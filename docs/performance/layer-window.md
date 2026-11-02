# Layer-window and NBA document performance

Recorded on 2026-11-02. This is local, partial evidence. No push, integration,
production deployment or desktop publication is authorized for this repair.
The task owner maintains `docs/quality-progress.md`; this work does not edit it.

## Input and source relationship

- Input: `/Volumes/TD/download/NBA-Land-UI-V3.voo`, read-only, 31,900,716 bytes.
- SHA-256: `8bf368d5c6b7cb1276f63f1dc262ec763fc266c404a4b97aee202914d929c4f8`.
- Actual page: 15,036 nodes: 5,110 groups, 3,052 texts, 5,675 rectangles,
  1,197 image instances and two paths. The binary container has 150 assets.
- Author branch: `codex/empty-canvas`, starting clean at
  `42319db11c1f9512109d566ecc3b5662ab65ddfe`.
- Read-only QA comparison: `31c24644c43d44932b576f134c574e1e13729fc2`.
  Merge base: `965bbd889bc121860564d2b82f25df5b4c7e78dd`.
  These are divergent histories; neither tree's results certify the other.
- Remote references were fetched. No merge, rebase, checkout, cherry-pick or
  write in the main QA tree was performed.

At the compared revisions, `editor_windowed_layer_rows.jsx`, `spatial_index.js`,
`use_editor_engine_registry.js`, `use_editor_artboard_layouts.js`,
`workspace-artwork-picture.js` and `use_skia_page.js` have identical content.
The workspace-index block in `image_editor.jsx` is also identical, although
that file has unrelated differences elsewhere. This patch extracts only that
block and its import. Preserve the QA tree's other edits when integrating.

The author branch also has earlier text/cache, custom-blend and empty-canvas
changes absent from the QA comparison. They are not part of this repair.
Do not replace the QA renderer with the author's whole tree. The three new
helper/probe paths do not exist at the QA comparison revision.

## Reproduction, attribution and change

Owner: `canvas.performance`, `layers.model-cache`. No font, IME, keyboard,
save/recovery implementation or `native_studio` changes.

- Initial real-file selection CPU profile: repeated R-tree insertion/splitting
  accounts for about 199 ms inclusive across 12 selections. The shared
  `ImageEditor` rebuilt the entire workspace index when engine selection
  notifications refreshed document wrappers, despite unchanged node geometry.
- Retained failing browser regression: two selection transitions with 2,000
  nodes cause **8,000 index insertions**, where zero are required. See
  `/tmp/voo-layer-perf-evidence/selection-index-red.log`.
- `createWorkspaceSpatialIndex` keeps one index per mounted workspace. Its
  signature covers node-array identity, document identity, root mode, frame
  dimensions and layout offsets. Immutable content changes and page/layout
  changes invalidate it. New indexes use existing STR bulk loading.
- The regression now observes zero index builds on selection. Pure tests also
  check moved/removed/undone nodes, exact hit locations, live node references,
  frame bounds, offsets and page membership.
- Scroll traces attribute substantial work to React DOM creation/removal and
  style/layout, not prefix-offset generation alone. Retained virtual rows now
  use ordinary React memoization and stable observer callbacks. Model changes
  still update selection, drag, rename, thumbnails and variable-height rows.

## Comparable measurements

Apple M4 Pro / macOS arm64; Node 26.7.0; Chromium 156.0.8078.4, headless,
1440 × 1000 CSS pixels, DPR 1. Sequential probes, no other QA suite launched by
this task during measurements. Other desktop applications remained running;
OS load averages are in the probe receipts. No process belonging to another
session was stopped. Browser GPU information reports **SwiftShader**, not
Metal. Available Electron package: 43.8.0; native Electron was **not run**.

Baseline and candidate use separate local production builds of the same
branch and the same input. Build HTML hashes, raw samples, exact input hash,
DOM/heap observations and CPU/timeline profiles are retained outside Git at
`/tmp/voo-layer-perf-evidence`. Development measurements are separate files.
Profiles run separately from scroll timing loops.

| Scenario | Before | After | Interpretation |
| --- | --- | --- | --- |
| Actual inspector X edit; three rounds × five edits | P50 208.74 ms; P95/max 353.08 ms | P50 161.85 ms; P95/max 242.10 ms | Pooled median improves 22.46%; includes Playwright, fill/Enter, state wait, two RAF callbacks and sampling overhead |
| Per-round edit medians | 215.10 / 176.97 / 205.79 ms | 155.89 / 177.88 / 162.17 ms | One reversed-order round does not improve; variability remains material |
| Actual file, selection after scrolling, three rounds × 12 | P50 69.70 / 70.60 / 70.00 ms | P50 60.40 / 62.20 / 62.30 ms | Programmatic selection to two RAF callbacks, not input-to-presentation latency |
| 2,000-row idle/smooth/sweep/jump; 120 intervals per mode per round | Idle P95 about 16.8 ms; scroll P95 about 33.4 ms | Similar P95; one smooth sample reaches 66.7 ms | No demonstrated scroll-cadence improvement |
| Actual 15,036-row file, same scroll modes | Scroll P95 about 33.4 ms | Similar P95; one jump reaches 83.3 ms | Long frames remain; no Figma/Electron parity claim |
| Controlled small-scroll development ablation; only old/new virtualizer differs | 7,384 row render calls | 120 row render calls | Counter-only evidence, not production FPS or latency |

Both scene sizes keep at most 32 layer rows mounted in the recorded scroll
samples. For the actual file, post-GC heap observations are about 99.27–99.60 MB
before and 99.11–99.43 MB after. DOM/listener observations stabilize after the
first traversal in these short runs. Neither bounded rows nor these samples
prove absence of a leak. No long-session allocation/retainer audit was run.

The original independent QA runs used a different revision and list height;
their samples remain references, not additional before samples. The older
118-frame report without raw data is excluded. Failed initial inspector probes
assumed integer node coordinates; the input contains X=1573.616 while the
control displays 1574. Those probes timed out before producing valid samples
and are retained as harness failures, not product/performance results.

## Functional acceptance and remaining contexts

- Full units, final local source copy: 608 files / 4,965 assertions passed;
  three files / four historical assertions skipped. Initial archive-only run
  failed the Git-based module-list assertion because the temporary copy had no
  `.git`; a private temporary Git repository fixed that fixture condition.
  Full rerun passed without changing assertions or product code.
- Final layer browser suite at DPR 1 and DPR 2: reachable last/offscreen rows,
  actual click/arrow selection, one-row pointer reorder, unchanged geometry,
  exact one-step undo/redo, rename/search and live variable-height filter rows.
- Five related browser suites: camera navigation, frame surface/camera,
  negative space, zoom preview and nested object lifecycle. See their separate
  exit-code receipts; a pass covers only their registered assertions.
- Design lint: 1,482 files clean. Task-source formatting uses the existing
  ESLint dependency for semicolons, final newline and trailing whitespace;
  no formatter dependency or broad legacy reformat is introduced.
- Final production build and module ownership checks are required before
  creating the local repair commit. `/tmp/voo-layer-perf-evidence/handoff.json` records their exits,
  source manifest, exact commit and build hash. This is not the 117-suite clean
  release verifier and does not certify unrun browser/platform contexts.

**Known old-branch failure, preserved independently:** two rows are selected,
then row 0 is dragged past row 3. Expected order `[2,3,0,1]`; both baseline and
candidate produce `[1,2,3,0]`, retaining two selected IDs but moving only one.
`tests/e2e/layer-window-multiselect-checks.mjs` retains the strict batch-order,
geometry and one-step undo/redo assertions as a separate reproduction. It
fails at the first batch-order assertion on this branch; later assertions are
unreached, not passed. The existing core layer suite remains scoped to its
original one-row drag case, with stronger geometry and redo checks.

The main QA comparison already has independent batch-drag work in
`db31e32791ab6556ea8b65346a8a5fa2d1a4f512`, including changed drag-session and
interaction routing. Do not infer that this old-branch failure occurs there;
do not overwrite that work. Run the preserved reproduction on the integrated
Linux candidate before accepting multi-selection drag. No main-tree test was
run by this task.

Unverified: integrated QA revision, native/packaged Electron, Metal/hardware
GPU, physical trackpad/touch, sustained memory behavior, full text/font parity,
all paint/export combinations, pan/zoom performance on this actual file, and
the other release suites. The CPU profile of actual edits still spends
substantial time in full Canvas2D layer-pass rendering. This repair does not
remove that remaining large-scene cost or make the file uniformly fluid.

## Reproduce on the integration candidate

Run with declared dependencies installed, no parallel QA benchmark, and keep
baseline/candidate build directories separate. The probe writes raw data to
the explicit output path; it never saves the imported source file.

```bash
npm run build
VOO_PERF_TRACE=1 VOO_PERF_OUTPUT=/tmp/layer-scroll.json node scripts/bench-layer-scroll.mjs
VOO_PERF_FILE=/path/to/NBA-Land-UI-V3.voo VOO_PERF_TRACE=1 VOO_PERF_OUTPUT=/tmp/nba-scroll.json node scripts/bench-layer-scroll.mjs
VOO_LAYER_TEST_DPR=2 node tests/e2e/image-layer-window.e2e.mjs
node --input-type=module -e 'import {withEditorBrowser} from "./tests/e2e/editor-browser-fixture.mjs"; import {verifyLayerWindowMultiDrag} from "./tests/e2e/layer-window-multiselect-checks.mjs"; await withEditorBrowser(verifyLayerWindowMultiDrag,{deviceScaleFactor:2});'
```

`VOO_PERF_MODE=development` uses the isolated Vite fixture; default is the local
production preview. `VOO_PERF_DPR=2` changes the benchmark DPR;
`VOO_PERF_DIST` selects an existing build. `VOO_PERF_BUILD_REVISION` records its
provenance; the HTML hash is checked directly. Caller-supplied source labels
in archived-copy probes are descriptions, not a clean-Git certificate. Match
the source manifest and build receipt before attributing results to a commit.
