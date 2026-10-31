import { randomBytes } from "node:crypto";
import { CLI_BRIDGE_CHANNEL as C, CLI_BRIDGE_EVENT as E } from "../../src/shared/cli_bridge_protocol.js";

/** Register an isolated relay on an Electron IPC or WebSocket IPC facade. */
export function registerMcpRelayChannels(ipcMain, { getPreviewBaseUrl } = {}) {
  let canvas = null;
  let nextId = 0;
  let context = null;
  let previewSession = null;
  let previewCapture = null;
  function updateContext(value = {}) {
    const next = JSON.stringify({ documentId: typeof value?.documentId === "string" ? value.documentId : null });
    if (next === context) return;
    context = next;
    previewSession = randomBytes(24).toString("hex");
    previewCapture = null;
  }
  const pending = new Map();
  function disconnect(sender) {
    if (canvas === sender) { canvas = null; context = null; previewSession = null; previewCapture = null; }
    for (const call of pending.values()) {
      if (call.sender === sender) call.finish(new Error("Canvas disconnected"));
    }
  }
  ipcMain.handle(C.MCP_REGISTER_CANVAS, ({ sender }, value = {}) => {
    if (canvas === sender) return { ok: true };
    if (canvas) disconnect(canvas);
    canvas = sender;
    updateContext(value);
    sender.once("destroyed", () => disconnect(sender));
    return { ok: true };
  });
  ipcMain.handle(C.MCP_CANVAS_CONTEXT, ({ sender }, value) => {
    if (canvas === sender) updateContext(value);
    return { ok: canvas === sender };
  });
  const getStatus = () => ({ canvasConnected: !!canvas, ...(context ? JSON.parse(context) : {}), ...(previewSession ? { previewSession } : {}),
    ...(previewSession && getPreviewBaseUrl ? { previewUrl: `${getPreviewBaseUrl()}/preview/${previewSession}` } : {}),
  });
  ipcMain.handle(C.MCP_STATUS, getStatus);
  ipcMain.handle(C.MCP_TOOL_RESULT, ({ sender }, result = {}) => {
    const call = pending.get(result.id);
    if (call?.sender === sender) {
      call.finish(result.ok ? null : new Error(result.error || "Tool execution failed"), result.value);
    }
  });
  function callCanvas(name, args) {
    if (!canvas) throw new Error("mcp.noCanvas");
    return new Promise((resolve, reject) => {
      const id = `mcp_${++nextId}`;
      const sender = canvas;
      const sourceSession = previewSession;
      const finish = (error, value) => {
        clearTimeout(timer);
        pending.delete(id);
        if (!error && name === "capture_canvas") {
          if (sourceSession !== previewSession) error = new Error("preview.expired");
          else if (getPreviewBaseUrl) value = { ...value, previewUrl: getStatus().previewUrl };
        }
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error("Tool execution timeout")), 60000);
      pending.set(id, { sender, finish });
      try { sender.send(E.MCP_TOOL_CALL, { id, name, args }); }
      catch (error) { finish(error); }
    });
  }
  ipcMain.handle(C.MCP_CALL, (_event, name, args) => callCanvas(name, args));
  return {
    getStatus,
    async capturePreview(session) {
      if (!canvas || !session || session !== previewSession) throw new Error("preview.expired");
      // Read-only capture cannot register or mutate a canvas. Share in-flight
      // work between viewers, and reject a document switch during rendering.
      const current = canvas;
      const pendingCapture = previewCapture ??= callCanvas("capture_canvas", { maxSize: 1600 });
      try {
        const result = await pendingCapture;
        if (canvas !== current || session !== previewSession) throw new Error("preview.expired");
        return result;
      } finally { if (previewCapture === pendingCapture) previewCapture = null; }
    },
    dispose: () => {
      canvas = null;
      previewSession = null;
      for (const call of pending.values()) call.finish(new Error("Relay disposed"));
      pending.clear();
    },
    sendToCanvas: (channel, payload) => {
      if (!canvas) return false;
      try {
        canvas.send(channel, payload);
        return true;
      } catch {
        return false;
      }
    },
  };
}
