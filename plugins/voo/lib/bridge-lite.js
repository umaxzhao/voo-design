/**
 * Standalone (App-less) VOO canvas bridge.
 *
 * The full bridge in `electron/cli_bridge_server.js` also hosts local CLI agents
 * and preview rendering, which needs the repository and Electron-free helper
 * modules. A DeepSeek Harness panel only needs the MCP canvas relay: the editor
 * page registers as the canvas and the `mcp__voo__*` tools are forwarded to it.
 * This module implements exactly that subset with `node:http` + `ws`, so the
 * portable connector can drive a panel editor without the VOO desktop app or a
 * repository checkout.
 *
 * Wire contract (must stay in sync with `src/shared/cli_bridge_protocol.js`):
 *   page  -> bridge  { type: "invoke", id, channel, args }
 *   bridge -> page   { type: "result", id, ok, value | error }
 *   bridge -> page   { type: "event", channel, payload }
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { WebSocketServer } from "ws";

/** Mirrors `CLI_BRIDGE_DEFAULT_PORT`. */
export const BRIDGE_PORT = 4179;
export const BRIDGE_SERVICE_ID = "voo-cli-bridge";
export const BRIDGE_PROTOCOL_VERSION = "1.0.0";
/** Mirrors `CLI_BRIDGE_CHANNEL`; a unit test compares both lists. */
export const BRIDGE_CHANNEL = Object.freeze({
  MCP_REGISTER_CANVAS: "voo:mcp-register-canvas",
  MCP_CANVAS_CONTEXT: "voo:mcp-canvas-context",
  MCP_TOOL_RESULT: "voo:mcp-tool-result",
  MCP_CALL: "voo:mcp-call",
  MCP_STATUS: "voo:mcp-status",
});
/** Mirrors `CLI_BRIDGE_EVENT`. */
export const BRIDGE_EVENT = Object.freeze({ MCP_TOOL_CALL: "voo:mcp-tool-call" });
const MESSAGE = Object.freeze({ INVOKE: "invoke", RESULT: "result", EVENT: "event" });

/** Origins allowed to connect without the CLI token (same list as the full bridge). */
export const DEFAULT_ORIGINS = Object.freeze([
  "null",
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

const CLOSE_INVALID_FRAME = 1003;
const TOOL_TIMEOUT_MS = 65000;

/** Same token file the MCP stdio server reads (`src/shared/cli_bridge_token.js`). */
export function tokenFilePath(env = process.env) {
  const custom = typeof env?.XDG_CONFIG_HOME === "string" && env.XDG_CONFIG_HOME.trim();
  const configDir = custom ? path.join(env.XDG_CONFIG_HOME.trim(), "voo-design") : path.join(os.homedir(), ".config", "voo-design");
  return path.join(configDir, "cli-bridge-token");
}

function writeTokenFile(filePath, token) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${token.trim()}\n`, { mode: 0o600 });
}

function createSender(socket) {
  let destroyed = false;
  const destroyListeners = [];
  socket.on("close", () => {
    destroyed = true;
    for (const listener of destroyListeners.splice(0)) listener();
  });
  return {
    isDestroyed: () => destroyed,
    send(channel, payload) {
      if (destroyed) return;
      try {
        socket.send(JSON.stringify({ type: MESSAGE.EVENT, channel, payload }));
      } catch {}
    },
    once(eventName, listener) {
      if (eventName !== "destroyed") return;
      if (destroyed) listener();
      else destroyListeners.push(listener);
    },
  };
}

/**
 * Start the standalone canvas bridge.
 *
 * @param {{port?: number, host?: string, origins?: string[], token?: string, persistToken?: boolean, tokenPath?: string, logger?: Console}} [options]
 * @returns {Promise<{port: number, token: string, mode: "lite", close: () => Promise<void>}>}
 */
export async function startBridgeLite(options = {}) {
  const {
    port = BRIDGE_PORT,
    host = "127.0.0.1",
    origins = DEFAULT_ORIGINS,
    token = randomBytes(32).toString("hex"),
    persistToken = port !== 0,
    tokenPath = tokenFilePath(),
    logger = console,
  } = options;
  const allowed = new Set(origins);

  let canvas = null;
  let context = null;
  let nextId = 0;
  const pending = new Map();

  const disconnect = (sender) => {
    if (canvas !== sender) return;
    canvas = null;
    context = null;
    for (const call of pending.values()) if (call.sender === sender) call.finish(new Error("Canvas disconnected"));
  };

  const updateContext = (value = {}) => {
    const next = JSON.stringify({ documentId: typeof value?.documentId === "string" ? value.documentId : null });
    if (next !== context) context = next;
  };

  const getStatus = () => ({ canvasConnected: !!canvas, ...(context ? JSON.parse(context) : {}) });

  const callCanvas = (name, args) => {
    if (!canvas) throw new Error("mcp.noCanvas");
    const sender = canvas;
    return new Promise((resolve, reject) => {
      const id = `mcp_${++nextId}`;
      const finish = (error, value) => {
        clearTimeout(timer);
        pending.delete(id);
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error("Tool execution timeout")), TOOL_TIMEOUT_MS);
      pending.set(id, { sender, finish });
      try {
        sender.send(BRIDGE_EVENT.MCP_TOOL_CALL, { id, name, args });
      } catch (error) {
        finish(error);
      }
    });
  };

  const handlers = new Map([
    [BRIDGE_CHANNEL.MCP_REGISTER_CANVAS, ({ sender }, value = {}) => {
      if (canvas !== sender) {
        if (canvas) disconnect(canvas);
        canvas = sender;
        updateContext(value);
        sender.once("destroyed", () => disconnect(sender));
      }
      return { ok: true };
    }],
    [BRIDGE_CHANNEL.MCP_CANVAS_CONTEXT, ({ sender }, value) => {
      if (canvas === sender) updateContext(value);
      return { ok: canvas === sender };
    }],
    [BRIDGE_CHANNEL.MCP_STATUS, () => getStatus()],
    [BRIDGE_CHANNEL.MCP_TOOL_RESULT, ({ sender }, result = {}) => {
      const call = pending.get(result.id);
      if (call?.sender === sender) call.finish(result.ok ? null : new Error(result.error || "Tool execution failed"), result.value);
      return { ok: true };
    }],
    [BRIDGE_CHANNEL.MCP_CALL, (_ctx, name, args) => callCanvas(name, args)],
  ]);

  const server = http.createServer((request, response) => {
    const expectedHost = `127.0.0.1:${server.address().port}`;
    if (request.headers.host !== expectedHost && request.headers.host !== `localhost:${server.address().port}`) {
      response.writeHead(403);
      response.end();
      return;
    }
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      response.end(JSON.stringify({ ok: true, version: BRIDGE_PROTOCOL_VERSION, service: BRIDGE_SERVICE_ID, mode: "lite" }));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Not Found" }));
  });

  const wss = new WebSocketServer({
    server,
    verifyClient: ({ origin, req }) => {
      if (origin !== undefined) return typeof origin === "string" && allowed.has(origin);
      const candidate = req.headers["x-voo-cli-bridge-token"];
      if (typeof candidate !== "string") return false;
      const a = Buffer.from(candidate);
      const b = Buffer.from(token);
      return a.length === b.length && timingSafeEqual(a, b);
    },
  });
  wss.on("error", () => {});

  wss.on("connection", (socket) => {
    const sender = createSender(socket);
    socket.on("message", async (data) => {
      let frame;
      try {
        frame = JSON.parse(typeof data === "string" ? data : data.toString());
      } catch {
        try { socket.close(CLOSE_INVALID_FRAME, "invalid frame"); } catch {}
        return;
      }
      if (!frame || frame.type !== MESSAGE.INVOKE || typeof frame.id !== "string" || typeof frame.channel !== "string") {
        try { socket.close(CLOSE_INVALID_FRAME, "invalid frame"); } catch {}
        return;
      }
      const handler = handlers.get(frame.channel);
      let reply;
      try {
        if (!handler) throw new Error("cli.unknownChannel");
        const args = Array.isArray(frame.args) ? frame.args : [];
        reply = { ok: true, value: await handler({ sender }, ...args) };
      } catch (error) {
        reply = { ok: false, error: error?.message || "cli.failed" };
      }
      if (sender.isDestroyed()) return;
      try {
        socket.send(JSON.stringify({ type: MESSAGE.RESULT, id: frame.id, ...reply }));
      } catch {}
    });
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  const actualPort = server.address().port;
  if (persistToken) {
    try {
      writeTokenFile(tokenPath, token);
    } catch (error) {
      logger.warn?.(`[voo] could not write the bridge token file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    port: actualPort,
    token,
    mode: "lite",
    close: async () => {
      for (const call of pending.values()) call.finish(new Error("Bridge closed"));
      pending.clear();
      for (const client of wss.clients) {
        try { client.terminate(); } catch {}
      }
      await new Promise((resolve) => {
        wss.close(() => resolve());
      });
      await new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}
