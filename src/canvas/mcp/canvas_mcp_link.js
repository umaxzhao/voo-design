import { CLI_BRIDGE_CHANNEL as C, CLI_BRIDGE_EVENT as E } from "../../shared/cli_bridge_protocol.js";
import { setAgentCursor } from "../editor/chrome_stage_overlays.js";

const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 60000;

/**
 * Connect the current page to the local tool relay. A missing bridge is an
 * expected state, so retries are silent and back off from 5s to 60s; a
 * successful connection resets the delay.
 */
export function startCanvasMcpLink({ url, executeTool, retryBaseMs = RETRY_BASE_MS, retryMaxMs = RETRY_MAX_MS, getContext = () => ({}), subscribeContext = () => () => {} }) {
  if (typeof WebSocket === "undefined") return () => {};
  const bridgeUrl = url || import.meta.env?.VITE_CLI_BRIDGE_URL || "ws://127.0.0.1:4179";
  let socket;
  let timer;
  let stopped = false;
  let nextId = 0;
  let sendContext = () => {};
  const stopContext = subscribeContext(() => sendContext());
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
    sendContext = () => invoke(C.MCP_CANVAS_CONTEXT, [getContext()]);
    ws.addEventListener("open", () => {
      delay = retryBaseMs;
      invoke(C.MCP_REGISTER_CANVAS, [getContext()]);
    });
    ws.addEventListener("message", async (event) => {
      let frame;
      try { frame = JSON.parse(event.data); } catch { return; }
      if (frame.type === "event" && frame.channel === E.STREAM_LAYOUT_UPDATE && frame.payload) {
        const { html, clear, final } = frame.payload;
        const stream = args => executeTool("stream_layout", args).catch(error => {
          if (error.name !== "AbortError") console.error("[stream_layout]", error);
        });
        if (clear || (typeof html === "string" && !html.trim())) {
          void stream({ clear: true });
        } else if (typeof html === "string") {
          const isFinal = /<!--\s*(?:voo:final|VOOFINISH)\s*-->/i.test(html);
          const cleaned = html.replace(/<!--\s*(?:voo:final|VOOFINISH)\s*-->/gi, "");
          void stream({ html: cleaned, final: Boolean(final) || isFinal });
        }
        return;
      }
      if (frame.type !== "event" || frame.channel !== E.MCP_TOOL_CALL || !frame.payload) return;
      const { id, name, args } = frame.payload;
      let cursorX = typeof args?.x === "number" ? args.x : null;
      let cursorY = typeof args?.y === "number" ? args.y : null;
      if (cursorX === null && Array.isArray(args?.nodes) && args.nodes.length > 0) {
        cursorX = args.nodes[0].x ?? 0;
        cursorY = args.nodes[0].y ?? 0;
      }
      if (cursorX !== null && cursorY !== null) {
        const labelMap = {
          build_layout: "构建设计图层...",
          create_frame: "创建画板容器...",
          create_shape: "绘制图形...",
          create_path: "生成贝塞尔曲线...",
          mutate_layer_style: "调整样式渐变...",
          mutate_layer_layout: "调整位置尺寸...",
          mutate_auto_layout: "计算弹性排版...",
          stream_layout: "实时流式构建...",
        };
        const label = args?.label || labelMap[name] || name;
        setAgentCursor({ x: cursorX, y: cursorY, label, durationMs: 4000 });
      }
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
  return () => { stopped = true; stopContext(); clearTimeout(timer); socket?.close(); };
}
