# Task: Engine render/hit-test/image cache performance

Working directory: `/workspace/wt-perf` branch `opencode/canvas-perf`.

## Context
Main already has: `updateNodes` + `preview:true` setDoc fast-path, R-tree spatial index, viewport culling, layer_cache. Remaining gaps:
- `imageAt` in `editor_pointer_hit_test.js` still linear-scans all nodes
- Stage size still falls back to `stage.clientWidth/Height` every frame
- No explicit dirty-rect helper for partial stage clears
- Bitmap cache lacks mipmap / downscaled reuse for zoomed-out views
- Ensure culling + spatial index stay hot-path for large docs

## Files you MAY edit
- `src/canvas/editor/editor_pointer_hit_test.js`
- `src/canvas/editor/editor_engine_render.js`
- `src/canvas/editor/editor_engine.js` (ONLY stage-dimension cache / dirty-rect wiring — do not break preview/setDoc)
- `src/canvas/editor/bitmap_cache.js`
- `src/canvas/editor/layer_cache.js` (small improvements only)
- `src/canvas/editor/viewport_culling.js` (only if needed)
- NEW: `src/canvas/editor/dirty_rect.js`, `src/canvas/editor/image_mipmaps.js`
- NEW tests under `tests/unit/`

## Files you MUST NOT edit
- `image_editor.jsx`, `design_store.js`, `use_skia_page.js` (another worker owns these)
- properties panels, electron workspace, vendor/dist

## Required work
1. **Spatial `imageAt`**: use `doc.spatialIndex` / `api.getSpatialIndex?.()` / pointQuery like `nodeAtPoint` in `doc_ops_nodes.js`; fall back to linear scan.
2. **Stage dimension cache**: ensure ResizeObserver (or existing cachedStageWidth/Height in editor_engine.js) is always preferred; avoid reading clientWidth/Height inside `renderEngineStage` when cache is set. Wire observer if missing.
3. **dirty_rect.js**: pure helpers — union rects, intersect viewport, convert world→device; optional use in render path to `clearRect` only dirty region when `draftRender`/preview and a small dirty set is provided. If full integration is risky, export helpers + unit tests and a minimal optional hook in render.
4. **image mipmaps**: helper that, given a decoded bitmap, builds/returns a downscaled canvas/ImageBitmap for zoom < 0.5 (powers of two). Integrate into `bitmap_cache` get path OR provide `getMipLevel(image, scale)` used by renderer if a clear call site exists — keep LRU byte budget. Unit test mipmap sizing.
5. **Tests**: `tests/unit/image_at_spatial.test.js`, `tests/unit/dirty_rect.test.js`, `tests/unit/image_mipmaps.test.js`; keep `m4_performance_gate` and `spatial_index` green.

Run: `npx vitest run tests/unit/image_at_spatial.test.js tests/unit/dirty_rect.test.js tests/unit/image_mipmaps.test.js tests/unit/m4_performance_gate.test.js tests/unit/spatial_index.test.js tests/unit/viewport_culling.test.js`

Do NOT commit. Summarize changes when done.
