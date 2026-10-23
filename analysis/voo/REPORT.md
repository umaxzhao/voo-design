# VOO Design — REPORT (confidence, method, limits)

## Scope and method

Read-only inspection of `/Users/tt/teamwork_projects/voo_design` (Electron + React + Vite +
CanvasKit design editor). No repo file outside `analysis/voo/` was written; no git state was changed;
the full `npm test` suite was **not** run (Lead owns it). No test file was executed at all — test
evidence below is static (file + test titles), not runtime results.

Technique, in order:
1. Read the four top-level docs (`README.md`, `PROJECT.md`, `TEST_READY.md`, `TEST_INFRA.md`) and
   `analysis/README.md` (schema, taxonomy).
2. Enumerated the tree: `src/canvas/editor` (349 files), `src/canvas/components` (96 top-level
   entries / 204 files), `src/canvas` top-level modules, `src/shared`, `src/services`, `src/storage`,
   `electron/`, `tests/unit` (87 test files).
3. Counted primitives directly from source tables rather than prose: `tool_ids.js` (34 tools),
   `command_table/definitions_part*.js` (40 commands), `BLEND_MODES` (25), `SIMPLE_ADJUSTMENTS` (21),
   effect keys in `normalizeEffects` (9), `google_fonts_index.js` (1,949), `DESIGN_SHORTCUT_GROUPS`,
   i18n key lines (4,081 en / 4,081 zh).
4. Traced wiring for each candidate feature: definition → importer/consumer → UI affordance → test.
   Wiring, not file presence, decided `implemented` vs `partial`.
5. For every `missing_expected` row, ran an explicit search and recorded the pattern and its
   zero/near-zero result in the row's `completeness_note` (see also `WEAKNESSES.md` §method note).

Deliverables: `features.jsonl` (164 rows), `FEATURES.md`, `COVERAGE.md`, `WEAKNESSES.md`, this file.
Row distribution: 126 `implemented`, 23 `partial`, 15 `missing_expected`, 0 `unknown`
(areas that were too ambiguous to assert were folded into `partial` with a note instead).

## Verified by reading code (high confidence)

These were confirmed by reading the implementation **and** at least one consumer/test; I would defend
the "implemented" verdict:

- Boolean path engine and its topological invariants (`path_boolean_engine.js` + 3 test suites,
  ~86 cases), expand-stroke (34 cases), offset path (18 cases), SVG parse/serialise, path menu.
- Snapping/spacing/alignment (`scene_snapping.js:snapNodeBounds`, `align_ops.js`, align section) —
  read the math and the 118-case test surface.
- Undo/redo contract and history: `undo-action-contracts.js:commitEditorDocument`,
  `editor_history.js`, every engine mutation goes through it; verified the agent command executor
  calls it (`command_table/executor.js` imports `commitEditorAction`).
- Workspace storage: three drivers behind `WorkspaceStorageEngine`, IPC surface in
  `electron/preload.cjs` / `workspace_manager.cjs`, and 4 workspace test suites.
- Agent bridge: `local_cli_bridge.js` → `codex_transport.js` → `electron/cli_bridge_server.js` /
  `preload.cjs` IPC; protocol + stress tests read.
- Figma import: `figma_import_client.js` + 12 `tests/unit/figma/*` suites (kiwi writer, zip reader,
  schema, text, vectors, glyphs, effects, round-trip).
- Export pipeline: dialog `FORMATS` → `use_editor_export` → `export_editor_image` →
  `editor_export_{raster,selection,regions}.js`; PSD writer and PDF hook read.
- Auto layout model (`scene_auto_layout.js`) read line by line; panel read — hence "exists but
  untested/partial", not "implemented".
- The two stub modules (`provider_client.js`, `model_route_resolver.js`) and the `rpc.js` no-ops were
  read in full — this is why direct-API AI is reported as broken rather than implemented.

## Inferred (medium confidence) — behaviour read but not executed

- **Exact user-visible wiring of some UI affordances.** I did not launch the app (no dev server, no
  Electron run). Statements of the form "the panel exposes X" are based on JSX prop threading and
  imports, not on clicking. Examples: tool sub-bars, canvas presets popover, history panel,
  presentation viewer.
- **Grid snapping is unreachable** — inferred from the three `snapNodeBounds(...)` call sites passing
  no `options`. If some other path (not found by `grep -rn snapNodeBounds`) supplies options, this
  claim would weaken. Searched for `snapToGrid` globally: only `scene_snapping.js` lines 82/149/225.
- **Autosave disabled in the desktop build** — inferred from the `disabled` flag comment and the
  no-op return path; the actual value of `disabled` is supplied by the editor page, which I read only
  around the call site.
- **Collaboration dead code** — inferred from the absence of any `createCollabSession` consumer and
  the static `status:"off"` snapshot. It is conceivable that a build-time alias replaces
  `collab/use_collab.js`; no such alias exists in `vite.config.js` (read) or in the repo (grep).
- **Presentation and module "implemented" verdicts** rest on the pure modules + UI imports; with no
  tests, runtime defects are possible.
- **Test-case counts (~986)** come from counting `it()/test(` occurrences; suites using loops,
  `it.each` or generated tables will execute more, and skipped tests are not detected statically.
  Treat the numbers as relative breadth indicators, not exact run counts.

## Could not inspect / deliberately not done

- **No runtime behaviour captured.** No screenshots, no browser automation, no Electron launch.
  Anything requiring a live session (font download behaviour, ONNX model download, real PPTX opening
  in PowerPoint, importing a real `.fig`/`.psd`) is unverified.
- **`vendor/voo-canvas-core/`** (vendored Skia renderer) was not read beyond its presence; the Skia
  path is therefore reported as existing but uncharacterised.
- **`src/content/`, `design/`, `docs/`, `native_studio/`, `public/`** were not audited (out of the
  editor feature scope); `Design.md`/`design/lint.cjs` were only skimmed to confirm the visual gate.
- **The 40-command table's exact semantics** (schemas read, bodies read at a glance) were not audited
  command-by-command for domain correctness; "all 40 have implementations" is a name-level match
  (`implementations_part1-4.js` + executor gesture map), not a proof each is bug-free.
- **Electron main-process internals** beyond the bridge/workspace/MCP surfaces (e.g. menu
  construction, auto-update) were not reviewed.
- **No analysis of transpiled/built output** (`dist/`) and no attempt to compare against Pen/Figma
  artifacts — that is the Lead's synthesis job; this file only documents VOO's side.
- **`native_studio/`** and any Python/engine services were skipped; if they implement features the
  JS tree only stubs, the report under-claims.

## Known caveats in this analysis

1. **Stub vs missing distinction matters.** "Stubbed in the standalone build" is not the same as
   "never implemented": `provider_client.js`, `model_route_resolver.js`, `rpc.js`,
   `collab/use_collab.js` are deliberate standalone degradations with the real code either removed or
   present-but-unwired. For gap ranking, they behave as missing in this repo.
2. **Rows are feature-level, not UI-flow-level.** A row may say `implemented` for a surface that the
   comparison target reaches through a different flow (e.g. VOO exports HTML/CSS via context menu and
   full-page HTML, while Figma has a Dev Mode inspect panel). The Lead should compare the narrative in
   `FEATURES.md` §22 as much as the row status.
3. **Area attribution is single-valued.** A row like AI layout generation touches `ai`, `layout`, and
   `agent`; it is filed under `ai` with cross-references in the note. Aggregating per area therefore
   under-counts cross-cutting features.
4. **The repo is a large uncommitted worktree.** File contents were read at analysis time; the Lead's
   later `git diff` could show differences if another teammate edited `src/` (none should have).
5. **Two docs disagree with code** (`PROJECT.md` 3-step onboarding vs 4 in code; `TEST_READY.md`
   686 tests vs ~986 now). I trusted code over docs and recorded the drift in `COVERAGE.md` §7.

## Suggested handoff to the Lead

- Treat `features.jsonl` `status` as VOO's side of the matrix; the Pen/Figma analyst rows should be
  joined by semantic id (area + concept), not by string equality.
- The gap ranking almost certainly starts with: hosted/direct-API AI (P0), collaboration/share (P0
  for Pen parity), prototyping/comments (P0 for Figma parity), components/variants/styles/constraints
  (P1), rulers+guides and grid snapping (P1 quick wins — small plumbing fixes for real affordances),
  motion timeline and dev mode (P2), format holes (Pen import, PDF import).
- Two cheap wins with high perceived value: pass snapping options (including `snapToGrid` and
  `snapToPixel`) into the existing `snapNodeBounds` calls, and either wire or hide the share/export
  surfaces that depend on the stubbed provider client.
