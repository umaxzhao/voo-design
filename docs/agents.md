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

### Layout & Generation

| Tool | Effect |
| :--- | :--- |
| `build_layout` | Builds a structured layout from a description. |
| `generate_image` | Generates and places an image layer. |
| `generate_image_web` | Finds and places a web image. |
| `create_shape` | Creates a shape layer. |
| `create_frame` | Creates a frame. |
| `place_image` | Places an image on the canvas. |
| `capture_canvas` | Captures the current canvas. |
| `new_document` | Creates a new blank design document. |

### Layer Inspection & Mutation

| Tool | Effect |
| :--- | :--- |
| `describe_selection` | Reports the selected layer. |
| `inspect_layer_tree` | Reads the layer hierarchy and metadata. |
| `mutate_layer_layout` | Updates layer position, size or rotation. |
| `mutate_layer_style` | Updates fills, strokes, corners or opacity. |
| `mutate_layer_text` | Updates text and typography. |
| `mutate_auto_layout` | Configures Auto-Layout. |
| `batch_mutate_layers` | Runs multiple layer mutations atomically. |
| `delete_layers` | Deletes layers. |
| `duplicate_layer` | Duplicates a layer. |
| `select_layers` | Selects layers. |
| `group_layers` | Groups layers. |
| `reorder_layer` | Changes layer order. |
| `rename_layer` | Renames a layer. |
| `set_constraints` | Sets layout constraints. |
| `align_layers` | Aligns layers. |
| `distribute_layers` | Distributes layers evenly. |
| `find_layers` | Finds layers by properties. |
| `undo` | Undoes the last document action. |
| `redo` | Redoes the last undone action. |
| `set_text_range_style` | Styles a text range. |
| `update_plan` | Updates the agent plan. |
| `get_plan` | Reads the agent plan. |
| `export_layers` | Exports selected layers as PNG data. |

### Components & Variants

| Tool | Effect |
| :--- | :--- |
| `create_component` | Creates a reusable component. |
| `create_instance` | Creates a component instance. |
| `set_instance_override` | Overrides instance layer or record properties. |
| `reset_instance_overrides` | Clears instance overrides. |
| `swap_instance` | Changes an instance source component. |
| `create_component_variant` | Creates a sibling component variant. |
| `create_component_variants_batch` | Creates sibling variants from property sets in one undoable transaction. |
| `create_component_variant_matrix` | Creates and persists a Cartesian variant matrix from axes. |
| `list_component_variants` | Lists variants in a component group. |
| `list_instance_variant_properties` | Lists current and available variant properties for an instance. |
| `set_instance_variant` | Switches by variant name or property map in one document transaction. |

### Design System & Variables

| Tool | Effect |
| :--- | :--- |
| `list_styles` | Lists saved styles. |
| `create_style` | Creates a saved style. |
| `apply_style` | Applies a saved style. |
| `list_variables` | Lists design variables. |
| `bind_variable` | Binds a variable to a layer property. |
| `create_variable_collection` | Creates a variable collection. |
| `add_variable_mode` | Adds a collection mode. |
| `create_variable` | Creates a typed variable. |
| `set_variable_value` | Sets a variable value. |
| `set_active_mode` | Changes an active variable mode. |

### Path & Boolean Ops

| Tool | Effect |
| :--- | :--- |
| `create_path` | Creates a vector path. |
| `get_path_nodes` | Reads path nodes. |
| `edit_path_nodes` | Edits path nodes. |
| `boolean_combine` | Combines layers with a boolean operation. |
| `ungroup_layers` | Ungroups a layer group. |

### Quality & Lint

| Tool | Effect |
| :--- | :--- |
| `lint_design` | Checks the design for quality issues. |

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

### Generation handoff from the welcome screen

The welcome composer does not talk to the agent panel through window events.
It builds one immutable `GenerationIntent`
(`src/canvas/components/welcome_dashboard/generation_intent.js`) and writes it
to `pendingGeneration` in the design store; `CanvasAgentPanel` claims it
exactly once (`consumePendingGeneration`), so mount order and React
StrictMode's development double-mount cannot drop or duplicate the turn.

The intent carries the user prompt, the selected design type and its scene
guidance, the frame size, the style kit id, the provider model id and the
reference attachments. The panel renders it as a structured first line:

```
[Generation] kind=landing frame=1440x900 style=linear model=claude:... references=1
```

`runAgentTurn` receives the same values as `styleId`, `sceneKind` and `frame`;
the HTML pipeline applies `styleKitId` by replacing the art-direction model's
own design system with the chosen kit. Attached images are placed on the canvas
as visual references before the turn starts.

### Scene guides and style kits

`src/canvas/agent/design_quality/` holds the design knowledge injected into
the system prompt:

- `scene_guides.js` — six scene contracts (landing, mobile, web, slides,
  dashboard, other) covering structure, typography, layout, content, quality
  checks and pitfalls; looked up by `sceneKind` or by the prompt's own words.
- `style_kits.js` — 20 complete style kits (palette, fonts, type scale,
  radius, shadow, spacing density, layout patterns, dos/don'ts), selected
  automatically by `pickStyleKit` or explicitly by the welcome picker.
- `prompt.js` — assembles the quality block, the active kit, exemplars and the
  scene guide. A deterministic `lint_design` report is attached to every
  `capture_canvas` result, and a score below 60 on a real design triggers one
  bounded repair pass.

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
