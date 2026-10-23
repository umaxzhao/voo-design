# VOO Design MCP server

Expose the open VOO canvas to MCP clients such as Claude Code and Codex. The
server uses newline-delimited JSON-RPC on stdin/stdout, with tool execution in
the most recently connected editor page. It requires no MCP SDK or new dependencies.

## Run

Start the web editor with `npm run dev`.
Run `npm run bridge` for a persistent bridge, then launch the MCP server with
`npm run mcp`. Alternatively, `npm run mcp` starts its own bridge if none is
reachable, so no separate bridge command is required. The editor must remain open.
The page retries every five seconds when the bridge is absent.

The bridge defaults to `ws://127.0.0.1:4179`. Set `VOO_CLI_BRIDGE_PORT` for the
server and `VITE_CLI_BRIDGE_URL` for the editor when using a different port.
Set `localStorage.setItem("voo.mcpLink", "off")` and reload to disable the page
link; remove that key and reload to enable it again. Calls time out after 60 seconds
in the relay and fail if the selected canvas disconnects or is replaced.

## Electron desktop

Open the desktop app with `npm run electron:dev` or launch the packaged app.
Electron starts the same CLI bridge on `127.0.0.1:4179`, or reuses the bridge
already listening there. It closes only its own bridge when quitting. Keep the
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
- `delete_layers`
- `duplicate_layer`
- `select_layers`
- `group_layers`
- `reorder_layer`
- `rename_layer`
- `create_component`
- `create_instance`
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
- `voo_status`

Image generation and placement (`generate_image`, `generate_image_web`,
`place_image`) and agent plan tools (`update_plan`, `get_plan`) are excluded.
`voo_status` reports `{canvasConnected: boolean}`. PNG data URLs returned by
`capture_canvas` and `export_layers` become MCP image content alongside the
remaining JSON metadata. Tool failures return MCP `isError` content.

Example prompt: “Check voo_status, create a 1440 × 900 landing page frame with a
headline and three feature cards, then capture_canvas so I can review it.”

## Verify

```sh
npx vitest run tests/unit/mcp_server.test.js
npm run build
```
