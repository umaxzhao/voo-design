# Pen.app 1.2.15 — coverage, confidence and unknowns

Companion to [`FEATURES.md`](./FEATURES.md), [`features.jsonl`](./features.jsonl),
[`GAPS-vs-VOO.md`](./GAPS-vs-VOO.md), [`rea/COMMANDS.md`](./rea/COMMANDS.md).

## 1. Bottom line

| question | answer |
|---|---|
| Features inventoried | **144 rows** across **27 areas** (`features.jsonl`, schema per `analysis/README.md`) |
| Evidence links | **291** (~2.0 per row; every row ≥1) — all bundle-relative paths under `/tmp/apps/pen` |
| Static-proven | 291 links are `static`; every one of the 144 rows carries at least one static link |
| Inferred (explicitly flagged) | 3 links, on 3 rows — `components.variants`, `styles.named_styles`, `motion.shader_animation` (all *negative/absence* findings) |
| Runtime-observed | **0** (deliberate: the running app was never touched, no GUI automation) |
| Docs-sourced | 0 (no web/docs used; everything is from the shipped bundle) |
| Largest unknown | whether the renderer implements any behaviour not visible in its string/schema/menu surface |

## 2. What is *static-proven* (high confidence)

These rest on machine-readable artifacts shipped inside the asar, not on marketing copy:

1. **The `.pen` schema v2.20** (`out/skills/pen-dev/pen-schema.md`, 227 lines) — every node type,
   layout attribute, fill/effect type, variable/theme model, `ref`/slot semantics, browser and script
   nodes. This one file proves more than any amount of string mining: 60+ features are anchored in it.
2. **The agent `execute` API** (`out/skills/pen-dev/execute.md`, 316 lines) — transaction/rollback
   semantics, the full function list, `Get` visitor context (`bounds`, `problems`), `Export` formats
   and options, `FindEmptySpace`, `SetVariables`.
3. **The native menu tree** (`out/menu.js`, 23 KB) — File/Edit/View/Window/Help with accelerators and
   the literal IPC channels each item fires (`export-selection`, `open-export-snapshot-dialog`,
   `show-code-mcp-dialog`, `import-images`, `toggle-ui-visibility`, …).
4. **IPC/literal string vocabulary** (`out/app.js`) — chat sessions, skills add/list/remove, MCP
   config/toggle, share uploads, workspace folders, agent API keys/OAuth, autosave failure.
5. **Config + constants** (`out/config.js`, `out/constants.js`) — provider keys and login types,
   `enabledIntegrations`, `customSkills`, `~/.pencil` layout, blob storage URL.
6. **Integration wiring** (`out/desktop-mcp-adapter.js`, `out/agent-config-manager.js`, `out/ide.js`)
   — the 7 MCP install targets and the Cursor extension install path.
7. **Bundled assets as feature evidence** — 40 shader presets + 10 generative scripts with previews
   (`out/editor/goodies/`, 146 files), 12 starter documents (`out/data/*.pen`), 15 skill guides.
8. **The compiled UI surface** — 36,302 extracted string literals, a 17-category/77-entry keyboard
   shortcut catalog, and 15 `setActiveTool(…)` tool activations (all reproducible, see C4).

## 3. What is inferred (and why)

| claim | why inferred | what would settle it |
|---|---|---|
| Component **variants** absent | no variant type in the `Child` union; no variant UI strings. All "variant" hits are `font-variant*` CSS keywords and shader preset names (*textured-solar-variant*) | runtime UI inspection or a `.pen` file containing a variant |
| Named **styles** absent | no style node/collection in schema; the only "Styles" label is the MCP result group title for `get_style` | runtime UI / docs |
| **Prototyping** absent | zero product-level prototype strings; every `prototype` hit is a JS built-in (`isPrototypeOf`, class `prototype`) | runtime UI |
| **Motion/timeline** absent | only `@time` shader animation; no keyframe model in schema | runtime UI |
| Presentation slides | proven for the controller (`getStartSlide`, `isEnabledSlideFrame`, `stepSlides`); "no speaker notes / no deck document" is inferred from the absence of such strings | runtime UI |
| Browser nodes are *drivable* by the agent | `browser` node + browser CDP modules + `WebMCP tools` strings exist; the exact drivable operations were not decompiled | runtime / MCP tool schema at runtime |

There is **one flat contradiction risk** worth stating: `out/menu.js` shows an "Export Selection to…"
submenu with exactly four formats, while `execute.md` documents `Export(..., "html-tailwind")`. Both
are true — CLI/agent export is richer than the native menu. I recorded both as separate rows
(`export.images_pdf`, `export.html_code`) rather than averaging them.

## 4. Notable unknowns

1. **Renderer internals are opaque.** The 7.6 MB minified bundle exhausted the rea worker heap while
   parsing (`analyze-index-renderer.json`, sha256 `a255ac34…`, evidence `ev_057db33…`). Feature
   claims about the renderer come from strings + compiled snippets, not from a reconstructed module
   graph. Any *implementation-quality* question (e.g. "is the text engine HarfBuzz?") is unanswered.
2. **IPC boundary is invisible to static analysis.** rea reports 0 IPC operations for the readable
   main process because the app uses the internal `@ha/ipc` abstraction rather than `ipcMain.handle`.
   Channel names were recovered by grep, but **request/response direction and payload schemas are not
   proven** — only channel existence.
3. **`node_modules/@ha/*` packages were out of scope.** `@ha/agent`, `@ha/mcp`, `@ha/schema`,
   `@ha/shared`, `@ha/ipc` are the real engines behind agent/MCP/schema behaviour. The 12k
   `node_modules` files were deliberately excluded (`--source-path` scoping); analysing them would
   firm up the agent runtime but is unlikely to change the *feature* inventory.
4. **`mcp-server-darwin-arm64` (4.7 MB) not analysed** — binary, and no native provider is configured.
   Its tool list is therefore unknown (though `execute.md` documents the agent-facing equivalent).
5. **Cloud services are opaque.** Sharing/collab/comments/AI generation are server-side; only the
   client contract is visible. E.g. `share-upload-changed` proves an upload protocol, not its format.
6. **Activation gating is unknown.** Strings such as `[DEV] Start Onboarding`, `wt.isVSCode`,
   `pen.dev plan usage limit …` show conditional surfaces (dev / VS Code host / plan-limited); I did
   not determine which are on for a normal desktop user.
7. **Feature completeness ≠ feature existence.** Many rows prove "the string/UI/API exists"; none
   prove the feature is finished or bug-free.

## 5. Method quality / reproducibility

- Commands: [`rea/COMMANDS.md`](./rea/COMMANDS.md) (C1–C4 + the exact grep recipes).
- Large Evidence JSON files were moved out of the git tree to `/tmp/rea_evidence/pen/` (197 MB +
  211 MB), with sizes and sha256 recorded in `COMMANDS.md`; everything left in `analysis/pen/` is
  small derived evidence (total ≈ 1.9 MB).
- Spot-check recipe for any row:
  ```bash
  grep -n -F '<locator>' analysis/pen/rea/strings-index.txt   # string locators
  grep -n '<symbol>' /tmp/apps/pen/out/<file>                 # symbol/label locators
  sed -n '1,260p' /tmp/apps/pen/out/skills/pen-dev/<file>     # schema/doc locators
  ```
- Negative findings are listed in `FEATURES.md` §"What is notably absent" with their basis, and each
  is represented by a `strength: inferred` row in `features.jsonl` where the area allows it.

## 6. Confidence summary per area

| confidence | areas |
|---|---|
| **High** (schema/menu/API-proven) | file, layout, components, variables, vector, text, effects, image, export, import, agent (tool API), plugins/MCP, presentation, shortcuts, settings |
| **Medium** (string-proven, semantics partial) | canvas, tools, selection, comments, collaboration, scripting, onboarding, performance |
| **Low / negative-only** | styles (absent), prototyping (absent), motion (absent), variants (absent), accessibility (spot-check only) |
