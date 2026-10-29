# VOO Design agent connector

Build the portable plugin from the repository:

```sh
node scripts/build-agent-plugin.mjs /absolute/new/plugin-folder
```

The builder includes the MCP runtime, a snapshot of the tool catalog, and the
already declared `ws` dependency. It refuses an existing output folder. Node 18+
and an open VOO desktop app (or a persistent `npm run bridge`) are required.
No credentials are included. Tool discovery works before the desktop starts;
canvas calls connect lazily and report a clear error while it is unavailable.

Claude Code:

```sh
claude plugin validate /absolute/new/plugin-folder
claude --plugin-dir /absolute/new/plugin-folder
```

Codex can use the same portable runtime:

```sh
codex mcp add voo-design -- node /absolute/new/plugin-folder/scripts/mcp-server.mjs
```

OpenCode / Antigravity:

In `opencode.json` (or `~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "servers": {
      "voo-design": {
        "command": "node",
        "args": ["/absolute/new/plugin-folder/scripts/mcp-server.mjs"]
      }
    }
  }
}
```

DeepSeek Harness uses its official Cordis MCP client overlay:

```sh
VOO_MCP_ENTRY=/absolute/new/plugin-folder/scripts/mcp-server.mjs \
  dsh web --patch /absolute/new/plugin-folder/deepseek.cordis.yml
```

This leaves the Harness profile's model and credentials under Harness control.
It does not select a guessed DeepSeek model or overwrite existing profile files.
In the desktop app, merge the overlay's `insert` patch into the intended profile
through Harness configuration; do not replace an existing `cordis.patch.yml`.

Verification: ask the agent to call `voo_status`, inspect the layer tree, then
create and undo a rectangle in a disposable document. A missing canvas is an
explicit tool error, not a successful empty operation.

References (verified 2026-10-27):

- [Claude plugin manifest](https://code.claude.com/docs/en/plugins-reference)
- [Harness CLI](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md)
- [Harness MCP client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md)
- [Harness overlays](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/mcp-memory.md)
