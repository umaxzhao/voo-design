/** In-memory WebRTC signaling relay. */

import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";
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
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/lib/voo-run/uploads";
const UPLOAD_MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 100 * 1024 * 1024);
const UPLOAD_TTL_HOURS = Number(process.env.UPLOAD_TTL_HOURS || 24);
const PUBLIC_ORIGIN = (process.env.VOO_PUBLIC_BASE_URL || "https://voo.run").replace(
  /\/+$/,
  "",
);
const MIME_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/quicktime", "mov"],
]);
const FILE_NAME_PATTERN = /^[0-9a-f-]{36}\.(png|jpg|webp|gif|svg|mp4|webm|mov)$/i;

function setCorsHeaders(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, HEAD, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");
  res.setHeader("access-control-max-age", "86400");
  res.setHeader("x-content-type-options", "nosniff");
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function uploadMedia(req, res) {
  setCorsHeaders(res);
  const contentType = String(req.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const extension = MIME_EXTENSIONS.get(contentType);
  const contentLength = Number(req.headers["content-length"]);

  if (!extension) return sendJson(res, 415, { error: "unsupportedMediaType" });
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    return sendJson(res, 411, { error: "contentLengthRequired" });
  }
  if (contentLength > UPLOAD_MAX_BYTES) {
    return sendJson(res, 413, { error: "uploadTooLarge" });
  }

  const fileName = `${randomUUID()}.${extension}`;
  const filePath = path.join(UPLOAD_DIR, fileName);
  let receivedBytes = 0;
  const limiter = new (await import("node:stream")).Transform({
    transform(chunk, encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > UPLOAD_MAX_BYTES) {
        callback(new Error("uploadTooLarge"));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await mkdir(UPLOAD_DIR, { recursive: true, mode: 0o750 });
    await pipeline(req, limiter, createWriteStream(filePath, { flags: "wx" }));
    sendJson(res, 201, { url: `${PUBLIC_ORIGIN}/uploads/${fileName}` });
  } catch (error) {
    await unlink(filePath).catch((cleanupError) => {
      if (cleanupError.code !== "ENOENT") console.error("[upload] partial file cleanup failed", cleanupError);
    });
    if (!res.destroyed) {
      const tooLarge = receivedBytes > UPLOAD_MAX_BYTES;
      sendJson(res, tooLarge ? 413 : 400, {
        error: tooLarge ? "uploadTooLarge" : "uploadFailed",
      });
    }
    if (!res.destroyed && error?.message !== "uploadTooLarge") {
      console.error("[upload] request failed", error);
    }
  }
}

async function serveUpload(req, res, fileName) {
  setCorsHeaders(res);
  if (!FILE_NAME_PATTERN.test(fileName)) return sendJson(res, 404, { error: "notFound" });

  const filePath = path.join(UPLOAD_DIR, fileName);
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return sendJson(res, 404, { error: "notFound" });
    const extension = path.extname(fileName).slice(1).toLowerCase();
    const contentType = [...MIME_EXTENSIONS].find(([, ext]) => ext === extension)?.[0];
    if (!contentType) return sendJson(res, 404, { error: "notFound" });

    res.writeHead(200, {
      "content-type": contentType,
      "content-length": fileStat.size,
      "cache-control": "public, max-age=3600",
      ...(extension === "svg" ? { "content-disposition": "attachment" } : {}),
    });
    if (req.method === "HEAD") return res.end();
    await pipeline(createReadStream(filePath), res);
  } catch (error) {
    if (error?.code === "ENOENT") return sendJson(res, 404, { error: "notFound" });
    console.error("[upload] file read failed", error);
    if (!res.headersSent) sendJson(res, 500, { error: "uploadReadFailed" });
    else res.destroy(error);
  }
}

async function cleanupExpiredUploads() {
  const expiresBefore = Date.now() - UPLOAD_TTL_HOURS * 60 * 60 * 1000;
  try {
    const files = await readdir(UPLOAD_DIR, { withFileTypes: true });
    await Promise.all(
      files
        .filter((entry) => entry.isFile() && FILE_NAME_PATTERN.test(entry.name))
        .map(async (entry) => {
          const filePath = path.join(UPLOAD_DIR, entry.name);
          const fileStat = await stat(filePath);
          if (fileStat.mtimeMs < expiresBefore) await unlink(filePath);
        }),
    );
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("[upload] cleanup failed", error);
  }
}

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
    let pathname;
    try { pathname = new URL(req.url || "/", "http://127.0.0.1").pathname; }
    catch { sendJson(res, 400, { error: "invalidPath" }); return; }
    if (pathname === "/upload" && req.method === "OPTIONS") {
      setCorsHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }
    if (pathname === "/upload" && req.method === "POST") {
      void uploadMedia(req, res);
      return;
    }
    const uploadMatch = pathname.match(/^\/uploads\/([^/]+)$/);
    if (uploadMatch && ["GET", "HEAD"].includes(req.method || "")) {
      void serveUpload(req, res, uploadMatch[1]);
      return;
    }
    sendJson(res, 404, { error: "notFound" });
  });
  const server = new WebSocketServer({ server: httpServer });
  const cleanupTimer = setInterval(() => void cleanupExpiredUploads(), 60 * 60 * 1000);
  cleanupTimer.unref();
  void cleanupExpiredUploads();
  httpServer.on("close", () => clearInterval(cleanupTimer));

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
    console.log(`signalling on ws://${HOST}:${httpServer.address().port} (rooms are in memory only)`);
  });
}

if (isMain) startServer();
