# VOO Design MCP server

Expose the open VOO canvas to MCP clients such as Claude Code and Codex. The
server uses newline-delimited JSON-RPC on stdin/stdout, with tool execution in
the most recently connected editor page. It requires no MCP SDK or new dependencies.

## Run

Start the web editor with `npm run dev`.
Run `npm run bridge` for a persistent web bridge, then launch the MCP server
with `npm run mcp`. The MCP process only connects; it never owns the bridge
port. Tool discovery works before a bridge starts, and tool calls retry the
connection lazily. The editor must remain open.
In a plain browser the page links only after opt-in: run
`localStorage.setItem("voo.mcpLink", "on")` and reload, select a local CLI agent,
or open a flow that dials the bridge. It then retries quietly with backoff
(5s, doubling to 60s) while the bridge is absent. The desktop app always links.

The bridge defaults to `ws://127.0.0.1:4179`. Set `VOO_CLI_BRIDGE_PORT` for the
server and `VITE_CLI_BRIDGE_URL` for the editor when using a different port.
Set `localStorage.setItem("voo.mcpLink", "off")` and reload to disable the page
link; remove that key and reload to return to the defaults. Calls time out after 60 seconds
in the relay and fail if the selected canvas disconnects or is replaced.

## Electron desktop

Open the desktop app with `npm run electron:dev` or launch the packaged app.
Electron starts the same CLI bridge on `127.0.0.1:4179`, or reuses the bridge
already listening there. If that owner exits, Electron retries every two seconds
and acquires the released port. It cancels retries and closes only its own bridge
when quitting. Keep the
app and document open, then configure Claude Code or Codex with
`node /ABS/PATH/voo-design/scripts/mcp-server.mjs` as shown below; the Node entry
and its dependencies must be available separately from the packaged app.
No separate `npm run bridge` is needed.

The bridge accepts Electron's `null` / `file://` origins and localhost development
origins. `VOO_CLI_BRIDGE_ORIGINS` adds comma-separated allowed origins.
`VOO_CLI_BRIDGE_PORT` changes the desktop bridge port; set it for the MCP client
too, and set `VITE_CLI_BRIDGE_URL` for the renderer (at build time for packaged
apps) to the matching WebSocket URL. The default needs no configuration.

## Client configuration

Claude Code:

```sh
claude mcp add voo-design -- node /ABS/PATH/voo-design/scripts/mcp-server.mjs
```

Codex, in `~/.codex/config.toml`:

```toml
[mcp_servers.voo-design]
command = "node"
args = ["/ABS/PATH/voo-design/scripts/mcp-server.mjs"]
```

Use the Node entry directly in client configurations so npm banners do not
appear on the JSON-RPC stdout stream. Diagnostics go to stderr.

## Tools

The catalog follows `CANVAS_TOOL_SCHEMAS` and currently includes:

- `describe_selection`
- `inspect_layer_tree`
- `mutate_layer_layout`
- `mutate_layer_style`
- `mutate_layer_text`
- `mutate_auto_layout`
- `batch_mutate_layers`
- `create_shape`
- `build_layout`
- `new_document`
- `delete_layers`
- `duplicate_layer`
- `select_layers`
- `group_layers`
- `reorder_layer`
- `rename_layer`
- `create_component`
- `create_instance`
- `create_component_variant`
- `create_component_variants_batch`
- `create_component_variant_matrix`
- `list_component_variants`
- `list_instance_variant_properties`
- `set_instance_variant`
- `list_styles`
- `create_style`
- `apply_style`
- `list_variables`
- `bind_variable`
- `create_path`
- `capture_canvas`
- `set_instance_override`
- `reset_instance_overrides`
- `swap_instance`
- `create_variable_collection`
- `add_variable_mode`
- `create_variable`
- `set_variable_value`
- `set_active_mode`
- `set_text_range_style`
- `get_path_nodes`
- `edit_path_nodes`
- `align_layers`
- `distribute_layers`
- `create_frame`
- `ungroup_layers`
- `find_layers`
- `undo`
- `redo`
- `boolean_combine`
- `set_constraints`
- `export_layers`
- `lint_design`
- `inspect_layout`
- `export_code`
- `generate_vector`
- `vectorize_image`
- `edit_image`
- `stock_image`
- `create_icon`
- `find_empty_space`
- `voo_status`

Image generation and placement (`generate_image`, `generate_image_web`,
`place_image`) and agent plan tools (`update_plan`, `get_plan`) are excluded.
`generate_vector` needs the in-app API agent model (a nested text completion);
an external MCP client receives `agentVectorNeedsApiModel` for it, while
`vectorize_image`, `edit_image` and `stock_image` work from any client.
`voo_status` reports `{canvasConnected: boolean}`. PNG data URLs returned by
`capture_canvas` and `export_layers` become MCP image content alongside the
remaining JSON metadata. Tool failures return MCP `isError` content.

## Resources

The server exposes live canvas state as standard MCP resources for context-aware agents:

- `voo://canvas/tree` — Structured layer tree JSON of the active document.
- `voo://canvas/selection` — Metadata and properties of currently selected layers.
- `voo://canvas/preview.png` — Real-time PNG screenshot of the canvas (`image/png` binary blob).
- `voo://canvas/status` — Live connection and document readiness status.

Agents can read these directly (e.g. `resources/read`) to inspect the document without executing mutating tool calls.

## Embedded Component Mode (`?embed=1`)

To embed Design Editor inside an IDE webview (VS Code / Cursor), iframe, or external tool pane:

- Navigate to `http://localhost:5173/?embed=1` (or `?minimal=1`).
- In embed mode:
  - Outer app chrome (title bar, prompts, release banners) is hidden, giving full viewport to the canvas.
  - An untitled canvas is automatically initialized so the editor is immediately interactive.
  - The MCP loopback bridge link is automatically enabled without requiring manual `localStorage` toggles.

Example prompt: “Check voo_status, create a 1440 × 900 landing page frame with a
headline and three feature cards, then capture_canvas so I can review it.”

## Verify

```sh
npx vitest run tests/unit/mcp_server.test.js
npm run build
```

## Client configuration names

`voo-design` is the canonical name in these examples, not a required protocol
identifier. An existing local registration called `voo` can use the same entry
point without being renamed or duplicated. Use the name actually registered
with your client when editing or removing its configuration.

Style and text tools expose the same validated patches in the editor and MCP
catalog. See [patch units and aliases](agents.md#style-and-typography-patch-units).
Schema exposure and stored values do not certify final pixels for every effect;
see the dated [audit index](README.md#audits-point-in-time-records-check-the-date-and-re-verify-before-relying-on-them).

## Portable connectors

Run `node scripts/build-agent-plugin.mjs /absolute/new/plugin-folder` to build a
self-contained Claude Code plugin and a DeepSeek Harness Cordis overlay. The
package includes the existing `ws` runtime dependency, never credentials. See
[connector instructions](../plugins/voo-design/README.md). Claude Code validates
the generated plugin with `claude plugin validate <folder>`. Harness CLI and MCP
configuration were checked against upstream documentation and the installed
0.2.1-rc.3 runtime's isolated `sdk-minimal` schema; model API execution requires
the user's configured Harness profile and was not exercised. The Web profile's
schema dump currently reports unrelated native Loader carrier errors.
