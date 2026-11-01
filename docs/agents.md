# Agents

VOO can be driven by agents in two ways: the built-in **design agent** (a
tool-calling chat powered by a configured model provider) and **local CLI
agents** already installed on your machine (Claude Code, Codex, OpenCode,
Antigravity, DeepSeek Harness). Both act on the canvas only through the same set of **canvas
tools**.

## Canvas tools

Defined in `src/canvas/agent/canvas_tools.js`
(`CANVAS_TOOL_SCHEMAS`); execution is transactional, mutation-focused, and
kept in sync with undo/redo:

### Layout & Generation

| Tool | Effect |
| :--- | :--- |
| `resize_document` | Sets active document dimensions through the shared constraint-aware engine operation. |
| `build_layout` | Builds a structured layout from a description. |
| `stream_layout` | Streams incremental layout/HTML onto the canvas with live progressive rendering and commits upon completion. |
| `generate_image` | Generates and places an image layer. |
| `generate_image_web` | Finds and places a web image. |
| `create_shape` | Creates a shape layer. |
| `create_frame` | Creates a frame. |
| `place_image` | Places an image on the canvas. |
| `capture_canvas` | Captures the current canvas. |
| `new_document` | Creates a new blank design document. |
| `resize_document` | Sets the active document width and height in pixels through the shared constraint-aware engine operation. |
| `find_empty_space` | Finds non-overlapping coordinates (x, y) on the canvas for a new frame or screen. |

### Layer Inspection & Mutation

| Tool | Effect |
| :--- | :--- |
| `describe_selection` | Reports the selected layer. |
| `inspect_layer_tree` | Reads the layer hierarchy and metadata. |
| `mutate_layer_layout` | Updates layer position, size or rotation. |
| `mutate_layer_style` | Updates solid/structured-gradient paints, stroke details/dashes, opacity, blend mode, layer/background blur and layer effects. |
| `mutate_layer_text` | Updates content, font family/size/weight, italic, underline, line-height multiplier, pixel letter spacing, alignment, color and text-box width. Style-only patches preserve content. |
| `mutate_auto_layout` | Configures frame/group Auto Layout. `enabled: false` clears layout; enabled partial changes preserve existing sizing/direction. `alignment` maps start/center/end/stretch to cross-axis alignment and space-between to main-axis distribution. `alignItems: "stretch"` gives every flow child the full line cross; a hugging cross axis keeps measured sizes. |
| `batch_mutate_layers` | Runs multiple layer mutations atomically. |
| `delete_layers` | Deletes layers. |
| `duplicate_layer` | Duplicates a layer. |
| `fork_frame` | Forks/duplicates an entire frame to an adjacent non-overlapping position for variant comparison or A/B testing. |
| `select_layers` | Selects layers. |
| `group_layers` | Groups layers. |
| `reorder_layer` | Changes layer order. |
| `rename_layer` | Renames a layer. |
| `set_constraints` | Sets layout constraints. |
| `align_layers` | Aligns visible layer bounds, translating a container's descendants together in one undo transaction. |
| `distribute_layers` | Distributes layers evenly. |
| `find_layers` | Finds layers by properties. |
| `find_empty_space` | Finds an available space on the canvas to place new content. |
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
| `set_frame_slot` | Declares component slot recommendations on a frame (e.g. `['Button', 'IconButton']`). |
| `get_frame_slot` | Reads the declared component slot recommendations for a frame. |
| `set_code_connect` | Configures the component source, import metadata and property mappings for code handoff. |

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
| `lint_design` | Checks the design for quality issues (score + issues + metrics). |
| `inspect_layout` | Structured layout QA: clipped/overflow/overlap/contrast/… problems with layer ids and fixes. |

### Review comments

| Tool | Effect |
| :--- | :--- |
| `list_comments` | Lists page comments, optionally unresolved threads only. |
| `create_comment` | Adds a page-coordinate comment with an undoable document edit. |
| `reply_comment` | Adds a reply to an existing thread. |
| `resolve_comment` | Resolves or reopens a thread. |
| `delete_comment` | Deletes a thread and its replies. |

### Current interaction boundary

The agent works through document operations rather than simulating arbitrary
pointer gestures. It can create editable vector paths, mutate geometry and
styles, and use image-provider tools, but it does not yet expose the editor's
freehand pixel brush/eraser/retouch gestures, mesh or puppet-warp sessions,
text-on-path controls, file-picker workflows for every import/export format,
or presentation-deck export as canvas tools. The editor's own stretch alignment
and per-line main-axis fill behavior are also not implemented by the layout
engine. These are explicit coverage gaps, not operations the agent should claim
to have performed.

### Handoff & Code

| Tool | Effect |
| :--- | :--- |
| `export_code` | Exports the selection or page as `html` (Tailwind), `react` (JSX) or `css`, with warnings and a size budget. |

### Asset generation

| Tool | Effect |
| :--- | :--- |
| `generate_vector` | Turns a prompt into editable SVG artwork (paths/rects) using the configured API agent model. |
| `vectorize_image` | Traces a raster layer into editable vector paths locally (no provider). |
| `edit_image` | Removes or replaces an image background through the configured image provider. |
| `stock_image` | Searches Openverse (CC-licensed) and places a matching photo. |
| `create_icon` | Inserts a vector icon (from built-in Lucide set) directly onto the canvas. |

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
choices, whether to confirm before generating image-slot assets, whether to use the
current selection as the reference by default, the default image size
(`1024x1024`, `1024x1536`, `1536x1024`), the step limit, and an optional
style note appended to the system prompt. Session history persists between
turns (`session_history.js`).

### Incremental edits (surgical delta workflow)

A follow-up change to an existing design must not rebuild the screen. The
system prompt tells the model to inspect first and then patch in place:

1. `inspect_layer_tree` (or `find_layers`) to read the current hierarchy and
   collect the target layer ids — never guess ids.
2. Apply the smallest delta that achieves the request with
   `mutate_layer_style`, `mutate_layer_layout`, `mutate_layer_text`, or several
   of them atomically through `batch_mutate_layers`.
3. Reuse the full-document tools (`build_layout`, `stream_layout`,
   `new_document`) only for a new design or an explicit "redo it from scratch"
   request; every other turn preserves the rest of the canvas, its history
   and its clip relationships.

This keeps multi-turn work incremental: one edit lands as one undoable action
and the rest of the canvas (artwork, masks, comments, component links) stays
untouched.

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
own design system with the chosen kit. User-provided images are passed directly
to the model as visual references and stay out of the document so the empty
canvas generation route remains available. Without an attached image, a
configured image provider first creates a visual reference; the HTML model then
reconstructs it as editable text, shapes and layout. Complex-photo or
illustration slots can become independent PNG image layers when automatic
image-slot generation is enabled.

### Variants

The welcome composer offers 1–3 variants. `runAgentTurn({ variantCount })` runs
the HTML pipeline once per variant, each with a different art direction from
the same brief, and offsets the frames horizontally
(`x + i * (width + 80)`). `onVariant({index, frameId, directionId, nodeCount})`
lets the panel offer "keep variant N": keeping one deletes the other candidate
frames and leaves a single design. Variants only apply to the HTML pipeline
(empty document + generation brief); the tool loop stays single-solution.

### Scene guides and style kits

`src/canvas/agent/design_quality/` holds the design knowledge injected into
the system prompt:

- `scene_guides.js` — nine scene contracts (landing, mobile, web, slides,
  dashboard, poster, banner, xiaohongshu, other) covering structure, typography,
  layout, content, quality checks and pitfalls; looked up by `sceneKind` or by
  the prompt's own words.
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
| **DeepSeek Harness** | Desktop app + VOO plugin (`dsh plugin --profile desktop add "link:<connector>"`) | External MCP client (`mcpOnly`): it is detected by its app bundle and by the installed VOO plugin in `~/.dsh/profiles/*`; connects through the VOO MCP server with the generated connector; its profile owns the model. No managed session. |

Each CLI runs through an Electron session module with the same contract
(`start` / `callTool` / `advance` / `close`, see
`electron/agent_tool_turn.js`), so the agent panel and the local bridge treat
them identically.

### DeepSeek Harness plugin

DeepSeek Harness is not a managed CLI session: `dsh` is a desktop app, and its
profile owns the model. The portable connector built by
`node scripts/build-agent-plugin.mjs <folder>` doubles as a Harness plugin
bundle: `package.json` declares `dsh.bundle.patch`, and the generated
`cordis.patch.yml` inserts `@deepseek-ai/dsh-mcp-client` over the connector's
stdio server (server name `voo`). Install it with
`dsh plugin --profile desktop add "link:<folder>"` and restart Harness; new sessions get the same
`mcp__voo__*` canvas tools as Codex's connector.

The first-run agent step detects the desktop app bundle
(`/Applications/DeepSeek Harness.app`) and the plugin in `~/.dsh/profiles/*`.
When only the app is present the card reads “Plugin needed” and the step shows
the install command, a copy button, a one-click install (desktop app) and a
re-detect action. Selecting DeepSeek Harness also opts the page into the canvas
MCP link, so a browser tab reaches the bridge for external MCP clients the same
way it does for local CLIs. Packaging details: [mcp-server.md](mcp-server.md#portable-connectors).

### Using the Harness model inside VOO

The connector also ships a Harness **model bridge** (`voo-model-bridge`, installed
by the same plugin bundle). It serves the profile's selected model
(`agentDefaultModel.currentSelection()`) as an OpenAI-compatible endpoint on
`http://127.0.0.1:4399/v1` — `/v1/models`, `/v1/chat/completions` with SSE and
tool calling, loopback-only with CORS for the editor. Picking “DeepSeek Harness
models” in the first-run API row (or adding a custom provider with that base URL
and key `voo-local`) fetches the Harness model list; the in-app Agent then runs
on the Harness profile's model without a separate DeepSeek key. The bridge is
text-only for now: image content from `capture_canvas` is dropped, and reasoning
deltas are not forwarded. It starts and stops with the Harness host process; the
editor reports a fetch/chat failure while Harness is closed.

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

### Style and typography patch units

`mutate_layer_style.gradient` accepts `type` (`linear`, `radial`, `angular`,
`diamond`), numeric degree `angle`, and at least two `{color, position, opacity}`
stops. Stop colors are six-digit hex; position and stop opacity are 0–100.
Optional geometry uses percentages; explicit line endpoints require all four
of `startX/startY/endX/endY`. This is converted to the same fill string used by
the panel. Do not supply competing `fill`/`fills` alongside `gradient`.

Layer/fill/stroke opacity is 0–1. The `effects` object replaces the effect
stack; null clears it. Shadow/glow and overlay opacity is 0–100; texture opacity
is 0–1. Unsupported GPU effects use the existing Canvas2D compositor rather
than silently disappearing. Stroke dash accepts a preset or a nonnegative
numeric pattern.

Text `lineHeight` is a multiplier (0.8–3); `letterSpacing` is in document pixels
(-10–40). `textContent`, `textAlign` and `color` normalize to the document's
`text`, `align` and `fill` fields. Single writes and `batch_mutate_layers` share
validation; invalid batches reject before any mutation. Generated portable
connectors snapshot tool schemas and must be rebuilt after schema changes.
