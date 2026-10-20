/**
 * The collaboration session: one room, its peers, and the state the UI reads.
 *
 * Everything the toolbar shows comes from here, and the transport is injected
 * rather than imported — the session owns *what* is exchanged and when, and
 * knows nothing about WebRTC. That is what lets the whole state machine be
 * driven by a fake transport in tests, which matters because the interesting
 * behaviour (a peer joining mid-edit, a peer going silent) is precisely the
 * part that is miserable to reproduce against real sockets.
 *
 * The server is only ever a rendezvous. Once two peers are introduced the
 * document, the images and the strokes all travel directly between them, so a
 * session costs the signalling server a few kilobytes of handshake and nothing
 * afterwards.
 */

import {
  CAP_BINARY_BLOBS,
  MSG,
  ProtocolError,
  decode,
  encode,
} from "./protocol.js";
import { decodeBinaryFrame } from "./chunking.js";
import { createPresence, colourFor } from "./presence.js";
import { createRoomId, roomUrl } from "./room.js";

export const STATUS = {
  OFF: "off",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  FAILED: "failed",
};

/** How often the roster is swept and a keep-alive HELLO goes out. */
const HEARTBEAT_MS = 5000;

/**
 * @param {object} options
 * @param {(room: string, handlers: object) => object} options.connect
 *   Opens the transport for a room. Returns `{ send(peerId, wire), broadcast(wire),
 *   close() }`; `handlers` receives `{ onPeer, onMessage, onPeerGone, onStatus,
 *   onTransport }`.
 * @param {string} [options.userId] who you are, stable across this device's
 *   windows — the roster and the avatars are keyed by it.
 * @param {string} [options.connectionId] this tab's transport address. Two
 *   windows of the same editor are two connections but one person.
 * @param {string} [options.name] the display name others see.
 * @param {(state: object) => void} [options.onChange] called whenever the
 *   snapshot the UI renders has changed.
 */
export function createCollabSession({
  connect,
  userId = crypto.randomUUID(),
  connectionId,
  name = "",
  onChange = () => {},
  now = () => Date.now(),
  setInterval: schedule = globalThis.setInterval,
  clearInterval: unschedule = globalThis.clearInterval,
  setTimeout: scheduleTimer = globalThis.setTimeout,
  clearTimeout: unscheduleTimer = globalThis.clearTimeout,
  connectTimeoutMs = 15000,
}) {
  let currentConnectionId = connectionId;
  const presence = createPresence(userId, now);
  /**
   * connectionId -> userId.
   *
   * Routing happens per connection and presence per person, so the two have to
   * be related somewhere. This is that somewhere: it is how a message from a
   * tab is attributed, and how closing one window of two leaves the person in
   * the room.
   */
  const whoIs = new Map();
  /**
   * connectionId -> Set of capabilities the peer advertised in its HELLO.
   * Senders check this before using a newer wire format; a peer that says
   * nothing gets the format the first build spoke.
   */
  const peerCaps = new Map();
  /**
   * connectionId -> transport kind, once the data channel has opened.
   * "direct" (host/server-reflexive) or "relay" (through the TURN server).
   * Surfaced on each peer so the room says whether its bytes stay P2P or are
   * being forwarded — the difference the sharer cares about most.
   */
  const transportTypes = new Map();
  let status = STATUS.OFF;
  let roomId = null;
  let transport = null;
  /**
   * Sends made before the transport finished opening.
   *
   * A transport may report its first peer synchronously, from inside the very
   * `connect` call whose return value would have been assigned to `transport`
   * — so the greeting that introduces this peer would be sent into nothing.
   * Queueing is what makes the session independent of when a transport chooses
   * to tell it things.
   */
  const outbox = [];

  /** One place every outbound message goes, queued or live. */
  function dispatch(peerId, wire) {
    if (!transport) {
      outbox.push({ peerId, wire });
      return;
    }
    if (peerId) transport.send(peerId, wire);
    else transport.broadcast(wire);
  }
  let heartbeat = 0;
  let displayName = name;
  let avatarSeed = null;
  /** Which document this room is about; the sidebar marks it as shared. */
  let workflowId = null;
  /** Handlers the host installs to apply what arrives; see `setHandlers`. */
  let sink = {};
  /** When the current room was joined; used to tell an empty room apart from
   * a session that is still connecting. */
  let joinedAt = null;
  /** True when this page arrived on a shared link (or pasted one) rather than
   * starting the room itself — only joiners should be told a room is offline;
   * the host is simply waiting for people. */
  let joinedViaLink = false;
  /** Whether a document has arrived for the current room. An offline shared
   * link (nobody in the room) never delivers one. */
  let receivedDocument = false;
  /**
   * The permission the room's guests hold: "edit" or "view". The host decides
   * it when sharing and broadcasts it; a guest adopts it (from its hello or the
   * link). A "view" guest is read-only: it sees live updates but cannot edit.
   */
  let access = "edit";
  let error = null;
  let connectTimer = null;

  function clearConnectTimer() {
    if (connectTimer !== null) {
      unscheduleTimer(connectTimer);
      connectTimer = null;
    }
  }

  function startConnectTimer(timeoutMs) {
    clearConnectTimer();
    if (!timeoutMs || timeoutMs <= 0) return;
    connectTimer = scheduleTimer(() => {
      connectTimer = null;
      if (status === STATUS.CONNECTING) {
        error = "timeout";
        status = STATUS.FAILED;
        announce();
      }
    }, timeoutMs);
  }

  /** A guest is read-only when the room granted view (hosts always edit). */
  const readOnly = () => access === "view" && joinedViaLink;

  const snapshot = () => ({
    status,
    roomId,
    workflowId,
    link: roomId ? roomUrl(roomId) : null,
    selfId: userId,
    peers: presence.list(),
    joinedAt,
    joinedViaLink,
    receivedDocument,
    access,
    readOnly: readOnly(),
    error,
    // "Is a room live on this page right now?" — the toolbar's share menu uses
    // it to show "copy collab link" rather than "share this canvas" once a
    // room exists, and to decide whether a fresh share can even succeed.
    active: status !== STATUS.OFF,
  });

  /** Everyone watching the snapshot: the host callback plus React. */
  const listeners = new Set(onChange ? [onChange] : []);
  const announce = () => {
    const state = snapshot();
    listeners.forEach((listener) => listener(state));
  };

  function setStatus(next) {
    if (next === STATUS.CONNECTED) {
      clearConnectTimer();
      error = null;
    } else if (next === STATUS.FAILED) {
      clearConnectTimer();
    }
    if (status === next) return;
    status = next;
    announce();
  }

  function helloWire({ reply = true } = {}) {
    return encode(MSG.HELLO, {
      peerId: userId,
      name: displayName,
      colour: colourFor(userId),
      avatarSeed,
      // The document this room is about. Peers use it to recognise the room's
      // document when it arrives, so a guest can adopt the host's workflow.
      workflowId,
      caps: [CAP_BINARY_BLOBS],
      access,
      reply,
    });
  }

  function handleMessage(fromPeerId, raw) {
    // Bulk image bytes arrive as binary frames rather than JSON; everything
    // else — and everything from older builds — is a JSON string.
    if (typeof raw !== "string") {
      let frame;
      try {
        frame = decodeBinaryFrame(raw);
      } catch (error) {
        if (error instanceof ProtocolError) {
          console.warn("collab: dropped frame", error.reason, error.message);
          return;
        }
        throw error;
      }
      if (!whoIs.has(fromPeerId)) {
        dispatch(fromPeerId, helloWire({ reply: true }));
      }
      presence.touch(whoIs.get(fromPeerId));
      if (frame.meta.t === MSG.BLOB_DATA) {
        sink.onBlobChunk?.(frame.meta, frame.bytes, fromPeerId);
      }
      return;
    }
    let message;
    try {
      message = decode(raw);
    } catch (error) {
      // A peer on another build is a fact of life once links are shared; log
      // it and carry on rather than tearing the session down.
      if (error instanceof ProtocolError) {
        console.warn("collab: dropped message", error.reason, error.message);
        return;
      }
      throw error;
    }
    // If a non-greeting message arrives from an unknown connection, prompt them
    // with our HELLO so they can greet us back and complete presence.
    if (!whoIs.has(fromPeerId) && message.type !== MSG.HELLO) {
      dispatch(fromPeerId, helloWire({ reply: true }));
    }
    // Attribute the connection to a person the first time it says who it is.
    if (message.type === MSG.HELLO) {
      whoIs.set(fromPeerId, message.peerId);
      peerCaps.set(
        fromPeerId,
        new Set(Array.isArray(message.caps) ? message.caps : []),
      );
    }
    presence.touch(whoIs.get(fromPeerId));

    switch (message.type) {
      case MSG.HELLO:
        // A room's permission is decided by the host and announced in its
        // hello. A guest adopts it (a deep-link viewer has no query to read);
        // the host keeps whatever it chose. Adopting also re-greets peers so
        // the change propagates.
        if (message.access && joinedViaLink) {
          const next = message.access === "view" ? "view" : "edit";
          if (access !== next) {
            access = next;
            dispatch(null, helloWire());
          }
        }
        presence.upsert(message.peerId, {
          name: message.name,
          colour: message.colour,
          avatarSeed: message.avatarSeed ?? null,
          workflowId: message.workflowId ?? null,
          // The channel is already open before the greeting arrives, so the
          // transport kind is known by now — attach it directly to this person.
          transport: transportTypes.get(fromPeerId),
        });
        // Two-way handshake guarantee: answer back so the sender has us in
        // their roster even if our initial onPeer hello was lost or raced.
        if (message.reply !== false) {
          dispatch(fromPeerId, helloWire({ reply: false }));
        }
        announce();
        break;
      case MSG.CURSOR:
        presence.setCursor(message.peerId, message.cursor ?? null);
        announce();
        break;
      case MSG.BYE:
        presence.remove(message.peerId);
        announce();
        break;
      case MSG.SUBGRAPH_TEMPLATE:
        sink.onSubgraphTemplate?.(message.template, fromPeerId);
        break;
      case MSG.DOC_REQUEST:
        sink.onDocRequest?.(fromPeerId);
        break;
      case MSG.DOC:
        receivedDocument = true;
        sink.onDocument?.(message, fromPeerId);
        break;
      case MSG.BLOB_HAVE:
        sink.onBlobHave?.(message.ids, fromPeerId);
        break;
      case MSG.BLOB_WANT:
        sink.onBlobWant?.(message.ids, fromPeerId);
        break;
      case MSG.BLOB_DATA:
        sink.onBlobData?.(message, fromPeerId);
        break;
      case MSG.STROKE:
        sink.onStroke?.(message, fromPeerId);
        break;
      default:
        break;
    }
  }

  function tick() {
    const dropped = presence.sweep();
    if (dropped.length) announce();
    // A HELLO doubles as the keep-alive: it is small, idempotent, and it also
    // repairs a roster that missed the first one during connection setup.
    dispatch(null, helloWire());
  }

  return {
    getSnapshot: snapshot,

    /**
     * Resource frames are accepted only from a connection that completed the
     * room handshake. The transport id is intentionally used here rather
     * than the advertised user id: the bridge's pending request is bound to
     * the exact data-channel connection that must answer it.
     */
    isPeerKnown(peerId) {
      return Boolean(peerId && whoIs.has(peerId));
    },

    /**
     * Installs the callbacks that apply incoming data to the document.
     *
     * Kept separate from construction so the store wiring can be attached
     * after the session exists, and swapped in tests.
     */
    setHandlers(next) {
      sink = next ?? {};
    },

    /** Changes how you appear; peers see it on the next greeting. */
    setIdentity({ name: nextName, avatarSeed: nextSeed } = {}) {
      if (nextName !== undefined) displayName = nextName ?? "";
      if (nextSeed !== undefined) avatarSeed = nextSeed ?? null;
      presence.upsert(userId, { name: displayName, avatarSeed });
      dispatch(null, helloWire());
      announce();
    },

    /** Records which document the room is about. */
    setWorkflowId(next) {
      if (workflowId === next) return;
      workflowId = next ?? null;
      announce();
    },

    /**
     * Sets the permission guests hold in this room ("edit" or "view"). The host
     * calls this when sharing; a guest adopts the value from the host's hello
     * or the shared link. Making the change re-greets peers so a room that
     * flips to view-only takes effect immediately.
     */
    setAccess(next) {
      if (access === next) return;
      access = next === "view" ? "view" : "edit";
      dispatch(null, helloWire());
      announce();
    },

    /**
     * Starts (or joins) a room. Returns the room id.
     *
     * `viaLink` tells the session whether this page arrived on someone else's
     * shared link. A host reusing a workflow-bound room id is NOT a guest, so
     * startCollab passes `{ viaLink: false }` even when `existingRoomId` is a
     * persistent bound id. Defaults to true only when an existing id is given,
     * which preserves the join-by-link callers.
     */
    start(
      existingRoomId,
      { viaLink = Boolean(existingRoomId), timeoutMs = connectTimeoutMs } = {},
    ) {
      const joinRoom = existingRoomId ?? createRoomId();
      if (transport) {
        // Already in this room — e.g. React StrictMode remounts the editor in
        // development and the auto-join runs again. Joining again would open a
        // second socket with the same connection id and every peer would end
        // up negotiating with us twice, which breaks the WebRTC handshake.
        if (roomId === joinRoom) return roomId;
        this.stop();
      }
      roomId = joinRoom;
      joinedAt = Date.now();
      joinedViaLink = Boolean(existingRoomId && viaLink);
      receivedDocument = false;
      // A fresh room the host starts defaults to "edit" (both sides can change
      // it). Otherwise a previous view-only share would linger on the session
      // and silently make every later share read-only — and a read-only guest
      // never broadcasts, so the host would never see its edits.
      if (!existingRoomId) access = "edit";
      error = null;
      presence.upsert(userId, { name: displayName, avatarSeed });
      setStatus(STATUS.CONNECTING);
      startConnectTimer(timeoutMs);

      currentConnectionId = connectionId || crypto.randomUUID();
      transport = connect(roomId, {
        connectionId: currentConnectionId,
        onStatus: (next) => setStatus(next),
        onPeer: (peerId) => {
          // Nothing goes in the roster yet: a connection is not a person until
          // its HELLO says whose it is. Greeting it is what asks.
          dispatch(peerId, helloWire());
          // A peer that has just arrived has nothing; ask for the document
          // rather than waiting for the next edit to bring it.
          dispatch(peerId, encode(MSG.DOC_REQUEST, {}));
          announce();
        },
        onPeerGone: (peerId) => {
          const gone = whoIs.get(peerId);
          whoIs.delete(peerId);
          peerCaps.delete(peerId);
          transportTypes.delete(peerId);
          // Someone with a second window open is still here; only the last of
          // their connections leaving takes them out of the room.
          if (gone && ![...whoIs.values()].includes(gone)) {
            presence.remove(gone);
          }
          announce();
        },
        onTransport: (peerId, type) => {
          if (!type) return;
          transportTypes.set(peerId, type);
          // The mapping may or may not be known yet; the HELLO handler attaches
          // it when the greeting arrives, this covers the reverse order.
          const personId = whoIs.get(peerId);
          if (personId) presence.upsert(personId, { transport: type });
          announce();
        },
        onMessage: handleMessage,
      });

      // Anything the transport prompted during `connect` goes out now that
      // there is something to send it through.
      const queued = outbox.splice(0);
      queued.forEach((entry) => dispatch(entry.peerId, entry.wire));

      heartbeat = schedule(tick, HEARTBEAT_MS);
      announce();
      return roomId;
    },

    stop() {
      clearConnectTimer();
      error = null;
      if (heartbeat) {
        unschedule(heartbeat);
        heartbeat = 0;
      }
      if (transport) {
        // Best effort: a closing tab may not get this out, which is why the
        // roster also times peers out.
        try {
          transport.broadcast(encode(MSG.BYE, { peerId: userId }));
        } catch {
          // The channel is already gone; nothing to do.
        }
        transport.close();
        transport = null;
      }
      outbox.length = 0;
      presence.clear();
      peerCaps.clear();
      whoIs.clear();
      roomId = null;
      joinedAt = null;
      joinedViaLink = false;
      receivedDocument = false;
      setStatus(STATUS.OFF);
      announce();
    },

    /** Sends one message to everyone. No-op when not in a session. */
    broadcast(type, payload) {
      if (!transport) return false;
      dispatch(null, encode(type, payload));
      return true;
    },

    /** Sends one message to a single peer. */
    sendTo(peerId, type, payload) {
      if (!transport) return false;
      dispatch(peerId, encode(type, payload));
      return true;
    },

    /** Unsent bytes queued for a peer; 0 when the transport does not say. */
    bufferedAmount(peerId) {
      return transport?.bufferedAmount?.(peerId) ?? 0;
    },

    /**
     * Resolves when a peer's send buffer has room again. A transport without
     * flow control (the fakes in tests) resolves immediately, so senders can
     * await this unconditionally.
     */
    whenWritable(peerId) {
      return transport?.whenWritable?.(peerId) ?? Promise.resolve();
    },

    /** Whether a peer advertised a capability in its HELLO. */
    peerSupports(peerId, capability) {
      return peerCaps.get(peerId)?.has(capability) ?? false;
    },

    /**
     * Sends an already-framed binary payload to a single peer. Only for bulk
     * bytes (images); everything else goes through `sendTo` so it is encoded
     * and validated.
     */
    sendRaw(peerId, frame) {
      if (!transport) return false;
      transport.send(peerId, frame);
      return true;
    },

    /** Watches the snapshot; returns the unsubscribe React's effect needs. */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
