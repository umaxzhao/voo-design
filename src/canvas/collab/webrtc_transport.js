/**
 * The peer-to-peer transport: a signalling socket to meet on, and one WebRTC
 * data channel per peer to actually talk over.
 *
 * The server's whole job is introductions. It relays SDP and ICE candidates
 * between members of a room and holds nothing — once two peers have shaken
 * hands, every document, image and stroke goes directly between them and the
 * server sees none of it. That is the point: a session costs a few kilobytes
 * of handshake regardless of how much work happens inside it.
 *
 * Who offers is decided by comparing peer ids rather than by arrival order.
 * Both sides learn about each other at roughly the same moment, and without a
 * rule they would both offer and both answer — "the larger id offers" is a
 * tiebreak both sides compute identically without another round trip.
 */

import {
  HOSTED_SIGNALING_URL,
  SITE_HOSTNAMES,
} from "../../shared/vps_origin.js";

import { MSG, decode, encode } from "./protocol.js";
import { STATUS } from "./session.js";

/**
 * STUN only, by decision: a TURN relay carries every byte of a session through
 * a server, which is the one thing this design exists to avoid.
 *
 * Several servers rather than one because STUN costs us nothing and a wider
 * spread of reflexive candidates is the cheapest way to raise the direct-
 * connection rate. What it cannot fix is a symmetric NAT on both ends — those
 * peers get a few re-negotiations, then fail, and the UI says so.
 *
 * `__VOO_ICE_SERVERS__` overrides this, so a TURN server can be added later
 * without touching code if that trade is ever worth making.
 */
export const DEFAULT_ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

/**
 * Reconnect pacing. The signalling socket is redialled with an exponential
 * backoff that never exceeds the cap — a lost network comes back eventually,
 * and re-joining is idempotent (the server kicks the stale socket for a
 * re-used peer id), so there is no reason to give up. A failed ICE
 * connection is different: retrying cannot fix a symmetric NAT, so a peer
 * gets a bounded number of re-negotiations before being declared unreachable.
 */
const SOCKET_RETRY_BASE_MS = 1000;
const SOCKET_RETRY_CAP_MS = 30_000;
const ICE_RETRY_LIMIT = 3;

/** The ICE servers this build should use. */
export function resolveIceServers() {
  const configured = globalThis.__VOO_ICE_SERVERS__;
  return Array.isArray(configured) && configured.length
    ? configured
    : DEFAULT_ICE;
}

/**
 * Send-side flow control, in bytes of a peer's unsent buffer.
 *
 * `channel.send()` never blocks and never fails on a slow link — it just
 * buffers. A whole image library fired in one loop would pile up in memory
 * until the tab died, so senders pause once the buffer passes the high-water
 * mark and resume when it drains below the low-water one. Between the two the
 * pipe stays full, which is what keeps the link saturated without a queue of
 * our own.
 */
export const BUFFER_HIGH_WATER = 8 * 1024 * 1024;
export const BUFFER_LOW_WATER = 1024 * 1024;

/**
 * How many data channels are opened per peer. Image chunks are round-robined
 * across them so a burst can queue more before the transport's flow control
 * pauses; control messages always use channel 0. WebRTC runs these all over one
 * SCTP association, so the aggregate throughput is still bounded by that
 * association's congestion window — the channels mainly let the sender keep the
 * per-channel buffers full rather than stalling on a single channel's high-water
 * mark. Overridable for tests.
 */
export const NUM_CHANNELS = Number(globalThis.__VOO_COLLAB_CHANNELS__ ?? 8);

/** Where the signalling socket lives; overridable for local development. */
export function signalingUrl() {
  const configured = globalThis.__VOO_SIGNALING_URL__;
  if (configured) return configured;
  const origin = globalThis.location?.origin ?? "https://voo.run";
  // WebSocket only accepts ws/wss. The desktop app runs under the custom
  // `voo://app` scheme, which is not http(s) and has no signalling endpoint of
  // its own — without this return the client would hand `new WebSocket` a
  // `voo://app/collab` URL and the whole transport would fail to connect. Route
  // any non-http origin to the hosted signalling server.
  if (!/^https?:\/\//.test(origin)) return HOSTED_SIGNALING_URL;
  // The site on voo.run is a serverless deployment and cannot hold a WebSocket,
  // so the page's own origin has no /collab there either: use the VPS.
  if (SITE_HOSTNAMES.includes(new URL(origin).hostname)) {
    return HOSTED_SIGNALING_URL;
  }
  return `${origin.replace(/^http/, "ws")}/collab`;
}

/**
 * Opens a room.
 *
 * @param {string} roomId
 * @param {{onStatus: Function, onPeer: Function, onPeerGone: Function,
 *   onMessage: Function}} handlers
 * @param {object} [options] injection seams for tests: `WebSocketImpl`,
 *   `PeerConnectionImpl`, `iceServers`, `selfId`.
 */
export function createWebRtcTransport(roomId, handlers, options = {}) {
  const {
    WebSocketImpl = globalThis.WebSocket,
    PeerConnectionImpl = globalThis.RTCPeerConnection,
    iceServers = resolveIceServers(),
    url = signalingUrl(),
    setTimeout: schedule = globalThis.setTimeout,
    clearTimeout: unschedule = globalThis.clearTimeout,
  } = options;
  // This tab's address on the signalling server. It is not the user id: one
  // person with two windows is two connections here and one face in the room.
  const selfId = handlers.connectionId ?? options.selfId ?? crypto.randomUUID();

  /** peerId -> { connection, channel } */
  const peers = new Map();
  let socket = null;
  let closed = false;
  /** Socket redial state: attempts so far and the pending timer, if any. */
  let socketRetries = 0;
  let socketTimer = 0;
  /** peerId -> ICE re-negotiations attempted, and peerId -> pending timer. */
  const iceRetries = new Map();
  const iceTimers = new Map();

  const signal = (to, data) => {
    if (socket?.readyState === 1) {
      socket.send(encode(MSG.SIGNAL, { to, from: selfId, data }));
    }
  };

  function clearIceRetry(peerId) {
    iceRetries.delete(peerId);
    const timer = iceTimers.get(peerId);
    if (timer) {
      unschedule(timer);
      iceTimers.delete(peerId);
    }
  }

  function dropPeer(peerId) {
    const peer = peers.get(peerId);
    if (!peer) return;
    clearIceRetry(peerId);
    try {
      peer.channel?.close();
      peer.connection.close();
    } catch {
      // Already torn down by the browser; nothing left to release.
    }
    peers.delete(peerId);
    handlers.onPeerGone?.(peerId);
  }

  /**
   * A failed ICE connection gets a bounded re-negotiation: a transient
   * network change recovers this way, a symmetric NAT does not — that peer
   * is given up on after ICE_RETRY_LIMIT attempts, as before, just not on
   * the first failure.
   */
  function handleIceFailure(peerId) {
    const attempts = iceRetries.get(peerId) ?? 0;
    dropPeer(peerId);
    if (closed) return;
    if (attempts >= ICE_RETRY_LIMIT) {
      if (peers.size === 0) handlers.onStatus?.(STATUS.FAILED);
      return;
    }
    iceRetries.set(peerId, attempts + 1);
    iceTimers.set(
      peerId,
      schedule(
        () => {
          iceTimers.delete(peerId);
          // Back already (re-introduced via the roster)? Nothing to redo.
          if (closed || peers.has(peerId)) return;
          // The larger id re-offers; the smaller side waits for that offer.
          if (shouldOffer(peerId)) {
            startOffer(peerId).catch(() => dropPeer(peerId));
          } else {
            peerFor(peerId);
          }
        },
        SOCKET_RETRY_BASE_MS * 2 ** attempts,
      ),
    );
  }

  /**
   * Best-effort classification of a connection's selected candidate type.
   *
   * ICE picks the best path it can: a straight hop (host — same LAN — or a
   * server-reflexive STUN mapping) is direct, and only a symmetric-NAT pair is
   * left with the relay. This reads the RTCStats the browser gathers and names
   * which it is, so the UI can say "direct" vs "relayed via server". Never throws:
   * the transport must not fail a perfectly good connection over a diagnostic.
   */
  async function classifyConnection(connection) {
    if (!connection?.getStats) return "unknown";
    try {
      const stats = await connection.getStats();
      let type = "unknown";
      stats.forEach((report) => {
        // The connected pair is the one that succeeded; read its local side.
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          const local = stats.get(report.localCandidateId);
          type = local?.candidateType ?? "unknown";
        }
      });
      return type === "relay" ? "relay" : "direct";
    } catch {
      return "unknown";
    }
  }

  function controlChannel(peer) {
    if (!peer?.channels?.length) return null;
    return (
      peer.channels.find((c) => c.label === "voo") ?? peer.channels[0] ?? null
    );
  }

  function attachChannel(peerId, channel) {
    const peer = peers.get(peerId);
    if (peer) {
      if (channel.label === "voo") peer.channels.unshift(channel);
      else peer.channels.push(channel);
    }
    channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER;
    // Binary frames arrive as ArrayBuffer, not Blob, so receivers can read
    // them synchronously instead of awaiting blob.arrayBuffer() per chunk.
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      // A working channel settles any re-negotiation in flight for this peer.
      clearIceRetry(peerId);
      handlers.onStatus?.(STATUS.CONNECTED);
      const ctrl = controlChannel(peer);
      // Introduce the peer once its control channel is open and ready to transmit.
      // Image pipes that open earlier must not fire onPeer before greetings can be sent.
      if (peer && !peer.notified && ctrl?.readyState === "open") {
        peer.notified = true;
        handlers.onPeer?.(peerId);
        void classifyConnection(peer?.connection).then((type) =>
          handlers.onTransport?.(peerId, type),
        );
      }
    };
    channel.onmessage = (event) => handlers.onMessage?.(peerId, event.data);
    channel.onclose = () => removeChannel(peerId, channel);
    // An error is only actionable as a close; the session times peers out too.
    channel.onerror = () => removeChannel(peerId, channel);
  }

  /** Drops one of a peer's channels; the peer dies only when none remain. */
  function removeChannel(peerId, channel) {
    const peer = peers.get(peerId);
    const index = peer?.channels?.indexOf(channel) ?? -1;
    if (peer && index >= 0) peer.channels.splice(index, 1);
    if (!peer?.channels?.length) dropPeer(peerId);
  }

  function peerFor(peerId) {
    const existing = peers.get(peerId);
    if (existing) return existing;
    const connection = new PeerConnectionImpl({ iceServers });
    const entry = {
      connection,
      channels: [],
      remoteSet: false,
      pendingCandidates: [],
    };
    peers.set(peerId, entry);

    connection.onicecandidate = (event) => {
      if (event.candidate) signal(peerId, { candidate: event.candidate });
    };
    connection.ondatachannel = (event) => attachChannel(peerId, event.channel);
    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      if (state === "failed") handleIceFailure(peerId);
      if (state === "closed") dropPeer(peerId);
    };
    return entry;
  }

  /**
   * Applies one remote ICE candidate, buffering it when it arrives before the
   * remote description so a trickled candidate is never silently dropped. In a
   * cross-environment pair (desktop ↔ web) the TURN relay candidate can reach
   * this side first; dropping it would kill the only route across symmetric NATs
   * and the data channel would never open.
   */
  async function applyRemoteCandidate(fromPeerId, candidate) {
    const { connection, remoteSet, pendingCandidates } =
      peers.get(fromPeerId) ?? {};
    if (!connection) return;
    if (!remoteSet) {
      pendingCandidates.push(candidate);
      return;
    }
    try {
      await connection.addIceCandidate(candidate);
    } catch {
      // A candidate that never lands (e.g. re-triplicated) is harmless.
    }
  }

  function flushPendingCandidates(fromPeerId) {
    const peer = peers.get(fromPeerId);
    if (!peer) return;
    peer.remoteSet = true;
    const pending = peer.pendingCandidates.splice(0);
    for (const candidate of pending) {
      void peer.connection.addIceCandidate(candidate).catch(() => {});
    }
  }

  /** The larger id offers, so exactly one side does. */
  const shouldOffer = (peerId) => selfId > peerId;

  async function startOffer(peerId) {
    const { connection } = peerFor(peerId);
    // Ordered and reliable: the document merge assumes it sees whole messages
    // in the order they were sent. One data channel carries control messages
    // (index 0); the rest are extra pipes so a burst of image bytes can spread
    // across them instead of stalling on a single channel's high-water mark.
    for (let i = 0; i < NUM_CHANNELS; i += 1) {
      attachChannel(
        peerId,
        connection.createDataChannel(i === 0 ? "voo" : `voo-${i}`, {
          ordered: true,
        }),
      );
    }
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    signal(peerId, { sdp: connection.localDescription });
  }

  async function handleSignal(fromPeerId, data) {
    // Ensure the peer exists (idempotent — returns the existing entry). A
    // candidate or offer can arrive before the roster round, so this must not
    // drop the signal for an unseen peer.
    const connection = peerFor(fromPeerId).connection;
    if (data.candidate) {
      await applyRemoteCandidate(fromPeerId, data.candidate);
      return;
    }
    if (!data.sdp) return;
    await connection.setRemoteDescription(data.sdp);
    flushPendingCandidates(fromPeerId);
    if (data.sdp.type === "offer") {
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      signal(fromPeerId, { sdp: connection.localDescription });
    }
  }

  /**
   * Redialling the signalling socket. Never gives up: the server or the
   * network coming back is enough, and re-joining the room is idempotent.
   */
  function scheduleSocketReconnect() {
    if (closed || socketTimer) return;
    const delay = Math.min(
      SOCKET_RETRY_CAP_MS,
      SOCKET_RETRY_BASE_MS * 2 ** socketRetries,
    );
    socketRetries += 1;
    // Peers already connected keep talking without the socket; the loss only
    // pauses introductions, so the room stays "connected" for them.
    handlers.onStatus?.(peers.size ? STATUS.CONNECTED : STATUS.CONNECTING);
    socketTimer = schedule(() => {
      socketTimer = 0;
      openSocket();
    }, delay);
  }

  function openSocket() {
    socket = new WebSocketImpl(url);
    socket.onopen = () => {
      socketRetries = 0;
      socket.send(encode(MSG.JOIN, { room: roomId, peerId: selfId }));
    };
    socket.onmessage = async (event) => {
      let message;
      try {
        message = decode(event.data);
      } catch {
        return; // The server should not send us anything else; ignore it.
      }
      if (message.type === MSG.ROSTER) {
        // Only offer to the peers already here. Anyone arriving later offers
        // to us, so no pair ever negotiates twice.
        for (const peerId of message.peers) {
          // A peer we already know (the server can list the room again, e.g.
          // after a re-join) must not be negotiated with a second time: a
          // second offer on an existing connection derails the first handshake.
          if (peerId === selfId || peers.has(peerId)) continue;
          if (shouldOffer(peerId)) {
            await startOffer(peerId).catch(() => dropPeer(peerId));
          } else {
            peerFor(peerId);
          }
        }
        return;
      }
      if (message.type === MSG.SIGNAL && message.to === selfId) {
        await handleSignal(message.from, message.data).catch(() =>
          dropPeer(message.from),
        );
      }
    };
    // An error is only actionable as a close; the close path drives redial.
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      socket = null;
      scheduleSocketReconnect();
    };
  }

  openSocket();

  return {
    send(peerId, wire) {
      // Control messages (the document and every protocol update) always use
      // the control channel so they stay ordered — a position update must never be
      // overtaken by an older one on a different channel.
      const peer = peers.get(peerId);
      const channel = controlChannel(peer);
      if (channel?.readyState === "open") channel.send(wire);
    },
    sendRaw(peerId, wire) {
      const peer = peers.get(peerId);
      const ctrl = controlChannel(peer);
      // Image chunks round-robin across channels 1..N, leaving the control
      // channel to control messages; reassembly is already tolerant of interleaving.
      const open = (peer?.channels ?? []).filter(
        (c) => c !== ctrl && c.readyState === "open",
      );
      if (!open.length) {
        if (ctrl?.readyState === "open") {
          ctrl.send(wire);
          return true;
        }
        return false;
      }
      const idx = (peer.rr ?? 0) % open.length;
      peer.rr = (peer.rr ?? 0) + 1;
      open[idx].send(wire);
      return true;
    },
    broadcast(wire) {
      for (const peer of peers.values()) {
        const channel = controlChannel(peer);
        if (channel?.readyState === "open") channel.send(wire);
      }
    },
    /** Unsent bytes queued for a peer; 0 once the peer is gone. */
    bufferedAmount(peerId) {
      return (peers.get(peerId)?.channels ?? []).reduce(
        (sum, c) => sum + (c.readyState === "open" ? c.bufferedAmount : 0),
        0,
      );
    },
    /**
     * Resolves when a peer's send buffer has room again — or immediately when
     * the peer is gone, so a sender waiting on it wakes up and stops instead
     * of hanging on a channel that will never drain.
     */
    whenWritable(peerId) {
      const peer = peers.get(peerId);
      const channels = (peer?.channels ?? []).filter(
        (c) => c.readyState === "open",
      );
      if (!peer || channels.length === 0) return Promise.resolve();
      const buffered = channels.reduce((sum, c) => sum + c.bufferedAmount, 0);
      if (buffered <= BUFFER_HIGH_WATER) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => {
          channels.forEach((c) => {
            c.removeEventListener("bufferedamountlow", done);
            c.removeEventListener("close", done);
          });
          resolve();
        };
        channels.forEach((c) => {
          c.addEventListener("bufferedamountlow", done);
          c.addEventListener("close", done);
        });
      });
    },
    close() {
      closed = true;
      if (socketTimer) {
        unschedule(socketTimer);
        socketTimer = 0;
      }
      for (const peerId of [...peers.keys()]) dropPeer(peerId);
      try {
        socket?.close();
      } catch {
        // Already closing.
      }
      socket = null;
    },
  };
}
