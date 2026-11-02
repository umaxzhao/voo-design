# voo-editor-panel

A DeepSeek Harness bundle that runs the **VOO Design editor inside the Harness
right sidebar**, next to the conversation, on the same local bridge the VOO
canvas tools use.

```text
Harness Web UI ── right Sidebar tab "VOO 编辑器"
        │ iframe  http://127.0.0.1:4173/?embed
        ▼
VOO editor build (<repo>/dist)  ── ws://127.0.0.1:4179 ──► VOO CLI bridge ◄── mcp__voo__* tools
```

## What it does

One bundle row, two halves:

| Half | File | Responsibility |
| --- | --- | --- |
| Host | `index.js` + `lib/` | Serves the built editor on a loopback origin and, when nothing answers on the bridge port, starts the VOO CLI bridge so the editor page links to the canvas the agent drives. |
| Client | `client.js` | Registers the right-Sidebar tab type `voo`, its guide card, and the iframe body (loading state, refresh command). |

The editor itself already supports this: loaded with `?embed` it skips the
title bar, onboarding and crash prompts, opens an untitled project, and links
itself to the local bridge.

## Install

```sh
dsh plugin --profile desktop add "link:/absolute/path/to/plugins/voo-editor-panel"
```

Restart DeepSeek Harness when the bundle does not activate through HMR, then
open a session, expand the right sidebar and pick **VOO 编辑器** on the guide
page. The editor also appears as a right-Sidebar tab for the current session.

The default configuration assumes the bundle is linked from a VOO repository
checkout (`<repo>/plugins/voo-editor-panel`): it serves `<repo>/dist` and starts
the bridge from `<repo>/electron/cli_bridge_server.js`. Build the editor first:

```sh
npm run build   # writes dist/
```

## Config

```yaml
- id: voo-editor-panel
  config:
    port: 4173          # loopback origin the panel iframe loads
    editorDir: ''       # empty: <repo>/dist; absolute path otherwise
    bridge: true        # start the VOO bridge when 4179 is free
    bridgePort: 4179
    repoDir: ''         # empty: two levels above this package
```

Do not change `port` without extending the bridge's
`VOO_CLI_BRIDGE_ORIGINS`: the bridge only accepts a fixed origin allowlist that
includes `http://127.0.0.1:4173`, so an editor served elsewhere cannot link to
the canvas.

## Runtime contract

- The editor server binds `127.0.0.1` only, answers `GET`/`HEAD`, maps
  extension-less paths to `index.html`, refuses paths outside `editorDir`, and
  reports `/__voo/health` as JSON (`{ ok, service, editorDir, hasBuild }`).
- A missing build serves a short bilingual page telling the user to run
  `npm run build`; the panel stays open instead of showing a browser error.
- The bridge is started in the Host process, not spawned, so it is released
  when the row unloads. An already-running bridge (VOO desktop app or
  `npm run bridge`) is reused. The bridge writes its token file as usual, which
  is what the installed VOO MCP connector reads for `mcp__voo__*` calls.
- Both the editor server and the bridge are created inside one `ctx.effect`;
  removing the row through the profile patch stops both.

## Verification

```sh
curl -s http://127.0.0.1:4173/__voo/health
curl -s http://127.0.0.1:4179/health
```

Then, with a session open and the panel visible, `mcp__voo__voo_status` reports
`canvasConnected: true`, and canvas tools act on the document shown in the
panel. The tab body keeps the editor mounted while switching tabs
(`keepMounted`), so the open document survives sidebar navigation.

Rendered appearance is verified in the Harness page; this package cannot do it
from the Host side.
