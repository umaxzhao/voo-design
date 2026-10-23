# VOO Design — feature gap report vs Pen.app 1.2.15 and Figma (desktop + editor)

Date: 2026-10-22 · Workspace: `/Users/tt/teamwork_projects/voo_design` · Tooling: local `rea` v6.5.0

---

## 1. Executive summary

The reverse-engineering phase produced **three evidence inventories** (Pen 144 features / 291 static
evidence links, Figma 145 features — 124 of them from the *real recovered editor bundle*, VOO 164
features / 126 implemented) and a curated **capability matrix** in
[`FEATURE_MATRIX.md`](FEATURE_MATRIX.md). The picture:

- **VOO is not a thin clone.** It is at parity or ahead of Pen/Figma on large editor surfaces:
  boolean/path engine, 34 tools, brush/healing/warp, masks + raster paint, 21 adjustment layers,
  25 blend modes, local on-device AI (matting/upscale/inpaint/outpaint), presentation + PPTX/PDF deck
  export, Figma `.fig` import, PSD import/export, SVG export, i18n, spatial-index performance, and the
  agent stack (CLI agents, MCP, island bar, command table).
- **The real gaps cluster in four stories**, not in the drawing tools:
  1. **Design-system depth** — variables beyond flat colours (types, collections, **modes/themes**),
     named paint/text/effect styles, component variants/properties, resize constraints,
     auto-layout hug/fill/wrap depth.
  2. **Code handoff / dev mode** — Pen ships an *Export Design to Code* flow (HTML + Tailwind) and
     Figma ships Dev Mode + codegen + Code Connect + MCP; VOO only has Copy HTML/CSS.
  3. **Canvas interaction polish** — rulers + draggable guides, reachable grid snapping, comments,
     prototyping interactions, find & replace, quick-action palette, light theme.
  4. **Collaboration/product plumbing** — the 12-module collab stack is written but **never wired**
     (no `createCollabSession` call), share links read a session nothing creates, autosave is disabled
     in standalone desktop.
- **Pen-specific gaps worth closing first**: Pen `.pen` import (VOO has no parser), snapshot bundles,
  Pen's documented `execute` agent API + bundled design skills/guides, HTML(+Tailwind) code export,
  user shader fills, browser/script nodes.
- **Figma-specific gaps worth closing first**: comments, variables modes/binding, prototyping + smart
  animate, Code Connect/MCP dev mode, plugin ecosystem, branch/version workflows, light mode.

This cycle implements six high-value gaps in two waves (see §4):
wave 1 — **`.pen` import**, **Export Design to Code (Tailwind/React/CSS)**, **rulers + draggable
guides + reachable grid snapping**; wave 2 — **auto-layout depth (wrap/min-max/alignContent)**,
**Variables v2 (typed variables, collections, modes)**, **canvas comments / review threads**;
wave 3 — **named paint/text/effect styles**, **resize constraints**, **⌘K command palette +
⌘F find & replace**, plus codegen emission of the new auto-layout fields.

---

## 2. Method and evidence chain

Everything below is reproducible from the repo.

### 2.1 Pen.app 1.2.15 (Electron 44, `pen.dev` / highagency)

- `rea analyze-javascript-application /Applications/Pen.app/Contents/Resources/app.asar` fails on the
  unpacked claude-agent-sdk binary (`artifact_integrity_mismatch`); the analysis was re-run on the
  extracted tree (`/tmp/apps/pen`) with `--artifact-format directory`, plus targeted analyses of the
  7.3 MB renderer bundle (`out/editor/assets/index.js`) and the main-process modules (`out/*.js`).
- High-value shipped artifacts inside the app were recovered:
  **`.pen` schema v2.20** (`out/skills/pen-dev/pen-schema.md` + `node_modules/@ha/schema/pen.schema.json`),
  the **agent `execute` API doc** (316 lines), the native menu tree (`out/menu.js`),
  **12 bundled starter documents** (`out/data/*.pen`), 40 shader presets + 10 generative scripts,
  15 design skill guides, and 36,302 UI string literals.
- Evidence: [`pen/features.jsonl`](pen/features.jsonl), [`pen/FEATURES.md`](pen/FEATURES.md),
  [`pen/GAPS-vs-VOO.md`](pen/GAPS-vs-VOO.md), [`pen/REPORT.md`](pen/REPORT.md),
  [`pen/rea/COMMANDS.md`](pen/rea/COMMANDS.md). Large Evidence JSONs live in
  `/tmp/rea_evidence/pen/` with sha256 recorded.
- Limitation: renderer is minified; rea exhausted its worker heap on the 7.6 MB bundle, so UI
  behaviour is inferred from strings/schema/menu, not executed. Pen was never launched or modified.

### 2.2 Figma desktop 126.9.13

- Desktop shell: `rea analyze-javascript-application /tmp/apps/figma --artifact-format directory`
  (evidence `ev_cba470e0…`): 45 parsed JS files, 34 IPC channels / 23 handlers, 75 exposed API
  members, 328 shell i18n keys × 7 locales, native menu + accelerators, shipped
  **Dev Mode MCP server** (`lazy/external/codegen_mcp_server.js`), Make Local browser-preview bridge.
- **The Figma editor web app itself was recovered non-destructively** from the user's Chromium simple
  cache (`~/Library/Application Support/Figma/DesktopProfile/v43/Cache`) with two read-only tools in
  [`figma/tools/`](figma/tools/): 1,182 decoded files / 280 MB including the 8.3 MB `figma_app` bundle,
  the 33,116-key English i18n bundle (451 namespaces), prototype viewer, import worker and canvas WASM.
  Re-analyzed with `rea` (`ev_52416c8b…`).
- Evidence: [`figma/features.jsonl`](figma/features.jsonl), [`figma/FEATURES.md`](figma/FEATURES.md),
  [`figma/GAPS-vs-VOO.md`](figma/GAPS-vs-VOO.md), [`figma/REPORT.md`](figma/REPORT.md).
  Large dumps in `/tmp/rea_evidence/figma/` (sha256 recorded in `figma/rea/COMMANDS.md`).
- Limitation: static only (no execution); the cache is LRU so lazy chunks may be missing; no source
  maps. The user's running Figma session was never touched.

### 2.3 VOO Design current state

- Read-only inventory of the working tree (349 engine files, 96 component entries, 87 test files,
  ~986 declared test cases): [`voo/features.jsonl`](voo/features.jsonl),
  [`voo/FEATURES.md`](voo/FEATURES.md), [`voo/COVERAGE.md`](voo/COVERAGE.md),
  [`voo/WEAKNESSES.md`](voo/WEAKNESSES.md), [`voo/REPORT.md`](voo/REPORT.md).
- Baseline executed by the Lead: `npm test` → **87 files / 1,078 tests passed**;
  `npm run lint:design` → clean (818 files); `npm run build` → success (6.3 s).
- Limitations: VOO verdicts in the matrix are static (no runtime interaction); the tree is a large
  uncommitted work-in-progress, so status is point-in-time.

### 2.4 Synthesis

`analysis/tools/merge_matrix.py` performs a deterministic area-scoped token join across the three
`features.jsonl` files; its raw output is kept as [`FEATURE_MATRIX.raw.json`](FEATURE_MATRIX.raw.json)
(toon: 301 rows — 139 gap, 23 partial_gap, 119 differentiator). Because the products name the same
capability differently, the **curated** [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md) is authoritative.

---

## 3. Gap ranking (what actually matters)

Ranked by user value × product differentiation × implementation cost. Full backlog:
[`BACKLOG.md`](BACKLOG.md).

| # | Gap | Why it matters | Pen / Figma | Effort |
|---|---|---|---|---|
| 1 | **Variables beyond colour + modes/themes** | Token layer for dark mode, spacing scales, multi-brand docs; also unlocks agent token workflows | Pen P0 (4 types + `{value,theme}`), Figma P0 (collections/modes/binding) | L — **implemented wave 2** |
| 2 | **Export design to code (HTML+Tailwind/React/CSS)** | The "design → production code" story is now table stakes; Pen ships it, Figma's Dev Mode is a product | Pen P0, Figma P0 | M — **implemented this cycle** |
| 3 | **`.pen` import** | VOO can import Figma/PSD/SVG but not the format of the closest competitor; unlocks real Pen documents | Pen native | M — **implemented this cycle** |
| 4 | **Prototyping interactions / flows / smart animate** | Figma's core differentiator; VOO presentation is linear slides only | Figma P0 | L |
| 4b | **Comments / review threads** | Review loop absent before wave 2 | Figma P0, Pen P1 | M — **implemented wave 2** |
| 5 | **Comments on canvas** | Review loop is absent; VOO annotations only mark reference images for AI | Figma P0, Pen P1 | M |
| 6 | **Wire collaboration (it exists but is dead)** | 12 modules, 0 call sites; share links cannot complete; presence UI has no peers | Pen P1, Figma P0 | M |
| 7 | **Rulers + guides + reachable grid snapping** | Precision editing basics; guides are already snap targets but cannot be created | Pen Y, Figma Y | S — **implemented this cycle** |
| 8 | **Named paint/text/effect styles + component variants** | Design-system authoring depth; styles done in wave 3, variants remain | Figma P0, Pen P2/– | L |
| 9 | **Auto-layout depth: hug/fill/wrap/min-max + constraints** | Layout engine lacked wrap/min-max tests; wave 2 added them | Pen P0, Figma P0 | M — **depth implemented, constraints still planned** |
| 10 | **Light/dark interface theme** | Pen ships both; VOO is dark-only | Pen P1, Figma Y | M |
| 11 | **Quick actions / command palette + find-replace** | Power-user navigation; implemented in wave 3 | Figma P0/P2 | S — **done** |
| 12 | **Pen agent contract: documented `execute` API + bundled design skills/guides** | Pen's agent surface is *documented and transactional*; VOO's is split across command table + MCP + free-form chat | Pen P0 | M |

Secondary gaps (documented, not scheduled): snapshot `.zip` export/import, browser/script/icon nodes,
user `.glsl` shader fills, mesh gradients, layout grids, Code Connect, plugin runtime, VS Code/Cursor
extensions, PDF/Sketch/CSV import, branch/merge reviews, RTL/rich text, screen-reader announcements.

---

## 4. Implemented in this cycle

Three disjoint workstreams were commissioned from the backlog (see `BACKLOG.md` for acceptance
criteria and `analysis/voo/` for the evidence that motivated them):

1. **Pen `.pen` import** (task-5, `src/canvas/pen/`, open-dialog wiring, tests) — maps Pen's
   frame/group/rect/ellipse/polygon/path/text/icon nodes, fills (solid/gradient/image), strokes,
   corner radii, effects, auto-layout frames, variables/themes and assets into a valid `.voo` document,
   with a warnings rail for unsupported constructs.
2. **Export design to code** (task-6, `src/canvas/codegen/`, code dialog) — selection/page → HTML +
   Tailwind, React component and plain CSS, with copy/download, scope selector and lossy-node warnings.
3. **Rulers + guides + grid snapping** (task-7, `src/canvas/editor/rulers_geometry.js`,
   `src/canvas/components/editor_rulers.jsx`) — viewport-aligned rulers, drag-out/move/delete guides
   persisted in `doc.guides` with undo, plus the grid-snap option plumbing that was dead code.

Verification for this cycle: targeted vitest per workstream, the existing snapping/HTML-export
regression suites, `npm run lint:design` (clean, 850 files), the full `npm test`
(**100 files / 1,361 tests passed**, baseline 87/1,078) and `npm run build` (green) at integration, plus
headless-Chrome screenshots of rulers/guides, the code-export dialog, the comments panel/thread, the
variables manager, the ⌘K command palette, the ⌘F find bar and the new styles/constraints sections
([`screenshots/`](screenshots/)). Details and deferred items:
[`IMPLEMENTATION.md`](IMPLEMENTATION.md).

---

## 5. Reproduction

```bash
# Repo baseline
npm test && npm run lint:design && npm run build

# Pen inventory
rea analyze-javascript-application /tmp/apps/pen --artifact-format directory --format json
rea analyze-javascript-application /tmp/apps/pen/out/editor/assets/index.js --format json

# Figma shell + recovered editor bundle
rea analyze-javascript-application /tmp/apps/figma --artifact-format directory --format json
python3 analysis/figma/tools/scan_chromium_cache.py    # read-only cache scan
python3 analysis/figma/tools/extract_chromium_cache.py # dumps to /tmp/figma_web
rea analyze-javascript-application /tmp/figma_editor --artifact-format directory --format json

# Synthesis
python3 analysis/tools/merge_matrix.py                 # raw join → FEATURE_MATRIX.raw.json
```

## 6. Caveats

- Pen/Figma evidence is **static** (inert parsing, no execution). "Absent" means "no positive evidence
  found", not a product decision — for Pen the negative findings (variants, prototyping, keyframes,
  named styles) are explicitly marked inferred.
- Figma editor evidence comes from an LRU disk cache: lazy-loaded chunks may be missing, and
  entitlement-gated surfaces cannot be distinguished from shipped ones.
- VOO status was measured on a mid-refactor working tree (large uncommitted diff); re-run the
  inventories after the tree settles if statuses must be exact.
- Runtime behaviour of VOO's own new features is covered by unit tests + a smoke screenshot this
  cycle, not by a full interactive QA pass.
