/**
 * The local CLI bridge: lets the web editor (voo.run or dev server) drive
 * local CLI agents (Claude Code, OpenAI Codex, Antigravity) without Electron.
 *
 * Starts a loopback HTTP + WebSocket server on 127.0.0.1:4179.
 * Provides a /health endpoint and WS wire protocol adapter.
 */

import { handlePreviewRequest } from "./mcp_server/preview-http.js";
import { registerMcpRelayChannels } from "./mcp_server/canvas_relay.js";
import { startDraftStreamWatcher } from "./draft_stream_watcher.js";
import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { CLI_BRIDGE_DEFAULT_PORT, CLI_BRIDGE_SERVICE_ID } from "../src/shared/cli_bridge_protocol.js";
import { writeBridgeToken } from "../src/shared/cli_bridge_token.js";
import { createWsIpcAdapter } from "./ws_ipc_adapter.js";
import { registerLocalCliIpc } from "./local_backend_bridge.js";

export const DEFAULT_CLI_BRIDGE_ORIGINS = Object.freeze([
  "null", // Opaque Origin sent by packaged Electron pages loaded with file://.
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4176",
  "http://127.0.0.1:4176",
  "http://localhost:4179",
  "http://127.0.0.1:4179",
  "https://voo.run",
  "https://la.voo.run",
]);

export function isAllowedOrigin(origin, allowedSet) {
  return typeof origin === "string" && allowedSet.has(origin);
}

function hasValidBridgeToken(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string") return false;
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}

/**
 * Registers CLI bridge channels on an ipcMain facade.
 *
 * There is no Electron `app` here, so nothing fires "before-quit": the caller
 * must call the returned `dispose()` to release the Codex child process, MCP
 * server and temp directory started by the connect handler.
 *
 * @returns {{ dispose: () => Promise<void> }}
 */
export function registerCliBridgeChannels({ ipcMain, getPreviewBaseUrl }) {
  const { dispose } = registerLocalCliIpc(ipcMain, { isAuthorized: () => true });
  const relay = registerMcpRelayChannels(ipcMain, { getPreviewBaseUrl });
  return {
    dispose: async () => {
      await dispose?.();
      relay?.dispose?.();
    },
    sendToCanvas: relay?.sendToCanvas,
    getStatus: relay.getStatus,
    capturePreview: relay.capturePreview,
  };
}

/**
 * Starts the bridge HTTP + WebSocket server.
 */
export async function startCliBridgeServer({
  port = CLI_BRIDGE_DEFAULT_PORT,
  host = "127.0.0.1",
  origins = DEFAULT_CLI_BRIDGE_ORIGINS,
  token,
  persistToken = port !== 0,
  register = registerCliBridgeChannels,
} = {}) {
  const activeToken = token || process.env.VOO_CLI_BRIDGE_TOKEN || randomBytes(32).toString("hex");
  const adapter = createWsIpcAdapter();
  // `register` may be a custom registrar with nothing to dispose.
  const registration = register({ ipcMain: adapter.ipcMain,
    getPreviewBaseUrl: () => `http://127.0.0.1:${server.address().port}`,
  });

  const allowed = new Set(origins);
  const server = http.createServer(async (request, response) => {
    // Reject DNS rebinding; preview URLs are always loopback-only.
    const expectedHost = `127.0.0.1:${server.address().port}`;
    if (request.headers.host !== expectedHost && request.headers.host !== `localhost:${server.address().port}`) {
      response.writeHead(403); response.end(); return;
    }
    if (await handlePreviewRequest(request, response, registration)) return;
    // Health probe for scripts and liveness checks
    if (request.url === "/health") {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      response.end(JSON.stringify({ ok: true, version: "1.0.0", service: CLI_BRIDGE_SERVICE_ID }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Not Found" }));
  });

  const wss = new WebSocketServer({
    server,
    verifyClient: ({ origin, req }) => {
      if (origin !== undefined) return isAllowedOrigin(origin, allowed);
      return hasValidBridgeToken(req.headers["x-voo-cli-bridge-token"], activeToken);
    },
  });

  // Attach error handler to prevent unhandled EventEmitter crashes when server errors occur
  wss.on("error", () => {});

  wss.on("connection", (socket) => {
    adapter.attach(socket);
  });

  await new Promise((resolve, reject) => {
    let settled = false;
    const onError = (err) => {
      if (settled) return;
      settled = true;
      server.removeListener("error", onError);
      try {
        wss.close();
      } catch {}
      try {
        server.close();
      } catch {}
      reject(err);
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      if (settled) return;
      settled = true;
      server.removeListener("error", onError);
      resolve();
    });
  });

  process.env.VOO_CLI_BRIDGE_TOKEN = activeToken;
  try {
    // Ephemeral/test servers must not replace the running desktop's token.
    // A random-port caller can explicitly opt in with an isolated config dir.
    if (persistToken) writeBridgeToken(activeToken);
  } catch (err) {
    try {
      wss.close();
    } catch {}
    try {
      server.close();
    } catch {}
    throw err;
  }

  const draftWatcher = startDraftStreamWatcher({
    sendToCanvas: (channel, payload) => registration?.sendToCanvas?.(channel, payload),
  });

  return {
    server,
    wss,
    port: server.address().port,
    token: activeToken,
    adapter,
    draftWatcher,
    async close() {
      draftWatcher?.close();
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {}
      }
      try {
        await new Promise((resolve) => wss.close(resolve));
        await new Promise((resolve) => server.close(resolve));
      } finally {
        // Always release agent resources, even if the sockets failed to close.
        await registration?.dispose?.();
      }
    },
  };
}
