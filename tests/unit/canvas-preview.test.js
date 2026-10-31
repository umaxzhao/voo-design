import { describe, expect, it } from "vitest";
import { registerMcpRelayChannels } from "../../electron/mcp_server/canvas_relay.js";
import { CLI_BRIDGE_CHANNEL as C, CLI_BRIDGE_EVENT as E } from "../../src/shared/cli_bridge_protocol.js";

function fixture() {
  const handlers = new Map();
  const relay = registerMcpRelayChannels({ handle: (id, fn) => handlers.set(id, fn) });
  const invoke = (channel, sender, ...args) => handlers.get(channel)({ sender }, ...args);
  const sender = { once() {}, send(channel, payload) {
    if (channel === E.MCP_TOOL_CALL) queueMicrotask(() => invoke(C.MCP_TOOL_RESULT, sender,
      { id: payload.id, ok: true, value: { dataUrl: "data:image/png;base64,AAAA", width: 120, height: 80 } }));
  } };
  return { relay, invoke, sender };
}

describe("Read-only canvas preview binding", () => {
  it("captures the connected canvas without registering another writable target", async () => {
    const { relay, invoke, sender } = fixture();
    invoke(C.MCP_REGISTER_CANVAS, sender, { documentId: "document-a" });
    const status = invoke(C.MCP_STATUS);
    expect(status.previewSession).toBeTruthy();
    const shot = await relay.capturePreview(status.previewSession);
    expect(shot).toMatchObject({ width: 120, height: 80 });
    expect(invoke(C.MCP_STATUS).previewSession).toBe(status.previewSession);
    relay.dispose();
  });
  it("invalidates old links when document or writable canvas changes", async () => {
    const { relay, invoke, sender } = fixture();
    invoke(C.MCP_REGISTER_CANVAS, sender, { documentId: "document-a" });
    const session = invoke(C.MCP_STATUS).previewSession;
    invoke(C.MCP_CANVAS_CONTEXT, sender, { documentId: "document-b" });
    await expect(relay.capturePreview(session)).rejects.toThrow("preview.expired");
    const next = invoke(C.MCP_STATUS).previewSession;
    invoke(C.MCP_CANVAS_CONTEXT, {}, { documentId: "forged" });
    expect(invoke(C.MCP_STATUS).previewSession).toBe(next);
    invoke(C.MCP_REGISTER_CANVAS, { once() {} }, { documentId: "document-c" });
    await expect(relay.capturePreview(next)).rejects.toThrow("preview.expired");
    relay.dispose();
  });
});

it("rejects a capture that finishes after the source document switches", async () => {
  const { relay, invoke, sender } = fixture();
  let complete;
  sender.send = (_channel, payload) => { complete = payload; };
  invoke(C.MCP_REGISTER_CANVAS, sender, { documentId: "before" });
  const first = invoke(C.MCP_STATUS).previewSession;
  const capture = relay.capturePreview(first);
  invoke(C.MCP_CANVAS_CONTEXT, sender, { documentId: "after" });
  invoke(C.MCP_TOOL_RESULT, sender, { id: complete.id, ok: true, value: { dataUrl: "data:image/png;base64,AAAA" } });
  await expect(capture).rejects.toThrow("preview.expired");
  relay.dispose();
});
