# Handoff Report: Snapping & Overlays Architectural Survey

## 1. Observation

Direct observations made from the codebase:
1. **`src/canvas/editor/scene_snapping.js` (lines 348–396)**:
   - Contains prototype equidistant snapping:
     ```javascript
     if (snapEqualSpacing && siblingBoxes.length >= 2) {
       const sortedX = [...siblingBoxes].sort((a, b) => a.x - b.x);
       for (let i = 0; i < sortedX.length - 1; i += 1) {
         const b1 = sortedX[i];
         const b2 = sortedX[i + 1];
         const gap = b2.x - (b1.x + b1.width);
         if (gap > 4) {
           const targetRight = b2.x + b2.width + gap;
           ...
           const targetLeft = b1.x - gap - rect.width;
           ...
     ```
   - Only checks outside placement (`targetRight` and `targetLeft`). No insertion/in-between logic exists.
   - Sibling boxes are sorted globally by X or Y with no perpendicular proximity filter.
   - Emits only `guides.push({ type: "v", pos: activeGuideX })` or `{ type: "h", pos: activeGuideY }`. No gap spans, tick marks, or pill badges are generated.
2. **`src/canvas/editor/chrome_stage_overlays.js` (lines 169–198)**:
   - `drawGuides(ctx, guides, viewport, dpr)` iterates over `guides`:
     ```javascript
     for (const guide of guides) {
       ctx.beginPath();
       if (guide.type === "v") {
         const screenX = Math.round(guide.pos * viewport.zoom + viewport.panX) + 0.5;
         ctx.moveTo(screenX, 0);
         ctx.lineTo(screenX, height);
       } else if (guide.type === "h") {
         const screenY = Math.round(guide.pos * viewport.zoom + viewport.panY) + 0.5;
         ctx.moveTo(0, screenY);
         ctx.lineTo(width, screenY);
       }
       ctx.stroke();
     }
     ```
   - It only handles `guide.type === "v"` and `guide.type === "h"`. It does not handle any gap guides, tick marks, or text pill badges.
3. **`src/canvas/editor/editor_pointer_move.js` (lines 356–376)**:
   - Snapping bypass check:
     ```javascript
     const bypassSnap =
       Boolean(event.metaKey || event.ctrlKey) ||
       api.getSnappingEnabled?.() === false;
     ```
   - When `bypassSnap === true`, `snap = { x: bounds.x, y: bounds.y, guides: [] }`.
   - Snap correction is applied to all moved nodes via `api.updateNode(..., { commit: false })`.
   - Emits guides via `api.setGuides(snap.guides)`.
4. **`src/canvas/editor/editor_pointer.js` (line 295)**:
   - On pointer up: `api.setGuides([])` is unconditionally called, instantly clearing all active guides.
5. **`tests/unit/smart_snapping_guides.test.js` (line 59)**:
   - Asserts:
     ```javascript
     expect(snapGapRight.guides.some((g) => g.type === "v" && g.pos === 400)).toBe(true);
     ```
   - Requires that gap snaps along the horizontal axis continue to provide `{ type: "v", pos: target }` alongside any new `{ type: "gap", ... }` objects to maintain backwards compatibility.
6. **Test Suite Status**:
   - `npx vitest run tests/unit/smart_snapping_guides.test.js tests/unit/snapping_controller.test.js tests/unit/snapping_e2e.test.js` runs 3 test files (55 tests) and all 55 pass in 460ms.
   - `npm run lint:design` reports clean across 797 files.

## 2. Logic Chain

1. From **Observation 1**, `scene_snapping.js` computes snapping coordinates by iterating over candidate bounding boxes. However, because it only checks placing an element to the right of `b2` or left of `b1`, inserting an object between two existing boxes (`b1` and `b2`) fails to snap when the left and right gaps equalize.
2. From **Observation 1**, sorting sibling boxes without a cross-axis proximity filter means two boxes separated by thousands of pixels vertically will form an erroneous horizontal gap pair. Adding a cross-axis overlap filter (`haveVerticalProximity` for horizontal gaps and `haveHorizontalProximity` for vertical gaps) will isolate genuine row/column neighbors.
3. From **Observation 2**, `chrome_stage_overlays.js:drawGuides` executes after `ctx.restore()` in `chrome_draw.js:274`, where canvas coordinates are in screen pixels scaled by DPR. This allows drawing fixed-size screen badges ($15\text{px}$ pill, $10\text{px}$ font, $8\text{px}$ tick marks) that remain crisp regardless of the viewport zoom factor.
4. From **Observations 1 and 2**, introducing a structured guide object `{ type: "gap", axis, gap, pos: gap, spans: [...] }` allows `scene_snapping.js` to communicate both the reference gap and dragged gap spans directly to `drawGapGuide` in `chrome_stage_overlays.js`.
5. From **Observation 5**, keeping `{ type: "v", pos: snappedEdge }` (or `{ type: "h", pos: snappedEdge }`) in the returned `guides` array alongside `{ type: "gap", ... }` guarantees that existing unit tests pass without regression while enabling rich dimension overlays.
6. From **Observations 3 and 4**, the existing gesture pipeline already handles `Cmd`/`Ctrl` modifier bypass and pointer-up guide cleanup cleanly without requiring architecture modifications to `editor_pointer_move.js` or `editor_pointer.js`.

## 3. Caveats

1. **Complex Auto-Layout Containers**: When layers are inside nested flex frames / auto-layout groups, their positions may be governed by parent auto-layout layout passes rather than free-form canvas coordinates. This investigation scoped free-form canvas layer movement and drag transformations.
2. **Oblique / Non-Orthogonal Rotations**: `scene_geometry_bounds.js:nodeAABB` computes enclosing axis-aligned bounding boxes for rotated nodes. While gap snapping on AABBs matches Figma's bounding box projection behavior, true rotated-axis spacing (e.g. projecting along a 45-degree angle) is out of scope for standard 2D axis snapping.
3. **No Code Modifications**: Per explorer role constraints, no source code was modified. Complete implementation specifications, algorithms, and code blueprints are provided in `report.md`.

## 4. Conclusion

The current snapping and overlay architecture in VOO Design is cleanly decoupled and well-suited for adding professional Smart Spacing Guides and Gap Snapping:
- **`src/canvas/editor/scene_snapping.js`** can be upgraded to support:
  1. In-between insertion gap snapping ($availableSpace / 2$).
  2. Collinear extension gap snapping (left/right, top/bottom).
  3. Multi-layer chain detection.
  4. Perpendicular band proximity filtering.
  5. Dual guide emission (`{ type: "v" | "h", pos }` for compatibility + `{ type: "gap", axis, gap, spans }` for overlays).
- **`src/canvas/editor/chrome_stage_overlays.js`** can be upgraded with a dedicated `drawGapGuide` function rendering:
  1. Solid pink/purple hairlines (`#e056fd` or `#ff3b77`).
  2. Perpendicular end tick marks ($8\text{px}$ T-bars).
  3. Centered rounded pill badges displaying `${gap}px` with crisp white typography.
- Existing gesture lifecycle (`editor_pointer_move.js`, `editor_pointer_transform.js`, `editor_pointer.js`) already correctly handles `Cmd`/`Ctrl` bypass, magnetic toggling, and pointer-up cleanup without requiring changes.

## 5. Verification Method

To independently verify the investigation findings and implementation readiness:
1. **Inspect Survey Report**:
   Read `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_snapping/report.md`.
2. **Execute Existing Test Baseline**:
   ```bash
   npx vitest run tests/unit/smart_snapping_guides.test.js tests/unit/snapping_controller.test.js tests/unit/snapping_e2e.test.js
   ```
   *Expected outcome*: 55 passing tests.
3. **Execute Design System Linter**:
   ```bash
   npm run lint:design
   ```
   *Expected outcome*: Clean (0 violations).
4. **Invalidation Conditions**:
   - If `tests/unit/smart_snapping_guides.test.js:59` fails when omitting `{ type: "v", pos }`, it confirms that dual guide emission is strictly required for backwards compatibility.
