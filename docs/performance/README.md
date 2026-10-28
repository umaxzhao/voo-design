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
Other oversized editor modules and remaining hook suppressions still need
separate behavior-preserving maintenance.

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
