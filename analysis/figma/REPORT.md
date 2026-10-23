# Figma.app reverse-engineering — REPORT

Task: reverse-engineer Figma.app (desktop Electron shell + as much of the Figma editor
web app as can be recovered non-destructively) with the local `rea` CLI, and judge which
capabilities VOO Design already has.

**Headline:** the desktop shell was fully recoverable with `rea`, and — beyond the brief's
fallback expectation — the **Figma editor web app itself was recovered from the user's
Chromium disk cache**, including the 8.3 MB main `figma_app` bundle and the 3.2 MB English
i18n bundle with **33,116 UI strings**, plus the prototype viewer, import worker and canvas
WASM. So the feature inventory is ~90% static evidence from Figma's own build artifacts and
~10% public docs, not docs-first.

## 1. What was reverse-engineered, and how

### a) Desktop shell — `rea` static analysis (strength: static, high confidence)

Target: pre-extracted read-only asar `/tmp/apps/figma` (Figma Desktop **126.9.13**,
`channel: stable`, `bundleIdentifier: com.figma.Desktop`).

```bash
rea analyze-javascript-application /tmp/apps/figma --artifact-format directory --format json
# exit 0, evidence_id ev_cba470e0…a7db9664
```

Full canonical evidence JSON (238,486,364 bytes, sha256 `2ff037b3…d21a1c5e`) was moved out of
the repo to `/tmp/rea_evidence/figma/analyze-app.json` at the Lead's request; small projections
stay in `analysis/figma/rea/`:

- `shell-summary.json` — 74 relevant files, 45 parsed JS files, 1,801,663 AST nodes,
  0 parse failures, 4 browser windows, 2 preload entrypoints, 8 context-bridge APIs,
  75 exposed API members, 34 IPC channels / 23 IPC handlers, 1 utility process.
- `shell-graph-extract.json` — literal IPC channels and handlers
  (`makeLocalBrowserPreview:invoke`, `shell:getAgentStatus`, `shell:restartAgent`,
  `notificationReceived`, web callback/promise channels), context bridges
  (`__figmaCodeConnect`, `__figmaPreviewIpc`, `loadingScreenAPI`), browser windows/workers.

Cross-checked with grep over the same files:
- **Native application menu** in `main.js`: New Window ⌘⇧N, New Tab ⌘T, Close Tab ⌘W,
  Open ⌘O, Import / Import from CSV, Save local copy, Export / Export as / Export frames to
  PDF / Export slides to PDF, Save/Show version history, Preferences, Color management,
  Interface scale, Graphics backend, Haptics, tray/menu-bar, Log out, update dialogs,
  performance/network log capture, agent status/restart.
- **328 shell i18n keys × 7 locales** (`de, es-es, es-la, fr, ja, ko-kr, pt-br` — the brief
  said 15; the shipped asar has 7) covering dialogs (updates, make-local trust dirs, merge
  close, voice-call microphone permission, plugin camera/mic permission, log-out), the tab
  bar (pinned/split/grouped tab labels), error tabs (403/404/407/502/503, crash, connection),
  and the shell app UI (agent status, tab preview memory, parsed fonts).
- **Desktop bridge capability list** in `web_app_binding_renderer.js`:
  `U=[["desktopChannelInApi",208], … ["addMcpStreamableHttpSupport",150]]` — ≥60 named
  capabilities including `makeLocalBrowserPreview*` (start/stop, element picker, HMR/hard
  reload, screenshot/thumbnail, mouse/key/wheel forwarding, CSS-var resolution, annotation
  pins, code-component source resolution), MCP install/proxy (`mcpInstallationSupport`,
  `xcodeMcpInstall`, `hasMcpRemoteClientProxy`, `addMcpStreamableHttpSupport`),
  overlay/floating/detached windows, screen-reader detection, system stats, global eyedropper,
  process-memory polling, file-load metrics.
- **Shipped Dev Mode MCP server**: `lazy/external/codegen_mcp_server.js` identifies itself as
  `"Figma Dev Mode MCP Server"` with canonical docs URL
  `https://developers.figma.com/docs/figma-mcp-server/`; bundles the MCP SDK, zod and ajv;
  tools are injected by the app (`internal_get_tools`).
- Other lazy modules: `mcp_client_manager.js` (MCP client config manager),
  `fcm_manager.js` (Firebase push notifications), `proxy_agent.js` (corporate proxy).
- **`make_local/`** ships a preload exposing `__figmaCodeConnect` and the Make Local browser
  preview bridge.

### b) Figma editor web app — non-destructive cache recovery (strength: static, high confidence for strings, medium for runtime semantics)

The editor is loaded from `figma.com` and is not in the asar. Rather than relaunching Figma
with remote debugging (which would disturb the user's session), we scanned the user's
Chromium **simple cache** read-only:
`~/Library/Application Support/Figma/DesktopProfile/v43/Cache/Cache_Data` (4,819 blocks).

Two small read-only tools were written (`analysis/figma/tools/`):
`scan_chromium_cache.py` (validates `0xfcfb6d1ba7725c30` blocks, decodes key/content-type) and
`extract_chromium_cache.py` (body sits between the key and the trailing `HTTP/1.1` header
block; brotli/gzip bodies decompressed via Node zlib into `/tmp/figma_web`).

Result: **1,182 decoded files / 280 MB**:

| artifact | size |
|---|---|
| `figma_app-ce44270e…min.js` (main editor bundle) | 8,287,210 B |
| `figma_app-8af2da57…min.js` (second build) | 8,280,226 B |
| `figma_app-61e97149…min.en.json` (English UI strings, 33,116 keys) | 3,217,467 B |
| `figma_app-d80773ba…min.en.json` (second build, 33,066 keys) | 3,211,338 B |
| `figma_app-*.min.css` (3 builds) | ~3.7 MB each |
| `prototype_app-*.min.js` + `*.min.en.json` | 208 KB / 2.7 MB |
| `devtools_worker-*.min.js` | 10,049,929 B |
| `import.worker.js` | 3,335,370 B |
| canvas/render WASM (2 builds) | 52.7 MB + 29.4 MB |

No source maps were cached (the bundle references one; the `.map` was not in the cache), so
we have minified-but-readable JS plus the full string surface, not original modules.

Then `rea analyze-javascript-application /tmp/figma_editor --artifact-format directory`
(exit 0, evidence_id `ev_52416c8b…a6a561`; 40,635,972 B, sha256 `94b2b2c7…57336fb`, moved to
`/tmp/rea_evidence/figma/analyze-editor.json`; summary in `rea/editor-summary.json`:
11.7 MB text read, 50,222 AST nodes, 47 modules, 0 parse failures). Token greps corroborate
editor features independently: `"SMART_ANIMATE"` ×7, `"BOOLEAN_OPERATION"` ×9,
`"COMPONENT_SET"` ×1, `"dev-mode"` ×2, `"auto-layout"` ×1 in the main bundle.

The i18n bundle is the single richest artifact: **451 namespaces**, including
`figmake` 2,460, `community` 2,418, `fullscreen` 2,055 (+ `fullscreen_actions` = **1,109
user-facing commands**), `sites` 1,286, `dev_handoff` 1,260, `design_systems` 1,256,
`whiteboard` 1,081, `activity_log` 925, `ai_assistant` 833, `collaboration` 812,
`file_browser` 789, `slides` 605, `make_local` 577, `motion` 465, `settings_tab` 460,
`proto` 406, `inspect_panel` 284, `variables` 263, `comments` 180.

This changed the inventory substantially versus a docs-only approach: the recovered strings
show Figma is a suite — **Figma Design, Make (+Make Local), Sites, Slides, Buzz, Draw, FigJam,
Motion, FigSpec, the Figma agent, Weave** — much of which is not in current public
documentation in this detail.

### c) Public documentation (strength: docs, used sparingly)

Used to name/corroborate:
- Figma Motion keyframes: <https://help.figma.com/hc/en-us/articles/41307938657559-Add-select-and-delete-keyframes>,
  <https://help.figma.com/hc/en-us/articles/41405906446999-Use-the-Figma-Motion-timeline>
- Dev Mode MCP server canonical URL (recovered from the shipped code itself):
  <https://developers.figma.com/docs/figma-mcp-server/>

Only `motion.keyframes` and `i18n.editor_locales` rows carry docs evidence in
`features.jsonl`; every other row is static artifact evidence.

## 2. Evidence split in the deliverables

| evidence class | where | count in `features.jsonl` | confidence |
|---|---|---|---|
| Desktop shell (`rea` + grep of `/tmp/apps/figma`) | `rea/COMMANDS.md` §1/§6, `shell-summary.json`, `shell-graph-extract.json`, `i18n-keys.txt` | 21 rows primary | high (static, exact strings) |
| Recovered editor bundle (cache → `/tmp/figma_web`) | `rea/COMMANDS.md` §3/§4/§5, `editor-commands.txt`, `editor-string-samples.txt` | 124 rows primary | high for UI surface; medium for exact runtime semantics |
| Public docs | cited URLs | 0 rows primary, 2 rows carry a docs pointer as secondary evidence | medium |

Numbers: 145 feature rows across 30 areas (details in `FEATURES.md`); 1,109 recovered command
labels (`rea/editor-commands.txt`); 328 shell i18n keys; 33,116 editor i18n keys.

## 3. Notable findings worth the Lead's attention

1. **Figma ships the Dev Mode MCP server inside the desktop app** and a whole MCP client
   bootstrap flow (Claude/Cursor/VS Code/Xcode install modals, streamable HTTP support,
   remote client proxy). This is direct evidence for the "design → AI coding" strategy and
   the closest analogue to VOO's agent/MCP work.
2. **Make Local is a desktop-only bridge** with browser preview, element picker, HMR,
   keyboard/mouse forwarding, CSS-variable resolution, screenshot capture and code-component
   source mapping (`makeLocalBrowserPreview:*` capability family + `make_local/` preload).
   This is a large surface absent from most public docs.
3. **The desktop app has a native agent status UI** (`agent_status`, `agent_running`,
   `agent_version`, `restart_agent`) and a file-browser agent chat ("Do anything", starter
   prompts Build/Ask) — Figma is converging on the same agent-first UX as VOO.
4. **Desktop shell maturity**: tab groups + pinned/split tabs, per-tab memory display and
   muting, error-tab taxonomy with reconnection, update dialogs, FCM notifications, proxy
   support, 7 locales, color-management (Display P3) and graphics-backend switches.
5. **The editor exposes an internal "metronome" animation path** (`metronomeLottieExport`,
   `toggle-display-metronome-texture-cache`) — likely the Figma Motion/Slides renderer.
6. **Two editor builds were cached within days of each other** (33,116 vs 33,066 i18n keys),
   so the recovered surface is current as of ~Oct 21 2026; strings may differ slightly by
   rollout bucket.

## 4. Confidence & limitations

- **Static only.** Nothing was executed: rea parses inert text, our cache parser only reads
  bytes. We infer user-visible behaviour from string keys/labels and command ids, not from
  observing the UI. No screen recording (permission denied) and no native-binary providers
  were configured, so `rea observe-native-ui`, `rea inspect`, `rea analyze`, `rea decompile`,
  `rea xrefs` were not used.
- **Figma was never disturbed**: PID 17989 still running; no quit/relaunch, no remote
  debugging, no writes to `~/Library/Application Support/Figma` (cache opened read-only).
- **Bundle completeness**: the cache holds 728 JS responses but is an LRU working set, not a
  full release. We have the main `figma_app` bundle and strings, but some lazy chunks may be
  missing; the exact module graph is therefore partial. No source maps.
- **Plan/entitlement vs code**: the i18n bundle contains strings for products a user may not
  have access to; presence of strings = code ships, not that the feature is usable.
- **Feature-flag ambiguity**: several surfaces (design-system bundles, Weave, FigSpec, Sites
  CMS) may be flagged/alpha; `features.jsonl` notes mark the uncertain ones.
- **VOO verdicts are point-in-time guesses** based on `rg` patterns over a tree that is being
  actively modified (many agent-runtime files are currently deleted per `git status`).
  Patterns and hit files are recorded per row in `GAPS-vs-VOO.md` so they can be re-run.
- **No runtime evidence for the domain/DOM of the editor**: DOM/CSS behaviour was not
  reconstructed; `fullscreen_actions`/i18n keys are the authoritative surface we can defend.

## 5. Deliverables in this directory

| file | contents |
|---|---|
| `rea/COMMANDS.md` | every rea/grep/cache command, evidence ids, hashes, limitations |
| `rea/analyze-app.err`, `rea/analyze-editor.err` | rea progress logs (exit 0) |
| `rea/shell-summary.json`, `rea/shell-graph-extract.json`, `rea/editor-summary.json` | small projections of the two big Evidence JSONs (which live in `/tmp/rea_evidence/figma/`) |
| `rea/i18n-keys.txt`, `rea/i18n-de.json`, `rea/editor-commands.txt`, `rea/editor-string-samples.txt` | extracted string evidence |
| `features.jsonl` | 145 schema-conformant feature rows with verified evidence pointers |
| `FEATURES.md` | narrative inventory, grouped by area + product-surface summary |
| `GAPS-vs-VOO.md` | per-capability VOO verdicts, search patterns and hit files |
| `tools/scan_chromium_cache.py`, `tools/extract_chromium_cache.py` | read-only cache tools |
| `tools/build_features.py`, `tools/feature_rows.py`, `tools/render_features_md.py` | reproducible feature build (all evidence pointers verified at build time) |

Reproduce: `python3 analysis/figma/tools/build_features.py` (requires the recovered
`/tmp/figma_web` and `/tmp/apps/figma`). Build fails if any evidence pointer is not found in
the actual artifacts — that is the guard against invented features.
