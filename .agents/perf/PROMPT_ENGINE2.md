# Finish engine perf wiring (partial work already done)

Working directory: `/workspace/wt-perf`.

## Already present (do not rewrite from scratch — extend)
- `src/canvas/editor/dirty_rect.js` — complete helpers
- `src/canvas/editor/image_mipmaps.js` — getMipLevel, createMipCache, getMip
- `src/canvas/editor/editor_pointer_hit_test.js` — spatial `imageAt` (pointQuery path) already patched

## Still needed
1. Unit tests:
   - `tests/unit/dirty_rect.test.js`
   - `tests/unit/image_mipmaps.test.js` (use a fake createCanvas that records sizes; or skip canvas draw and only test getMipLevel math)
   - `tests/unit/image_at_spatial.test.js` — build SpatialIndex with image nodes, attach to doc, call createPointerHitTester's imageAt via constructing tester with mock api that has getSpatialIndex + getViewport + toDocPoint + isPaintOpaqueAt

2. Wire mipmaps into `bitmap_cache.js`:
   - Import createMipCache / getMip / invalidate
   - On put/evict/dispose of a bitmap, invalidate its mip
   - Export `getDisplayBitmap(image, scale)` or add method on cache instance that returns mip or original
   - Keep byte budget; do not break existing createBitmapCache API used by tests

3. Optional dirty-rect in `editor_engine_render.js` / `chrome_draw.js`:
   - If `options.dirtyRects` provided and `shouldUseDirtyRect`, clearRect only that device region before draw; otherwise keep full clear. Minimal, safe change.

4. Stage size: in `editor_engine_render.js`, prefer passed stageWidth/Height; never force clientWidth when both provided (already mostly true — verify and add a short comment if needed). Ensure `editor_engine.js` ResizeObserver sets cachedStageWidth/Height — search for cachedStageWidth and complete if incomplete.

Do NOT edit image_editor.jsx, design_store.js, use_skia_page.js.
Do NOT commit.
Run the new unit tests + m4_performance_gate + spatial_index until green.
