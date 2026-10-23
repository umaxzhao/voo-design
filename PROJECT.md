# Project: VOO Design Canvas Engine Full-Stack Performance Architecture Upgrade

## Architecture
VOO Design Canvas Engine delivers an ultra-high performance, 60 FPS vector and raster editing experience across 1,000+ nodes and high-frequency gestures. The performance architecture couples 2D R-Tree spatial indexing, visual-effect-aware viewport culling, offscreen layer caching, rAF gesture scheduling, Local AABB neighborhood snapping queries, byte-budgeted LRU texture caching, and structurally-shared undo/redo history.

```
+-----------------------------------------------------------------------------------------------------------------+
|                                                   VOO DESIGN                                                    |
|                                                                                                                 |
|  [Hardware Pointer Events (500Hz-1000Hz)]                  [Canvas Viewport & Interaction Loop]                 |
|                   │                                                              │                              |
|                   ▼                                                              ▼                              |
|  [rAF Pointer Event Scheduler]                                 [Local AABB Neighborhood Snapping]               |
|   (editor_pointer.js)                                           - Query SpatialIndex in O(log N + K)            |
|   - Non-allocating rAF tick                                     - Bounded candidate box (margin ~1000px)        |
|   - Sync flush on pointerUp                                     - O(K^2) gap discovery vs O(N^2)                |
+-----------------------------------------------------------------------------------------------------------------+
                                         │                                                 │
                                         ▼                                                 ▼
+-----------------------------------------------------------------+    +------------------------------------------+
|                 Viewport Culling & Layer Caching                |    |       Memory, Texture & History Engine   |
|                                                                 |    |                                          |
|  - SpatialIndex (2D R-Tree with STR bulk-load)                  |    |  - Byte-Budgeted LRU Bitmap Cache        |
|  - nodeVisualAABB(node) (strokes, drop shadows, glows, blurs)   |    |    (256 MB maxBytes, evict least used)   |
|  - Frustum culling in chrome_draw.js via O(log N + K) search    |    |  - WebGL Texture Deallocation via onEvict|
|  - OffscreenCanvas LayerCache for static & unchanged nodes      |    |  - Incremental Ref-Counted Image Pinning |
|    (cached bitmap blits in O(1) during pan/drag)                |    |  - Structurally Shared / Diff Undo State |
+-----------------------------------------------------------------+    +------------------------------------------+
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Visual Effect Bounds (`nodeVisualAABB`) | Calculate true visual bounding box including strokes, shadows, glows, blurs, and clip bounds | M1 | Survey R1 |
| 2 | Active Engine Spatial Index Maintenance | Maintain active `SpatialIndex` in `editor_engine` and attach to document for fast query | M1 | Survey R1 |
| 3 | Frustum Culling in `chrome_draw.js` | Query `SpatialIndex.search(visibleRect)` in $O(\log N + K)$ and skip offscreen nodes | M1 | Survey R1 |
| 4 | Culling Effect Bounds Correction | Remove unconditional effect bypass in `viewport_culling.js` and use true visual bounds | M1 | Survey R1 |
| 5 | Offscreen Layer Cache (`layer_cache.js`) | Bounded LRU offscreen canvas cache for complex static nodes and groups, blitting via `drawImage` | M1 | Survey R1 |
| 6 | rAF Pointer Move Throttling | Decouple high-frequency mouse/trackpad events in `editor_pointer.js` via `requestAnimationFrame` | M2 | Survey R2 |
| 7 | Synchronous Flush on `pointerup` | Guarantee pending pointer coordinates are flushed immediately on mouse release | M2 | Survey R2 |
| 8 | Local AABB Neighborhood Snapping | Constrain alignment and guide searches in `scene_snapping.js` to spatial neighborhood box | M2 | Survey R2 |
| 9 | Local Equidistant Gap Pairing | Reduce equidistant gap candidate discovery from $O(N^2)$ to $O(K^2)$ using local sibling box | M2 | Survey R2 |
| 10 | Batch Multi-Node Move Updates | Provide batched update (`api.updateNodes`) in `editor_pointer_move.js` avoiding repeated clone | M2 | Survey R2 |
| 11 | Byte-Budgeted LRU Bitmap Cache | Add byte tracking (`maxBytes: 256MB`) and evict oldest unpinned images in `bitmap_cache.js` | M3 | DONE |
| 12 | WebGL Texture Deallocation Hook | Wire `onEvict` callback in `createBitmapCache` to call `glAdjustments.release` and pyramid cleanup | M3 | DONE |
| 13 | Incremental History Image Pinning | Replace 50-snapshot `JSON.parse` pin refresh with active-document / ref-counted image pinning | M3 | DONE |
| 14 | Structural Sharing in Undo History | Store in-memory document snapshots with structural sharing, eliminating deep JSON stringify overhead | M3 | DONE |
| 15 | Design Token Compliance Fix | Fix 3 `shadow-sm` violations in `src/canvas/components/editor_toolbar.jsx` to use `shadow-pop` | M4 | DONE |
| 16 | Flaky Test Race Condition Fix | Eliminate millisecond timestamp race in `tests/unit/adversarial_welcome_dashboard_challenge.test.js` | M4 | DONE |
| 17 | Specialized Performance Test Suite | Add automated tests for 1,000+ node culling, neighborhood snapping, and LRU eviction | M4 | DONE |
| 18 | Full 60+ Suites Regression Gate | Execute and pass 100% of all unit and integration test suites via `npm test` | M4 | DONE |
| 19 | Production Build Gate | Clean production bundle generation via `npm run build` | M4 | DONE |
| 20 | Server `la` Automated Deployment | Deploy bundle to `la` (`103.114.160.86`) via `scripts/deploy-editor.sh` and verify live HTTP 200 | M4 | BLOCKED (SSH) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Viewport Culling & Layer Caching Engine | Features 1–5: Visual bounds (`nodeVisualAABB`), SpatialIndex integration in `chrome_draw.js`, and `layer_cache.js` | none | DONE |
| M2 | Gesture & Snapping Optimization | Features 6–10: rAF pointer move throttling, Local AABB neighborhood snapping query in `scene_snapping.js`, batch node updates | M1 | DONE |
| M3 | Memory, Texture & Undo/Redo Management | Features 11–14: Byte-budgeted LRU cache, WebGL texture cleanup on eviction, ref-counted pinning, structural sharing undo | M1 | DONE |
| M4 | Verification, Quality Gate & Production Deployment | Features 15–20: Toolbar design token fix, test race fix, performance tests, 100% test pass, build, deploy to `la`, HTTP 200 | M1, M2, M3 | DONE (deploy blocked) |

## Interface Contracts

### Visual Bounds Contract (`src/canvas/editor/viewport_culling.js`)
- `nodeVisualAABB(node: Object): { x: number, y: number, width: number, height: number }`
  Calculates geometric bounds plus stroke width, shadow blur + spread + offsets, outer glow, and layer blur.

### Layer Cache Contract (`src/canvas/editor/layer_cache.js`)
- `createLayerCache(options?: { maxEntries?: number, maxBytes?: number }): LayerCache`
- `layerCache.get(node: Object, zoom: number, dpr: number): HTMLCanvasElement | null`
- `layerCache.set(node: Object, canvas: HTMLCanvasElement, zoom: number, dpr: number): void`
- `layerCache.invalidate(nodeId?: string): void`
- `layerCache.clear(): void`

### Neighborhood Snapping Contract (`src/canvas/editor/scene_snapping.js`)
- `snapNodeBounds({ doc, activeId, activeIds, rect, zoom, handle, options }): { x, y, guides }`
  `options.spatialIndex`: when provided, queries `spatialIndex.search(neighborhoodBox)` to restrict sibling candidates.
  `options.neighborhoodMargin`: world pixels to expand search box (default: 1000px).

### Byte-Budgeted Bitmap Cache Contract (`src/canvas/editor/bitmap_cache.js`)
- `createBitmapCache(options?: { maxBytes?: number, maxCount?: number, onEvict?: (image, key) => void }): BitmapCache`
- `cache.touch(key, image)`: moves entry to tail and accounts for byte size.
- `cache.evict()`: evicts unpinned entries when `currentBytes > maxBytes` or `size > maxCount`, invoking `onEvict(image, key)`.
- `calculateBitmapBytes(image): number`

### Structural Sharing Undo History Contract (`src/canvas/editor/editor_history.js`)
- `pushEntry(snapshot: Object | string, name?: string): void`
- `getSnapshot(index?: number): Object | string`
- Supports object-level structural sharing without full JSON serialization.

## Code Layout
- `src/canvas/editor/spatial_index.js`: 2D R-Tree implementation with STR packing and query operations.
- `src/canvas/editor/viewport_culling.js`: Visual bounds calculation, culling helpers, and visible ID set computation.
- `src/canvas/editor/layer_cache.js`: LRU OffscreenCanvas cache for pre-rendered static layers.
- `src/canvas/editor/chrome_draw.js`: Main 2D canvas draw loop with $O(\log N + K)$ frustum filtering.
- `src/canvas/editor/editor_pointer.js`: Canvas pointer input handling with rAF event scheduling.
- `src/canvas/editor/scene_snapping.js`: Object alignment, guide lines, and equidistant gap snapping.
- `src/canvas/editor/editor_pointer_move.js`: Gesture move dispatcher and batch node transforms.
- `src/canvas/editor/bitmap_cache.js`: Byte-budgeted LRU image and texture cache.
- `src/canvas/editor/editor_engine_history_state.js`: Active document and history pinning state.
- `src/canvas/editor/editor_history.js`: Document undo/redo history manager.
- `src/canvas/components/editor_toolbar.jsx`: Top editing toolbar and action controls.
- `tests/unit/`: Automated Vitest test suites.
- `scripts/deploy-editor.sh`: Production deployment script to `la` server.
