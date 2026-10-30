# VOO agent connector

Build the portable plugin from the repository:

```sh
node scripts/build-agent-plugin.mjs /absolute/new/plugin-folder
```

The builder includes the MCP runtime, a snapshot of the tool catalog, the
already declared `ws` dependency, and the DeepSeek Harness plugin bundle files
(`package.json` `dsh.bundle.patch`, `cordis.patch.yml`, `locale/`, `icon.png`).
It refuses an existing output folder. Node 18+ and an open VOO desktop app (or a
persistent `npm run bridge`) are required. No credentials are included. Tool
discovery works before the desktop starts; canvas calls connect lazily and report
a clear error while it is unavailable.

Claude Code:

```sh
claude plugin validate /absolute/new/plugin-folder
claude --plugin-dir /absolute/new/plugin-folder
```

Codex can use the same portable runtime:

```sh
codex mcp add voo -- node /absolute/new/plugin-folder/scripts/mcp-server.mjs
```

OpenCode / Antigravity:

In `opencode.json` (or `~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "servers": {
      "voo": {
        "command": "node",
        "args": ["/absolute/new/plugin-folder/scripts/mcp-server.mjs"]
      }
    }
  }
}
```

DeepSeek Harness: install the portable folder as a plugin bundle. The Harness
CLI (0.2.1-rc.3) requires the profile before `add` and rejects a bare
`dsh plugin add` with "required option '--profile <name>' not specified":

```sh
dsh plugin --profile desktop add "link:/absolute/new/plugin-folder"
```

Quote the whole `link:` argument when the path contains spaces, as the VOO
desktop app's connector folder does. The VOO first-run agent step runs this for
you (one-click install) once DeepSeek Harness is detected; without the desktop
app, run the command by hand.

Restart DeepSeek Harness, then start a new session. The session exposes the
canvas tools as `mcp__voo__*`. The package's `cordis.patch.yml` inserts
the official `@deepseek-ai/dsh-mcp-client` over stdio with `serverName:
voo`, so the Harness profile's model and credentials stay under Harness
control. The Plugin Manager and Settings show it as "VOO" with the
connector icon (from the exported `locale/en.json`,
`locale/zh.json`, and `icon.png`).

The installed folder is self-contained: Node 18+ and the bundled
`node_modules/ws` are enough, because Harness starts it with `node`. The patch
bakes in the absolute `scripts/mcp-server.mjs` path and its `cwd`, and a linked
directory is used in place, so rebuild into a new empty folder after moving it
or after tool-schema changes.

### DSH model bridge (use the Harness model inside VOO)

The same install also carries the **VOO Model Bridge**: `lib/model-bridge.js`
and a second `cordis.patch.yml` row (`voo-model-bridge`, patch-relative
`./lib/model-bridge.js`) start a loopback OpenAI-compatible endpoint at
`http://127.0.0.1:4399/v1` that serves the Harness profile's current model and
credentials. One install therefore gives you both the canvas tools
(`mcp__voo__*`) and a model endpoint for VOO's own agent — no separate provider
key for the editor.

- VOO → first-run dialog → **API provider** → **DeepSeek Harness models**;
  the preset fills base URL `http://127.0.0.1:4399/v1` and API key `voo-local`
  (the bridge accepts any bearer value; it only listens on `127.0.0.1`).
- **Fetch models** lists the Harness provider's catalog (falling back to the
  current default model). Streaming text, streamed tool calls, and
  `finish_reason` `stop` / `tool_calls` / `length` are supported; image content
  is ignored in this first version.
- After the bundle activates it writes `~/.dsh/voo-model-bridge.json`
  (`{ url, port, pid, provider, model, models }`) and removes it when the
  plugin unloads. If `4399` is already taken it moves to the next free port and
  writes the real port there. `VOO_MODEL_BRIDGE_PORT` overrides the port.
- The bridge is also published as a standalone bundle
  (`plugins/voo-model-bridge`) for Harness users who only want the endpoint.
  Restart DeepSeek Harness after reinstalling the connector so the new Host row
  loads; a linked-directory change needs a Harness restart, not only a new
  session.

DeepSeek Harness CLI overlay (legacy, still supported):

```sh
VOO_MCP_ENTRY=/absolute/new/plugin-folder/scripts/mcp-server.mjs \
  dsh web --patch /absolute/new/plugin-folder/deepseek.cordis.yml
```

This leaves the Harness profile's model and credentials under Harness control.
It does not select a guessed DeepSeek model or overwrite existing profile files.
In the desktop app, prefer the plugin bundle above; if merging the overlay by
hand, add its `insert` patch to the intended profile without replacing an
existing `cordis.patch.yml`.

For editable compositions from Codex, use `build_layout` with one top-level
`frame` and nest its visual elements and `text` layers under `children`. Then
call `capture_canvas` and `inspect_layout` to review the result. The portable
connector intentionally omits provider-backed image generation tools. Rebuild
the connector into a new empty folder after tool-schema changes so its catalog
snapshot includes the latest guidance.

Custom vector art can be created in the same tree with `type: "path"` and SVG
path data in `d`; the path remains a native editable VOO path layer.
`generate_vector` also creates editable path layers, but its MCP call requires
an in-app API agent model. External Codex calls should use nested `path` nodes
or `create_path`; `vectorize_image` can convert a placed flat raster into
editable paths.

Verification: ask the agent to call `voo_status`, inspect the layer tree, then
create and undo a rectangle in a disposable document. A missing canvas is an
explicit tool error, not a successful empty operation.

References (verified 2026-10-27):

- [Claude plugin manifest](https://code.claude.com/docs/en/plugins-reference)
- [Harness CLI](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md)
- [Harness MCP client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md)
- [Harness overlays](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/mcp-memory.md)
