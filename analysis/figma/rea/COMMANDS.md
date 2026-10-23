# Figma reverse-engineering — rea command log

All commands are read-only against the Figma targets. `rea` v6.5.0 at `/Users/tt/.npm-global/bin/rea`.
No native-binary providers are configured, so no `rea inspect/analyze/decompile/xrefs` was used.
Screen Recording is denied, so `rea observe-native-ui` / `capture-native-ui-scenario` were **not** attempted.
Figma.app (PID 17989, window 23825) was never quit, killed, reconfigured, or written to.

## Targets

| Target | Location | Read-only? |
|---|---|---|
| Figma desktop asar, pre-extracted | `/tmp/apps/figma` (9.5 MB, `package.json` version `126.9.13`, channel `stable`) | yes |
| Figma Desktop Chromium cache | `~/Library/Application Support/Figma/DesktopProfile/v43/Cache/Cache_Data` (4,819 simple-cache blocks) | yes, opened O_RDONLY by our scripts |
| Figma editor web app | recovered from the cache into `/tmp/figma_web` (1,182 files, 280 MB decoded) | n/a (dumps in /tmp) |

## 1. Desktop shell — `rea analyze-javascript-application`

```bash
rea analyze-javascript-application /tmp/apps/figma \
    --artifact-format directory --format json \
    > analysis/figma/rea/analyze-app.json \
    2> analysis/figma/rea/analyze-app.err
# EXIT:0
```

Evidence bundle (kept OUT of the repo per Lead hygiene instruction):

| | |
|---|---|
| command | `rea analyze-javascript-application /tmp/apps/figma --artifact-format directory --format json` |
| full JSON now at | `/tmp/rea_evidence/figma/analyze-app.json` |
| size | 238,486,364 bytes (238 MB) |
| sha256 | `2ff037b38d44765663769ff7ead3429c6fa2fe2a45fd0c07e075c174d21a1c5e` |
| evidence_id | `ev_cba470e08e63316e260901be9879f05afda6dbe1b6f40e5e013e9791a7db9664` |
| subject digest | `sha256:7ec69a50a895e3da6f1d02042eaa7b57c4050562da910131724caca829ff4958` |

Everything used from it was projected into small files that stay in `analysis/figma/rea/`:

- `analysis/figma/rea/shell-summary.json` — statistics + Electron boundary counts
  (74 relevant files, 45 parsed JS files, 1,801,663 AST nodes, 0 parse failures,
  1,546 findings, 4 browser windows, 2 preload entrypoints, 8 context bridge APIs,
  75 exposed API members, 34 IPC channels / 23 IPC handlers).
- `analysis/figma/rea/shell-graph-extract.json` — IPC channels/handlers, context-bridge
  APIs (`__figmaCodeConnect`, `__figmaPreviewIpc`, `loadingScreenAPI`), browser windows.
- `analysis/figma/rea/analyze-app.err` — rea progress log (per-file parse progress, exit code).

Notable literal IPC channels recovered (AST-static, from `main.js` line 374/441):

```
makeLocalBrowserPreview:invoke
makeLocalBrowserPreview:loadComponentDescriptor
shell:getAgentStatus
shell:restartAgent
notificationReceived
web-cancel-callback
web-promise-response:handlePromiseResolve
web-promise-response:handlePromiseReject
```

`rea inspect-analysis-view` was probed (`--help`, `--schema`) but its view workflow JSON is
undocumented in `rea --llms-full`; the same facts were projected directly from
`normalized_result.graph.nodes` with a small Python read (see `shell-graph-extract.json`).
No `--full-output` dump was printed to the terminal; all large output was written to files.

## 2. Recovered editor bundle — `rea analyze-javascript-application`

```bash
mkdir -p /tmp/figma_editor
cp /tmp/figma_web/figma_app-ce44270e1f795160.min.js.br   /tmp/figma_editor/figma_app.js
cp /tmp/figma_web/prototype_app-2782359aaccef92f.min.js.br /tmp/figma_editor/prototype_app.js
cp /tmp/figma_web/figma_app-61e97149e8b9c012.min.en.json.br /tmp/figma_editor/figma_app.en.json

rea analyze-javascript-application /tmp/figma_editor \
    --artifact-format directory --format json \
    > analysis/figma/rea/analyze-editor.json \
    2> analysis/figma/rea/analyze-editor.err
# EXIT:0
```

Evidence bundle (kept OUT of the repo per Lead hygiene instruction):

| | |
|---|---|
| command | `rea analyze-javascript-application /tmp/figma_editor --artifact-format directory --format json` |
| full JSON now at | `/tmp/rea_evidence/figma/analyze-editor.json` |
| size | 40,635,972 bytes (39 MB) |
| sha256 | `94b2b2c7343b5ff92535e63b8d4607c0572f9d400449493b5aeaa93de57336fb` |
| evidence_id | `ev_52416c8b87f09f73abae5e8ee7b30dba1af07276064756392e8778f584a6a561` |

Extracted from it: `analysis/figma/rea/editor-summary.json`
(3 relevant files, 11.7 MB text read, 1 parsed JS file, 50,222 AST nodes,
575 findings, 47 modules, 0 parse failures).
Limitations recorded by rea: inert static parsing, no execution; graph coverage incomplete.

## 3. Chromium simple-cache recovery (desktop shell profile, read-only)

Two purpose-written read-only tools were added (no writes to the Figma profile):

- `analysis/figma/tools/scan_chromium_cache.py` — walks `Cache_Data`, validates the
  `0xfcfb6d1ba7725c30` data-block magic, decodes the key (`<stream>/<index>/<url>`) and
  content-type/content-encoding, emits `cache_index.jsonl` (URL, type, sizes).
- `analysis/figma/tools/extract_chromium_cache.py` — same walk, but recovers the response
  body: for Chromium simple-cache entries the body sits between the key and the trailing
  `HTTP/1.1` header block; `br`/`gzip`/identity bodies are decompressed (brotli via Node
  `zlib.brotliDecompressSync`, batched) and written to `/tmp/figma_web` with an `_index.json`
  URL→file map. Cache files were only read.

```bash
python3 analysis/figma/tools/scan_chromium_cache.py \
  "$HOME/Library/Application Support/Figma/DesktopProfile/v43/Cache/Cache_Data" \
  /tmp/figma_web
# entries: 4819; hosts: s3-alpha-sig.figma.com 2945, www.figma.com 892,
# s3-alpha.figma.com 469, api.iconify.design 212, static.figma.com 130,
# api.simplesvg.com 56, 127.0.0.1:44950 56, …

python3 analysis/figma/tools/extract_chromium_cache.py \
  "$HOME/Library/Application Support/Figma/DesktopProfile/v43/Cache/Cache_Data" \
  /tmp/figma_web
# wrote 1182 files / 280 MB decoded: 815 JS, 251 JSON, 67 HTML, 41 SVG, 4 WASM, 4 CSS
```

Key recovered editor artifacts (`/tmp/figma_web/_index.json`):

```
figma_app-ce44270e1f795160.min.js.br    8,287,210 B  main Figma editor bundle
figma_app-8af2da5733b27d09.min.js.br    8,280,226 B  second build of the editor bundle
figma_app-61e97149e8b9c012.min.en.json.br 3,217,467 B English editor UI strings (33,116 keys)
figma_app-d80773ba44fb00dc.min.en.json.br 3,211,338 B second build of the strings bundle
figma_app-*.min.css.br                  3.6 MB each   editor stylesheets
prototype_app-*.min.js/.en.json         prototype viewer bundles + strings
devtools_worker-*.min.js.br            10,049,929 B devtools worker
42416-*.min.js.br                      14,502,694 B largest lazy chunk
import.worker.js.br                     3,335,370 B  design-file importer worker
compiled_wasm.wasm.br (2 variants)     52.7 MB / 29.4 MB  canvas/render wasm
```

No Figma profile files were modified; all recovered output is under `/tmp`.

## 4. String / command extraction from the recovered editor i18n bundle

```bash
python3 - <<'EOF'
import json
d = json.load(open('/tmp/figma_web/figma_app-61e97149e8b9c012.min.en.json.br'))
open('analysis/figma/rea/editor-commands.txt','w').write('\n'.join(
    k+'\t'+d[k].get('string','') for k in d if k.startswith('fullscreen_actions.')))
EOF
# 1109 commands -> analysis/figma/rea/editor-commands.txt
```

Outputs:
- `analysis/figma/rea/editor-commands.txt` — 1,109 editor commands (`fullscreen_actions.<action-id>` → English label).
- `analysis/figma/rea/editor-string-samples.txt` — per-namespace samples
  (`motion`, `variables`, `dev_handoff`, `inspect_panel`, `slides`, `sites`, `buzz`, `proto`, …).
- `analysis/figma/rea/i18n-keys.txt` / `i18n-de.json` — desktop shell i18n (7 locales, 328 keys each).
- Editor namespace histogram (451 namespaces), top: `figmake` 2460, `community` 2418,
  `fullscreen` 2055, `sites` 1286, `dev_handoff` 1260, `design_systems` 1256,
  `whiteboard` 1081, `activity_log` 925, `ai_assistant` 833, `collaboration` 812,
  `file_browser` 789, `slides` 605, `make_local` 577, `motion` 465, `settings_tab` 460,
  `proto` 406, `inspect_panel` 284, `variables` 263, `comments` 180, `tokens` 143.

## 5. Token greps corroborating editor features in the recovered JS bundle

```bash
grep -oE '"(smart-animate|SMART_ANIMATE|auto-layout|AUTO_LAYOUT|component-set|COMPONENT_SET|variable-mode|VARIABLE_MODE|dev-mode|DEV_MODE|code-connect|CODE_CONNECT|boolean-operation|BOOLEAN_OPERATION|vector-network|VECTOR_NETWORK)"' \
  /tmp/figma_web/figma_app-ce44270e1f795160.min.js.br | sort | uniq -c
#   1 "auto-layout"
#   9 "BOOLEAN_OPERATION"
#   1 "COMPONENT_SET"
#   2 "dev-mode"
#   7 "SMART_ANIMATE"
```

## 6. Desktop shell string evidence (grep + rea)

```bash
grep -oE 'desktop\.[a-zA-Z0-9_.]+' /tmp/apps/figma/i18n/de.json | sort -u   # 328 keys
ls /tmp/apps/figma/i18n                                                   # 7 locales
grep -oE '"(CmdOrCtrl|CommandOrControl)[^"]*"' /tmp/apps/figma/main.js    # menu accelerators
grep -oE 'xi\.[a-z0-9_]+' /tmp/apps/figma/main.js                         # menu item ids
grep -oE '"(get|create|update|delete)_[a-z0-9_]{3,40}"' /tmp/apps/figma/main.js  # API/action names
```

Findings (all static, in `/tmp/apps/figma`):
- `main.js` — Electron main process, native application menu (`New Window` ⌘⇧N, `New Tab` ⌘T,
  `Close Tab` ⌘W, `Open file…` ⌘O, `Import…`, `Import from CSV…`, `Save local copy`,
  `Export` / `Export as` / `Export frames to PDF…` / `Export slides to PDF…`,
  `Save to version history`, `Show version history`, `Preferences`, `Color management`,
  `Interface scale`, graphics backend, haptics, tray/menu-bar, log out, update dialogs,
  performance/network log capture, agent status/restart.
- `web_app_binding_renderer.js` — desktop bridge capability list `U=[["desktopChannelInApi",208],
  ["makeLocalBrowserPreviewUserInteraction",207], …, ["addMcpStreamableHttpSupport",150]]`
  with ≥60 named desktop capabilities (make-local browser preview, MCP install/proxy,
  Xcode MCP install, detached/floating/overlay windows, screen-reader detection,
  system stats, global eyedropper, process-memory polling, file-load metrics).
- `lazy/external/codegen_mcp_server.js` — ships the **Figma Dev Mode MCP Server**
  (`"Figma Dev Mode MCP Server"`, canonical URL `https://developers.figma.com/docs/figma-mcp-server/`),
  bundled MCP SDK + zod + ajv; tool set is supplied by the app (`internal_get_tools`).
- `lazy/external/mcp_client_manager.js` — MCP client config manager (Ajv-validated client configs).
- `lazy/external/fcm_manager.js` — Firebase Cloud Messaging for desktop notifications.
- `lazy/external/proxy_agent.js` — corporate proxy support.
- `make_local/` — Figma Make local project support (working-directory selection, git remote, trusted dirs).

## 7. Repo (VOO Design) read-only capability probes

Used only for `GAPS-vs-VOO.md`; the repo was never modified.

```bash
rg -il --glob '!node_modules' --glob '!analysis' --glob '!tests/**' -e '<pattern>' src electron
```

Patterns and hit counts are recorded per row in `analysis/figma/GAPS-vs-VOO.md` and raw
results in `/tmp/voo_search.json`, `/tmp/voo_search2.json`, `/tmp/voo_impl.json`.
