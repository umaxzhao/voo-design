/** In-memory WebRTC signaling relay. */

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const PORT = Number(process.env.PORT || 8787);
const HOST = "127.0.0.1";
const JOIN = "join";
const ROSTER = "roster";
const SIGNAL = "signal";
const PROTOCOL_VERSION = 1;
const rooms = new Map();

const send = (socket, payload) => {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify({ ...payload, v: PROTOCOL_VERSION }));
  }
};

function leave(socket) {
  const { roomId, peerId } = socket.voo ?? {};
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.get(peerId) === socket) room.delete(peerId);
  if (room.size === 0) rooms.delete(roomId);
}

function startServer() {
  const httpServer = createServer((req, res) => {
    const payload = JSON.stringify({ error: "notFound" });
    res.writeHead(404, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
    });
    res.end(payload);
  });
  const server = new WebSocketServer({ server: httpServer });

  server.on("connection", (socket) => {
    socket.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (message.t === JOIN) {
        const { room: roomId, peerId } = message;
        if (typeof roomId !== "string" || typeof peerId !== "string") return;
        const room = rooms.get(roomId) ?? new Map();
        rooms.set(roomId, room);
        const previous = room.get(peerId);
        if (previous && previous !== socket) {
          previous.voo = null;
          previous.close();
        }
        send(socket, { t: ROSTER, peers: [...room.keys()] });
        room.set(peerId, socket);
        socket.voo = { roomId, peerId };
        const roster = [...room.keys()];
        for (const [otherId, otherSocket] of room) {
          if (otherId !== peerId) send(otherSocket, { t: ROSTER, peers: roster });
        }
        return;
      }

      if (message.t === SIGNAL) {
        const { roomId } = socket.voo ?? {};
        const target = rooms.get(roomId)?.get(message.to);
        if (target) send(target, message);
      }
    });

    socket.on("close", () => leave(socket));
    socket.on("error", () => leave(socket));
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`signalling on ws://${HOST}:${PORT} (rooms are in memory only)`);
  });
}

if (isMain) startServer();
