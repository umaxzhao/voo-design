// Standalone canvas bridge used when no VOO app or repository checkout exists.
// It speaks the same wire contract as `electron/cli_bridge_server.js`, so these
// tests also guard the protocol parity with `src/shared/cli_bridge_protocol.js`.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  BRIDGE_CHANNEL,
  BRIDGE_EVENT,
  DEFAULT_ORIGINS,
  BRIDGE_PORT,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SERVICE_ID,
  startBridgeLite,
  tokenFilePath,
} from "../../plugins/voo/lib/bridge-lite.js";
import {
  CLI_BRIDGE_CHANNEL,
  CLI_BRIDGE_DEFAULT_PORT,
  CLI_BRIDGE_EVENT,
  CLI_BRIDGE_PROTOCOL_VERSION,
  CLI_BRIDGE_SERVICE_ID,
} from "../../src/shared/cli_bridge_protocol.js";

const bridges = [];
const sockets = [];
const tempRoots = [];

async function start(options = {}) {
  const bridge = await startBridgeLite({ port: 0, persistToken: false, logger: { warn() {}, info() {} }, ...options });
  bridges.push(bridge);
  return bridge;
}

function connect(url, options) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    sockets.push(socket);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function invoke(socket, id, channel, args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("invoke timeout")), 5000);
    const onMessage = (data) => {
      let frame;
      try {
        frame = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (frame.type !== "result" || frame.id !== id) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(frame);
    };
    socket.on("message", onMessage);
    socket.send(JSON.stringify({ type: "invoke", id, channel, args }));
  });
}

function nextEvent(socket, channel) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("event timeout")), 5000);
    const onMessage = (data) => {
      let frame;
      try {
        frame = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (frame.type !== "event" || frame.channel !== channel) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(frame.payload);
    };
    socket.on("message", onMessage);
  });
}

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "voo-bridge-lite-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const bridge of bridges.splice(0)) await bridge.close().catch(() => {});
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("standalone canvas bridge", () => {
  it("shares the wire contract with the repository bridge", () => {
    expect(BRIDGE_PORT).toBe(CLI_BRIDGE_DEFAULT_PORT);
    expect(BRIDGE_SERVICE_ID).toBe(CLI_BRIDGE_SERVICE_ID);
    expect(BRIDGE_PROTOCOL_VERSION).toBe(CLI_BRIDGE_PROTOCOL_VERSION);
    expect(BRIDGE_CHANNEL).toMatchObject({
      MCP_REGISTER_CANVAS: CLI_BRIDGE_CHANNEL.MCP_REGISTER_CANVAS,
      MCP_CANVAS_CONTEXT: CLI_BRIDGE_CHANNEL.MCP_CANVAS_CONTEXT,
      MCP_TOOL_RESULT: CLI_BRIDGE_CHANNEL.MCP_TOOL_RESULT,
      MCP_CALL: CLI_BRIDGE_CHANNEL.MCP_CALL,
      MCP_STATUS: CLI_BRIDGE_CHANNEL.MCP_STATUS,
    });
    expect(BRIDGE_EVENT.MCP_TOOL_CALL).toBe(CLI_BRIDGE_EVENT.MCP_TOOL_CALL);
    expect(DEFAULT_ORIGINS).toContain("http://127.0.0.1:4173");
    expect(DEFAULT_ORIGINS).toContain("https://voo.run");
  });

  it("serves a health probe and rejects unknown routes", async () => {
    const bridge = await start();
    const health = await fetch(`http://127.0.0.1:${bridge.port}/health`).then((response) => response.json());
    expect(health).toEqual({ ok: true, version: BRIDGE_PROTOCOL_VERSION, service: BRIDGE_SERVICE_ID, mode: "lite" });
    const missing = await fetch(`http://127.0.0.1:${bridge.port}/nope`);
    expect(missing.status).toBe(404);
  });

  it("accepts the editor origin and relays canvas tool calls", async () => {
    const bridge = await start();
    const url = `ws://127.0.0.1:${bridge.port}`;
    const page = await connect(url, { origin: "http://127.0.0.1:4173" });
    const mcp = await connect(url, { headers: { "x-voo-cli-bridge-token": bridge.token } });

    const registered = await invoke(page, "page_1", BRIDGE_CHANNEL.MCP_REGISTER_CANVAS, [{ documentId: "document-7" }]);
    expect(registered.ok).toBe(true);

    const status = await invoke(mcp, "stdio_1", BRIDGE_CHANNEL.MCP_STATUS, []);
    expect(status.ok).toBe(true);
    expect(status.value).toMatchObject({ canvasConnected: true, documentId: "document-7" });

    const toolCall = nextEvent(page, BRIDGE_EVENT.MCP_TOOL_CALL);
    const call = invoke(mcp, "stdio_2", BRIDGE_CHANNEL.MCP_CALL, ["create_frame", { x: 0, y: 0 }]);
    const event = await toolCall;
    expect(event).toMatchObject({ name: "create_frame", args: { x: 0, y: 0 } });
    await invoke(page, "page_2", BRIDGE_CHANNEL.MCP_TOOL_RESULT, [{ id: event.id, ok: true, value: { ok: true, layerId: "layer-1" } }]);
    await expect(call).resolves.toMatchObject({ ok: true, value: { ok: true, layerId: "layer-1" } });

    // A context update reaches the status probe too.
    await invoke(page, "page_3", BRIDGE_CHANNEL.MCP_CANVAS_CONTEXT, [{ documentId: "document-8" }]);
    const updated = await invoke(mcp, "stdio_3", BRIDGE_CHANNEL.MCP_STATUS, []);
    expect(updated.value.documentId).toBe("document-8");
  });

  it("reports a clear error when no canvas is registered", async () => {
    const bridge = await start();
    const mcp = await connect(`ws://127.0.0.1:${bridge.port}`, { headers: { "x-voo-cli-bridge-token": bridge.token } });
    const result = await invoke(mcp, "stdio_1", BRIDGE_CHANNEL.MCP_CALL, ["build_layout", {}]);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("mcp.noCanvas");
  });

  it("refuses a page origin outside the allowlist", async () => {
    const bridge = await start();
    await expect(connect(`ws://127.0.0.1:${bridge.port}`, { origin: "http://evil.test" })).rejects.toBeTruthy();
  });

  it("writes the token file the MCP stdio server reads", async () => {
    const root = tempRoot();
    const tokenPath = path.join(root, "voo-design", "cli-bridge-token");
    const bridge = await start({ persistToken: true, tokenPath });
    expect(fs.readFileSync(tokenPath, "utf8").trim()).toBe(bridge.token);
    expect(fs.statSync(tokenPath).mode & 0o777).toBe(0o600);
    // Default path mirrors the repository helper's XDG/HOME resolution.
    expect(tokenFilePath({ XDG_CONFIG_HOME: root })).toBe(path.join(root, "voo-design", "cli-bridge-token"));
    expect(tokenFilePath({})).toBe(path.join(os.homedir(), ".config", "voo-design", "cli-bridge-token"));
  });

  it("answers CORS health probes and enforces the loopback Host header", async () => {
    const bridge = await start();
    const response = await fetch(`http://127.0.0.1:${bridge.port}/health`);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const wrongHost = await new Promise((resolve, reject) => {
      const request = http.request(
        { host: "127.0.0.1", port: bridge.port, path: "/health", headers: { host: "evil.test" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      request.on("error", reject);
      request.end();
    });
    expect(wrongHost).toBe(403);
  });
});
