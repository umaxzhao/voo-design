import { WebSocket } from "ws";
import { createInterface } from "node:readline";
import { CLI_BRIDGE_CHANNEL as C, CLI_BRIDGE_DEFAULT_PORT } from "../../src/shared/cli_bridge_protocol.js";
import { startCliBridgeServer } from "../cli_bridge_server.js";
import { buildMcpTools } from "./tool_catalog.js";

function connect(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, { handshakeTimeout: 2000 });
    socket.on("error", () => {});
    socket.once("error", reject);
    socket.once("open", () => resolve(socket));
  });
}

function createBridgeClient() {
  let connection;
  let ownedBridge;
  let socket;
  let nextId = 0;
  let closed = false;
  const pending = new Map();
  async function ready() {
    if (closed) throw new Error("MCP server closed");
    if (connection) return connection;
    connection = (async () => {
      const port = Number(process.env.VOO_CLI_BRIDGE_PORT || CLI_BRIDGE_DEFAULT_PORT);
      try { socket = await connect(port); }
      catch {
        try { ownedBridge = await startCliBridgeServer({ port }); }
        catch (error) { if (error.code !== "EADDRINUSE") throw error; }
        socket = await connect(ownedBridge?.port ?? port);
      }
      socket.on("message", (data) => {
        let frame;
        try { frame = JSON.parse(data.toString()); } catch { return; }
        if (frame.type !== "result") return;
        pending.get(frame.id)?.finish(frame.ok ? null : new Error(frame.error), frame.value);
      });
      socket.once("close", () => {
        connection = null;
        for (const call of pending.values()) call.finish(new Error("Bridge disconnected"));
      });
      if (closed) { socket.close(); throw new Error("MCP server closed"); }
      return socket;
    })().catch((error) => { connection = null; throw error; });
    return connection;
  }
  return {
    ready,
    async call(name, args) {
      const ws = await ready();
      return new Promise((resolve, reject) => {
        const id = `stdio_${++nextId}`;
        const finish = (error, value) => {
          clearTimeout(timer);
          pending.delete(id);
          if (error) reject(error); else resolve(value);
        };
        const timer = setTimeout(() => finish(new Error("Tool execution timeout")), 65000);
        pending.set(id, { finish });
        try {
          ws.send(JSON.stringify({ type: "invoke", id,
            channel: name === "voo_status" ? C.MCP_STATUS : C.MCP_CALL,
            args: name === "voo_status" ? [] : [name, args] }));
        } catch (error) { finish(error); }
      });
    },
    async close() {
      closed = true;
      await connection?.catch(() => {});
      for (const call of pending.values()) call.finish(new Error("MCP server closed"));
      socket?.close();
      await ownedBridge?.close();
    },
  };
}

function toolContent(name, value) {
  const images = [];
  const text = JSON.stringify(value ?? null, (key, item) => {
    if (["capture_canvas", "export_layers"].includes(name) && key === "dataUrl" &&
        typeof item === "string" && item.startsWith("data:image/png;base64,")) {
      images.push({ type: "image", data: item.slice(22), mimeType: "image/png" });
      return undefined;
    }
    return item;
  });
  return [{ type: "text", text }, ...images];
}

/** Newline-delimited JSON-RPC; injected tools keep tests independent of sockets. */
export function createMcpStdioServer({ input, output, callTool, listTools = buildMcpTools }) {
  const bridge = callTool ? null : createBridgeClient();
  const invoke = callTool || bridge.call;
  const lines = createInterface({ input, crlfDelay: Infinity });
  const send = (id, result, error) => output.write(JSON.stringify({ jsonrpc: "2.0", id,
    ...(error ? { error } : { result }) }) + "\n");
  async function handle(frame) {
    if (!frame || frame.jsonrpc !== "2.0" || typeof frame.method !== "string") {
      send(frame?.id ?? null, null, { code: -32600, message: "Invalid Request" });
      return;
    }
    if (!Object.hasOwn(frame, "id")) return;
    const { id, method, params = {} } = frame;
    try {
      switch (method) {
        case "initialize": return send(id, { protocolVersion: params.protocolVersion || "2025-06-18",
          capabilities: { tools: {} }, serverInfo: { name: "voo-design", version: "1.0.0" } });
        case "ping": return send(id, {});
        case "tools/list": return send(id, { tools: await listTools() });
        case "tools/call": {
          try {
            if (typeof params.name !== "string") throw new Error("Tool name is required");
            if (!(await listTools()).some((tool) => tool.name === params.name)) throw new Error(`Unknown tool: ${params.name}`);
            const value = await invoke(params.name, params.arguments ?? {});
            return send(id, { content: toolContent(params.name, value) });
          } catch (error) {
            const text = error.message === "mcp.noCanvas"
              ? "No VOO canvas is connected. Open VOO Design (npm run dev / desktop) with the bridge enabled."
              : error.message || "Tool execution failed";
            return send(id, { isError: true, content: [{ type: "text", text }] });
          }
        }
        default: return send(id, null, { code: -32601, message: "Method not found" });
      }
    } catch (error) { send(id, null, { code: -32603, message: error.message }); }
  }
  lines.on("line", (line) => {
    if (!line.trim()) return;
    let frame;
    try { frame = JSON.parse(line); }
    catch { send(null, null, { code: -32700, message: "Parse error" }); return; }
    void handle(frame);
  });
  return { ready: () => bridge?.ready(), async close() { lines.close(); await bridge?.close(); } };
}

export async function startMcpStdioServer() {
  const server = createMcpStdioServer({ input: process.stdin, output: process.stdout });
  process.stdin.once("end", () => { void server.close(); });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => { void server.close().then(() => process.exit(0)); });
  }
  await server.ready();
  return server;
}
