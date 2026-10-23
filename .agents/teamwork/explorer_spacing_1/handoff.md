# Phase 1 Investigation Report: Smart Spacing & Equidistant Snapping Architecture (Requirement R1)

**Target Milestone**: Phase 1 - Architecture & Algorithm Design for Smart Spacing & Snapping (R1)  
**Author**: Explorer 1 (Smart Spacing & Snapping Explorer)  
**Date**: 2026-10-21  
**Scope**: `src/canvas/editor/scene_snapping.js`, `src/canvas/editor/chrome_stage_overlays.js`, and the canvas dragging event loop (`src/canvas/editor/editor_pointer_move.js`, `src/canvas/editor/editor_pointer.js`, `src/canvas/editor/editor_pointer_transform.js`, `src/canvas/editor/editor_engine_document.js`, `src/canvas/editor/chrome_draw.js`).

---

## 1. Observation

### 1.1 `src/canvas/editor/scene_snapping.js` (Current Snapping Implementation)

In `src/canvas/editor/scene_snapping.js`, the primary snapping entry point is `snapNodeBounds`:

```javascript
// Lines 25-33: Function Signature
export function snapNodeBounds({
  doc,
  activeId,
  activeIds,
  rect,
  zoom = 1,
  handle = null,
  options = {},
})
```

#### A. Threshold Calculation (Lines 67–69)
```javascript
  const baseThreshold = options.tolerance ?? SNAP_THRESHOLD_PX;
  const threshold = Math.max(3, baseThreshold / zoom);
```
- `SNAP_THRESHOLD_PX` is defined on line 9 as `6`.
- The document-space threshold scales inversely with `zoom` and is clamped to a minimum of 3 document units.

#### B. Sibling Collection & Target Generation (Lines 80–101)
```javascript
  const moving = new Set(activeIds ?? (activeId ? [activeId] : []));
  const siblingBoxes = [];

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
- Active nodes being dragged (`activeIds` or `activeId`) and hidden nodes (`node.visible === false`) are excluded.
- `siblingBoxes` stores the axis-aligned bounding box (`nodeAABB(node)`) of each visible stationary node.
- Edge targets (min, center, max) are populated into `targetsX` and `targetsY`.

#### C. Current Equidistant Gap Snapping (Lines 347–396)
```javascript
    // 4. Equidistant Gap Snapping (Figma & Affinity parity)
    if (snapEqualSpacing && siblingBoxes.length >= 2) {
      // Horizontal equidistant gaps
      const sortedX = [...siblingBoxes].sort((a, b) => a.x - b.x);
      for (let i = 0; i < sortedX.length - 1; i += 1) {
        const b1 = sortedX[i];
        const b2 = sortedX[i + 1];
        const gap = b2.x - (b1.x + b1.width);
        if (gap > 4) {
          const targetRight = b2.x + b2.width + gap;
          const distRight = Math.abs(rect.x - targetRight);
          if (distRight <= threshold && distRight < bestDistX) {
            bestDistX = distRight;
            snappedX = targetRight;
            activeGuideX = targetRight;
          }
          const targetLeft = b1.x - gap - rect.width;
          const distLeft = Math.abs(rect.x - targetLeft);
          if (distLeft <= threshold && distLeft < bestDistX) {
            bestDistX = distLeft;
            snappedX = targetLeft;
            activeGuideX = targetLeft + rect.width;
          }
        }
      }

      // Vertical equidistant gaps
      const sortedY = [...siblingBoxes].sort((a, b) => a.y - b.y);
      for (let i = 0; i < sortedY.length - 1; i += 1) {
        const b1 = sortedY[i];
        const b2 = sortedY[i + 1];
        const gap = b2.y - (b1.y + b1.height);
        if (gap > 4) {
          const targetBelow = b2.y + b2.height + gap;
          const distBelow = Math.abs(rect.y - targetBelow);
          if (distBelow <= threshold && distBelow < bestDistY) {
            bestDistY = distBelow;
            snappedY = targetBelow;
            activeGuideY = targetBelow;
          }
          const targetAbove = b1.y - gap - rect.height;
          const distAbove = Math.abs(rect.y - targetAbove);
          if (distAbove <= threshold && distAbove < bestDistY) {
            bestDistY = distAbove;
            snappedY = targetAbove;
            activeGuideY = targetAbove + rect.height;
          }
        }
      }
    }
```
- **Observations on current gap snapping:**
  1. Only checks **appending right** (`targetRight = b2.x + b2.width + gap`) and **appending left** (`targetLeft = b1.x - gap - rect.width`).
  2. **Completely misses in-between insertion**: If dragging `rect` *between* `b1` and `b2`, there is no check for `targetCenter = b1.x + b1.width + (b2.x - (b1.x + b1.width) - rect.width) / 2`.
  3. **Completely ignores orthogonal overlap / alignment**: Sibling boxes are sorted globally on `x` regardless of their `y` coordinate. Two boxes at opposite vertical corners of a 10,000px canvas are paired up.
  4. **Only emits infinite full-canvas lines**: It assigns `activeGuideX = targetRight` or `targetLeft + rect.width`, which pushes `{ type: "v", pos: activeGuideX }` (lines 407–409). No gap segment bounds, no measurement badges, and no tick-mark descriptors are emitted!

---

### 1.2 `src/canvas/editor/chrome_stage_overlays.js` (Current Overlay Rendering)

In `src/canvas/editor/chrome_stage_overlays.js`:
```javascript
// Lines 169-198: drawGuides
export function drawGuides(ctx, guides, viewport, dpr) {
  if (!guides || guides.length === 0) return;
  const { canvas } = ctx;
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;

  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  for (const guide of guides) {
    ctx.beginPath();
    if (guide.type === "v") {
      const screenX =
        Math.round(guide.pos * viewport.zoom + viewport.panX) + 0.5;
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, height);
    } else if (guide.type === "h") {
      const screenY =
        Math.round(guide.pos * viewport.zoom + viewport.panY) + 0.5;
      ctx.moveTo(0, screenY);
      ctx.lineTo(width, screenY);
    }
    ctx.stroke();
  }
  ctx.restore();
}
```
- `ctx` is `CanvasRenderingContext2D`.
- Currently only recognizes `guide.type === "v"` and `guide.type === "h"`.
- Strokes full-screen lines in `SELECTION_COLOR` (`#b2ffd6`).
- Does **not** render smart spacing guide segments, does not render end ticks, does not render pill badges or numeric pixel measurements.

---

### 1.3 Pointer Move, Dragging, Bypass & Clearing Lifecycle

#### A. Translation Snapping in `src/canvas/editor/editor_pointer_move.js` (Lines 352–376)
```javascript
  const boxes = moved.map((entry) =>
    nodeAABB({ ...entry.node, x: entry.x, y: entry.y }),
  );
  const bounds = combinedBounds(boxes);
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
- Bypass trigger: `Boolean(event.metaKey || event.ctrlKey) || api.getSnappingEnabled?.() === false`.
- When bypassed, `snap.guides` is `[]`, so `api.setGuides([])` immediately clears all guides.
- When enabled, `api.setGuides(snap.guides)` notifies `requestRender()`.

#### B. Clearing Guides on Drag End in `src/canvas/editor/editor_pointer.js` (Lines 290–296)
```javascript
  const onPointerUp = (event) => {
    lastPointerEvent = null;
    if (stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
    api.setGuides([]);
    if (!gesture) return;
...
```
- On pointer release, `api.setGuides([])` is explicitly called, instantaneously clearing all active guidelines.

#### C. Guide Storage in `src/canvas/editor/editor_engine_document.js` (Lines 94–104)
```javascript
    getGuides: () => {
      const docGuides = Array.isArray(getDoc()?.guides) ? getDoc().guides : [];
      if (!guides || guides.length === 0) return docGuides;
      const seen = new Set(docGuides.map((g) => `${g.type}:${g.pos}`));
      const extra = guides.filter((g) => !seen.has(`${g.type}:${g.pos}`));
      return [...docGuides, ...extra];
    },
    setGuides: (nextGuides) => {
      guides = nextGuides ?? [];
      requestRender();
    },
```
- Temporary snapping guides set by `setGuides` are merged with persistent ruler guides `docGuides`.
- Notice the deduplication key: `${g.type}:${g.pos}`.
  Any new guide descriptor must either have a meaningful/unique `pos` or use distinct `type` names so that multiple gap guides are not incorrectly deduplicated away!

---

### 1.4 Existing Test Assertions (`tests/unit/smart_snapping_guides.test.js` & `tests/unit/snapping_e2e.test.js`)

In `tests/unit/smart_snapping_guides.test.js` (Lines 52–60 and 84–92):
```javascript
    const snapGapRight = snapNodeBounds({
      doc: sampleDoc,
      activeId: "active",
      rect: { x: 403, y: 500, width: 80, height: 80 },
      zoom: 1,
    });
    expect(snapGapRight.x).toBe(400);
    expect(snapGapRight.guides.some((g) => g.type === "v" && g.pos === 400)).toBe(true);

    const snapGapBelow = snapNodeBounds({
      doc: docWithVNodes,
      activeId: "active",
      rect: { x: 500, y: 422, width: 80, height: 80 },
      zoom: 1,
    });
    expect(snapGapBelow.y).toBe(420);
    expect(snapGapBelow.guides.some((g) => g.type === "h" && g.pos === 420)).toBe(true);
```
- **Crucial backward-compatibility constraint:** Existing unit tests verify that `guides` contains `{ type: "v", pos: 400 }` (or `{ type: "h", pos: 420 }`) when gap snapping triggers.
- Therefore, when emitting new rich gap guide descriptors, `snapNodeBounds` **must still include** `{ type: "v", pos: snappedX }` or `{ type: "h", pos: snappedY }` so all existing test suites pass with 0 regressions.

---

## 2. Logic Chain

### 2.1 Problem Decomposition for Requirement R1
Requirement R1 mandates:
1. **Dynamic identification of adjacent peer layers** along X and Y axes during layer drag.
2. **Measurement of horizontal and vertical gaps** between peers.
3. **Calculation of equidistant snap conditions**:
   - Extrapolated sequence: $A \to B \to \text{dragged } C$ or $\text{dragged } C \to A \to B$ with equal gap $G$.
   - Interpolated sequence: $A \to \text{dragged } C \to B$ centered between $A$ and $B$ with equal gap $G$.
   - Layout gap matching: Dragged item forming a gap with an adjacent peer that matches an existing gap elsewhere in the row/column.
4. **Computation of snapped positions and snap delta**.
5. **Generation of rich visual overlay descriptors**:
   - Pink/purple guideline segments (`#e056fd` or `#ff2d87`).
   - Perpendicular end-cap tick marks at gap boundaries.
   - Measurement pill badges displaying numeric values (e.g. `16px`).
6. **Rendering in `chrome_stage_overlays.js`** using Canvas2D context, and automatic clearing upon mouse release or bypass.

### 2.2 Mathematical Model for Equidistant Spacing

Let $R = \{ x, y, \text{width}, \text{height} \}$ be the bounding box of the active selection.  
Let $S_1, S_2, \dots, S_n$ be stationary sibling bounding boxes.

#### A. Horizontal Gaps ($X$-Axis)
1. **Gap Definition**: For two boxes $A$ and $B$ where $A.x + A.\text{width} \le B.x$:
   $$\text{gap}_X(A, B) = B.x - (A.x + A.\text{width})$$
2. **Candidate Peer Pairing**:
   - In Figma and UI layout engines, candidates along $X$ are peers that either:
     a) Share vertical projection overlap: $\min(A.y + A.h, B.y + B.h) - \max(A.y, B.y) > 0$.
     b) Or are within a vertical proximity threshold: $|\text{center}_Y(A) - \text{center}_Y(B)| \le \max(A.h, B.h) \times 1.5$.
   - To support 1D document test cases (e.g. `smart_snapping_guides.test.js` where test nodes are at $y=100$ while dragged rect is at $y=500$), candidate selection should prioritize peers with $Y$-overlap but gracefully fall back to $X$-ordered pairs when no $Y$-overlapping candidates exist.
3. **Equidistant Conditions & Target Positions**:
   - **Scenario 1 (Append Right: $S_i \to S_j \to R$)**:
     Given existing gap $G = S_j.x - (S_i.x + S_i.w) > 4$:
     $$\text{targetX} = S_j.x + S_j.w + G$$
     $$\text{dist} = |R.x - \text{targetX}|$$
   - **Scenario 2 (Append Left: $R \to S_i \to S_j$)**:
     Given existing gap $G = S_j.x - (S_i.x + S_i.w) > 4$:
     $$\text{targetX} = S_i.x - G - R.w$$
     $$\text{dist} = |R.x - \text{targetX}|$$
   - **Scenario 3 (Insert In-Between: $S_i \to R \to S_j$)**:
     For $S_i$ and $S_j$ where $S_j.x - (S_i.x + S_i.w) > R.w + 8$:
     $$\text{freeSpace} = S_j.x - (S_i.x + S_i.w)$$
     $$G = \frac{\text{freeSpace} - R.w}{2}$$
     $$\text{targetX} = S_i.x + S_i.w + G$$
     $$\text{dist} = |R.x - \text{targetX}|$$

#### B. Vertical Gaps ($Y$-Axis)
Analogous equations apply along the $Y$ axis:
1. **Append Below ($S_i \to S_j \to R$)**: $\text{targetY} = S_j.y + S_j.h + G$.
2. **Append Above ($R \to S_i \to S_j$)**: $\text{targetY} = S_i.y - G - R.h$.
3. **Insert In-Between ($S_i \to R \to S_j$)**: $\text{targetY} = S_i.y + S_i.h + \frac{S_j.y - (S_i.y + S_i.h) - R.h}{2}$.

### 2.3 Guide Data Contract

When equidistant snapping activates, `snapNodeBounds` must emit both:
1. The backwards-compatible alignment line: `{ type: "v", pos: snappedX }` or `{ type: "h", pos: snappedY }`.
2. The paired gap descriptors representing the matching gaps:
   - For horizontal gaps:
     ```javascript
     {
       type: "gap_h",
       x1: leftEdge,           // document coordinate
       x2: rightEdge,          // document coordinate
       y: referenceY,          // document coordinate (Y centerline)
       gap: Math.round(gapVal),
       label: `${Math.round(gapVal)}px`,
       pos: Math.round((leftEdge + rightEdge) / 2),
     }
     ```
   - For vertical gaps:
     ```javascript
     {
       type: "gap_v",
       y1: topEdge,            // document coordinate
       y2: bottomEdge,         // document coordinate
       x: referenceX,          // document coordinate (X centerline)
       gap: Math.round(gapVal),
       label: `${Math.round(gapVal)}px`,
       pos: Math.round((topEdge + bottomEdge) / 2),
     }
     ```

Each equidistant snap emits **two** gap descriptors:
- Gap A: between the two stationary reference nodes (or between reference 1 and dragged).
- Gap B: between the reference node and the dragged node.
This matches Figma's behavior where both matching gaps light up simultaneously.

### 2.4 Rendering Architecture in `chrome_stage_overlays.js`

In `chrome_stage_overlays.js`:
1. **Design Tokens & Colors**:
   - `SPACING_GUIDE_COLOR = "#e056fd"` (Vibrant magenta/purple, high contrast on dark canvas `#171717`/`#525252` and light artboard `#ffffff`).
   - Line width: 1 physical screen pixel (`1 / (dpr === 1 ? 1 : 1)` or `1`).
2. **Coordinate Transform**:
   - $s_{x1} = \text{Math.round}(x_1 \times \text{viewport.zoom} + \text{viewport.panX})$
   - $s_{x2} = \text{Math.round}(x_2 \times \text{viewport.zoom} + \text{viewport.panX})$
   - $s_y = \text{Math.round}(y \times \text{viewport.zoom} + \text{viewport.panY}) + 0.5$
3. **Tick Marks**:
   - For `gap_h`: vertical ticks at $s_{x1}$ and $s_{x2}$ spanning $s_y - 4$ to $s_y + 4$.
   - For `gap_v`: horizontal ticks at $s_{y1}$ and $s_{y2}$ spanning $s_x - 4$ to $s_x + 4$.
4. **Measurement Pill Badge**:
   - Centered at $s_{\text{midX}} = (s_{x1} + s_{x2}) / 2$, $s_{\text{midY}} = s_y$.
   - Measure text width via `ctx.measureText(label).width`.
   - Badge size: `width = textWidth + 8`, `height = 16`, `radius = 3`.
   - Background: `ctx.fillStyle = SPACING_GUIDE_COLOR`. Pill drawn using `ctx.roundRect` (with graceful fallback to `ctx.fillRect`).
   - Text: `ctx.fillStyle = "#ffffff"`, font `10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`, centered.
   - Anti-collision: If the gap screen width is narrower than `badgeWidth + 4`, offset the badge perpendicularly above the line by `badgeHeight / 2 + 3` so it does not obscure the end tick marks.

---

## 3. Caveats

1. **Rotated Nodes**:
   `nodeAABB(node)` provides the axis-aligned bounding box of a rotated node. Smart spacing operates on axis-aligned bounds (matching Figma's smart guides when dragging rotated objects). This is mathematically sound and predictable.
2. **Headless Canvas in Unit Tests**:
   Vitest runs in a Node.js environment where `CanvasRenderingContext2D` methods like `roundRect` or `measureText` may be mocked or minimal.
   - Any rendering helper must feature defensive checks: `if (typeof ctx.roundRect === "function")` with fallback to `ctx.fillRect`.
   - Pure geometric snapping logic in `scene_snapping.js` must remain completely decoupled from DOM Canvas APIs.
3. **Candidate Scalability**:
   When a document has thousands of nodes, comparing all $O(N^2)$ pairs on every pointermove is wasteful.
   Candidate filtering should:
   - Filter out `node.visible === false` and `activeIds` (already done).
   - Filter stationary nodes to those within a reasonable bounding envelope of the active rect (e.g. within 2000px or viewport bounds).
   - Only consider pairs with gaps $\le 500\text{px}$ and $G > 4$.

---

## 4. Conclusion & Recommended Implementation Blueprint

### 4.1 File Responsibilities
| File Path | Responsibility | Changes Required |
|---|---|---|
| `src/canvas/editor/scene_snapping.js` | Core snapping math & guide generation | 1. Add In-Between equidistant gap calculation.<br>2. Generate paired `gap_h` and `gap_v` guide descriptors.<br>3. Preserve `{ type: 'v'|'h', pos }` for backwards compatibility.<br>4. Implement candidate spatial filtering. |
| `src/canvas/editor/chrome_stage_overlays.js` | Canvas2D rendering for guides & overlays | 1. Define `SPACING_GUIDE_COLOR = "#e056fd"`.<br>2. Add `drawGapGuides(ctx, gapGuides, viewport)`.<br>3. Render pink guide segments, end tick marks, and pill measurement badges.<br>4. Integrate into `drawGuides()`. |
| `src/canvas/editor/editor_pointer_move.js` | Drag event loop | Already correctly wires `snapNodeBounds`, `bypassSnap`, and `api.setGuides`. No changes needed. |
| `src/canvas/editor/editor_pointer.js` | Gesture lifecycle & drag end | Already correctly calls `api.setGuides([])` on pointer up. No changes needed. |
| `src/canvas/editor/editor_engine_document.js` | Guide store & rendering notify | Supports `setGuides` and triggers `requestRender()`. Ensure guide deduplication key handles gap descriptors cleanly. |

### 4.2 Concrete Implementation Steps

#### Step 1: Enhance `scene_snapping.js`
In `snapNodeBounds()`:
1. In Section 4 (Equidistant Gap Snapping):
   - For horizontal spacing:
     - Sort candidate siblings by `x`.
     - For adjacent pairs $(S_i, S_{i+1})$:
       - Calculate $G = S_{i+1}.x - (S_i.x + S_i.w)$.
       - If $G > 4$:
         - Test Append Right: $\text{targetRight} = S_{i+1}.x + S_{i+1}.w + G$.
         - Test Append Left: $\text{targetLeft} = S_i.x - G - rect.w$.
       - Test In-Between Insertion:
         - If $S_{i+1}.x - (S_i.x + S_i.w) > rect.w + 8$:
           - $G_{\text{mid}} = (S_{i+1}.x - (S_i.x + S_i.w) - rect.w) / 2$.
           - $\text{targetMid} = S_i.x + S_i.w + G_{\text{mid}}$.
     - Record the best match. When snapped:
       - Set `snappedX = target`.
       - Add `{ type: "v", pos: target }` (for existing test suites).
       - Add the two gap descriptors `{ type: "gap_h", x1, x2, y, gap, label }`.
   - For vertical spacing:
     - Mirror horizontal logic with Append Below, Append Above, and In-Between Insertion.
     - Add `{ type: "h", pos: target }`.
     - Add the two gap descriptors `{ type: "gap_v", y1, y2, x, gap, label }`.

#### Step 2: Implement Visual Gap Overlays in `chrome_stage_overlays.js`
1. Export `SPACING_GUIDE_COLOR = "#e056fd"`.
2. In `drawGuides(ctx, guides, viewport, dpr)`:
   - Partition `guides` into alignment lines (`v`, `h`) and gap guides (`gap_h`, `gap_v`).
   - Draw alignment lines as before in `SELECTION_COLOR`.
   - Call helper `drawGapGuides(ctx, gapGuides, viewport)`:
     - Stroke magenta segment connecting the gap bounds.
     - Stroke perpendicular tick marks (8px tall/wide) at start and end.
     - Draw pill badge with text `"${gap}px"`, rounded rectangle background in `SPACING_GUIDE_COLOR`, and white text.

#### Step 3: Write Dedicated Vitest Unit Tests
Create/update `tests/unit/smart_spacing_snapping.test.js` covering:
- Horizontal Append Right gap snap.
- Horizontal Append Left gap snap.
- Horizontal In-Between Insertion gap snap.
- Vertical Append Below, Append Above, and In-Between gap snaps.
- Gap guide descriptors validation (verifying `type`, `x1`, `x2`, `y`, `gap`, `label`).
- Jitter rejection for $G \le 4\text{px}$.
- Bypass via `options.enabled = false` or `options.snapEqualSpacing = false`.
- Multi-selection combined bounds gap snap.
- Visual rendering test for `drawGuides` verifying Canvas2D calls without errors.

---

## 5. Verification Method

### 5.1 Automated Command Verification
Run the Vitest test runner on existing and new snapping test suites:
```bash
npm test -- tests/unit/smart_snapping_guides.test.js tests/unit/snapping_controller.test.js tests/unit/snapping_e2e.test.js
```
Expected output: 100% passed (55+ tests), 0 failures.

### 5.2 Lint & Design System Verification
Run the design system validator:
```bash
npm run lint:design
```
Expected output: `design: clean — all files match Design.md`.

### 5.3 Invalidation Conditions
The design is invalidated if:
1. Any existing snapping test fails or changes behavior.
2. Gap guides fail to disappear when `Cmd` or `Ctrl` is held during drag.
3. Guides persist after `pointerup` (mouse release).
4. Dragging between two objects does not snap to the equidistant midpoint.
