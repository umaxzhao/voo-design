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
