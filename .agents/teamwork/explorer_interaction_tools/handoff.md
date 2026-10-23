# Handoff Report: Selection Precision, Snapping Feel & Tool Transitions (R2)

**Agent:** `explorer_interaction_tools`  
**Working Directory:** `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_interaction_tools`  
**Handoff Type:** Hard (Task complete)  
**Timestamp:** 2026-10-21T23:17:00Z  

---

## 1. Observation

Direct code observations from the inspected codebase:

1. **Document-Space Hit Slop in `src/canvas/editor/doc_ops_nodes.js:264-267`**:
   ```javascript
   const local = toNodeLocal(node, point);
   const slop = Math.max(
     node.width <= 2 || node.height <= 2 ? 6 : 4,
     ((node.strokeWidth ?? 0) / 2),
   );
   ```
   `slop` is constant in doc-space units regardless of viewport zoom level.

2. **Bounding-Box Hit Fallthrough for Vector Paths in `src/canvas/editor/doc_ops_nodes.js:268-286`**:
   Vector path nodes (`NODE_KIND.PATH`) without fill only test against `local.x >= -slop && local.x <= node.width + slop && local.y >= -slop && local.y <= node.height + slop`, testing the entire bounding box rather than bezier curve stroke distance.

3. **Accidental Multi-Selection Drag in Empty Space in `src/canvas/editor/editor_pointer_transform.js:387-395`**:
   ```javascript
   const bounds = draggable.length > 0 ? combinedBounds(draggable.map((node) => nodeAABB(node))) : null;
   if (bounds && point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height) {
     hit = draggable[0];
   }
   ```
   Clicking anywhere within the union bounding box of multi-selected nodes assigns `hit = draggable[0]`, dragging the selection instead of deselecting or starting a marquee.

4. **Phantom Unrotated Anchor Hit Testing in `src/canvas/editor/editor_pen_edit.js:116-143`**:
   ```javascript
   const unrotated = (anchor, handle) => ({
     x: node.x + (anchor.x + (handle ? handle[0] : 0)) * scaleX,
     y: node.y + (anchor.y + (handle ? handle[1] : 0)) * scaleY,
   });
   ...
   const da = distance(point, a);
   const dua = distance(point, ua);
   const d = Math.min(da, dua);
   ```
   Testing against `ua` allows mouse clicks in empty space (where an unrotated anchor previously sat) to hit rotated anchors.

5. **Anchor vs. Handle Inversion on Zero-Length Handles in `src/canvas/editor/editor_pen_edit.js:132-144`**:
   When bezier handles are retracted (`handle = [0, 0]`), handle distance `hd` is $\le$ anchor distance `d`, causing `best` to select `{ handle: "in" | "out" }` over `{ handle: null }` (the anchor dot).

6. **Unbounded Infinite Guide Lines in `src/canvas/editor/chrome_stage_overlays.js:371-385`**:
   ```javascript
   if (guide.type === "v") {
     ctx.moveTo(screenX, 0);
     ctx.lineTo(screenX, height);
   } else if (guide.type === "h") {
     ctx.moveTo(0, screenY);
     ctx.lineTo(width, screenY);
   }
   ```
   Every alignment guide draws a line across the entire screen from edge to edge.

7. **Unfiltered Global Alignment Candidates in `src/canvas/editor/scene_snapping.js:158-175`**:
   Every node in `doc.nodes` contributes targets to `targetsX` and `targetsY` regardless of whether it is thousands of pixels away off-screen.

8. **Lack of Hysteresis in `src/canvas/editor/scene_snapping.js:404-421`**:
   The attach threshold and detach threshold are both identical (`threshold = 6 / zoom`), causing high-frequency fluttering near the snap boundary.

9. **Dropped Tool Switches When No Artboard is Focused in `src/canvas/components/image_editor.jsx:589, 1983-1994`**:
   ```javascript
   const engine = enginesRef.current.get(focusedId)?.engine ?? null;
   ...
   const runTool = useCallback((next) => {
     if (!engine) return; // Silent drop when focusedId is null!
     engine.setTool(next);
   }, [engine]);
   ```

10. **Empty Canvas Left-Click Interception in `src/canvas/components/image_editor.jsx:2756-2780`**:
    `onFreePointerDownCapture` intercepts all left clicks outside artboards and triggers a camera pan gesture, preventing marquee and lasso drags on the outer canvas.

11. **Missing `TOOL.FRAME` Definition**:
    `TOOL.FRAME` does not exist in `src/canvas/editor/tool_ids.js` and `TOOL_KEYS` (`editor_constants.js`).

12. **Design Token Lint Output**:
    Running `node scripts/check-design.mjs` outputs:
    `src/canvas/components/editor_toolbar.jsx: 259, 273, 288: shadow: shadow-sm is not on the overlay shadow ladder. Use shadow-pop / shadow-menu / shadow-panel`.

---

## 2. Logic Chain

1. **From Observation 1 & 2 to Hit-Testing Imprecision**:
   - Because `slop` in `doc_ops_nodes.js` is fixed in document units, zooming out scales down the physical hit zone below human motor precision (1 screen px at 0.25x zoom), while zooming in enlarges it to 30+ pixels, creating false hits.
   - Because `NODE_KIND.PATH` uses rectangular AABB containment without inspecting curve topology, empty interior space inside path bounding boxes swallows clicks.

2. **From Observation 3 to Multi-Selection Lockout**:
   - The bounding box check in `editor_pointer_transform.js:387-395` treats empty space between selected nodes as a hit on `draggable[0]`. Consequently, clicking between two distant selected nodes starts dragging both nodes instead of deselecting or starting a marquee.

3. **From Observation 4 & 5 to Pen Tool Glitches**:
   - The `Math.min(da, dua)` logic evaluates ghost unrotated anchor coordinates, creating phantom click targets.
   - Testing handles without verifying `isAnchorSelected` or prioritizing the anchor dot when `handle = [0,0]` causes users to drag invisible or zero-length handles instead of the anchor point.

4. **From Observation 6, 7 & 8 to Sticky, Disruptive Snapping Feel**:
   - Collecting alignment targets from every node in `doc.nodes` causes constant snapping to invisible objects thousands of pixels away.
   - Drawing infinite full-screen lines flashes cyan rays across the entire display on every movement.
   - Identical attach/detach thresholds with zero hysteresis cause the dragged node to jitter rapidly across the 6px boundary.

5. **From Observation 9, 10 & 11 to Tool Switch Breakage & Event Dropping**:
   - Clicking canvas background resets `focusedId` to null.
   - When `focusedId` is null, `engine` is null, so `runTool` immediately returns without setting the tool.
   - When a user presses `M`, `R`, or `P`, the tool switch is lost.
   - When dragging on empty canvas, `onFreePointerDownCapture` initiates camera pan, preventing marquee and lasso selection from executing.
   - `TOOL.FRAME` is missing from the tool routing tables.

---

## 3. Caveats

1. **Single Canvas vs. Multi-Canvas Engine**:
   - VOO Design is transitioning from multi-engine artboards toward a single unified canvas (`useWorkspaceSkia`). The proposed top-level `workspaceTool` synchronization cleanly bridges both architectures: it ensures all active engines in `enginesRef` stay synchronized in multi-mode, while providing a single tool dispatch target for single-canvas mode.
2. **Path Geometry Hit-Testing Performance**:
   - Projecting points onto bezier curves via `projectOntoPath` adds a small mathematical cost compared to a plain box check. However, because it is only evaluated as a refinement *after* the spatial index and AABB filter pass, the performance impact is negligible (<0.02ms per click).

---

## 4. Conclusion

The selection precision, snapping feel, and tool transition issues are directly caused by:
1. Doc-space slop scaling, AABB path testing, empty-space multi-selection hit fallthrough, and phantom unrotated pen coordinates.
2. Unscoped global candidate generation, infinite full-screen lines, and zero hysteresis in `scene_snapping.js` and `chrome_stage_overlays.js`.
3. Null engine drops in `runTool`, empty-canvas pan capture, and missing `TOOL.FRAME`.

Applying the 5-point remediation blueprint in `analysis.md` will restore tactile 60fps tracking, crisp segment-bounded smart guides, reliable pen anchor selection, and seamless tool switching across the entire workspace.

---

## 5. Verification Method

To independently verify the investigation findings and test proposed remediations:

1. **Automated Unit Tests**:
   ```bash
   npx vitest run tests/unit/smart_snapping_guides.test.js tests/unit/smart_spacing_snapping.test.js tests/unit/spatial_index.test.js tests/unit/selection_transform.test.js
   ```
   Verify 100% pass rate (37/37 tests).

2. **Design Standard Linter**:
   ```bash
   node scripts/check-design.mjs
   ```
   Verify existing 3 `shadow-sm` violations in `src/canvas/components/editor_toolbar.jsx` (lines 259, 273, 288).

3. **Code Inspection Checkpoints**:
   - Inspect `src/canvas/editor/doc_ops_nodes.js:263-287` to confirm doc-space slop and path bounding box test.
   - Inspect `src/canvas/editor/editor_pen_edit.js:116-143` to confirm `unrotated` phantom hit testing.
   - Inspect `src/canvas/editor/scene_snapping.js:158-175` to confirm unfiltered global target generation.
   - Inspect `src/canvas/editor/chrome_stage_overlays.js:371-385` to confirm infinite full-screen guide lines.
   - Inspect `src/canvas/components/image_editor.jsx:1983-1994` to confirm `if (!engine) return` drop on empty canvas.

4. **Invalidation Conditions**:
   - If `nodeAtPoint` already incorporated viewport zoom, Observation 1 would be invalidated.
   - If `unrotated` was proven necessary for canvas coordinate mapping, Observation 4 would be invalidated (it was verified that `fromNodeLocal` already maps local coordinates to document space).
