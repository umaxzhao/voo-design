/**
 * The local CLI bridge: lets the web editor (voo.run or dev server) drive
 * local CLI agents (Claude Code, OpenAI Codex, Antigravity) without Electron.
 *
 * Starts a loopback HTTP + WebSocket server on 127.0.0.1:4179.
 * Provides a /health endpoint and WS wire protocol adapter.
 */

import { registerMcpRelayChannels } from "./mcp_server/canvas_relay.js";
import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { CLI_BRIDGE_DEFAULT_PORT } from "../src/shared/cli_bridge_protocol.js";
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

const SESSION_BRIDGE_TOKEN = process.env.VOO_CLI_BRIDGE_TOKEN || randomBytes(32).toString("hex");
process.env.VOO_CLI_BRIDGE_TOKEN = SESSION_BRIDGE_TOKEN;
writeBridgeToken(SESSION_BRIDGE_TOKEN);

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
export function registerCliBridgeChannels({ ipcMain }) {
  const { dispose } = registerLocalCliIpc(ipcMain, { isAuthorized: () => true });
  registerMcpRelayChannels(ipcMain);
  return { dispose };
}

/**
 * Starts the bridge HTTP + WebSocket server.
 */
export async function startCliBridgeServer({
  port = CLI_BRIDGE_DEFAULT_PORT,
  host = "127.0.0.1",
  origins = DEFAULT_CLI_BRIDGE_ORIGINS,
  token = SESSION_BRIDGE_TOKEN,
  register = registerCliBridgeChannels,
} = {}) {
  const adapter = createWsIpcAdapter();
  // `register` may be a custom registrar with nothing to dispose.
  const registration = register({ ipcMain: adapter.ipcMain });

  const allowed = new Set(origins);
  const server = http.createServer((request, response) => {
    // Health probe for scripts and liveness checks
    if (request.url === "/health") {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      response.end(JSON.stringify({ ok: true, version: "1.0.0" }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Not Found" }));
  });

  const wss = new WebSocketServer({
    server,
    verifyClient: ({ origin, req }) => {
      if (origin !== undefined) return isAllowedOrigin(origin, allowed);
      return hasValidBridgeToken(req.headers["x-voo-cli-bridge-token"], token);
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

  return {
    server,
    wss,
    port: server.address().port,
    adapter,
    async close() {
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
