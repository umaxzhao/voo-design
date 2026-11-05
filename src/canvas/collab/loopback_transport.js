import { STATUS } from "./session.js";

const RETRY_MS = 1000;
const BINARY_STEP = 8192;

function encodeFrame(frame) {
  if (typeof frame === "string") return { text: frame };
  const bytes = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
  let data = "";
  for (let i = 0; i < bytes.length; i += BINARY_STEP) {
    data += String.fromCharCode(...bytes.subarray(i, i + BINARY_STEP));
  }
  return { binary: btoa(data) };
}

function decodeFrame(frame) {
  if (typeof frame?.text === "string") return frame.text;
  if (typeof frame?.binary !== "string") throw new Error("Invalid loopback frame");
  return Uint8Array.from(atob(frame.binary), char => char.charCodeAt(0));
}

/** Loopback-only transport for isolated testing; never accepts a LAN address. */
export function createLoopbackTransport(room, handlers, { url, token, initialAccess, WebSocketImpl = WebSocket } = {}) {
  const address = new URL(url);
  if (address.protocol !== "ws:" || address.hostname !== "127.0.0.1" || address.username || address.password) {
    throw new Error("Loopback signaling requires ws://127.0.0.1");
  }
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(token)) throw new Error("Invalid loopback token");
  if (initialAccess !== undefined && !["view", "edit"].includes(initialAccess)) throw new Error("Invalid access");
  const selfId = handlers.connectionId ?? crypto.randomUUID();
  let socket, timer, closed = false, hostAccess = initialAccess;
  const peers = new Set();
  const send = (peerId, wire) => {
    if (socket?.readyState === 1 && peers.has(peerId)) {
      socket.send(JSON.stringify({ v: 1, t: "signal", to: peerId, data: encodeFrame(wire) }));
    }
  };
  const connect = () => {
    socket = new WebSocketImpl(address.href);
    socket.onopen = () => {
      socket.send(JSON.stringify({ v: 1, t: "join", room, peerId: selfId, token }));
      if (hostAccess) socket.send(JSON.stringify({ v: 1, t: "access", access: hostAccess }));
    };
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.v !== 1) return;
      if (message.t === "roster" && Array.isArray(message.peers)) {
        const next = new Set(message.peers.filter(id => id !== selfId));
        for (const peer of peers) if (!next.has(peer)) { peers.delete(peer); handlers.onPeerGone?.(peer); }
        for (const peer of next) if (!peers.has(peer)) { peers.add(peer); handlers.onPeer?.(peer); }
        handlers.onStatus?.(STATUS.CONNECTED);
      } else if (message.t === "signal" && message.to === selfId && typeof message.from === "string") {
        if (!peers.has(message.from)) { peers.add(message.from); handlers.onPeer?.(message.from); }
        handlers.onMessage?.(message.from, decodeFrame(message.data));
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      for (const peer of peers) handlers.onPeerGone?.(peer);
      peers.clear();
      if (!closed) { handlers.onStatus?.(STATUS.CONNECTING); timer = setTimeout(connect, RETRY_MS); }
    };
  };
  connect();
  return {
    send,
    broadcast: wire => { for (const peer of peers) send(peer, wire); },
    bufferedAmount: () => socket?.bufferedAmount ?? 0,
    setAccess(access) {
      if (!["view", "edit"].includes(access)) throw new Error("Invalid loopback access");
      // Preserve the host policy when the signaling socket reconnects.
      hostAccess = access;
      if (socket?.readyState === 1) socket.send(JSON.stringify({ v: 1, t: "access", access }));
    },
    close() { closed = true; clearTimeout(timer); socket?.close(); },
  };
}
