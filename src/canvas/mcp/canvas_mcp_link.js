import { CLI_BRIDGE_CHANNEL as C, CLI_BRIDGE_EVENT as E } from "../../shared/cli_bridge_protocol.js";

const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 60000;

/**
 * Connect the current page to the local tool relay. A missing bridge is an
 * expected state, so retries are silent and back off from 5s to 60s; a
 * successful connection resets the delay.
 */
export function startCanvasMcpLink({ url, executeTool, retryBaseMs = RETRY_BASE_MS, retryMaxMs = RETRY_MAX_MS }) {
  if (typeof WebSocket === "undefined") return () => {};
  const bridgeUrl = url || import.meta.env?.VITE_CLI_BRIDGE_URL || "ws://127.0.0.1:4179";
  let socket;
  let timer;
  let stopped = false;
  let nextId = 0;
  let delay = retryBaseMs;
  function retry() {
    clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(connect, delay);
    delay = Math.min(delay * 2, retryMaxMs);
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
    ws.addEventListener("open", () => {
      delay = retryBaseMs;
      invoke(C.MCP_REGISTER_CANVAS, []);
    });
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
