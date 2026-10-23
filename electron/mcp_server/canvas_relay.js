import { CLI_BRIDGE_CHANNEL as C, CLI_BRIDGE_EVENT as E } from "../../src/shared/cli_bridge_protocol.js";

/** Register an isolated relay on an Electron IPC or WebSocket IPC facade. */
export function registerMcpRelayChannels(ipcMain) {
  let canvas = null;
  let nextId = 0;
  const pending = new Map();
  function disconnect(sender) {
    if (canvas === sender) canvas = null;
    for (const call of pending.values()) {
      if (call.sender === sender) call.finish(new Error("Canvas disconnected"));
    }
  }
  ipcMain.handle(C.MCP_REGISTER_CANVAS, ({ sender }) => {
    if (canvas === sender) return { ok: true };
    if (canvas) disconnect(canvas);
    canvas = sender;
    sender.once("destroyed", () => disconnect(sender));
    return { ok: true };
  });
  ipcMain.handle(C.MCP_STATUS, () => ({ canvasConnected: !!canvas }));
  ipcMain.handle(C.MCP_TOOL_RESULT, ({ sender }, result = {}) => {
    const call = pending.get(result.id);
    if (call?.sender === sender) {
      call.finish(result.ok ? null : new Error(result.error || "Tool execution failed"), result.value);
    }
  });
  ipcMain.handle(C.MCP_CALL, (_event, name, args) => {
    if (!canvas) throw new Error("mcp.noCanvas");
    return new Promise((resolve, reject) => {
      const id = `mcp_${++nextId}`;
      const sender = canvas;
      const finish = (error, value) => {
        clearTimeout(timer);
        pending.delete(id);
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error("Tool execution timeout")), 60000);
      pending.set(id, { sender, finish });
      try { sender.send(E.MCP_TOOL_CALL, { id, name, args }); }
      catch (error) { finish(error); }
    });
  });
}
