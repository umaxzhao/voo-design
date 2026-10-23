import { CLI_BRIDGE_CHANNEL as C, CLI_BRIDGE_EVENT as E } from "../../shared/cli_bridge_protocol.js";

/** Connect the current page to the local tool relay; retry quietly every 5s. */
export function startCanvasMcpLink({ url, executeTool }) {
  if (typeof WebSocket === "undefined") return () => {};
  const bridgeUrl = url || import.meta.env?.VITE_CLI_BRIDGE_URL || "ws://127.0.0.1:4179";
  let socket;
  let timer;
  let stopped = false;
  let nextId = 0;
  function retry() {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(connect, 5000);
  }
  function connect() {
    if (stopped) return;
    let ws;
    try { ws = socket = new WebSocket(bridgeUrl); }
    catch { retry(); return; }
    const invoke = (channel, args) => {
      if (!stopped && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "invoke", id: `page_${++nextId}`, channel, args }));
      }
    };
    ws.addEventListener("open", () => invoke(C.MCP_REGISTER_CANVAS, []));
    ws.addEventListener("message", async (event) => {
      let frame;
      try { frame = JSON.parse(event.data); } catch { return; }
      if (frame.type !== "event" || frame.channel !== E.MCP_TOOL_CALL || !frame.payload) return;
      const { id, name, args } = frame.payload;
      let result;
      try {
        const value = await executeTool(name, args ?? {});
        result = { id, ok: true, value: JSON.parse(JSON.stringify(value ?? null)) };
      } catch (error) { result = { id, ok: false, error: error?.message || String(error) }; }
      invoke(C.MCP_TOOL_RESULT, [result]);
    });
    ws.addEventListener("close", retry);
    ws.addEventListener("error", () => {});
  }
  connect();
  return () => { stopped = true; clearTimeout(timer); socket?.close(); };
}
