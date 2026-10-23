# Pen.app 1.2.15 — `rea` command log & evidence index

Environment: macOS arm64 · `rea` v6.5.0 at `/Users/tt/.npm-global/bin/rea`
Target (read-only extracted asar): `/tmp/apps/pen` (774 MB, `pen@1.2.15`, Electron 44).
App was left running (PID 16331); no GUI automation, no profile writes, no native-provider commands were used.

Conventions used in `features.jsonl`:

- `file` is bundle-relative from `/tmp/apps/pen`.
- `locator` is `string:<exact UI string>` (found via strings extraction), `code:<compiled snippet>`,
  `symbol:<exported name>`, or `label:<menu item>`.
- `command` is the command that reproduces the evidence. The three long-running commands are
  defined once below as **C1**, **C2**, **C3**; grep rows use **C4** to produce a strings index
  first and then a concrete `grep -n -F` on it.

---

## C1 — Static analysis of the renderer/editor bundle (partial, heap-limited)

```bash
cd /tmp/apps/pen
rea analyze-javascript-application /tmp/apps/pen \
  --artifact-format directory \
  --source-path out/editor/assets/index.js \
  --format json \
  --analysis-timeout-ms 240000 \
  > /Users/tt/teamwork_projects/voo_design/analysis/pen/rea/analyze-index-renderer.json
```

Purpose: reconstruct the renderer's module/binding graph, exports and retained string/endpoint facts.
Why `--source-path`: the full tree has 12,343 other files (mostly `node_modules`), which only adds noise;
`--artifact-format directory` avoids the asar integrity failure on the unpacked `claude-agent-sdk` binary.

Outcome (honest): **exited 0 with partial evidence.** The single 7.6 MB minified file exhausted the
isolated analyzer worker heap during the semantic phase; rea returned the graph collected so far.

| item | value |
|---|---|
| original output | `analysis/pen/rea/analyze-index-renderer.json` (197,734,061 bytes) **moved out of the repo** |
| current location | `/tmp/rea_evidence/pen/analyze-index-renderer.json` |
| sha256 | `a255ac34777aa1c3130ba36c7c649b16692dfb0d6001163a642b3ef204216bde` |
| evidence id | `ev_057db33217900432b31cc59a96f725405b9908d35611619f394dd08784a1961f` |
| parsed JS files / AST nodes | 1 / 1,706,498 |
| graph nodes / semantic nodes / evidence contexts | 22,630 / 11,817 / 19,434 |
| limitations (verbatim, selected) | "Owned JavaScript worker exhausted its heap while analyzing out/editor/assets/index.js during semantic…"; "Graph coverage is incomplete; unavailable facts remain explicit and must not be read as absence." |

Extracted from it into the repo (small derivations):

- `rea/summary-index-renderer.json` — evidence id, parameters, summary/statistics/coverage/limitations.
- Nothing else was mined from this file for features: the minifier destroyed useful symbol names, and
  the strings extraction (**C4**) is a strictly better source for the renderer's user-visible surface.

## C2 — Static analysis of the readable main-process files (complete for scope)

```bash
cd /tmp/apps/pen
rea analyze-javascript-application /tmp/apps/pen \
  --artifact-format directory \
  --source-path out/main.js --source-path out/app.js --source-path out/menu.js \
  --source-path out/config.js --source-path out/skills-manager.js \
  --source-path out/desktop-mcp-adapter.js --source-path out/save-document-as.js \
  --source-path out/load-document.js --source-path out/file-io.js --source-path out/constants.js \
  --format json \
  > /Users/tt/teamwork_projects/voo_design/analysis/pen/rea/analyze-main-process.json
```

Purpose: recover the Electron boundary, IPC surface, configuration keys, skills manager and MCP
integration wiring from the readable compiled main process (10 files, 104 KB of source).

| item | value |
|---|---|
| original output | `analysis/pen/rea/analyze-main-process.json` (210,999,097 bytes) **moved out of the repo** |
| current location | `/tmp/rea_evidence/pen/analyze-main-process.json` |
| sha256 | `6c06f94f2f6f99b8730af2d267115541b2b0a18af17727c5d998900189f1f06a` |
| evidence id | `ev_27af01295a060130bab6b53c02aa4f9a89daff51ee6870110fba5c6a4022d8ae` |
| parsed JS files / AST nodes | 10 / 13,174 |
| graph nodes by kind | 9,717 javascript-asset · 432 artifact · 132 javascript-module · 15 endpoint · 6 native-addon |
| IPC summary | all IPC counters 0 — see finding below |

Extracted into the repo:

- `rea/summary-main-process.json` — evidence id, parameters, summary/statistics/coverage/limitations.
- `rea/endpoints-main.txt` — the 15 `endpoint` observations (candidate network/storage endpoint
  nodes, e.g. `config_1.desktopConfig.get("claudeLoginType")`, `ipc.request("serialize")`).

Key finding / honest limitation: rea reports **0 IPC operations, 0 main handlers and 0 preload
bridges**. That is not evidence of absence: this app routes everything through the internal
`@ha/ipc` abstraction (`ipc.notify(...)`, `ipc.request(...)`, `ipcDeviceManager`) instead of raw
`ipcMain.handle` / `contextBridge.exposeInMainWorld`, so the static Electron boundary heuristics
find nothing. The literal IPC channel names were therefore recovered with **C4** (grep) instead —
documented in `features.jsonl` (`out/app.js`, `out/menu.js`).

## C3 — Projecting the retained Evidence (`inspect-analysis-view`)

```bash
# small inline wrapper around the retained Evidence: source inline + summary view
jq -r '.evidence_id' /tmp/rea_evidence/pen/analyze-main-process.json
printf '%s' "{\"source\":{\"kind\":\"inline\",\"evidence\":$(cat /tmp/rea_evidence/pen/analyze-main-process.json)},\"view\":{\"kind\":\"summary\"}}" > /tmp/av-inline.json
rea inspect-analysis-view /tmp/av-inline.json --format json
```

Purpose: prove the retained Evidence is valid and re-readable without re-running analysis, and pull
a summary view. (For `analyze_javascript_application` only `view: {kind:"summary"}` is supported —
the analysis-view schema has no page/module view for JS application evidence.)

Outcome: exit 0, produced a new analysis-view Evidence record
`ev_cb8de7fb8be3efe045f39cda7cc106a8fef119aad79bed7544a409936fe8129f`
(parent `ev_27af0129…`, `parent_operation: analyze_javascript_application`,
coverage `complete-within-view` 9,849 / 22,636 records examined).
The command was a validation step; no feature claims depend on it. `--format json` output was
inspected on stdout only (not stored, to keep the repo small).

## C4 — Strings index + keyword mining (the primary feature-vocabulary source)

```bash
# 1. extract unique short string literals from the 7.6 MB minified renderer bundle
node analysis/pen/rea/extract-strings.cjs \
  /tmp/apps/pen/out/editor/assets/index.js \
  analysis/pen/rea/strings-index.txt
# -> 36,302 unique string literals (980 KB, kept in repo)

# 2. group them per feature area
analysis/pen/rea/mine.sh          # -> analysis/pen/rea/mine/*.txt (20 area files)

# 3. pull exact compiled context for a single label (used for `code:` locators)
grep -o '.\{60\}Add flex layout.\{80\}' /tmp/apps/pen/out/editor/assets/index.js

# 4. tool names actually activated by the toolbar / state machine
grep -oE 'setActiveTool\("[a-z_]+"\)' /tmp/apps/pen/out/editor/assets/index.js | sort -u
#   -> comment, ellipse, frame, hand, move, pen, pen_cut, pen_move, rectangle, scale, sticky_note, text
#   (+ toolbar-only: icon, script, browser from `activeTool==="…"`)

# 5. keyboard-shortcut catalog embedded in the bundle
node -e '…indexOf("x7n=[{category:")…'   # -> rea/shortcuts-catalog-chunk.js.txt
#   -> 17 categories, 77 shortcut descriptions
```

Helper scripts kept in the repo (small): `rea/extract-strings.cjs`, `rea/mine.sh`,
`rea/strings-index.txt`, `rea/caps.txt` (title-case UI labels), `rea/shortcuts-catalog-chunk.js.txt`
(12 KB compiled shortcut table excerpt), `rea/mine/*.txt` (572 KB of area-filtered strings).

Also read directly (static, shipped inside the bundle — these are the product's own instructions to
its agent, i.e. self-documentation of the feature surface):

| file | what it proves |
|---|---|
| `out/skills/pen-dev/pen-schema.md` | complete `.pen` v2.20 schema: node types, layout, fills, effects, variables/themes, refs, slots, browser/script nodes |
| `out/skills/pen-dev/execute.md` | the MCP `execute` JS API (Insert/Copy/Update/Replace/Move/Delete/Get/Print/TakeScreenshot/Export/Generate/SetVariables/FindEmptySpace) |
| `out/skills/pen-dev/SKILL.md` | product framing, style archetypes, 15 design guides |
| `out/skills/pen-dev/generate.md` | AI/stock/SVG generation + remove-background / replace-background / vectorize-image |
| `out/skills/pen-dev/scripts-and-shaders.md` | script nodes (JS → nodes) and WebGL shader fills with uniform annotations |
| `out/skills/pen-dev/guide/{components,code,design-system,table,slides,web-app,mobile-app,landing-page,tailwind}.md` | component/instance semantics, design-to-code workflow, slots, slide/table guidance |
| `out/menu.js` (23 KB) | full native menu tree with accelerators and IPC channel names |
| `out/app.js` (31 KB) | literal IPC channel vocabulary (agent, skills, MCP, share, chat sessions, workspace) |
| `out/config.js`, `out/constants.js` | config keys (claudeApiKey/codexApiKey/geminiApiKey/cursorApiKey, login types, enabledIntegrations, customSkills), `~/.pencil` folders, blob storage URL |
| `out/skills-manager.js`, `out/desktop-mcp-adapter.js`, `out/agent-config-manager.js`, `out/ide.js` | skills distribution (manifest + zip + semver), MCP integration targets, multi-provider agent config, IDE extension install |
| `out/editor/goodies/{shaders,scripts}/` | 146 bundled shader/script presets with preview images |
| `out/data/*.pen` | 12 bundled starter design-system libraries / demo documents |

## Not used (and why)

- `rea analyze` / `rea inspect` / `rea xrefs` / `rea decompile` on binaries — no native provider
  (Hopper/Ghidra/IDA) configured.
- `rea observe-native-ui` — Screen Recording permission denied; not retried.
- Whole-asar analysis without `--source-path` — 12k node_modules files for no additional feature
  signal; the scoped runs above cover everything relevant.
- `out/mcp-server-darwin-arm64` (4.7 MB binary) — out of scope for JS/Electron analysis.

## Reproducibility notes

- `analysis/pen/` total size after moving the two large JSON files: ~1.9 MB.
- The two large Evidence JSON files are reproducible by re-running C1/C2; they were deliberately
  kept outside the git working tree (`/tmp/rea_evidence/pen/`) to avoid polluting the deliverable.
- `analysis/pen/voo-audit.sh` + `analysis/pen/voo-audit-output.txt` are the read-only VOO repo audit
  (grep patterns + file counts) used by `GAPS-vs-VOO.md`.
