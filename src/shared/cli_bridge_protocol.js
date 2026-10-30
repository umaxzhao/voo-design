/**
 * Wire contract between the local CLI bridge (`npm run bridge`) and the web
 * editor. Both ends import it, so a channel rename cannot drift apart.
 *
 * The bridge carries exactly the desktop `vooDesktop.localCli` surface over a
 * loopback WebSocket — the channel names are the desktop IPC channel names —
 * so the agent loop runs unchanged in a browser.
 *
 * Frames are JSON:
 *   page   -> bridge  { type: "invoke", id, channel, args }
 *   bridge -> page    { type: "result", id, ok, value | error }
 *   bridge -> page    { type: "event", channel, payload }
 *
 * Pure data — safe to import from Node and from browser code.
 */

/** Loopback port the bridge binds and the page dials unless overridden. */
export const CLI_BRIDGE_DEFAULT_PORT = 4179;

/** Native agent admission must agree in the renderer and every CLI host. */
export const NATIVE_AGENT_CLI_IDS = Object.freeze([
  "codex",
  "claude",
  "antigravity",
  "opencode",
]);

/** Invokable channels (same names the desktop preload uses over IPC). */
export const CLI_BRIDGE_CHANNEL = Object.freeze({
  CONNECT: "voo:codex-connect",
  ADVANCE: "voo:codex-advance",
  CANCEL: "voo:codex-cancel",
  CHECK_ALL: "voo:cli-check-all",
  RUN_TEXT: "voo:cli-run-text",
  // DeepSeek Harness connector: detection (read-only) and one-click install.
  DSH_STATUS: "voo:dsh-connector-status",
  DSH_INSTALL: "voo:dsh-connector-install",
  MCP_REGISTER_CANVAS: "voo:mcp-register-canvas",
  MCP_TOOL_RESULT: "voo:mcp-tool-result",
  MCP_CALL: "voo:mcp-call",
  MCP_STATUS: "voo:mcp-status",
});

/** Events the bridge pushes without being asked. */
export const CLI_BRIDGE_EVENT = Object.freeze({
  TEXT: "voo:codex-text",
  MCP_TOOL_CALL: "voo:mcp-tool-call",
  STREAM_LAYOUT_UPDATE: "voo:stream-layout-update",
});

/** Frame `type` values. */
export const CLI_BRIDGE_MESSAGE = Object.freeze({
  INVOKE: "invoke",
  RESULT: "result",
  EVENT: "event",
});
