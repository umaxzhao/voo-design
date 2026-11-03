import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { createRoomId } from "../src/canvas/collab/room.js";
import { createLoopbackAssetHandler } from "./lan-loopback-assets.js";

const LOOPBACK = "127.0.0.1";
const MAX_FRAME_BYTES = 256 * 1024;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const ROOM = /^[23456789abcdefghjkmnpqrstuvwxyz]{8,20}$/;

/** Serve an explicitly supplied editor build and collaboration on loopback only. */
export async function startLoopbackSignaling({ port = 0, room = createRoomId(), staticRoot,
  hostToken = randomBytes(16).toString("base64url"), guestToken = randomBytes(16).toString("base64url") } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError("Invalid port");
  if (!ROOM.test(room)) throw new Error("Invalid room");
  if (![hostToken, guestToken].every(token => typeof token === "string" && /^[A-Za-z0-9_-]{22}$/.test(token)) || hostToken === guestToken) {
    throw new Error("Invalid room credentials");
  }
  // Fail closed until the authenticated host explicitly publishes its policy.
  let access = "view";
  const matches = (actual, expected) => {
    if (typeof actual !== "string") return false;
    const a = Buffer.from(actual), b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const rooms = new Map();
  const http = createServer(createLoopbackAssetHandler(staticRoot));
  const sockets = new WebSocketServer({ server: http, maxPayload: MAX_FRAME_BYTES });
  // ws forwards the HTTP server's listen error before the HTTP listener sees it.
  // Keep an error listener installed so startLoopbackSignaling can reject normally.
  sockets.on("error", error => { if (http.listening) console.error("Loopback signaling error:", error); });
  const send = (socket, payload) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ ...payload, v: 1 }));
  };
  const leave = socket => {
    const member = socket.member;
    if (!member) return;
    socket.member = null;
    const members = rooms.get(member.room);
    if (members?.get(member.peerId) === socket) members.delete(member.peerId);
    if (member.host && members) for (const peer of members.values()) peer.close(1008);
    if (members?.size === 0) rooms.delete(member.room);
    else if (members) for (const peer of members.values()) send(peer, { t: "roster", peers: [...members.keys()] });
  };
  sockets.on("connection", socket => {
    socket.on("message", raw => {
      let message;
      try { message = JSON.parse(String(raw)); } catch { socket.close(1007); return; }
      if (!message || message.v !== 1) { socket.close(1008); return; }
      if (message.t === "join") {
        const host = matches(message.token, hostToken);
        const members = rooms.get(room) ?? new Map();
        if (socket.member || message.room !== room || !ID.test(message.peerId) ||
            (!host && !matches(message.token, guestToken)) || members.has(message.peerId) ||
            (host && [...members.values()].some(peer => peer.member?.host)) ||
            (!host && ![...members.values()].some(peer => peer.member?.host))) { socket.close(1008); return; }
        rooms.set(room, members);
        send(socket, { t: "roster", peers: [...members.keys()] });
        members.set(message.peerId, socket);
        socket.member = { room, peerId: message.peerId, host };
        for (const [peerId, peer] of members) {
          if (peerId !== message.peerId) send(peer, { t: "roster", peers: [...members.keys()] });
        }
        return;
      }
      if (message.t === "access") {
        if (!socket.member?.host || !["view", "edit"].includes(message.access)) { socket.close(1008); return; }
        access = message.access;
        return;
      }
      if (message.t !== "signal" || !socket.member || !ID.test(message.to) ||
          !message.data || typeof message.data !== "object") { socket.close(1008); return; }
      let data = message.data;
      if (typeof data.text === "string") {
        let wire;
        try { wire = JSON.parse(data.text); } catch { socket.close(1007); return; }
        if (!socket.member.host && access === "view" &&
            !["hello", "cursor", "docRequest", "blobWant", "blobWantOriginal", "bye"].includes(wire?.t)) return;
        if (wire?.t === "hello") {
          wire.access = access;
          if (!socket.member.host) wire.readOnly = access === "view";
          data = { text: JSON.stringify(wire) };
        }
      } else if (typeof data.binary !== "string" || (!socket.member.host && access === "view")) {
        return;
      }
      const target = rooms.get(socket.member.room)?.get(message.to);
      if (target) send(target, { t: "signal", to: message.to, from: socket.member.peerId, data });
    });
    socket.on("close", () => leave(socket));
    socket.on("error", () => leave(socket));
  });
  try {
    await new Promise((resolve, reject) => {
      http.once("error", reject);
      http.listen(port, LOOPBACK, () => { http.off("error", reject); resolve(); });
    });
  } catch (error) {
    sockets.close();
    throw error;
  }
  return {
    address: LOOPBACK,
    port: http.address().port,
    room,
    hostToken,
    guestToken,
    async close() {
      for (const socket of sockets.clients) socket.terminate();
      await new Promise((resolve, reject) => sockets.close(error => error ? reject(error) : resolve()));
      await new Promise((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
    },
  };
}
