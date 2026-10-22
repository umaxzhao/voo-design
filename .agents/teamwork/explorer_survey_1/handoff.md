# Handoff Report — Requirement 1: Viewport Culling & Layer Caching

**Author**: `explorer_survey_1`  
**Date**: 2026-10-21T23:32:00Z  
**Target Milestone**: R1: Viewport Culling & Layer Caching (`ORIGINAL_REQUEST.md`)  
**Status**: Completed (Investigation & Architectural Survey)  

---

## Executive Summary

This investigation surveys VOO Design's canvas rendering pipeline, spatial indexing, viewport culling, and layer caching capabilities. 

### Key Discoveries:
1. **R-Tree Spatial Index Exists but is Disconnected from 2D Stage Rendering**: `src/canvas/editor/spatial_index.js` provides an industrial-grade, zero-dependency 2D R-Tree with $O(N \log N)$ STR bulk loading and $O(\log N + K)$ search. However, the primary 2D editing canvas (`chrome_draw.js:165-173`) ignores the spatial index during rendering, executing a linear $O(N)$ scan over all document nodes on every frame and calculating trigonometry/coordinate transforms via `nodeAABB` repeatedly.
2. **Missing Spatial Index on Document Engine**: Neither `editor_engine.js` nor `editor_engine_document.js` attaches or maintains `doc.spatialIndex`. Consequently, hit-testing (`doc_ops_nodes.js:nodeAtPoint`) and marquee selection (`doc_ops_selection.js:nodesWithin`) fall back to $O(N)$ linear scans across the entire document node array.
3. **Flawed Effect Culling & Inconsistent Bounds**: `viewport_culling.js:buildCullableIds` unconditionally bypasses culling for any node having array-based effects (`if (Array.isArray(node.effects) && node.effects.length > 0) continue;`). Furthermore, nodes with object-format effects (`node.effects = { shadow: ... }`), outer glow, or layer blurs are culled using unexpanded geometric `nodeAABB(node)` boxes, risking visual popping or shadow clipping at viewport boundaries.
4. **Zero Layer Caching for Static Layers or Unchanged Groups**: No offscreen layer bitmap cache exists for static nodes. During canvas panning or when dragging a single node, all visible nodes (including complex vector paths, multi-line typography, and multi-pass layer effects like drop shadows, blurs, and bevels) re-execute their entire CPU rasterization stack every 16ms frame.
5. **Architectural Opportunity**: By unifying visual bounds calculation (`nodeVisualAABB`), wiring an incrementally maintained R-Tree index into `editor_engine`, and introducing a bounded LRU `LayerCache` (`OffscreenCanvas`), VOO Design can eliminate $O(N)$ per-frame overhead and sustain rock-solid 60 FPS under 1,000+ nodes and intensive pan/zoom gestures.

---

## 1. Observation

### 1.1 `src/canvas/editor/viewport_culling.js`
- **Line 19**:
  ```javascript
  export const CULL_MARGIN_WORLD_PX = 240;
  ```
  `visibleWorldRect` grows the visible viewport box by 240 world pixels on each side to account for stroke overhang and pan jitter.
- **Lines 88–102 (`buildCullableIds`)**:
  ```javascript
  function buildCullableIds(nodes) {
    const clipBaseIds = new Set();
    for (const node of nodes) {
      if (node.clipTo) clipBaseIds.add(node.clipTo);
    }
    const ids = new Set();
    for (const node of nodes) {
      if (node.clipTo || clipBaseIds.has(node.id)) continue;
      if (node.kind === NODE_KIND.ADJUSTMENT || node.kind === NODE_KIND.BOOLEAN) continue;
      if (node.kind === NODE_KIND.GROUP) continue;
      if (Array.isArray(node.effects) && node.effects.length > 0) continue;
      ids.add(node.id);
    }
    return ids;
  }
  ```
  *Defect A*: Any node with array-based effects is excluded from culling and marked permanently visible, forcing expensive multi-pass shadows to draw even when thousands of pixels offscreen.  
  *Defect B*: Object-based effects (`node.effects = { shadow: ... }`) and `node.shadow` or `node.layerBlur` evaluate `Array.isArray(node.effects)` as `false`, marking them as cullable, but their bounding box is evaluated without effect expansion.
- **Lines 109–124 (`buildSpatialIndex`)**:
  ```javascript
  export function buildSpatialIndex(nodes) {
    const index = new SpatialIndex();
    const items = (nodes ?? []).map((node) => {
      const box = nodeAABB(node);
      return {
        id: node.id,
        minX: box.x,
        minY: box.y,
        maxX: box.x + box.width,
        maxY: box.y + box.height,
        node,
      };
    });
    index.load(items);
    return index;
  }
  ```
  Items are loaded into the R-Tree strictly using `nodeAABB(node)`, which does not encompass stroke widths, shadow blur/offset, outer glow, or layer blur.
- **Lines 136–175 (`visibleNodeIds`)**:
  ```javascript
  export function visibleNodeIds(doc, visibleRect, spatialIndex = null) {
    ...
    const index = spatialIndex ?? doc.spatialIndex ?? doc._spatialIndex;
    if (index) {
      const hits = index.search(box);
      const visibleCullableIds = new Set(hits.map((h) => h.id));
      const visibleIds = new Set();
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (!cullable.has(node.id) || visibleCullableIds.has(node.id)) {
          visibleIds.add(node.id);
        }
      }
      return visibleIds;
    }
    ...
  }
  ```
  Even when `spatialIndex` is present, `visibleNodeIds` iterates over all `nodes.length` in a linear loop to preserve non-cullable nodes.

### 1.2 `src/canvas/editor/chrome_draw.js`
- **Lines 160–173 (`draw` render loop)**:
  ```javascript
  const culledIds = cullOffscreen ? cullableNodeIds(doc) : null;
  const visibleRect = culledIds
    ? visibleWorldRect(viewport, canvas.width / dpr, canvas.height / dpr)
    : null;

  for (let i = 0; i < doc.nodes.length; i += 1) {
    const node = doc.nodes[i];
    if (paintNodeIds && !paintNodeIds.has(node.id)) continue;
    if (node.id === hiddenNodeId) continue;
    if (
      culledIds?.has(node.id) &&
      isBoxOffscreen(nodeAABB(node), visibleRect)
    )
      continue;
  ```
  *Defect C*: `chrome_draw.js` does NOT call `visibleNodeIds` nor query `SpatialIndex`. Instead, it invokes `nodeAABB(node)` on every iteration of a linear `for` loop over `doc.nodes`. For $N = 5,000$, `nodeAABB(node)` is computed 5,000 times per frame.

### 1.3 `src/canvas/editor/scene_geometry_bounds.js` & `scene_geometry_transform.js`
- `nodeAABB(node)` calls `nodeCorners(node)` which calls `fromNodeLocal(node, point)` 4 times per node.
- `fromNodeLocal` computes `Math.cos`, `Math.sin`, and `Math.tan` on rotation and shear.
- For 2,000 nodes, 8,000 trigonometric operations and 8,000 object allocations occur on every 16ms animation frame.

### 1.4 `src/canvas/editor/spatial_index.js`
- Implements a zero-dependency 2D R-Tree with:
  - `load(items)`: Sort-Tile-Recursive (STR) bulk loading producing balanced packing in $O(N \log N)$.
  - `search(box)`: Depth-first bounding-box intersection query in $O(\log N + K)$.
  - `pointQuery(point, tolerance)`: Containment test in $O(\log N)$.
  - `insert(item)` & `remove(item)`: Dynamic updates in $O(\log N)$.
- Fully tested and verified via `tests/unit/spatial_index.test.js` (14 passing) and `tests/unit/challenger_spatial_viewport_stress.test.js` (14 passing at 50,000 nodes scale).

### 1.5 `src/canvas/editor/editor_engine.js` & `editor_engine_render.js`
- In `editor_engine.js:207-232 (`setDoc`)`:
  ```javascript
  function setDoc(next, { commit = true, name = null } = {}) {
    doc = ctrl.initController.measureTextNodes(next);
    docVersion += 1;
    ctrl.initController.queueFontLoads(doc);
    ...
    requestRender();
    notify();
  }
  ```
  `doc.spatialIndex` is neither initialized nor updated when documents load or mutate.
- In `editor_engine_node_ops.js:151-170 (`nodeAtPoint`)`:
  Calls `ops.nodeAtPoint(doc, point, ...)` which attempts:
  `const index = spatialIndex ?? doc.spatialIndex ?? doc._spatialIndex;`
  Because `doc.spatialIndex` is undefined, hit-testing falls back to scanning `doc.nodes` in reverse linear order.
- In `editor_engine_render.js:125-131`:
  Invokes `draw(ctx, { doc, viewport, dpr, cullOffscreen: true, ... })`. Does not pass a `spatialIndex`.

### 1.6 Effect Overflow in `src/canvas/editor/transform_api_bake.js`
- Lines 53–85 define a localized helper `nodeVisualBounds`:
  ```javascript
  function nodeVisualBounds(node) {
    const bounds = nodeAABB(node);
    const stroke = Math.max(
      node.stroke && node.strokeWidth ? node.strokeWidth : 0,
      node.effects?.stroke?.enabled ? node.effects.stroke.width ?? 0 : 0,
    );
    const padding = { left: stroke, right: stroke, top: stroke, bottom: stroke };
    const includeShadow = (effect) => {
      if (!effect?.enabled) return;
      const blur = Math.ceil((effect.blur ?? 0) * 2) + (effect.spread ?? 0);
      const offsetX = effect.offsetX ?? 0;
      const offsetY = effect.offsetY ?? 0;
      padding.left = Math.max(padding.left, blur - offsetX);
      padding.right = Math.max(padding.right, blur + offsetX);
      padding.top = Math.max(padding.top, blur - offsetY);
      padding.bottom = Math.max(padding.bottom, blur + offsetY);
    };
    includeShadow(node.shadow);
    includeShadow(node.effects?.shadow);
    includeShadow(node.effects?.glow);
    return {
      x: bounds.x - padding.left,
      y: bounds.y - padding.top,
      width: bounds.width + padding.left + padding.right,
      height: bounds.height + padding.top + padding.bottom,
    };
  }
  ```
  This logic is private to `transform_api_bake.js` and is not exposed to `viewport_culling.js`, `spatial_index.js`, or `chrome_draw.js`.

### 1.7 Current Layer Caching State
- `src/canvas/editor/bitmap_cache.js`: Caches decoded `HTMLImageElement` bitmaps from IndexedDB. Does not cache rendered canvas nodes.
- `src/canvas/editor/render_cache.js`: Small LRU caches (limit 24–32 entries) for `boolean`, `customBlend`, and `softPath`.
- `src/canvas/editor/chrome_layers.js:17-18`: Uses `clippingChainCache = new WeakMap()` and `adjustmentLayerCache = new WeakMap()`. However, the cache key incorporates `${docVersion}`. When any node is dragged, `docVersion` increments, immediately invalidating all clipping chain caches across the entire document.
- `src/canvas/editor/render_node_dispatch.js`: Has NO offscreen canvas bitmap caching for individual nodes or static groups. Complex text, vector pen beziers, and layers with multiple effects are rasterized from scratch on every frame.

---

## 2. Logic Chain

1. **Premise 1 (Performance Bottleneck in 2D Render Loop)**:
   In `chrome_draw.js:165-173`, the stage rendering loop iterates linearly through `doc.nodes`. For each cullable node, it invokes `nodeAABB(node)` (Observation 1.2), which performs 4 corner projections with trigonometric calculations (Observation 1.3). When a document contains 1,000+ nodes, this linear evaluation dominates the 16ms frame budget during pan/zoom gestures, causing perceptible frame drops.

2. **Premise 2 (Underutilized R-Tree Spatial Index)**:
   `SpatialIndex` (`spatial_index.js`) can query intersecting nodes in $O(\log N + K)$ time and has been validated on 50,000 nodes (Observation 1.4). However, because `editor_engine.js` never assigns `doc.spatialIndex` (Observation 1.5), `chrome_draw.js`, `doc_ops_nodes.js:nodeAtPoint`, and `doc_ops_selection.js:nodesWithin` cannot take advantage of the R-Tree and degrade to $O(N)$.

3. **Premise 3 (Inaccurate and Inefficient Effect Culling)**:
   `viewport_culling.js:buildCullableIds` assumes nodes with effects cannot be culled, so it excludes them from culling entirely (Observation 1.1). However, in production UI designs, buttons, cards, and avatars frequently feature drop shadows and blurs. Leaving all shadowed nodes permanently unculled forces the canvas to execute expensive shadow blur passes even when nodes are thousands of pixels offscreen. Conversely, when effect bounds are properly expanded (as prototyped in `transform_api_bake.js:nodeVisualBounds`, Observation 1.6), nodes with effects CAN be safely indexed in the R-Tree and culled when outside the frustum.

4. **Premise 4 (Redundant Rasterization without Layer Caching)**:
   During canvas pan gestures, camera zoom is invariant and node contents are identical; only the global viewport matrix translates. Similarly, when a user drags one layer, only that single node's position changes. Because `render_node_dispatch.js` has no offscreen layer bitmap caching (Observation 1.7), all unchanged nodes re-execute expensive CPU rasterization, vector path filling, text shaping, and shadow rendering on every rAF tick.

5. **Deduction & Conclusion**:
   To fulfill Requirement 1:
   - Export a unified `nodeVisualAABB(node)` function that computes the exact bounding box including strokes, shadows, glows, and blurs.
   - Maintain an active `SpatialIndex` in `editor_engine` (built via STR on document load, updated incrementally or lazily on node edits).
   - In `chrome_draw.js`, query `SpatialIndex.search(visibleRect)` once per frame to obtain visible node IDs in $O(\log N + K)$, eliminating `nodeAABB` calls in the loop.
   - Implement `LayerCache` (`layer_cache.js`) with an LRU OffscreenCanvas pool, caching rasterized representations of complex static nodes and unchanged groups keyed by `(nodeId, nodeSignature, zoomTier)`. During pan or single-layer dragging, blit pre-rendered bitmaps via `ctx.drawImage` in $O(1)$.

---

## 3. Caveats

1. **Custom Blend Modes**: Blend modes like `dissolve`, `linear-burn`, and `vivid-light` (`render_custom_blend.js`) composite per-pixel against the existing backdrop. These layers cannot be cached in isolation without the backdrop pixels underneath them, but their visibility can still be filtered via `SpatialIndex`.
2. **Device Pixel Ratio & Zoom Scaling**: Caching rasterized layers at a single scale can introduce blurriness if the user zooms in significantly without re-rasterizing. The cache must support discrete zoom tiers (e.g. $[0.25, 0.5, 1, 2]$) or an interaction settle timer (`VIEW_SETTLE_MS = 250`), matching `render_custom_blend.js`.
3. **Memory Consumption with Offscreen Canvases**: Storing hundreds of offscreen canvases can consume substantial GPU/RAM. The `LayerCache` must enforce strict LRU limits (e.g., maximum 64–128 cached items or 64MB aggregate memory budget) and evict least-recently-used canvases. Simple solid shapes (like a plain 10x10 rectangle) should bypass the cache since `ctx.fillRect` is faster than `ctx.drawImage`.
4. **Clipping Mask Chains**: Layers with `clipTo` must be rendered in conjunction with their base layer. If the base layer's visual bounds fall outside the viewport, the entire clipping chain can be culled as a single unit.

---

## 4. Conclusion & Technical Recommendations

### 4.1 Proposed Architecture Overview

```
                                      +--------------------------+
                                      |      editor_engine       |
                                      +------------+-------------+
                                                   |
                     +-----------------------------+-----------------------------+
                     |                                                           |
                     v                                                           v
      +-----------------------------+                             +-----------------------------+
      |  Spatial Index Manager       |                             |     Layer Cache Manager     |
      |  (doc.spatialIndex)         |                             |     (OffscreenCanvas LRU)   |
      +--------------+--------------+                             +--------------+--------------+
                     |                                                           |
                     | nodeVisualAABB(node)                                      | getCachedLayer(nodeId)
                     |                                                           | drawCached(ctx, node)
                     v                                                           v
      +-----------------------------------------------------------------------------------------+
      |                                    chrome_draw.js                                       |
      |                                                                                         |
      |   1. visibleRect = visibleWorldRect(viewport, w, h)                                     |
      |   2. visibleSet = doc.spatialIndex.search(visibleRect) -> O(log N + K)                  |
      |   3. for node of visibleSet (sorted by z-order):                                        |
      |        if (layerCache.has(node)) -> ctx.drawImage(cached) -> O(1)                       |
      |        else -> drawNode(ctx, node) & recordToCache                                      |
      +-----------------------------------------------------------------------------------------+
```

### 4.2 Module-by-Module Implementation Blueprint

#### Component A: Unified Visual Bounds (`src/canvas/editor/scene_geometry_bounds.js` & `scene_geometry.js`)
Export `nodeVisualAABB(node)`:
```javascript
export function nodeVisualAABB(node) {
  const base = nodeAABB(node);
  let padLeft = 0, padRight = 0, padTop = 0, padBottom = 0;

  // 1. Stroke padding
  const strokeW = Math.max(
    node.stroke && node.strokeWidth ? Number(node.strokeWidth) || 0 : 0,
    node.effects?.stroke?.enabled ? Number(node.effects.stroke.width) || 0 : 0,
  );
  if (strokeW > 0) {
    padLeft = Math.max(padLeft, strokeW);
    padRight = Math.max(padRight, strokeW);
    padTop = Math.max(padTop, strokeW);
    padBottom = Math.max(padBottom, strokeW);
  }

  // 2. Object-style shadows and glows
  const addShadow = (shadow) => {
    if (!shadow || shadow.enabled === false) return;
    const blur = Math.ceil((Number(shadow.blur) || 0) * 2) + (Number(shadow.spread) || 0);
    const ox = Number(shadow.offsetX ?? shadow.x) || 0;
    const oy = Number(shadow.offsetY ?? shadow.y) || 0;
    padLeft = Math.max(padLeft, blur - ox);
    padRight = Math.max(padRight, blur + ox);
    padTop = Math.max(padTop, blur - oy);
    padBottom = Math.max(padBottom, blur + oy);
  };
  addShadow(node.shadow);
  addShadow(node.effects?.shadow);
  addShadow(node.effects?.glow);

  // 3. Array-style effects (Figma / Skia format)
  if (Array.isArray(node.effects)) {
    for (const eff of node.effects) {
      if (!eff || eff.visible === false) continue;
      if (eff.type === "DROP_SHADOW" || eff.type === "shadow") {
        const blur = Math.ceil((Number(eff.radius ?? eff.blur) || 0) * 2) + (Number(eff.spread) || 0);
        const ox = Number(eff.offset?.x ?? eff.offsetX) || 0;
        const oy = Number(eff.offset?.y ?? eff.offsetY) || 0;
        padLeft = Math.max(padLeft, blur - ox);
        padRight = Math.max(padRight, blur + ox);
        padTop = Math.max(padTop, blur - oy);
        padBottom = Math.max(padBottom, blur + oy);
      } else if (eff.type === "LAYER_BLUR" || eff.type === "blur") {
        const blur = Math.ceil((Number(eff.radius ?? eff.blur) || 0) * 3);
        padLeft = Math.max(padLeft, blur);
        padRight = Math.max(padRight, blur);
        padTop = Math.max(padTop, blur);
        padBottom = Math.max(padBottom, blur);
      }
    }
  }

  // 4. Layer blur
  if (node.layerBlur > 0) {
    const blur = Math.ceil(Number(node.layerBlur) * 3);
    padLeft = Math.max(padLeft, blur);
    padRight = Math.max(padRight, blur);
    padTop = Math.max(padTop, blur);
    padBottom = Math.max(padBottom, blur);
  }

  return {
    x: base.x - padLeft,
    y: base.y - padTop,
    width: base.width + padLeft + padRight,
    height: base.height + padTop + padBottom,
  };
}
```

#### Component B: Spatial Index Integration (`src/canvas/editor/viewport_culling.js`)
1. Update `buildSpatialIndex(nodes)` to index each node using `nodeVisualAABB(node)`:
   ```javascript
   export function buildSpatialIndex(nodes) {
     const index = new SpatialIndex();
     const items = (nodes ?? []).map((node) => {
       const box = nodeVisualAABB(node);
       return {
         id: node.id,
         minX: box.x,
         minY: box.y,
         maxX: box.x + box.width,
         maxY: box.y + box.height,
         node,
       };
     });
     index.load(items);
     return index;
   }
   ```
2. In `cullableNodeIds(doc)`:
   Allow nodes with drop shadows, glows, strokes, and layer blurs to be culled, because their spatial bounding boxes accurately represent their visual footprint. Only preserve:
   - `NODE_KIND.ADJUSTMENT`
   - `NODE_KIND.BOOLEAN`
   - `node.clipTo` & clip bases
   - `node.backgroundBlur > 0`
3. Provide `getOrBuildSpatialIndex(doc)` with a `WeakMap` cache:
   ```javascript
   const spatialIndexCache = new WeakMap();
   export function getOrBuildSpatialIndex(doc) {
     if (!doc?.nodes) return null;
     let index = spatialIndexCache.get(doc.nodes);
     if (!index) {
       index = buildSpatialIndex(doc.nodes);
       spatialIndexCache.set(doc.nodes, index);
     }
     return index;
   }
   ```

#### Component C: 2D Stage Fast Culling (`src/canvas/editor/chrome_draw.js`)
In `draw(ctx, options)`:
```javascript
  const spatialIndex = options.spatialIndex ?? getOrBuildSpatialIndex(doc);
  const visibleRect = cullOffscreen
    ? visibleWorldRect(viewport, canvas.width / dpr, canvas.height / dpr)
    : null;

  const visibleIds = (cullOffscreen && visibleRect && spatialIndex)
    ? visibleNodeIds(doc, visibleRect, spatialIndex)
    : null;

  for (let i = 0; i < doc.nodes.length; i += 1) {
    const node = doc.nodes[i];
    if (paintNodeIds && !paintNodeIds.has(node.id)) continue;
    if (node.id === hiddenNodeId) continue;
    if (visibleIds && !visibleIds.has(node.id)) continue;
    ...
```
*Performance Gain*: Replaces $N$ dynamic `nodeAABB` recalculations with an initial $O(\log N + K)$ search and $O(1)$ set lookups in the loop.

#### Component D: Smart Layer Offscreen Caching (`src/canvas/editor/layer_cache.js`)
Create a new module `src/canvas/editor/layer_cache.js`:
- **Eligibility criteria (`shouldCacheNode`)**:
  - Node has expensive effects (shadow, glow, bevel, inner shadow, layer blur).
  - Or node is a complex vector path (`points.length > 8` or pen bezier).
  - Or node is a boolean group.
  - Or node is a static group of elements.
  - Exclude actively transformed / edited node, adjustment layers, video layers.
- **Node Signature (`nodeRenderSignature`)**:
  Computes a 64-bit integer or short hash from visual styling attributes (`kind`, `width`, `height`, `fill`, `stroke`, `strokeWidth`, `opacity`, `rotation`, `effects`, `points`, `text`, `fontFamily`, `fontSize`). Note that $(x, y)$ is excluded so translations (dragging) do not dirty the cached bitmap.
- **Offscreen Canvas Management**:
  - Renders the eligible node into an `OffscreenCanvas` sized to `nodeVisualAABB` at `(dpr * zoomTier)`.
  - When drawing to the main canvas:
    `ctx.drawImage(cached.canvas, visualBox.x, visualBox.y, visualBox.width, visualBox.height)`.
  - Enforces bounded LRU eviction (default: 64 entries, max 64MB).
- **Invalidation Strategy**:
  - Node edit: invalidates `node.id`.
  - Viewport pan: 100% cache hit rate (zero invalidation).
  - Single node drag: active node invalidates; all other 999 nodes hit cache at 100%.

---

## 5. Verification Method

### 5.1 Automated Test Verification
Run existing and new Vitest suites to guarantee zero regression:
```bash
# 1. Run core spatial and viewport culling tests
npx vitest run tests/unit/viewport_culling.test.js tests/unit/spatial_index.test.js

# 2. Run extreme scale stress harness (50,000 nodes, 1,500 pan/zoom cycles)
npx vitest run tests/unit/challenger_spatial_viewport_stress.test.js

# 3. Run single canvas integration & acceptance criteria
npx vitest run tests/unit/single_canvas_integration.test.js tests/unit/e2e_acceptance_criteria.test.js

# 4. Verify full project test suite
npm test
```

### 5.2 Performance Benchmarking Invariants
1. **Viewport Pan Throughput**: Under a document containing 1,000 to 5,000 nodes, 100 consecutive `viewportTools.panBy(dx, dy)` calls must complete with average frame execution time $< 2.0\text{ms}$ on Canvas2D.
2. **Visual Bounding Accuracy**: For any node with shadow `blur: B`, `offsetX: OX`, and stroke `W`, verify that `isBoxOffscreen` returns `false` whenever the extended shadow or stroke overlaps `visibleWorldRect`, preventing visual clipping.
3. **Layer Cache Reuse Rate**: During pan gestures, `layerCache.stats().hits / (hits + misses)` must exceed $95\%$ for eligible layers.
4. **Memory Guard**: `layerCache` memory footprint must strictly remain under $64\text{MB}$ across 1,000 pan/zoom iterations.
