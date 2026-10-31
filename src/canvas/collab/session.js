/** Collaboration session facade; protocol handling and room admission live in focused modules. */
import {
  CAP_BINARY_BLOBS,
  MSG,
  encode,
} from "./protocol.js";
import { createPresence, colourFor } from "./presence.js";
import { createRoomId, createRoomSecret, roomUrl } from "./room.js";
import { isEditWire, isProtectedWire, proofFor } from "./room-security.js";
import { createPeerRoster } from "./peer-roster.js";
import { createMessageHandler } from "./message-handler.js";

export const STATUS = {
  OFF: "off",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  FAILED: "failed",
};

const HEARTBEAT_MS = 5000;

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
  let roomSecret = null;
  /** roomId -> secret, so a re-shared link keeps the same #k proof. */
  const roomSecrets = new Map();
  const presence = createPresence(userId, now);
  const { whoIs, peerCaps, verifiedPeers, requestedDocs, transportTypes } = createPeerRoster();
  /** Connections whose peer announced it is a read-only viewer. */
  const peerReadOnly = new Map();

  let status = STATUS.OFF;
  let roomId = null;
  let transport = null;
  const outbox = [];

  function dispatch(peerId, wire) {
    // A read-only viewer must never publish edits, even if a caller forgets its
    // own guard; drop the wire before any peer can see it.
    if (readOnly() && isEditWire(wire)) return;
    if (roomSecret && isProtectedWire(wire)) {
      if (peerId) {
        if (!verifiedPeers.has(peerId)) return;
      } else {
        const trusted = [...verifiedPeers];
        trusted.forEach((trustedPeer) => transport?.send(trustedPeer, wire));
        return;
      }
    }
    if (!transport) {
      outbox.push({ peerId, wire });
      return;
    }
    if (peerId) transport.send(peerId, wire);
    else transport.broadcast(wire);
  }

  async function helloWire({ reply = true } = {}) {
    return encode(MSG.HELLO, {
      peerId: userId, name: displayName, colour: colourFor(userId), avatarSeed,
      workflowId, caps: [CAP_BINARY_BLOBS], access, readOnly: readOnly(), reply,
      ...(roomSecret ? { proof: await proofFor(roomSecret, userId) } : {}),
    });
  }

  async function sendHello(peerId, options) {
    if (!roomSecret) {
      dispatch(peerId, encode(MSG.HELLO, {
        peerId: userId, name: displayName, colour: colourFor(userId), avatarSeed,
        workflowId, caps: [CAP_BINARY_BLOBS], access, readOnly: readOnly(),
        reply: options?.reply ?? true,
      }));
      return;
    }
    dispatch(peerId, await helloWire(options));
  }

  let heartbeat = 0;
  let displayName = name;
  let avatarSeed = null;
  let workflowId = null;
  let sink = {};
  let joinedAt = null;
  let joinedViaLink = false;
  let receivedDocument = false;
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

  /** A guest that joined through a view link is read-only for the room. */
  function readOnly() {
    return access === "view" && joinedViaLink;
  }

  const snapshot = () => ({
    status,
    roomId,
    workflowId,
    link: roomId ? roomUrl(roomId, undefined, access, roomSecret ?? undefined) : null,
    selfId: userId,
    peers: presence.list(),
    joinedAt,
    joinedViaLink,
    receivedDocument,
    access,
    readOnly: readOnly(),
    error,
    active: status !== STATUS.OFF,
  });

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

  const handleMessage = createMessageHandler({
    roomSecret: () => roomSecret, verifiedPeers, whoIs, peerCaps, peerReadOnly, requestedDocs, presence,
    sendHello, dispatch, sink: () => sink, joinedViaLink: () => joinedViaLink,
    getAccess: () => access, setAccess: (next) => { access = next; }, transportTypes,
    announce, setReceivedDocument: (next) => { receivedDocument = next; },
  });

  function tick() {
    const dropped = presence.sweep();
    if (dropped.length) announce();
    void sendHello(null);
  }

  return {
    getSnapshot: snapshot,

    isPeerKnown(peerId) {
      return Boolean(peerId && whoIs.has(peerId));
    },

    setHandlers(next) {
      sink = next ?? {};
    },

    setIdentity({ name: nextName, avatarSeed: nextSeed } = {}) {
      if (nextName !== undefined) displayName = nextName ?? "";
      if (nextSeed !== undefined) avatarSeed = nextSeed ?? null;
      presence.upsert(userId, { name: displayName, avatarSeed });
      void sendHello(null);
      announce();
    },

    setWorkflowId(next) {
      if (workflowId === next) return;
      workflowId = next ?? null;
      announce();
    },

    setAccess(next) {
      if (access === next) return;
      access = next === "view" ? "view" : "edit";
      void sendHello(null);
      announce();
    },

    start(
      existingRoomId,
      { viaLink = Boolean(existingRoomId), timeoutMs = connectTimeoutMs, secret } = {},
    ) {
      const joinRoom = existingRoomId ?? createRoomId();
      if (transport) {
        if (roomId === joinRoom) return roomId;
        this.stop();
      }
      roomId = joinRoom;
      const knownSecret = roomSecrets.get(joinRoom);
      // Hosting (no explicit via-link join) mints the room secret the share
      // link carries in its `#k=` fragment; a link guest adopts the secret it
      // was handed, and a legacy link without one stays secret-less.
      roomSecret = secret ?? knownSecret ?? (existingRoomId && viaLink ? null : createRoomSecret());
      if (roomSecret) roomSecrets.set(joinRoom, roomSecret);
      joinedAt = Date.now();
      joinedViaLink = Boolean(existingRoomId && viaLink);
      receivedDocument = false;
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
          void sendHello(peerId);
          if (!roomSecret) dispatch(peerId, encode(MSG.DOC_REQUEST, {}));
          announce();
        },
        onPeerGone: (peerId) => {
          const gone = whoIs.get(peerId);
          whoIs.delete(peerId);
          verifiedPeers.delete(peerId);
          requestedDocs.delete(peerId);
          peerCaps.delete(peerId);
          peerReadOnly.delete(peerId);
          transportTypes.delete(peerId);
          if (gone && ![...whoIs.values()].includes(gone)) {
            presence.remove(gone);
          }
          announce();
        },
        onTransport: (peerId, type) => {
          if (!type) return;
          transportTypes.set(peerId, type);
          const personId = whoIs.get(peerId);
          if (personId) presence.upsert(personId, { transport: type });
          announce();
        },
        onMessage: handleMessage,
      });
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
        try {
          transport.broadcast(encode(MSG.BYE, { peerId: userId }));
        } catch {
        }
        transport.close();
        transport = null;
      }
      outbox.length = 0;
      presence.clear();
      peerCaps.clear();
      peerReadOnly.clear();
      verifiedPeers.clear();
      requestedDocs.clear();
      whoIs.clear();
      roomId = null;
      joinedAt = null;
      joinedViaLink = false;
      roomSecret = null;
      receivedDocument = false;
      setStatus(STATUS.OFF);
      announce();
    },

    broadcast(type, payload) {
      if (!transport) return false;
      dispatch(null, encode(type, payload));
      return true;
    },

    sendTo(peerId, type, payload) {
      if (!transport) return false;
      dispatch(peerId, encode(type, payload));
      return true;
    },

    bufferedAmount(peerId) {
      return transport?.bufferedAmount?.(peerId) ?? 0;
    },

    whenWritable(peerId) {
      return transport?.whenWritable?.(peerId) ?? Promise.resolve();
    },

    peerSupports(peerId, capability) {
      return peerCaps.get(peerId)?.has(capability) ?? false;
    },

    sendRaw(peerId, frame) {
      if (!transport || (roomSecret && !verifiedPeers.has(peerId))) return false;
      transport.send(peerId, frame);
      return true;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
