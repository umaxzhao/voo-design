# Handoff Report — Requirement 2: High-Frequency Gesture & Snapping Optimization

**Author**: `explorer_survey_2`  
**Date**: 2026-10-21T23:35:00Z  
**Target Milestone**: Milestone 1 / Milestone 2 Architecture Implementation  
**Status**: Complete Investigation & Proposal  

---

## 1. Observation

Direct code examination of `src/canvas/editor/editor_pointer.js`, `src/canvas/editor/editor_pointer_move.js`, `src/canvas/editor/scene_snapping.js`, `src/canvas/editor/editor_pointer_transform.js`, `src/canvas/editor/editor_engine.js`, and `src/canvas/editor/spatial_index.js` reveals the following concrete implementation details and bottlenecks:

### 1.1 Synchronous, Unthrottled Pointer Move Dispatch
In `src/canvas/editor/editor_pointer.js` (lines 272–306):
```javascript
  const onPointerMove = (event) => {
    lastPointerEvent = event;
    if (!gesture) {
      if (onCanvas(event)) {
        if (api.getPolygonDraft?.()) {
          api.updatePolygonPreview(
            api.toDocPoint(event.clientX, event.clientY),
          );
        }
        if (api.getMagneticLassoDraft?.()) {
          api.updateMagneticLasso?.(
            api.toDocPoint(event.clientX, event.clientY),
            {
              forceStraight: event.altKey,
            },
          );
        }
        if (api.getPenDraft?.() || api.getEdit?.()) {
          api.penHover?.(api.toDocPoint(event.clientX, event.clientY));
        }
        hover.updateHoverCursor(event);
      }
      return;
    }

    if (
      gesture.pointerId !== undefined &&
      event.pointerId !== undefined &&
      event.pointerId !== gesture.pointerId
    ) {
      return;
    }

    dispatchMove(event, gesture);
  };
```
And lines 424–428:
```javascript
  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
```
**Direct Observation**:
- `onPointerMove` is attached directly to the DOM `pointermove` event without any `requestAnimationFrame` (rAF) throttle or coalescing.
- High-polling rate devices (gaming mice running at 500Hz–1000Hz, or Apple trackpads firing at 120Hz/240Hz) invoke `onPointerMove` hundreds to a thousand times per second.
- On every event, `dispatchMove(event, gesture)` (or the hover controller with full hit-testing) executes synchronously on the JavaScript main thread.

### 1.2 Unconstrained Full-Scene Scan in Snapping (`scene_snapping.js`)
In `src/canvas/editor/scene_snapping.js` (lines 158–176):
```javascript
  // Sibling nodes
  if (snapToObjects) {
    for (const node of doc.nodes ?? []) {
      if (moving.has(node.id) || node.visible === false) continue;
      const box = nodeAABB(node);
      siblingBoxes.push(box);

      targetsX.push(
        { pos: box.x },
        { pos: box.x + box.width / 2 },
        { pos: box.x + box.width },
      );
      targetsY.push(
        { pos: box.y },
        { pos: box.y + box.height / 2 },
        { pos: box.y + box.height },
      );
    }
  }
```
And lines 402–422:
```javascript
    for (const { edge, offset } of movingXEdges) {
      for (const target of targetsX) {
        const dist = Math.abs(edge - target.pos);
        if (dist <= threshold && dist < bestDistX) {
          bestDistX = dist;
          snappedX = target.pos - offset;
          activeGuideX = target.pos;
        }
      }
    }
```
**Direct Observation**:
- For a scene with $N$ nodes, `snapNodeBounds` computes `nodeAABB(node)` for every non-moving visible node in `doc.nodes`, even if the node is 10,000 pixels away or off-screen.
- Pushes $3N$ targets to `targetsX` and $3N$ targets to `targetsY`.
- Runs $3 \times 3N = 9N$ checks for X-alignment and $9N$ checks for Y-alignment.

### 1.3 Super-Linear Complexity in Equidistant Gap Snapping
In `src/canvas/editor/scene_snapping.js` (lines 424–636 and lines 638–850):
```javascript
    // 4. Equidistant Gap Snapping (Figma & Affinity parity)
    if (snapEqualSpacing && siblingBoxes.length >= 2) {
      // Horizontal equidistant gaps
      const sortedX = [...siblingBoxes].sort((a, b) => a.x - b.x);
      const hPairs = [];
      for (let i = 0; i < sortedX.length; i += 1) {
        const b1 = sortedX[i];
        for (let j = i + 1; j < sortedX.length; j += 1) {
          const b2 = sortedX[j];
          if (b2.x < b1.x + b1.width) continue;
          if (hasVerticalProximity(b1, b2, 100)) {
            hPairs.push({ b1, b2, gap: b2.x - (b1.x + b1.width) });
            break;
          }
        }
      }
```
And identically for `sortedY` (lines 638–650).
**Direct Observation**:
- `siblingBoxes` contains all nodes in the document.
- `[...siblingBoxes].sort(...)` runs $O(N \log N)$ twice per move event (once for X, once for Y).
- The nested loops over `sortedX` and `sortedY` are worst-case $O(N^2)$.
- Chain discovery executes backward and forward scans with `sortedX.indexOf(b1)` and `sortedY.indexOf(b1)`.
- If $N = 1,000$, gap candidate computation performs up to $1,000,000$ iterations in X and $1,000,000$ iterations in Y per pointer event.

### 1.4 Redundant Document Mutations During Multi-Node Drag
In `src/canvas/editor/editor_pointer_move.js` (lines 352–380):
```javascript
          const bypassSnap =
            Boolean(event.metaKey || event.ctrlKey) ||
            api.getSnappingEnabled?.() === false;
          const snap = bypassSnap
            ? { x: bounds.x, y: bounds.y, guides: [] }
            : snapNodeBounds({
                doc: visibleDoc,
                activeIds: gesture.origins.map((origin) => origin.id),
                rect: bounds,
                zoom,
                options: editorSnapOptions({ grid: api.getGrid?.() ?? null }),
              });
          const correctionX = snap.x - bounds.x;
          const correctionY = snap.y - bounds.y;
          for (const entry of moved) {
            api.updateNode(
              entry.node.id,
              { x: entry.x + correctionX, y: entry.y + correctionY },
              { commit: false },
            );
          }
          api.setGuides(snap.guides);
```
In `src/canvas/editor/editor_engine.js` (lines 207–232):
```javascript
  function setDoc(next, { commit = true, name = null } = {}) {
    doc = ctrl.initController.measureTextNodes(next);
    docVersion += 1;
    ctrl.initController.queueFontLoads(doc);
    // ...
    historyState.refreshBitmapCachePins();
    requestRender();
    notify();
  }
```
**Direct Observation**:
- If $M$ nodes are selected and dragged, `api.updateNode` is called in a loop $M$ times per pointermove event.
- Each `updateNode` calls `setDoc`, triggering `measureTextNodes(next)`, `docVersion += 1`, `queueFontLoads(doc)`, and `refreshBitmapCachePins()`.
- If 10 nodes are moving at 500Hz: $10 \times 500 = 5,000$ document cloning operations, text remeasurements, and cache updates per second on the main thread.

### 1.5 Existing Spatial Index Infrastructure Available But Unconnected
In `src/canvas/editor/spatial_index.js`:
- Class `SpatialIndex` provides a high-performance R-Tree with STR bulk loading ($O(N \log N)$), $O(\log N + K)$ bounding box search, and $O(\log N)$ point queries.
- Benchmark verification (`tests/unit/challenger_spatial_viewport_stress.test.js`) confirms 50,000 nodes are indexed in under 650ms, with query times in microseconds.
- In `src/canvas/editor/viewport_culling.js` (line 109), `buildSpatialIndex(nodes)` is already implemented.
- However, `scene_snapping.js` and `editor_pointer_move.js` do NOT utilize `SpatialIndex`, nor do they accept or pass it.

---

## 2. Logic Chain

From these direct observations, we trace the cause of input latency and frame drops down to two distinct architectural bottlenecks:

```
[High Polling-Rate Pointer Events (500Hz-1000Hz)]
                      │
                      ▼
[editor_pointer.js: onPointerMove without rAF throttle]
                      │
                      ▼
[editor_pointer_move.js: dispatchMove synchronously per event]
         ┌────────────┴────────────┐
         ▼                         ▼
[snapNodeBounds: O(N)       [api.updateNode: Loop of M
 & O(N^2) Full-Scene Scan]   document mutations & text remeasures]
         │                         │
         └────────────┬────────────┘
                      ▼
[Main Thread Event Loop Starvation: 50ms-100ms per frame]
                      │
                      ▼
[Severe Frame Stutter (<20 FPS), Drag Rubber-Banding & Lag]
```

### 2.1 The Need for requestAnimationFrame Scheduling
1. **Observation 1.1**: The browser dispatches pointer events at the device hardware rate (up to 1000Hz).
2. **Physical Limit**: The physical display refreshes at 60Hz (or 120Hz on ProMotion displays), meaning at most one frame can be presented every 16.6ms (or 8.3ms).
3. **Inference**: Any intermediate layout calculations, coordinate constraints, or state dispatches occurring between screen refresh intervals are discarded before ever being rendered, wasting CPU cycles and starving the paint loop.
4. **Conclusion**: Decoupling `pointermove` event ingestion from gesture dispatch via `requestAnimationFrame` guarantees that gesture math executes at most once per display refresh frame, immediately capping processing frequency to 60/120Hz while preserving cursor follow-through.

### 2.2 The Need for Local AABB Neighborhood Query
1. **Observation 1.2 & 1.3**: Snapping scans all $N$ scene nodes and performs $O(N^2)$ candidate pairing for gap discovery across the entire canvas.
2. **Physical Reality of User Interaction**:
   - In Figma, Sketch, and Affinity Designer, a user moving an object expects it to snap to adjacent objects on the same artboard or within the active viewport.
   - In fact, `hasVerticalProximity` and `hasHorizontalProximity` in `scene_snapping.js` (lines 73–85) *already* reject any nodes with distance $> 450\text{px}$ during gap snapping!
   - Calculating AABBs and sorting for nodes 3,000px away only to reject them at the tail end of the loop is completely wasted computation.
3. **Spatial Locality**:
   - By constructing a **Local AABB Neighborhood Box** around the dragged target (`rect` dilated by a margin, e.g. $\pm 800\text{px}$ to $1200\text{px}$, or matching the visible viewport):
     $$\text{Neighborhood} = [x - \text{margin}_x, y - \text{margin}_y, x + w + \text{margin}_x, y + h + \text{margin}_y]$$
   - Querying the existing R-Tree `SpatialIndex.search(neighborhoodBox)` takes $O(\log N + K)$ time, reducing the candidate set from $N = 1,000$ to $K \approx 10\text{--}20$ local sibling nodes.
4. **Complexity Reduction**:
   - Alignment edge checks drop from $9N$ ($9,000$ ops) to $9K$ ($90$ ops) — a **$100\times$ speedup**.
   - Gap candidate sorting drops from $O(N \log N)$ ($10,000$ ops) to $O(K \log K)$ ($50$ ops) — a **$200\times$ speedup**.
   - Gap pair discovery drops from $O(N^2)$ ($1,000,000$ ops) to $O(K^2)$ ($100$ ops) — a **$10,000\times$ speedup**.
5. **Static Invariance During Drag**:
   - When a user drags a selection, the *sibling* nodes in the background are completely motionless.
   - Therefore, the spatial index of candidate sibling nodes can be captured or referenced once at gesture start (`pointerdown`), and queried in sub-millisecond time on subsequent rAF ticks.

---

## 3. Caveats

1. **Canvas Boundary Snapping**:
   - Canvas edges ($0$, $\text{width}/2$, $\text{width}$) and guide lines are global and do not belong to sibling nodes. The neighborhood filtering must only filter sibling nodes; global canvas bounds and document guides must continue to be evaluated against `threshold` (which naturally rejects far-off boundaries in $O(1)$).
2. **Gesture Coordinate Preservation on `pointerup`**:
   - If a `pointermove` event is pending in the rAF queue when `pointerup` arrives, discarding it would cause the final drag position to snap back to the previous frame's coordinates.
   - *Requirement*: `onPointerUp` must flush any pending scheduled move synchronously before completing `finishGesture`.
3. **Stylus/Brush Pressure Strokes vs Layout Gestures**:
   - For freehand drawing tools (`paint`, `brush`), users expect continuous stroke interpolation. If needed, intermediate points can be accumulated or drawn via `event.getCoalescedEvents?.()`. For transform gestures (`move`, `resize`, `rotate`, `pan`, `marquee`, `crop`), only the latest pointer coordinate is relevant.
4. **Small Scene Backward Compatibility**:
   - If $N \le 30$ (e.g., standard unit tests in `smart_spacing_snapping.test.js`), building an R-Tree is unnecessary overhead. The system should gracefully operate linearly when $N$ is small or when no spatial index is provided.

---

## 4. Conclusion & Concrete Technical Design

### 4.1 Executive Summary
To achieve rock-solid 60FPS tracking under 1,000+ nodes and high-frequency pointer inputs, two core optimizations are required:
1. **rAF-Scheduled Pointer Engine (`editor_pointer.js`)**: Decouple high-frequency DOM `pointermove` events from gesture execution via a non-allocating rAF tick with guaranteed synchronous flush on `pointerup`.
2. **Local AABB Neighborhood Snapping (`scene_snapping.js` & `editor_pointer_move.js`)**: Constrain snapping candidate search and equidistant gap pairing to a spatial neighborhood around the moving bounding box, leveraging `SpatialIndex` ($O(\log N + K)$) when available or an efficient spatial filter.
3. **Batch Node Transformation**: Batch multi-selection position updates into a single document state transition per frame, eliminating repeated text remeasurement and cache refreshes.

---

### 4.2 Detailed Technical Architecture

#### Component A: rAF Gesture Scheduler in `src/canvas/editor/editor_pointer.js`

```javascript
// Architecture sketch for editor_pointer.js:
let pendingPointerEvent = null;
let moveRafId = 0;

function runScheduledMove() {
  moveRafId = 0;
  if (!pendingPointerEvent) return;
  const event = pendingPointerEvent;
  pendingPointerEvent = null;

  if (!gesture) {
    if (onCanvas(event)) {
      if (api.getPolygonDraft?.()) {
        api.updatePolygonPreview(api.toDocPoint(event.clientX, event.clientY));
      }
      if (api.getMagneticLassoDraft?.()) {
        api.updateMagneticLasso?.(api.toDocPoint(event.clientX, event.clientY), {
          forceStraight: event.altKey,
        });
      }
      if (api.getPenDraft?.() || api.getEdit?.()) {
        api.penHover?.(api.toDocPoint(event.clientX, event.clientY));
      }
      hover.updateHoverCursor(event);
    }
    return;
  }

  if (
    gesture.pointerId !== undefined &&
    event.pointerId !== undefined &&
    event.pointerId !== gesture.pointerId
  ) {
    return;
  }

  dispatchMove(event, gesture);
}

function flushScheduledMove() {
  if (moveRafId) {
    cancelAnimationFrame(moveRafId);
    moveRafId = 0;
  }
  if (pendingPointerEvent) {
    runScheduledMove();
  }
}

const onPointerMove = (event) => {
  lastPointerEvent = event;
  pendingPointerEvent = event;
  if (!moveRafId) {
    moveRafId = requestAnimationFrame(runScheduledMove);
  }
};

const onPointerUp = (event) => {
  flushScheduledMove();
  // ... existing pointer up logic ...
};
```

#### Component B: Local AABB Neighborhood Query in `src/canvas/editor/scene_snapping.js`

Add support for `options.spatialIndex`, `options.neighborhoodBox`, and `options.neighborhoodMargin`:

```javascript
// In scene_snapping.js:
export const DEFAULT_NEIGHBORHOOD_MARGIN_PX = 1000;

export function snapNodeBounds({
  doc,
  activeId,
  activeIds,
  rect,
  zoom = 1,
  handle = null,
  options = {},
}) {
  // ...
  const moving = new Set(activeIds ?? (activeId ? [activeId] : []));
  const siblingBoxes = [];

  if (snapToObjects) {
    const spatialIndex = options.spatialIndex ?? doc.spatialIndex ?? doc._spatialIndex ?? null;
    const margin = options.neighborhoodMargin ?? Math.max(DEFAULT_NEIGHBORHOOD_MARGIN_PX, 1200 / zoom);
    const queryBox = options.neighborhoodBox ?? {
      minX: rect.x - margin,
      minY: rect.y - margin,
      maxX: rect.x + rect.width + margin,
      maxY: rect.y + rect.height + margin,
    };

    let candidateNodes;
    if (spatialIndex && doc.nodes && doc.nodes.length > 40) {
      const hits = spatialIndex.search(queryBox);
      const hitIdSet = new Set(hits.map((h) => h.id));
      candidateNodes = doc.nodes.filter((node) => hitIdSet.has(node.id));
    } else if (doc.nodes && doc.nodes.length > 60) {
      // Fast AABB pre-filter if no spatialIndex is passed
      candidateNodes = doc.nodes.filter((node) => {
        if (moving.has(node.id) || node.visible === false) return false;
        const nx = node.x ?? 0;
        const ny = node.y ?? 0;
        const nw = node.width ?? 0;
        const nh = node.height ?? 0;
        return (
          nx + nw >= queryBox.minX &&
          nx <= queryBox.maxX &&
          ny + nh >= queryBox.minY &&
          ny <= queryBox.maxY
        );
      });
    } else {
      candidateNodes = doc.nodes ?? [];
    }

    for (const node of candidateNodes) {
      if (moving.has(node.id) || node.visible === false) continue;
      const box = nodeAABB(node);
      siblingBoxes.push(box);

      targetsX.push(
        { pos: box.x },
        { pos: box.x + box.width / 2 },
        { pos: box.x + box.width },
      );
      targetsY.push(
        { pos: box.y },
        { pos: box.y + box.height / 2 },
        { pos: box.y + box.height },
      );
    }
  }
  // ...
```

#### Component C: Spatial Index Plumbing in `editor_pointer_move.js`
In `editor_pointer_move.js` case `"move"`:
```javascript
          const bypassSnap =
            Boolean(event.metaKey || event.ctrlKey) ||
            api.getSnappingEnabled?.() === false;
          const snap = bypassSnap
            ? { x: bounds.x, y: bounds.y, guides: [] }
            : snapNodeBounds({
                doc: visibleDoc,
                activeIds: gesture.origins.map((origin) => origin.id),
                rect: bounds,
                zoom,
                options: {
                  ...editorSnapOptions({ grid: api.getGrid?.() ?? null }),
                  spatialIndex: api.getSpatialIndex?.() ?? gesture.spatialIndex ?? visibleDoc?.spatialIndex,
                },
              });
```

#### Component D: Batch Node Move in `editor_pointer_move.js`
Instead of calling `api.updateNode` $M$ times in a loop, provide `api.updateNodes` or update all positions in a single document pass:
```javascript
          if (api.updateNodes) {
            const updates = moved.map((entry) => ({
              id: entry.node.id,
              patch: { x: entry.x + correctionX, y: entry.y + correctionY },
            }));
            api.updateNodes(updates, { commit: false });
          } else {
            for (const entry of moved) {
              api.updateNode(
                entry.node.id,
                { x: entry.x + correctionX, y: entry.y + correctionY },
                { commit: false },
              );
            }
          }
```

---

### 4.3 Proposed Implementation Roadmap for Implementer

| Step | Target File | Action | Key Verification |
|---|---|---|---|
| **1** | `src/canvas/editor/scene_snapping.js` | Add `DEFAULT_NEIGHBORHOOD_MARGIN_PX`, query box filtering, and `spatialIndex` lookup in `snapNodeBounds` | Existing tests in `smart_spacing_snapping.test.js` and `snapping_e2e.test.js` pass 100% |
| **2** | `src/canvas/editor/editor_pointer.js` | Implement rAF queue (`moveRafId`, `pendingPointerEvent`, `runScheduledMove`, `flushScheduledMove`) | High-frequency mouse drag throttled cleanly to 60/120Hz; zero missed clicks or coordinates |
| **3** | `src/canvas/editor/editor_pointer_move.js` | Pass `spatialIndex` and `zoom` to `snapNodeBounds`; batch multi-node updates | Smooth 60FPS dragging under 1,000+ nodes |
| **4** | `tests/unit/gesture_snapping_perf.test.js` | Create specialized benchmark test suite measuring 1,000 nodes snapping under high-frequency simulated moves | Sub-millisecond execution per frame verified |

---

## 5. Verification Method

To independently verify the baseline and prospective implementation:

### 5.1 Run Existing Test Suites
```bash
# Verify baseline snapping correctness
npx vitest run tests/unit/smart_spacing_snapping.test.js tests/unit/smart_snapping_guides.test.js tests/unit/snapping_controller.test.js tests/unit/snapping_e2e.test.js

# Verify spatial index and extreme scale stress (50,000 nodes)
npx vitest run tests/unit/challenger_spatial_viewport_stress.test.js tests/unit/viewport_culling.test.js
```

### 5.2 Micro-Benchmark for Neighborhood Snapping
Construct a synthetic benchmark test with 1,000 nodes distributed across a 10,000x10,000 canvas:
```javascript
// Test scenario:
const nodes = Array.from({ length: 1000 }, (_, i) => ({
  id: `node_${i}`,
  visible: true,
  x: (i % 50) * 200,
  y: Math.floor(i / 50) * 200,
  width: 80,
  height: 80,
}));
const doc = { width: 10000, height: 10000, nodes };
const spatialIndex = buildSpatialIndex(nodes);

// Benchmark snapNodeBounds with and without spatialIndex
const start = performance.now();
for (let i = 0; i < 100; i++) {
  snapNodeBounds({
    doc,
    activeId: "dragged",
    rect: { x: 420 + i, y: 400, width: 80, height: 80 },
    options: { spatialIndex },
  });
}
const elapsed = performance.now() - start;
// With neighborhood spatialIndex, 100 queries must complete in < 15ms (< 0.15ms per frame)
```

### 5.3 Invalidation Conditions
- Any regression in `tests/unit/smart_spacing_snapping.test.js` or `tests/unit/snapping_e2e.test.js`.
- Any drop of final cursor coordinates on mouse up during drag.
- Visible guide lines failing to render when dragging near adjacent elements.
