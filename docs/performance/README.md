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
