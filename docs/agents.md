# Agents

VOO can be driven by agents in two ways: the built-in **design agent** (a
tool-calling chat powered by a configured model provider) and **local CLI
agents** already installed on your machine (Claude Code, Codex, OpenCode,
Antigravity). Both act on the canvas only through the same set of **canvas
tools**.

## Canvas tools

Defined in `src/canvas/agent/canvas_tools.js`
(`CANVAS_TOOL_SCHEMAS`); execution is transactional, mutation-focused, and
kept in sync with undo/redo:

| Tool | Effect |
| :--- | :--- |
| `generate_image` | Generates an image and places it as a new image layer. If a layer is selected and `useSelection` is not false, the selection is the reference image. |
| `describe_selection` | Reports which layer is currently selected. |
| `inspect_layer_tree` | Reads the layer tree. |
| `mutate_layer_layout` | Updates a layer's position, size or rotation. |
| `mutate_layer_style` | Updates visual style attributes: fills, strokes, strokeWidth, cornerRadius, opacity. |
| `mutate_layer_text` | Updates typography and text content on a text layer. |
| `mutate_auto_layout` | Configures or updates Auto-Layout on a frame or group (direction, gap, padding, wrap, alignment). |
| `batch_mutate_layers` | Executes multiple layer mutations in a single atomic undoable transaction. |
| `boolean_combine` | Combines layers into a boolean group (`union`, `subtract`, `intersect`, `exclude`) and selects the result. Without `layerIds`, the current selection is used. |
| `set_constraints` | Sets or clears layout constraints on layers (how they follow their parent frame on resize). Without `layerIds`, the current selection is used. |
| `export_layers` | Rasterizes layers to a base64 PNG data URL: one layer alone, or several composited and cropped to their union bounds. Returns a short preview unless `includeDataUrl` is set. |

Mutations flash a visual focus overlay on the canvas
(`src/canvas/editor/chrome_stage_overlays.js`) so you can see what the agent
touched, then land as normal undoable actions.

## The design agent loop

`src/canvas/agent/canvas_agent.js` runs a minimal agent turn: the model
streams text, calls canvas tools, and sees their results until it stops
asking for tools (bounded by a step limit). Errors thrown by a tool are
reported back to the model rather than swallowed.

Agent behaviour is configured in **agent settings** (`AGENT_SETTING`
keys): API key, base URL, model, separate text and image provider/model
choices, whether to confirm before generating images, whether to use the
current selection as the reference by default, the default image size
(`1024x1024`, `1024x1536`, `1536x1024`), the step limit, and an optional
style note appended to the system prompt. Session history persists between
turns (`session_history.js`).

## Local CLI agents

`src/shared/cli-agents.js` catalogs the supported local CLIs:

| CLI | Install | Notes |
| :--- | :--- | :--- |
| **Claude Code** | `npm install -g @anthropic-ai/claude-code` | Runs headless (`-p` with stream-json); reaches VOO tools only through the VOO MCP server. |
| **Codex** | `npm install -g @openai/codex` | Same session contract as Claude. |
| **OpenCode** | `npm install -g @opencode/cli` | Model list is discovered from the installed CLI. |
| **Antigravity** | `npm install -g @google/antigravity-cli` | Model list is discovered from the installed CLI. |

Each CLI runs through an Electron session module with the same contract
(`start` / `callTool` / `advance` / `close`, see
`electron/agent_tool_turn.js`), so the agent panel and the local bridge treat
them identically.

### Sandbox limits

The CLIs are deliberately disarmed: they may operate the canvas but nothing
else on your machine. Claude Code, for example, runs with
`--restricted --tools ""` (no Bash/file/web tools, no user, project or local
settings loaded), `--strict-mcp-config` (no MCP server except VOO's), and
`--permission-mode dontAsk` with only the VOO tools allowlisted — anything
else is refused outright rather than queued for a prompt nobody can answer.
The per-CLI connector files in `electron/` (for example
`electron/claude_agent_session.js`) document the exact flags for each CLI.

### How CLIs reach the tools: the VOO MCP server

`electron/agent_mcp_server.js` is a private, token-authenticated MCP-over-HTTP
server on `127.0.0.1` exposing two tools, `list_tools` and `call_tool`, which
forward to the same canvas tool set. Sessions are started per turn by the
electron process; only requests carrying the session bearer token, and with
no `Origin` header, are accepted.

## The local CLI bridge

The desktop app runs CLI sessions directly. The web editor cannot spawn
processes, so it uses a small loopback bridge:

```bash
npm run bridge
```

starts `scripts/cli-bridge.mjs`, an HTTP + WebSocket server on
`ws://127.0.0.1:4179` (via `electron/cli_bridge_server.js` and a
WebSocket-to-IPC adapter, `electron/ws_ipc_adapter.js`). It:

- answers `GET /health` with a JSON liveness probe;
- registers the same local-CLI IPC channels the Electron app uses;
- allows only a fixed origin list (localhost dev ports plus the hosted
  `voo.run` origins), extended with `VOO_CLI_BRIDGE_ORIGINS`;
- is configurable via `VOO_CLI_BRIDGE_PORT`.
