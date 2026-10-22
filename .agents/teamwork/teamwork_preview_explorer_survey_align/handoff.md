# Handoff Report: Align & Distribute Ops Survey

## 1. Observation

- **Target Files Examined**:
  - `src/canvas/editor/align_ops.js`:
    - Lines 79–112: `distributeSelection(items, axis)` sorts by center (`items[a].x + items[a].w / 2`), computes `startC`, `endC`, `step = (endC - startC) / (items.length - 1)`, and re-positions every item including outer ones using `copy[idx].x = Math.round(startC + i * step - copy[idx].w / 2)`.
    - Lines 114–147: `tidyUpSelection(items, axis)` sorts by `a.x - b.x` only, computes `totalGap = maxX - minX - totalW`, and sequentially mutates `curX` using `copy[idx].x = Math.round(curX); curX += copy[idx].w + gap`. The right anchor item is not explicitly pinned and can drift by $\pm 1\text{px}$ due to cumulative floating point rounding.
    - Lines 149–171: `toItems(nodes)` uses `nodeAABB(node)` to measure bounding boxes for transformed/rotated nodes, storing `offsetX = node.x - box.x` and `offsetY = node.y - box.y`. `toPatches` converts items back to coordinate deltas.
  - `src/canvas/editor/editor_engine_groups.js`:
    - Lines 172–208: `layoutSelection(layout, argument)` accepts a layout generator function and arbitrary argument payload. If a node is a container (`isContainerNode`), it measures descendants via `combinedBounds`, applies translation $(dx, dy)$ to the container and all `groupDescendants`, and commits atomically via `commitEditorDocument("editor.layout.selection", setDoc, next)`.
  - `src/canvas/editor/editor_engine_nodes.js`:
    - Lines 61–75: `selectionUnits()` filters out locked layers (`node.locked` and `isLockedByGroup(doc, node)`) and resolves grouped nodes to their top-level group unit.
  - `src/canvas/editor/editor_undo_actions.js`:
    - Lines 127–133: `"editor.layout.selection"` is registered as an `ATOMIC` boundary with history label `"editor.history.entry.align"`.
  - `src/canvas/components/editor_properties/align_section.jsx`:
    - Lines 218–275: Renders distribute center buttons (`distributeNodes`) and tidy buttons (`tidyNodes`), disabled when `count < 3` (`canSpread = count >= 3`). No Gap measurement or interactive numeric input exists.
  - `vendor/voo-canvas-core/dist/lib/align.js`:
    - Lines 47–79: Core library `distributeSelection` explicitly preserves outer items via `if (i === 0 || i === sorted.length - 1) { moved.set(it.id, ...); return; }`.

- **Test Infrastructure Verification**:
  - Ran `npm run lint:design`: passed with 0 violations across 797 files.
  - Ran `npx vitest run tests/unit/smart_snapping_guides.test.js`: passed (4 tests).
  - Search for align tests (`tests/unit/*align*`): no tests currently exist for `align_ops.js`.

---

## 2. Logic Chain

1. **Distribute Centers vs. Distribute Spacing**:
   - Observation: `distributeSelection` calculates $C_i = C_0 + i \cdot \text{step}$.
   - Logic: When items have disparate widths $w_i$, the whitespace between item $i$ and item $i+1$ is $\text{gap}_i = C_{i+1} - C_i - (w_{i+1} + w_i)/2 = \text{step} - (w_{i+1} + w_i)/2$. If $w_{i+1} \ne w_i$, gaps are unequal.
   - Inference: Professional designers require a distinct "Distribute Spacing" (equal whitespace) algorithm where $\text{gap}_i = g$ for all $i$.

2. **Outer Anchor Invariance & Rounding Drift**:
   - Observation: `tidyUpSelection` accumulates `curX += copy[idx].w + gap` sequentially with `Math.round(curX)`.
   - Logic: For fractional $g = G_{\text{total}} / (N - 1)$, accumulating unrounded floats and rounding each step does not guarantee $X_0 + \sum W_i + (N-1)g = X_{N-1}$. The final item can land at $X_{N-1} \pm 1\text{px}$.
   - Inference: Outer items $A_0$ and $A_{N-1}$ must be strictly pinned: $A_0.x' = X_0$ and $A_{N-1}.x' = X_{N-1}$. Intermediate items $k \in \{1, \dots, N-2\}$ must evaluate closed-form $P_k = X_0 + \sum_{j=0}^{k-1} W_j + k \cdot g$ rounded with `Math.round(P_k)`, eliminating cumulative drift.

3. **Explicit Gap $K$ Across $N \ge 2$**:
   - Observation: Current UI in `align_section.jsx` disables operations for $N = 2$.
   - Logic: While Distribute Spacing needs $N \ge 3$ because outer anchors are fixed, setting an explicit gap $K$ works for $N \ge 2$ by anchoring the first item $A_0$ and translating subsequent items by $A_i.x' = A_0.x + \sum_{j=0}^{i-1} W_j + i \cdot K$.
   - Inference: Adding a Gap numeric input in `align_section.jsx` for $N \ge 2$ alongside average gap measurement completes the Figma-grade spacing workflow.

4. **Engine Undo/Redo Compatibility**:
   - Observation: `layoutSelection(layout, argument)` already handles container descendants and commits via `commitEditorDocument("editor.layout.selection", setDoc, next)` (atomic).
   - Logic: Calling `layoutSelection(setGapNodes, { axis, gap })` requires zero modifications to the undo/redo engine or transaction stack.

---

## 3. Caveats

- **Concentric / Identically Positioned Items**: If multiple items have identical left edges and identical centers, the multi-tier sort breaks ties using the original index in the selection array to maintain deterministic behavior.
- **Enclosed Items**: If one giant item completely encloses other items along an axis, distributing spacing between them will push internal items within the enclosing span; if the enclosing item is one of the outer anchors, it remains fixed.
- **Auto-layout Containers**: If nodes are children of an Auto-layout Frame, their layout is governed by the parent frame's `autoLayout` properties rather than freeform canvas absolute positioning. The align section operates on freeform canvas selection units.

---

## 4. Conclusion

- Distribute Centers and Distribute Spacing must be strictly segregated as two distinct operations in both code and UI.
- The mathematical formulation for Distribute Spacing guarantees:
  1. Outer two items strictly pinned: $A_0.x' = X_0$ and $A_{N-1}.x' = X_{N-1}$.
  2. Exact equalized gap: $g = (X_{N-1} - X_0 - \sum_{i=0}^{N-2} W_i) / (N - 1)$.
  3. Closed-form coordinate evaluation eliminating cumulative rounding drift.
  4. Robust handling of negative gaps, overlapping items, and variable sizes.
- Setting explicit Gap $K$ applies to $N \ge 2$ items, anchoring the first item and translating subsequent items.
- Full survey details and drop-in code specifications are documented in:
  `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_align/report.md`.

---

## 5. Verification Method

1. **Verify Report Content**:
   Inspect `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_align/report.md` for complete mathematical proofs and implementation specifications.
2. **Execute Design System Linter**:
   Run `npm run lint:design` to confirm zero violations against `Design.md`.
3. **Execute Vitest Unit Tests**:
   Run `npx vitest run` to ensure existing tests pass cleanly without regression.
4. **Invalidation Conditions**:
   - If outer items move during a Distribute Spacing operation.
   - If rounding accumulates more than $1\text{px}$ disparity between consecutive gaps.
   - If Gap $K$ cannot be applied to 2 selected items.
