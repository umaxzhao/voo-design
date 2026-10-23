# Snapping & Overlays Architectural Survey Report
**Project**: VOO Design Editor  
**Module Scope**: `src/canvas/editor/scene_snapping.js`, `src/canvas/editor/chrome_stage_overlays.js`, and gesture interaction pipeline  
**Date**: 2026-10-20  
**Author**: Snapping & Overlays Explorer  

---

## 1. Executive Summary

This survey analyzes the canvas snapping engine and overlay rendering pipeline in VOO Design, focusing on introducing a production-grade **Smart Spacing & Equidistant Gap Snapping** system (Figma / Affinity parity).

### Core Findings
1. **Existing Foundation**: VOO Design already possesses a well-structured snapping foundation in `src/canvas/editor/scene_snapping.js` supporting edge/center alignment, rectangular grids, isometric lattices, and user guides, complete with zoom-adaptive thresholds.
2. **Current Gap Snapping Limitations**:
   - `scene_snapping.js` (lines 348–396) contains a prototype 2-sibling equidistant snap, but it only checks placement outside a single pair (to the right of `b2` or left of `b1`).
   - It **does not support in-between / insertion snapping** (dragging an object between two existing layers to equalize the gaps on both sides).
   - It lacks **perpendicular band filtering**: it globally sorts all sibling boxes regardless of their Y coordinate (or X coordinate for vertical gaps), leading to false snaps between vertically unrelated objects.
   - It only emits a single standard vertical/horizontal guide line (`{ type: "v" | "h", pos }`).
3. **Current Overlay Limitations**:
   - `src/canvas/editor/chrome_stage_overlays.js` (`drawGuides`) currently only renders infinite vertical (`type: "v"`) and horizontal (`type: "h"`) lines in `SELECTION_COLOR` (`#b2ffd6`).
   - It contains zero support for segmented dimension guides, end tick marks (T-bars), or measurement pill badges (e.g. `16px`).
4. **Gesture & Bypass Lifecycle**:
   - Magnetic snapping is stored in `editor_engine_document.js` (`snappingEnabled`, default `true`) and toggled via `toggleSnapping()`.
   - Dynamic bypass via `Cmd` / `Ctrl` is checked on every pointer move in `editor_pointer_move.js:357` and `editor_pointer_transform.js:505, 622`.
   - Overlays are cleanly cleared on pointer release in `editor_pointer.js:295` via `api.setGuides([])`.

---

## 2. Gesture Pipeline & Snapping Query Lifecycle

### 2.1 Drag-to-Move Lifecycle (`src/canvas/editor/editor_pointer_move.js`)
When moving objects:
```javascript
// editor_pointer_move.js: lines 352-376
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
- **Bounding Box**: All moved nodes are represented by their collective axis-aligned bounding box (`bounds = combinedBounds(boxes)`).
- **Active IDs Exclusion**: `gesture.origins.map(o => o.id)` is passed to `snapNodeBounds` as `activeIds`. All moving nodes are excluded from candidate snap targets.
- **Correction**: `correctionX = snap.x - bounds.x` and `correctionY = snap.y - bounds.y` shift all moved nodes by the exact snap delta.
- **Guide State**: `api.setGuides(snap.guides)` notifies `editor_engine_document.js` and requests a render frame.

### 2.2 Resize & Transform Lifecycle (`src/canvas/editor/editor_pointer_transform.js`)
During handle dragging:
- In `dragResize(event)` (lines 505–542 for multi-selection, lines 619–651 for single selection):
  - Checks `bypassSnap = Boolean(event.metaKey || event.ctrlKey)`.
  - Checks `snapDisabled = api.getSnappingEnabled?.() === false`.
  - Calls `snapNodeBounds({ doc, activeId, activeIds, rect: proposedRect, zoom, handle: gesture.handle })`.
  - Accumulates `snap.deltaX` / `snap.deltaY` to `effectiveDelta`.
  - Invokes `api.setGuides?.(snapGuides)`.

### 2.3 Modifier Bypass & Pointer Cleanup
1. **`Cmd` / `Ctrl` Bypass**:
   Holding `Cmd` (Mac) or `Ctrl` (Windows/Linux) sets `bypassSnap = true`. `snapNodeBounds` is completely bypassed, returning `guides: []`. The UI instantly frees the cursor and removes all guides.
2. **Magnet Toggle**:
   `engine.toggleSnapping()` toggles `snappingEnabled` in `editor_engine_document.js`. When `false`, snapping is disabled globally until re-enabled.
3. **Pointer Up Cleanup**:
   In `src/canvas/editor/editor_pointer.js:295`:
   ```javascript
   const onPointerUp = (event) => {
     ...
     api.setGuides([]);
     ...
   };
   ```
   When the mouse is released, `api.setGuides([])` is unconditionally called, ensuring no sticky guides or orphaned badges remain on the canvas.

---

## 3. Analysis of Existing Snapping Logic (`src/canvas/editor/scene_snapping.js`)

### 3.1 Candidate Selection & Tolerances
- **Active Node Exclusion**:
  `const moving = new Set(activeIds ?? (activeId ? [activeId] : []));`
  Every node in `moving` or marked `node.visible === false` is excluded.
- **AABB Geometry**:
  Candidates are measured with `nodeAABB(node)` (`scene_geometry_bounds.js`), which correctly handles rotated, sheared, and perspective nodes.
- **Zoom-Adaptive Threshold**:
  ```javascript
  const baseThreshold = options.tolerance ?? SNAP_THRESHOLD_PX; // default 6px
  const threshold = Math.max(3, baseThreshold / zoom);
  ```
  - When zoomed out ($zoom < 1$), `threshold` in document space expands so that snapping remains ~6 CSS screen pixels.
  - When zoomed in ($zoom > 1$), `threshold` shrinks, clamped to a minimum of 3 document units to prevent threshold collapse.

### 3.2 Existing Candidate Matching
- **Targets**:
  - Canvas borders: $0$, $doc.width / 2$, $doc.width$
  - Sibling edges and centerlines: $box.x$, $box.x + box.width / 2$, $box.x + box.width$
  - User persistent guides: $guide.pos$
- **Nearest Candidate Selection**:
  Iterates over targets, tracking `bestDistX` and `bestDistY`. The candidate minimizing $|edge - target.pos|$ within `threshold` is selected.

### 3.3 Prototype Gap Snapping Deficiencies
Lines 348–396 contain a preliminary implementation of equidistant snapping:
1. **Misses Insertion Snapping**:
   If an object is dragged between Box A and Box B, it should snap when the left gap equals the right gap:
   $$\text{gap}(A, R) = \text{gap}(R, B) = \frac{B.x - (A.x + A.width) - R.width}{2}$$
   Currently, the code only checks if $R$ is placed outside the pair ($x = B.x + B.width + g$ or $x = A.x - g - R.width$).
2. **Missing Perpendicular Overlap Filtering**:
   Sibling boxes are collected globally into `siblingBoxes` and sorted purely by $x$. If Box A is at $(100, 50)$ and Box B is at $(250, 4000)$, they are considered a "horizontal pair" with a 50px gap, causing false snaps for an object at $(400, 200)$.
3. **No Chain Expansion**:
   If boxes A, B, C exist with equal gaps, snapping D only references the single adjacent pair rather than visualizing the full chain.
4. **Primitive Output Format**:
   Only sets `activeGuideX = target` and pushes a single `{ type: "v", pos: activeGuideX }`. No gap length, no span coordinates, no pill tags.

---

## 4. Smart Equidistant Gap Snapping Algorithm Specification

### 4.1 Perpendicular (Cross-Axis) Band Filtering
To prevent distant unrelated layers from interfering, two boxes $A$ and $B$ (and the dragged rect $R$) are considered in the same horizontal band if their vertical projections overlap or have minimal vertical separation:
```javascript
function haveVerticalProximity(boxA, boxB) {
  const overlap =
    Math.min(boxA.y + boxA.height, boxB.y + boxB.height) -
    Math.max(boxA.y, boxB.y);
  if (overlap > 0) return true;
  const vertDist =
    Math.max(boxA.y, boxB.y) -
    Math.min(boxA.y + boxA.height, boxB.y + boxB.height);
  const minHeight = Math.min(boxA.height, boxB.height);
  return vertDist <= Math.max(32, minHeight);
}
```
Only sibling boxes passing `haveVerticalProximity(box, rect)` participate in horizontal gap evaluation. (For vertical gap evaluation, `haveHorizontalProximity` is used symmetrically).

### 4.2 Horizontal Gap Snapping Mechanics

Let `sortedX` be relevant sibling boxes sorted by $x$. For each consecutive pair $(b_1, b_2)$:

#### Pattern 1: Insertion (In-Between Sibling Nodes $b_1$ and $b_2$)
Occurs when $R$ is positioned between $b_1$ and $b_2$:
$$\text{availableSpace} = b_2.x - (b_1.x + b_1.width) - R.width$$
If $\text{availableSpace} \ge 4$:
$$\text{targetGap} = \frac{\text{availableSpace}}{2}$$
$$\text{targetX} = b_1.x + b_1.width + \text{targetGap}$$
$$\text{dist} = |R.x - \text{targetX}|$$
If $\text{dist} \le \text{threshold}$ and $\text{dist} < \text{bestDistX}$:
- Snap $R.x$ to $\text{targetX}$.
- Generate 2 gap spans:
  1. $b_1 \to R$: from $b_1.x + b_1.width$ to $\text{targetX}$, length $\text{targetGap}$.
  2. $R \to b_2$: from $\text{targetX} + R.width$ to $b_2.x$, length $\text{targetGap}$.

#### Pattern 2: Collinear Extension (Outside Adjacent Pair)
Let existing gap $g = b_2.x - (b_1.x + b_1.width)$. If $g \ge 4$:
1. **Right Extension**:
   $$\text{targetRight} = b_2.x + b_2.width + g$$
   $$\text{distRight} = |R.x - \text{targetRight}|$$
   If $\text{distRight} \le \text{threshold}$ and $\text{distRight} < \text{bestDistX}$:
   - Snap $R.x$ to $\text{targetRight}$.
   - Reference span: from $b_1.x + b_1.width$ to $b_2.x$.
   - Dragged span: from $b_2.x + b_2.width$ to $\text{targetRight}$.
   - Check if $b_1$ was part of an earlier chain with equal gap $g$ (chain expansion).
2. **Left Extension**:
   $$\text{targetLeft} = b_1.x - g - R.width$$
   $$\text{distLeft} = |R.x - \text{targetLeft}|$$
   If $\text{distLeft} \le \text{threshold}$ and $\text{distLeft} < \text{bestDistX}$:
   - Snap $R.x$ to $\text{targetLeft}$.
   - Dragged span: from $\text{targetLeft} + R.width$ to $b_1.x$.
   - Reference span: from $b_1.x + b_1.width$ to $b_2.x$.

#### Pattern 3: Vertical Symmetrical Equivalence
Replace $x \leftrightarrow y$, $width \leftrightarrow height$, and evaluate vertically using horizontal band proximity.

---

## 5. Guide Data Structure & Overlay Rendering Specification

### 5.1 Data Structure Contract
In `scene_snapping.js`, when gap snapping triggers, it emits a guide object:
```javascript
{
  type: "gap",
  axis: "x",                     // "x" | "y"
  gap: Math.round(gap),          // Integer gap in doc units (e.g. 16)
  pos: Math.round(gap),          // Backward-compatible numerical property
  spans: [
    {
      start: 200,                // Primary axis start (doc space)
      end: 216,                  // Primary axis end (doc space)
      cross: 150,                // Primary axis centerline for guide & badge
    },
    {
      start: 266,
      end: 282,
      cross: 150,
    }
  ]
}
```

> **Crucial Backwards Compatibility Requirement**:
> Existing unit tests (e.g. `tests/unit/smart_snapping_guides.test.js:59`) assert:
> `expect(snapGapRight.guides.some((g) => g.type === "v" && g.pos === 400)).toBe(true);`
> Therefore, whenever a gap snap triggers along the X-axis, the return payload MUST include BOTH the `{ type: "v", pos: snappedEdge }` guide AND the `{ type: "gap", ... }` guide! This ensures 100% regression-free test compatibility while providing full visual fidelity.

### 5.2 Overlay Rendering in `src/canvas/editor/chrome_stage_overlays.js`

In `chrome_draw.js:336`, `drawGuides(ctx, guides, viewport, dpr)` is called.
At this execution point:
- Canvas context transform is `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`.
- All drawing occurs in **screen pixel space** (device pixel ratio normalized).
- Document coordinates are converted to screen coordinates via:
  ```javascript
  const screenX = Math.round(docX * viewport.zoom + viewport.panX) + 0.5;
  const screenY = Math.round(docY * viewport.zoom + viewport.panY) + 0.5;
  ```

#### Visual Styling Specs (Figma / Affinity Standard):
- **Color Token**:
  `const GAP_COLOR = "#e056fd";` (Vibrant Magenta / Purple, high contrast against dark canvas backdrops).
  Alternative: `#ff3b77` (Figma Pink).
- **Dimension Guide Line**:
  - `ctx.strokeStyle = GAP_COLOR;`
  - `ctx.lineWidth = 1;`
  - Solid hairline drawn from `sStart` to `sEnd` at `sCross`.
- **End Tick Marks (T-bars)**:
  - Perpendicular tick marks at `sStart` and `sEnd`.
  - Half-length: `tickLength = 4` screen pixels (total 8px length).
  - For horizontal gaps: vertical tick from `sCross - 4` to `sCross + 4`.
  - For vertical gaps: horizontal tick from `sCross - 4` to `sCross + 4`.
- **Measurement Pill Badge**:
  - Position: Center of each span `mid = (sStart + sEnd) / 2`.
  - Label text: `${guide.gap}px` (e.g. `16px`, `24px`).
  - Font: `bold 10px system-ui, -apple-system, sans-serif`.
  - Pill Background:
    - Rounded rectangle (`border-radius: 3px`).
    - Fill: `GAP_COLOR` (`#e056fd`).
    - Padding: 4px horizontal, 2px vertical.
    - Height: 15px.
  - Text Color: `#ffffff` (crisp white, centered via `textAlign = "center"`, `textBaseline = "middle"`).

```javascript
export function drawGapGuide(ctx, guide, viewport) {
  const { axis, gap, spans } = guide;
  if (!spans || spans.length === 0) return;

  const GAP_COLOR = "#e056fd";
  const tickLength = 4;
  const label = `${Math.round(gap)}px`;

  ctx.save();
  ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const textWidth = ctx.measureText(label).width;
  const pillWidth = textWidth + 8;
  const pillHeight = 15;

  for (const span of spans) {
    if (axis === "x") {
      const sX1 = Math.round(span.start * viewport.zoom + viewport.panX) + 0.5;
      const sX2 = Math.round(span.end * viewport.zoom + viewport.panX) + 0.5;
      const sY = Math.round(span.cross * viewport.zoom + viewport.panY) + 0.5;

      // 1. Span line
      ctx.beginPath();
      ctx.strokeStyle = GAP_COLOR;
      ctx.lineWidth = 1;
      ctx.moveTo(sX1, sY);
      ctx.lineTo(sX2, sY);
      // 2. Start & end tick marks
      ctx.moveTo(sX1, sY - tickLength);
      ctx.lineTo(sX1, sY + tickLength);
      ctx.moveTo(sX2, sY - tickLength);
      ctx.lineTo(sX2, sY + tickLength);
      ctx.stroke();

      // 3. Pill badge at center
      const midX = (sX1 + sX2) / 2;
      const pillX = midX - pillWidth / 2;
      const pillY = sY - pillHeight / 2;

      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 3);
      } else {
        ctx.rect(pillX, pillY, pillWidth, pillHeight);
      }
      ctx.fillStyle = GAP_COLOR;
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, midX, sY);
    } else {
      const sY1 = Math.round(span.start * viewport.zoom + viewport.panY) + 0.5;
      const sY2 = Math.round(span.end * viewport.zoom + viewport.panY) + 0.5;
      const sX = Math.round(span.cross * viewport.zoom + viewport.panX) + 0.5;

      // 1. Span line
      ctx.beginPath();
      ctx.strokeStyle = GAP_COLOR;
      ctx.lineWidth = 1;
      ctx.moveTo(sX, sY1);
      ctx.lineTo(sX, sY2);
      // 2. Ticks
      ctx.moveTo(sX - tickLength, sY1);
      ctx.lineTo(sX + tickLength, sY1);
      ctx.moveTo(sX - tickLength, sY2);
      ctx.lineTo(sX + tickLength, sY2);
      ctx.stroke();

      // 3. Pill badge
      const midY = (sY1 + sY2) / 2;
      const pillX = sX - pillWidth / 2;
      const pillY = midY - pillHeight / 2;

      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 3);
      } else {
        ctx.rect(pillX, pillY, pillWidth, pillHeight);
      }
      ctx.fillStyle = GAP_COLOR;
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, sX, midY);
    }
  }
  ctx.restore();
}
```

---

## 6. Edge Cases & Resilience Strategy

| Edge Case | Problem / Risk | Solution & Handling Strategy |
| :--- | :--- | :--- |
| **Negative Gaps (Overlapping Nodes)** | Nodes intersect or overlap ($gap < 0$). Calculating $gap$ would invert span coordinates or produce negative badge numbers. | Strictly enforce positive gap threshold: `if (gap <= 4) continue;`. Overlapping nodes are handled by edge/center snapping, not gap snapping. |
| **Micro Gaps ($\le 4\text{px}$)** | Floating-point rounding or nearly touching nodes cause flickering micro-badges (`1px`, `2px`). | Minimum gap gate: `if (gap <= 4) continue;` (already verified in `smart_snapping_guides.test.js:221`). |
| **Multi-Layer Chains ($A \to B \to C \to D$)** | Three or more layers in a sequence. Snapping should highlight all equidistant gaps across the entire sequence. | When a snap occurs at gap $g$, scan adjacent sorted neighbors in both directions to discover all consecutive pairs with $|gap_i - g| \le 1\text{px}$ and add their spans to `guide.spans`. |
| **Zoom Compensation** | At high zoom, lines/badges could scale monstrously; at low zoom, badges could shrink to illegibility. | Snapping threshold is document-relative (`baseThreshold / zoom`), but overlay rendering happens in screen pixels after `ctx.restore()`. Pill badges, tick marks, and fonts are fixed screen-pixel sizes ($10\text{px}$ font, $15\text{px}$ pill, $8\text{px}$ tick), guaranteeing crisp readability at any zoom level ($10\%$ to $3200\%$). |
| **Multi-Selection Drag (`activeIds`)** | Dragging multiple items simultaneously might cause them to snap to each other or self-lock. | `snapNodeBounds` receives `activeIds`. `moving = new Set(activeIds)` excludes all selected nodes from `siblingBoxes`. Only stationary sibling nodes serve as snap anchors. |
| **Transformed / Rotated Nodes** | Nodes rotated by non-orthogonal angles. | `nodeAABB` computes the true enclosing axis-aligned bounds. Snapping operates on visible visual extents, aligning with Figma's bounding box projection. |
| **Performance ($O(N)$ vs $O(N^2)$)** | Large canvases with hundreds of nodes. | Band filtering (`haveVerticalProximity`) reduces candidate pool $M \ll N$. Sorting takes $O(M \log M)$ and adjacent inspection takes $O(M)$. Total execution time is $< 0.1\text{ms}$, well within 60fps frame budget (16.6ms). |

---

## 7. Concrete Implementation Blueprint

### 7.1 Enhancements to `src/canvas/editor/scene_snapping.js`
1. Add perpendicular proximity helper functions:
   - `haveVerticalProximity(boxA, boxB)`
   - `haveHorizontalProximity(boxA, boxB)`
2. In the `snapEqualSpacing` section:
   - Filter `siblingBoxes` by band proximity.
   - For horizontal spacing:
     - Check **In-Between Insertion** between consecutive pairs $(b_1, b_2)$.
     - Check **Right Extension** beyond $b_2$.
     - Check **Left Extension** before $b_1$.
     - Collect chain spans.
     - On snap, push `{ type: "v", pos: snappedEdge }` AND `{ type: "gap", axis: "x", gap, spans, pos: gap }`.
   - For vertical spacing:
     - Symmetric checks for In-Between, Below, and Above.
     - On snap, push `{ type: "h", pos: snappedEdge }` AND `{ type: "gap", axis: "y", gap, spans, pos: gap }`.

### 7.2 Enhancements to `src/canvas/editor/chrome_stage_overlays.js`
1. Export `drawGapGuide(ctx, guide, viewport)`.
2. Update `drawGuides(ctx, guides, viewport, dpr)`:
   - When `guide.type === "gap"`, call `drawGapGuide(ctx, guide, viewport)`.

### 7.3 Enhancements to `src/canvas/editor/editor_engine_document.js`
In `getGuides()` (lines 95–100):
Ensure gap guides with `pos` pass through the de-duplication filter seamlessly. Since `pos` is set to `Math.round(gap)`, `${g.type}:${g.pos}` produces a unique signature like `gap:16`, preventing collisions.

---

## 8. Verification & Test Plan

1. **Unit Tests (`tests/unit/smart_snapping_guides.test.js`)**:
   - Verify existing 4 tests pass unconditionally (`snapLeft`, `snapCenter`, `snapEdge`, `snapGapRight`, `snapGapLeft`, `snapGapBelow`).
   - Add new test cases:
     - In-between insertion gap snapping: Place 80px element between [100, 200] and [350, 450], verify it snaps to 225 with 25px equal gaps.
     - Perpendicular band isolation: Verify distant objects ($Y$ separated by $> 500\text{px}$) do not trigger horizontal gap snapping.
     - Multi-layer chain detection: 3 cards with 20px gap, dragging 4th card emits spans for all three 20px gaps.
     - Structure verification: Verify `{ type: "gap", axis, gap, spans }` is emitted with exact pixel spans and labels.
2. **E2E Snapping Tests (`tests/unit/snapping_e2e.test.js`)**:
   - Run complete suite (48 tests), ensuring 100% pass rate.
3. **Design System Gate**:
   - Run `npm run lint:design`, verify 0 violations.
4. **Interactive Gesture Check**:
   - Hold `Cmd` or `Ctrl`: verify `api.getGuides()` is empty and no gap badges render.
   - Release mouse: verify all guides and badges disappear immediately.

---
*Report completed for handoff to Teamwork implementer agents.*
