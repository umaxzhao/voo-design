import { describe, it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createMcpStdioServer } from "../../electron/mcp_server/stdio_server.js";
import { buildMcpTools } from "../../electron/mcp_server/tool_catalog.js";
import { startCliBridgeServer } from "../../electron/cli_bridge_server.js";
import { startCanvasMcpLink } from "../../src/canvas/mcp/canvas_mcp_link.js";
import { CLI_BRIDGE_CHANNEL as C } from "../../src/shared/cli_bridge_protocol.js";

function stdio(callTool) {
  const input = new PassThrough();
  const output = new PassThrough();
  const replies = [];
  output.on("data", (chunk) => replies.push(...chunk.toString().trim().split("\n").map(JSON.parse)));
  const server = createMcpStdioServer({ input, output, callTool });
  let id = 0;
  return { input, replies, close: server.close, async request(method, params) {
    const callId = ++id;
    input.write(JSON.stringify({ jsonrpc: "2.0", id: callId, method, params }) + "\n");
    for (let n = 0; n < 100; n++) {
      const reply = replies.find((item) => item.id === callId);
      if (reply) return reply;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("Missing stdio reply");
  } };
}
async function client(port, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
    headers: { "x-voo-cli-bridge-token": token },
  });
  await once(ws, "open");
  let id = 0;
  return { ws, invoke(channel, args = []) {
    const callId = String(++id);
    return new Promise((resolve) => {
      const listener = (data) => {
        const frame = JSON.parse(data);
        if (frame.type === "result" && frame.id === callId) {
          ws.off("message", listener);
          resolve(frame);
        }
      };
      ws.on("message", listener);
      ws.send(JSON.stringify({ type: "invoke", id: callId, channel, args }));
    });
  } };
}

describe("MCP stdio", () => {
  it("publishes the composition and verification guidance in Codex tools", () => {
    const toolNames = new Set(buildMcpTools().map((tool) => tool.name));
    for (const name of ["list_comments", "create_comment", "reply_comment", "resolve_comment", "delete_comment"]) {
      expect(toolNames.has(name)).toBe(true);
    }
    const layoutTool = buildMcpTools().find((tool) => tool.name === "build_layout");
    const autoLayoutTool = buildMcpTools().find((tool) => tool.name === "mutate_auto_layout");
    expect(layoutTool.description).toContain("one top-level frame");
    expect(layoutTool.description).toContain("type=text for editable copy");
    expect(layoutTool.description).toContain("capture_canvas and inspect_layout");
    expect(layoutTool.inputSchema.$defs.node.properties.type.enum).toContain("path");
    expect(layoutTool.inputSchema.$defs.node.properties.d.type).toBe("string");
    expect(layoutTool.inputSchema.$defs.node.properties.autoLayout.properties.wrap.type).toBe("boolean");
    expect(layoutTool.inputSchema.$defs.node.properties.layoutWidth.enum).toEqual(["fixed", "hug", "fill"]);
    expect(autoLayoutTool.inputSchema.properties.config.properties.padding.anyOf).toHaveLength(2);
    expect(autoLayoutTool.inputSchema.properties.config.properties.alignContent.enum).toContain("space-evenly");
  });

  it("initializes, lists safe tools, pings and ignores notifications", async () => {
    const s = stdio(async () => ({}));
    try {
      expect((await s.request("initialize", { protocolVersion: "2025-03-26" })).result).toMatchObject({
        protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "voo-design" },
      });
      expect((await s.request("initialize")).result.protocolVersion).toBe("2025-06-18");
      const tools = (await s.request("tools/list")).result.tools;
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["create_frame", "create_shape", "capture_canvas", "voo_status"]));
      for (const name of ["generate_image", "generate_image_web", "place_image", "update_plan", "get_plan"]) {
        expect(tools.some((t) => t.name === name)).toBe(false);
      }
      s.input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
      expect((await s.request("ping")).result).toEqual({});
      expect(s.replies.every((r) => Object.hasOwn(r, "id"))).toBe(true);
      expect((await s.request("unknown")).error.code).toBe(-32601);
      s.input.write('bad json\n');
      await s.request("ping");
      expect(s.replies.some((r) => r.error?.code === -32700)).toBe(true);
    } finally { await s.close(); }
  });
  it("returns tool results, image content and friendly execution errors", async () => {
    const s = stdio(async (name, args) => {
      if (name === "create_shape") return { id: "shape", ...args };
      if (name === "capture_canvas" || name === "export_layers") return { nested: [{ dataUrl: "data:image/png;base64,YWJj", width: 20 }] };
      if (name === "voo_status") return { canvasConnected: true };
      if (name === "undo") throw new Error("failed");
      throw new Error("mcp.noCanvas");
    });
    try {
      expect((await s.request("tools/call", { name: "create_shape", arguments: { x: 2 } })).result.content[0].text).toBe('{"id":"shape","x":2}');
      for (const name of ["capture_canvas", "export_layers"]) {
        expect((await s.request("tools/call", { name })).result.content).toEqual([
          { type: "text", text: '{"nested":[{"width":20}]}' },
          { type: "image", data: "YWJj", mimeType: "image/png" },
        ]);
      }
      expect((await s.request("tools/call", { name: "voo_status" })).result.content[0].text).toBe('{"canvasConnected":true}');
      expect((await s.request("tools/call", { name: "undo" })).result).toMatchObject({ isError: true, content: [{ text: "failed" }] });
      expect((await s.request("tools/call", { name: "create_frame" })).result.content[0].text).toContain("No VOO canvas is connected");
    } finally { await s.close(); }
  });
  it("lists and reads canvas resources with binary blobs and error handling", async () => {
    const s = stdio(async (name) => {
      if (name === "inspect_layer_tree") return { root: "doc", children: [{ id: "layer1" }] };
      if (name === "describe_selection") return { selected: ["layer1"] };
      if (name === "capture_canvas") return { dataUrl: "data:image/png;base64,QUJDRA==" };
      if (name === "voo_status") return { canvasConnected: true };
      throw new Error("mcp.noCanvas");
    });
    try {
      const list = (await s.request("resources/list")).result.resources;
      expect(list.map((r) => r.uri)).toEqual([
        "voo://canvas/tree",
        "voo://canvas/selection",
        "voo://canvas/preview.png",
        "voo://canvas/status",
      ]);
      expect((await s.request("resources/templates/list")).result.resourceTemplates).toEqual([]);

      const tree = (await s.request("resources/read", { uri: "voo://canvas/tree" })).result.contents[0];
      expect(tree.mimeType).toBe("application/json");
      expect(JSON.parse(tree.text)).toEqual({ root: "doc", children: [{ id: "layer1" }] });

      const sel = (await s.request("resources/read", { uri: "voo://canvas/selection" })).result.contents[0];
      expect(JSON.parse(sel.text)).toEqual({ selected: ["layer1"] });

      const preview = (await s.request("resources/read", { uri: "voo://canvas/preview.png" })).result.contents[0];
      expect(preview.mimeType).toBe("image/png");
      expect(preview.blob).toBe("QUJDRA==");

      const status = (await s.request("resources/read", { uri: "voo://canvas/status" })).result.contents[0];
      expect(JSON.parse(status.text)).toEqual({ canvasConnected: true });

      const unknown = (await s.request("resources/read", { uri: "voo://canvas/unknown" }));
      expect(unknown.error.code).toBe(-32602);
    } finally { await s.close(); }
  });
});

describe("MCP relay", () => {
  it("registers the page link and serializes executor results and errors", async () => {
    const bridge = await startCliBridgeServer({ port: 0 });
    function BrowserOriginWebSocket(url) {
      return new WebSocket(url, { origin: "http://localhost:5173" });
    }
    BrowserOriginWebSocket.OPEN = WebSocket.OPEN;
    vi.stubGlobal("WebSocket", BrowserOriginWebSocket);
    const executeTool = vi.fn(async (name, args) => {
      if (name === "fail") throw new Error("page failure");
      if (name === "empty") return undefined;
      return { ...args, ignored: undefined };
    });
    const stop = startCanvasMcpLink({ url: `ws://127.0.0.1:${bridge.port}`, executeTool });
    try {
      const caller = await client(bridge.port, process.env.VOO_CLI_BRIDGE_TOKEN);
      for (let n = 0; n < 100; n++) {
        if ((await caller.invoke(C.MCP_STATUS)).value.canvasConnected) break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect((await caller.invoke(C.MCP_CALL, ["create_shape", { x: 7 }])).value).toEqual({ x: 7 });
      expect(executeTool).toHaveBeenCalledWith("create_shape", { x: 7 });
      expect((await caller.invoke(C.MCP_CALL, ["empty", {}])).value).toBeNull();
      expect(await caller.invoke(C.MCP_CALL, ["fail", {}])).toMatchObject({ ok: false, error: "page failure" });
      stop();
      for (let n = 0; n < 100; n++) {
        if (!(await caller.invoke(C.MCP_STATUS)).value.canvasConnected) break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect((await caller.invoke(C.MCP_STATUS)).value.canvasConnected).toBe(false);
    } finally {
      stop();
      vi.unstubAllGlobals();
      await bridge.close();
    }
  });
  it("uses the real WebSocket transport for status and tool calls", async () => {
    const bridge = await startCliBridgeServer({ port: 0 });
    const previousPort = process.env.VOO_CLI_BRIDGE_PORT;
    process.env.VOO_CLI_BRIDGE_PORT = String(bridge.port);
    const s = stdio();
    try {
      expect((await s.request("tools/call", { name: "voo_status" })).result.content[0].text).toBe('{"canvasConnected":false}');
      expect((await s.request("tools/call", { name: "create_frame" })).result).toMatchObject({ isError: true });
      const page = await client(bridge.port, process.env.VOO_CLI_BRIDGE_TOKEN);
      await page.invoke(C.MCP_REGISTER_CANVAS);
      page.ws.on("message", (data) => {
        const frame = JSON.parse(data);
        if (frame.type === "event") void page.invoke(C.MCP_TOOL_RESULT, [{ id: frame.payload.id, ok: true, value: { id: "frame" } }]);
      });
      expect((await s.request("tools/call", { name: "create_frame" })).result.content[0].text).toBe('{"id":"frame"}');
      expect((await s.request("tools/call", { name: "voo_status" })).result.content[0].text).toBe('{"canvasConnected":true}');
    } finally {
      await s.close();
      await bridge.close();
      if (previousPort === undefined) delete process.env.VOO_CLI_BRIDGE_PORT;
      else process.env.VOO_CLI_BRIDGE_PORT = previousPort;
    }
  });
  it("round-trips tools, authenticates results, handles replacement and disconnect", async () => {
    const bridge = await startCliBridgeServer({ port: 0 });
    try {
      const page = await client(bridge.port, process.env.VOO_CLI_BRIDGE_TOKEN);
      const caller = await client(bridge.port, process.env.VOO_CLI_BRIDGE_TOKEN);
      expect(await caller.invoke(C.MCP_CALL, ["create_shape", {}])).toMatchObject({ ok: false, error: "mcp.noCanvas" });
      await page.invoke(C.MCP_REGISTER_CANVAS);
      expect((await caller.invoke(C.MCP_STATUS)).value.canvasConnected).toBe(true);
      page.ws.on("message", async (data) => {
        const frame = JSON.parse(data);
        if (frame.type !== "event") return;
        const { id, name, args } = frame.payload;
        if (name === "hold") return;
        await caller.invoke(C.MCP_TOOL_RESULT, [{ id, ok: true, value: "forged" }]);
        await page.invoke(C.MCP_TOOL_RESULT, [{ id, ok: name !== "fail", value: args, error: "tool failed" }]);
      });
      expect((await caller.invoke(C.MCP_CALL, ["create_shape", { x: 4 }])).value).toEqual({ x: 4 });
      expect(await caller.invoke(C.MCP_CALL, ["fail", {}])).toMatchObject({ ok: false, error: "tool failed" });
      const event = once(page.ws, "message");
      const pending = caller.invoke(C.MCP_CALL, ["hold", {}]);
      await event;
      const replacement = await client(bridge.port, process.env.VOO_CLI_BRIDGE_TOKEN);
      await replacement.invoke(C.MCP_REGISTER_CANVAS);
      expect(await pending).toMatchObject({ ok: false, error: "Canvas disconnected" });
      page.ws.close();
      const closed = once(replacement.ws, "close");
      replacement.ws.close();
      await closed;
      let canvasConnected = true;
      for (let n = 0; n < 100 && canvasConnected; n++) {
        canvasConnected = (await caller.invoke(C.MCP_STATUS)).value.canvasConnected;
        if (canvasConnected) await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(canvasConnected).toBe(false);
    } finally { await bridge.close(); }
  });
});
