# Performance evidence map

These documents measure different things. Keep their raw results separate;
merging numbers into one before/after table would mix backends and environments.

| Document | Scope | How to use it |
| --- | --- | --- |
| [Generated canvas benchmark](../canvas-perf-benchmark.md) and [JSON](../canvas-perf-results.json) | Node document/index/mutation CPU timings | Generated together by `tests/unit/canvas_perf_harness.js`; paths stay fixed |
| [Local drag](canvas-fps-local-drag.md) | Historical 2026-10-23 Canvas2D / SwiftShader drag profiling | Explains local repaint changes; not the present hardware GPU FPS gate |
| [Camera tiles](canvas-fps-tiles.md) | Historical 2026-10-23 Canvas2D camera tile experiments | Explains raster/cache evidence and limitations |
| [WASM architecture](wasm-engine.md) | Implementation, data contracts and feature flag | Design reference, not a benchmark result |
| [WASM benchmark](wasm-engine-bench.md) | Node/native linear vs production R-tree vs WASM timings | Mutation and query costs; not end-to-end presented frames |
| [Editor verification](../audits/editor-completion-verification.md#rendering-and-measured-performance) | 2026-10-27 hardware Chromium/CanvasKit pan, zoom, drag | Latest recorded full nine-scenario browser gate; read its scene/coverage limits |

Reproduce current browser measurements with `npm run test:e2e:fps`. The default
30 FPS gate covers synthetic rectangle scenes; specify hardware/software mode
and node counts explicitly when comparing runs. Do not compare a profiled run
with an unprofiled run, a drag-only run with a full sequence, or CPU microseconds
with displayed FPS. WASM remains experimental and off by default because
measured mutation gains do not establish a browser-wide gain.

## Editor download boundaries

Run `npm run analyze:editor` on a clean checkout to record the exact revision,
minified chunk membership and static entry dependency closure. The report goes
to the system temporary directory by default; an explicit output path is also
accepted. `build.write` is disabled, so analysis does not replace `dist/`. Keep
the JSON with local release artifacts rather than adding a dated file here.

A clean reconstruction of `1b262b0` measured 3,026,856 bytes of static entry JS
(891,759 bytes summed gzip). The maintenance change defers the initial editor,
separates the inspector and loads export builders only when used. Compare the
new report against that baseline; a renamed/smaller feature chunk alone is not
proof of a smaller initial download. Runtime-requested welcome/localization
chunks, CSS, fonts and WASM are outside this static-closure metric. The browser
`editor-loading` suite separately checks actual first-welcome requests and
that opening/returning to the editor preserves artwork and undo history.

The `5004f42` static-entry baseline is 1,232,507 bytes (356,535 summed gzip).
The next boundary change separates agent settings/model menus from tool
executors, draft lookup from serialization, and welcome metadata from design
contract validation. File parsers and generation contracts load on use. The
browser gate also rejects first-welcome requests for canvas tools, scene
variables/Auto Layout/snapping and the full font index. These runtime checks
matter because a dynamically loaded welcome chunk is outside the static-entry
metric. Re-run the analyzer for exact bytes at the release being considered.

Extracting gestures and shared camera hooks reduces the editor container from
5,037 to 4,343 lines and removes its two dependency-rule suppressions; it does
not by itself reduce the loaded editor chunk. The navigation gate exercises
real pointer pan/drag/cancellation, zoom, history and welcome round trips.
Other oversized editor modules still need behavior-preserving maintenance.
The following batch removes the remaining explicit Hook dependency suppressions.

The next structural extraction reduces `image_editor.jsx` from 4,343 to 3,967
lines by moving mobile panels, media import, feedback and image actions into
focused Hooks. These remain static imports; the extraction is a maintenance
improvement, not evidence of a smaller editor download. `editor-refactor` mounts
the real Hooks in React with recorded engine interfaces to check focus targeting,
touch events, independent feedback timers and unmount cleanup. The full editor
release suites separately cover actual engine and document behavior.

PropTypes diagnostics now fail unit tests and browser release checks. Sparse
multi-selection transform defaults and real inspector edit/undo are covered;
`hook-lifecycle` also exercises full-page callback routing and read-only Inspect
colour previews. SSR-only markup tests do not establish lifecycle behavior.

The following extraction moves frame properties/resizing, component source
resolution and property-library actions into focused modules. `editor-context`
uses real engines to check constraint reflow, commit/undo and live/snapshot
resolution order; the extraction keeps those APIs synchronous.

Optional surfaces have a separate download boundary. A `lazy()` declaration
alone does not defer a closed dialog when it is always mounted. Surfaces now
mount on first use and retain their instance after closing so Find query state
survives. The context menu loads on demand as well. `editor-optional-loading`
blocks cold module requests and checks Escape/outside cancellation, canvas
pixels, keyboard actions and reopening state. Re-run the bundle analyzer on
the release commit; the clean `baaed91` editor chunk baseline is 1,093,665
bytes (324,155 gzip). Its static import closure totals 2,513,663 bytes, including
shared entry chunks and excluding optional runtime imports. Neither figure is
an FPS measurement or a complete first-open network total.

Stroke parity uses the existing authoritative Canvas2D fallback for additional
paint lists and image/text strokes that the Skia scene format cannot carry.
This prioritizes correct pixels; it does not establish a hardware-GPU speedup.
Merged Boolean strokes now share local contours between Canvas2D and SVG.
The `boolean-stroke-export` gate checks four operations, three stroke positions,
paint alpha, nested holes, operand transforms and distant world coordinates
against explicit expected pixels. Curved operands retain the existing polygon
kernel's approximately 0.25 document-pixel tessellation tolerance; this is not
an unlimited-precision Bezier operation or a new GPU performance measurement.

The `svg-frame-clipping` gate checks transformed, rounded ancestor Frame clips
in the full PNG compositor and decoded SVG, including clipping-mask chains and
Frame selection exports. Ordinary folders preserve ancestry metadata, and
independently exported children remain standalone. Actual inspector toggles,
resize/move, screenshots and undo/redo exercise the visible stage as well.
Nested Frame clips use Canvas2D compatibility while the flat Skia adapter has
no representation for them. Boolean path operands and operand transforms unsupported
by the native painter use the same compatibility route. This does not certify general SVG layer effects.
The following `container-opacity` gate isolates a Frame/Group subtree before
applying alpha, including overlapping children, nested containers, clipping
chains and PNG-only adjustment backdrops. SVG adjustment effects remain outside
the supported export scope. Native blend modes composite the completed layer
once against its backdrop. PSD-only blend math is supported in PNG; SVG rejects
these unsupported modes explicitly instead of silently exporting normal blend.
Only non-unit-alpha containers become atomic layers;
their existing internal paint order is retained. An interleaved malformed
subtree uses its first member's paint slot, while ordinary opaque containers
retain the established flat order. The visible stage, one-step history and
project readback have separate browser assertions.

`boolean-resize` checks the shared synchronous mutation path through numerical
edits, real pointer handles, agent calls, constraints and project readback.
Stored operands and active child layers resize together; explicitly updated
batch children are not scaled twice. Regular resize retains scalar stroke and
radius values. An operand whose anisotropic transform exceeds the persisted
shear range is baked to an editable path so save/reopen preserves its geometry;
undo restores the original shape and hierarchy. This is correctness work, not
evidence of a faster Boolean kernel.

The following session extraction reduces `image_editor.jsx` from 3,687 to
3,330 lines. The new `editor-session` gate mounts real React Hooks with two
engines to check eviction snapshots, deferred selection, component-source return
contexts, the live-page cap and remote-listener cleanup. These are static imports;
the structural reduction alone is not evidence of a smaller initial download.

The next structural batch reduces the editor container to 3,135 lines and the
Page component from 1,330 to 168. Page activation, eviction, independent Skia
canvas refs, imports and title controls retain their interfaces in focused
modules. `editor-page-composition` covers real mount/unmount pixels, deduplicated
external images, title double-click rename and notice controls. Auto Layout's
public exports remain synchronous after normalization and reflow are separated.

Comments have a genuine optional download boundary: an empty, closed canvas
keeps the launcher while its thread views and controller load on demand. Saved
comments load their pins automatically. `comments-loading` blocks and fails real
module requests, checks cancellation and retry without replacing the canvas,
and verifies post/reply undo. `comments-lifecycle` checks initial unread pins,
camera geometry, draft/reply/filter retention, stale callbacks and unmount
cleanup. Escape registration remains eager so a cold feature cannot clear the
canvas selection while it is being dismissed. Compare clean release bundle
reports and network assertions; file splitting alone does not reduce download.

Layer-panel extraction separates tree rows, interaction/state controllers,
popovers and the public prop contract, reducing the public component from 2,252
to 184 lines and the shortcut Hook from 1,399 to 119. `editor-layers-composition` exercises
the real panel and document interactions; keeping these components as static
imports is a maintenance change, not a download or FPS improvement.
`editor-shortcut-lifecycle` separately checks ordered keyboard routing, current
callbacks, focus ownership and history bursts across engine changes. Blur,
disable and layout cleanup finish the originating history entry before passive
engine snapshots so a held arrow cannot lose its undo record. The new
shortcut modules keep the same synchronous engine APIs.

Auto Enhance and Smart Crop load their planners only on an explicit action.
The outpaint direction helper imports the small shared subject-bounds routine,
so it does not accidentally retain the entire crop solver. `image-action-loading`
blocks real requests, checks local loading/error recovery and duplicate-click
history, and rejects results after document/engine/crop changes. Selecting a
different image alone retains the click-time enhancement target. Public planner
exports remain synchronous, and applying a successful edit still belongs to the
engine's existing history operation. Compare clean bundle reports for the net
result, including shared static imports; the size of a newly named chunk alone
does not establish a smaller editor download.

The browser fixture binds its actual HTTP listener before configuring Vite
middleware and its private MCP origin. It never releases a reservation and then
polls an unbound port. `editor-fixture-startup` checks concurrent port ownership,
Origin rejection, isolated real-browser documents and listener cleanup. These
startup checks do not replace any editor behavior or pixel assertion.
Release verification keeps build, lint, unit tests and the startup-isolation
gate sequential, then runs the remaining browser suites with at most three
isolated processes. It preserves every command, complete per-suite logs and
ordered results, stops scheduling after failure and waits for in-flight cleanup.
Only an unchanged clean commit can produce a report marked complete.

The next maintenance batch separates optional raster action implementations
from the always-mounted Hook. Matting, selection repair, repaint, outpaint and
image processing load at the action boundary; the Hook itself stays synchronous.
`raster-loading` checks actual network requests, click-time targets, cancellation,
single stroke consumption and bitmap/undo behavior. A physical ONNX model run
is not part of that loading-contract test.

Generated-output actions must also reach the application's real persistence
sink. A successful CPU/provider result alone is insufficient: a separate
candidate must load its new bitmap, leave the source intact and survive project
save/reopen. Candidate creation belongs to the existing page workflow; it does
not add a second generation menu or replace the source image silently.
The default free-canvas root must expose those actions too: the
`root-contextual-toolbar` gate starts with the actual New action and checks
one selection bar, pointer access, object/camera anchoring and empty-selection
cleanup. The final raster UI check keeps that root and a real containing Frame;
an artificially bounded document is insufficient coverage for this entry point.
`frame-child-pointer` additionally exercises multiple real children inside a
Frame. A successful click on an unparented image does not establish that Frame
children can be selected and moved independently of Group promotion.
Moving an explicitly selected ordinary Group retains its complete move unit;
drag auto-parenting processes the unit's roots rather than detaching each child.
The same pointer gate covers overlapping Frame hierarchies, Group movement
between Frames, independent child drops and one-step hierarchy undo.
Agent geometry mutations compute one document transaction: Boolean translation
and scaling retain operand geometry, Frames use the inspector's constraint
path, and Group and external clipping followers move before the final history commit.
Moving a locked unit is rejected before any resize, without changing the document
or history; a pure Frame resize retains the inspector's locked-child pin policy. `boolean-resize`
checks complete pre/post node snapshots and one-step undo/redo through real MCP,
including unchanged width/rotation fields accompanying a move.
The real-touch portion of `editor-refactor` additionally checks pinch takeover
of an active drag. Internal pointer completion retains the pinch's own state
while ordinary cancellation still clears it; the engine's existing completion
policy records the pre-pinch drag once, which remains undoable.

Destructive Boolean and stroke expansion have a synchronous public mutation
contract. Their geometric implementation is split into focused modules while
remaining synchronously available; moving it behind a Promise would change
existing callers and history semantics. Do not report a lazy-loading benefit
for that structural change. The `destructive-boolean` browser suite checks
actual content pixels, stable layer IDs, result selection and source history.

`hook-lifecycle` checks React engine activation, overlay commits, page readiness,
draft/locale behavior, actual image loading and the independent CanvasKit canvas.
The source-comment policy test prevents reintroducing explicit dependency-rule
suppressions; it does not pretend the undeclared react-hooks plugin is installed.

## Snapping coverage

The legacy `tests/unit/snapping_e2e.test.js` filename denotes unit tests. Its grid,
pixel and option coverage is now mandatory and split into files under 400 lines.
The previous runtime probe incorrectly skipped five implemented isometric cases
because its point was outside the acquisition tolerance. Removing that gate
also removes pass-without-assertion fallbacks. Nearest isometric vertices are
checked against independent lattice enumeration, including adjacent staggered
rows and negative coordinates. `editor-snapping` separately uses real pointer
gestures, document pixel exports and undo/redo at different zoom levels.

## GPU spatial-filter correctness

`tests/e2e/gl-spatial-parity.e2e.mjs` replaces the three Node-only placeholder
skips with real WebGL2 shader execution and readback. Its 54 parameter pairs
cover high-pass, clarity and motion blur with opaque/mixed-alpha images, small
and large radii, preview scaling, live stacks and positive/negative angles.
Raw and visible RGBA retain the original per-channel tolerance of 3; the local
ANGLE SwiftShader run measured a maximum difference of 1 and verifies resource
release. CPU/GPU direction precision and radius bounds are now shared. This is
correctness evidence for that software renderer, not a physical-GPU FPS result
or a guarantee for every driver.

## Next performance work — 2026-11-01

This is an audit/backlog, not another optimization release. Source reviewed:
`df5bdb88932395a98c9445fb8513ede708252002`; the identified hot-path files
are unchanged from `cf9e00d`. `native_studio` is excluded. Existing passes
remain bound to their original revisions; no new browser FPS or Electron
acceptance is claimed here.

Evidence is separated deliberately:

- Historical browser production profile on the unchanged `test.fig`: a 975ms
  zoom window includes about 75ms in the layer controller, 145ms in layer-pass
  drawing, 103ms in React work and 44ms in GC. Inclusive stacks overlap and
  must not be added. Idle/program samples are not assigned to those functions.
  The recorded pan waits have median 171.5ms; six zoom waits have median 82.5ms,
  with a 248ms first event. These include automation/two rAFs, not GPU FPS.
- Current-source Node probes use the previously decoded private file snapshot:
  five pages have 17,499 / 11,051 / 5,478 / 6,024 / 16,370 nodes, 56,422 total.
  They do not reload original images or establish browser frame-time savings.
- Private scripts, raw samples and CPU stack summary are stored under the
  visualization artifact `performance-follow-up/`, not committed design data.

| Order | Area / capability | Evidence and next action |
| --- | --- | --- |
| P0 | Layer model: `layers.nesting`, `canvas.performance` | `useEditorLayersController` calls `buildEditorLayerTree` on every render. The tree builds multiple whole-document maps; `buildVisibleTreeItems` separately builds row descriptors. DOM virtualization already exists, but does not avoid this model work. Cache immutable topology, then visible/search rows by their real dependencies; keep selection/hover/opacity controls separate. |
| P0 | Durable save: `documents.autosave` | `createEditorDraftSaver.save` serializes an entire page for its signature; `hasChangedDocument` serializes it again after completion. The 17,499-node page produces 43,344,368 JSON bytes; current Node serialize+stringify median is 195ms (five samples, max 337ms). Use acknowledged document/region/pixel revisions and shared serialized snapshots, retaining flush, error and close guarantees. No browser autosave trace has yet attributed a stall to this path. |
| P0 | History asset pins: `documents.undo-redo` | History already shares immutable document references; do not replace it blindly. `refreshBitmapCachePins` scans every historical node array on each `setDoc`, even with only 154 unique image IDs. Actual-node synthetic contexts measure about 5ms for one entry versus 163ms for 50. Cache asset sets by immutable node arrays and update reference counts as entries change/drop. This is a Node stress case, not recorded user history. |
| P1 | Precise drawing: `canvas.zoom-preview`, `compositing.artwork-parity` | The spatial index is non-enumerable. `layerPassDocument` spreads the document and loses it; `renderEngineLayerPass` does not explicitly supply it to `draw`. A real-node probe confirms original index present/pass index absent. Reuse the existing index safely before considering Frame/tile caches and cancellable refinement. |
| P1 | Import: `documents.import-export`, `vectors.native-fig-properties` | Ordinary file opening supplies no `onChunk`, while the worker always emits every node chunk; COMPLETE later sends the whole mapped scene. These are separate structured clones, though aliases inside a single COMPLETE message share identity and must not be double-counted. Negotiate chunk delivery only for a real consumer. Then prioritize first-page mapping/visible assets and bounded batched persistence. Keep full import, CRC verification, cancellation, errors and export completeness. |
| P2 | Bitmap/texture pressure: `images`, `compositing` | A 256MiB decoded bitmap budget, LRU and mipmaps already exist. Pinned current/history keys can intentionally prevent eviction, and the budget is per cache; it is not a whole-application memory cap. Separate durable/history asset retention from reclaimable decoded/GPU copies and measure a shared budget. The historical main JS heap is about 365MiB, excluding worker/bitmap/GPU memory; this is not a leak finding. |

### Node probe details and limits

One-page layer model rebuild: median 29.8ms across nine warmed samples.
The all-five-root stress context builds 56,423 items in 43.0ms; a no-match
search takes 189.1ms. The historical browser did not record all panel props,
so this all-page context is not claimed as its exact UI state. Search can
revisit descendants through multiple ancestor checks; memoize subtree matches
per query/locale and retain the existing collapsed/clip/instance semantics.

Two hypothetical 1440x1000 world-space viewports at 100% return exactly the
same candidate sets with the linear and indexed queries (4,977 / 5,094 IDs,
including non-cullable nodes). Linear medians are 7.89 / 7.47ms; indexed
medians 0.206 / 0.221ms. Index construction costs 75ms, so reuse/incremental
updates matter. This is query-only, not a measured total-painter speedup,
and two equal sets do not certify every mask/effect/clip arrangement.

The historical import becomes interactive in about 12s and records a 1.29s
long task. Kiwi decoding already runs in a worker; the audit does not assign
that task to a particular phase. Instrument message receipt, asset persistence,
scene publication, first paint and sidebar build before promising a loading
speedup. Image extraction currently awaits each asset's persistence ACK; any
pipeline must keep byte bounds and backpressure rather than launch unbounded
work. Current node mapping builds each full page before emitting its chunks.

### Next acceptance sequence

1. Implement layer topology/search memoization and subscriber-aware import
   chunks first; they remove identified repeated work with limited surface area.
2. Isolate durable revision/serialization and history asset-set caching changes;
   verify last-edit close, delayed/failed saves, redo branches and bitmap recovery.
3. Exercise precise painting/index reuse at overview, 25%, 100%, 200% and DPR2,
   including rapid reversals, long pans, negative coordinates, masks and effects.
4. Keep actual input-to-present traces separate from script waits, Node probes,
   retained memory and cold load. Repeat warm/cold and reverse-order controls;
   preserve exact pixels, selection and one-step history before declaring gains.

At the audited revision, all rows above were **unimplemented / browser performance unverified**.
The source-bound implementation below supersedes only its explicitly listed work.
No Figma parity, 60FPS, total-memory reduction or installer certification follows
from these CPU probes. Extend the maintained audit with measured changes rather
than turning these hypotheses into passed acceptance rows.

## Layer models and subscribed import — implementation

Scope: `layers.model-cache`, `vectors.import-subscriptions`. The first batch
removes repeated layer-model work and unconsumed worker chunks; autosave,
history pin scanning, precise-pass index reuse and global bitmap budgets remain
separate pending work. No controls, dependencies or file format are added.

- Immutable node arrays share topology through a WeakMap. Each mounted panel
  retains one tree model. Selection and live page metadata are refreshed
  independently; cache keys include node identity, page structure, disclosure,
  query, labels and deferred translation values. Default/fallback page semantics
  remain unchanged. Stable external-master resolvers bypass cached instance
  searches so master updates cannot leave stale search results.
- Search evaluates labels once and propagates positive matches toward ancestors,
  covering child and clipping edges without path-dependent cycle misses. Inactive
  pages retain their legacy detached/cyclic recovery; unmatched nodes skip the
  needless ancestor sweep. This is not a flattened or truncated layer tree.
- The client negotiates `emitChunks` from the actual `onChunk` function. Without
  a consumer the worker omits node chunk messages but retains progress, page
  headers, asset ACK/backpressure and COMPLETE. Direct legacy worker callers
  without the option keep streaming. Complete-message aliases are not counted
  as duplicate clones. ZIP validation and complete scene mapping remain intact.
- Red evidence: unchanged node arrays create new topology; a 120-deep matching
  search repeatedly reads names; unsubscribed worker imports still emit chunks.
  `/tmp/voo-layer-import-red.log` retains five failures and two legacy passes.
- Initial real-panel regression exposes selection-only page metadata as an
  invalid cache dependency (two rebuilds). The cache now separates selected IDs
  and ignores ineffective root disclosure while refreshing live page descriptors.
  Original failure and diagnostic logs remain retained; the zero-rebuild
  assertion is not weakened. Actual selection, scrolling, reorder/undo, rename,
  search and variable-height rows pass in the updated browser case.
- The real Figma picker case verifies ordinary imports emit zero node chunks;
  a subscribed client still receives all ordered chunks and the complete scene.
  Existing crop/cover/rotation/overflow/mask pixels, variables, constraints,
  undo/redo and cold portable reopening retain their original assertions.

Fixed `ac9f18e635286848c08a0271cb25bca21e03ee94` completes a fresh
105/105 release steps: 101 core browser suites, 4,752 unit passes/four skips,
build/design/module checks; eleven additional checks remain not-run.
`voo-layer-import-release.json` binds every result to that clean revision.

Same-file production control `84130c8` versus `ac9f18e`, M4 Pro/Chromium 156,
1440x1000/DPR1: eight real layer-label clicks have median waits 113.5→56.5ms.
The panel renders 16 times in each run; the new tree builds zero times during
those selections. Twelve pan moves measure 157→150ms and six Ctrl-wheel
steps 84→66ms. Interactive loading is 10.133→9.657s; do not call this a large
cold-load gain. Initial one-minute host loads are 7.76/7.26. These are shared
host/automation plus two-rAF waits, not GPU FPS or universal speedups.

Unconsumed node messages fall from 72 (56,422 nodes) to zero. Both results
retain 56,422 mapped layers and 478 assets/247,642,346 transferred asset bytes.
The original file hash remains `ddf80a00291c5c79ebc30c9b71c7c4180a74ca80311a170ed16f2aeed006b2c2`.
Stable isolated 1000x800/zoom .024 artwork has zero pixel/channel differences;
real selection/camera operations retain document identity and no page errors.

Node probes retain equal row/item signatures for empty/matching/missing
queries. Missing search is 199→51ms and a warm selection-model hit about .012ms.
The uncached empty rebuild sample is 54→71ms, so no generic first-build gain
is claimed; raw samples remain retained. These CPU probes are not UI latency.

The fixed candidate is deployed and production-generated native Figma pixels,
mask/variable/constraint/history checks, both worker subscription modes, actual
selection with zero model builds, and zoom/exact-readback/undo pass. Eight
entry/critical assets match the verified build. Direct main push was rejected
by newly required PR/build rules; deployment had started before its result
was confirmed. Preserve that ordering and finish required CI/PR synchronization;
source/main and final deployment receipts are recorded independently.
Private `layer-import-optimization/` retains gate, benchmark, production and
GitHub evidence. `native_studio`, signed installers, physical input, all fonts/
pages/effects and Figma parity remain outside this acceptance.
