# Distribute Spacing & Transform Investigation Report (Requirement R2)

**Explorer**: Explorer 2 — Distribute Spacing & Transform Explorer  
**Working Directory**: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_distribute_2`  
**Date**: 2026-10-21  
**Scope**: Requirement R2 (Distribute Horizontal/Vertical Spacing Algorithm) & Integration with R3 (Gap Properties), Engine Layout Dispatch, and Transaction History.

---

## 1. Observation

### 1.1 Alignment & Distribution Entrypoint: `src/canvas/editor/align_ops.js`
In `src/canvas/editor/align_ops.js` (lines 19–28, 79–147, 186–208):

```javascript
// Lines 19-28
export const ALIGN_TYPES = [
  "left",
  "center",
  "right",
  "top",
  "middle",
  "bottom",
];

export const DISTRIBUTE_AXES = ["horizontal", "vertical"];

// Lines 79-112: Distribute Centers
function distributeSelection(items, axis) {
  if (items.length < 3) return items;
  const copy = items.map((it) => ({ ...it }));
  if (axis === "horizontal") {
    const sortedIndices = items
      .map((_, i) => i)
      .sort(
        (a, b) => items[a].x + items[a].w / 2 - (items[b].x + items[b].w / 2),
      );
    const first = items[sortedIndices[0]];
    const last = items[sortedIndices[sortedIndices.length - 1]];
    const startC = first.x + first.w / 2;
    const endC = last.x + last.w / 2;
    const step = (endC - startC) / (items.length - 1);
    sortedIndices.forEach((idx, i) => {
      copy[idx].x = Math.round(startC + i * step - copy[idx].w / 2);
    });
  } else {
    const sortedIndices = items
      .map((_, i) => i)
      .sort(
        (a, b) => items[a].y + items[a].h / 2 - (items[b].y + items[b].h / 2),
      );
    const first = items[sortedIndices[0]];
    const last = items[sortedIndices[sortedIndices.length - 1]];
    const startC = first.y + first.h / 2;
    const endC = last.y + last.h / 2;
    const step = (endC - startC) / (items.length - 1);
    sortedIndices.forEach((idx, i) => {
      copy[idx].y = Math.round(startC + i * step - copy[idx].h / 2);
    });
  }
  return copy;
}

// Lines 114-147: Current Tidy Up implementation
function tidyUpSelection(items, axis) {
  if (items.length < 3) return items;
  const copy = items.map((it) => ({ ...it }));
  if (axis === "horizontal") {
    const sortedIndices = items
      .map((_, i) => i)
      .sort((a, b) => items[a].x - items[b].x);
    const totalW = items.reduce((acc, it) => acc + it.w, 0);
    const minX = Math.min(...items.map((it) => it.x));
    const maxX = Math.max(...items.map((it) => it.x + it.w));
    const totalGap = maxX - minX - totalW;
    const gap = totalGap / (items.length - 1);
    let curX = minX;
    sortedIndices.forEach((idx) => {
      copy[idx].x = Math.round(curX);
      curX += copy[idx].w + gap;
    });
  } else {
    const sortedIndices = items
      .map((_, i) => i)
      .sort((a, b) => items[a].y - items[b].y);
    const totalH = items.reduce((acc, it) => acc + it.h, 0);
    const minY = Math.min(...items.map((it) => it.y));
    const maxY = Math.max(...items.map((it) => it.y + it.h));
    const totalGap = maxY - minY - totalH;
    const gap = totalGap / (items.length - 1);
    let curY = minY;
    sortedIndices.forEach((idx) => {
      copy[idx].y = Math.round(curY);
      curY += copy[idx].h + gap;
    });
  }
  return copy;
}
```

### 1.2 Coordinate Conversion & Node Patches: `src/canvas/editor/align_ops.js`
In `src/canvas/editor/align_ops.js` (lines 149–171):

```javascript
function toItems(nodes) {
  return nodes.map((node) => {
    const box = nodeAABB(node);
    return {
      item: { id: node.id, x: box.x, y: box.y, w: box.width, h: box.height },
      offsetX: node.x - box.x,
      offsetY: node.y - box.y,
      from: { x: node.x, y: node.y },
    };
  });
}

function toPatches(entries, results) {
  const patches = [];
  results.forEach((result, index) => {
    const { offsetX, offsetY, from } = entries[index];
    const x = result.x + offsetX;
    const y = result.y + offsetY;
    if (x === from.x && y === from.y) return;
    patches.push({ id: result.id, patch: { x, y } });
  });
  return patches;
}
```
`nodeAABB(node)` (from `src/canvas/editor/scene_geometry_bounds.js`) computes the exact axis-aligned bounding box covering rotated, sheared, perspective-warped, or mesh-deformed nodes. `offsetX` and `offsetY` preserve relative transforms when placing nodes at new box coordinates.

### 1.3 Engine Layout Dispatcher: `src/canvas/editor/editor_engine_groups.js`
In `src/canvas/editor/editor_engine_groups.js` (lines 172–208):

```javascript
  function layoutSelection(layout, argument) {
    const doc = getDoc();
    const units = selectionUnits();
    if (units.length === 0) return;
    const measured = units.map((unit) => {
      if (!isContainerNode(unit)) return unit;
      const box = combinedBounds(
        groupDescendants(doc, unit.id)
          .filter((node) => !isContainerNode(node))
          .map((node) => nodeAABB(node)),
      );
      return box ? { ...unit, ...box, rotation: 0, shear: 0 } : unit;
    });
    const canvasBounds = { x: 0, y: 0, w: doc.width, h: doc.height };
    const patches = layout(measured, argument, canvasBounds);
    if (!patches || patches.length === 0) return;
    let next = doc;
    for (const { id, patch } of patches) {
      const unit = measured.find((each) => each.id === id);
      const dx = (patch.x ?? unit.x) - unit.x;
      const dy = (patch.y ?? unit.y) - unit.y;
      if (dx === 0 && dy === 0) continue;
      const moved = isContainerNode(findNode(doc, id))
        ? [id, ...groupDescendants(doc, id).map((node) => node.id)]
        : [id];
      for (const memberId of moved) {
        const member = findNode(next, memberId);
        if (!member) continue;
        next = ops.updateNode(next, memberId, {
          x: member.x + dx,
          y: member.y + dy,
        });
      }
    }
    if (next === doc) return;
    commitEditorDocument("editor.layout.selection", setDoc, next);
  }
```

### 1.4 Undo/Redo Action Contract: `src/canvas/editor/editor_undo_actions.js`
In `src/canvas/editor/editor_undo_actions.js` (lines 127–133):

```javascript
  [
    "editor.layout.selection",
    "Lay out the Design Editor selection",
    "ATOMIC",
    "src/canvas/editor/editor_engine_groups.js",
    "editor.history.entry.align",
  ],
```
When `commitEditorDocument("editor.layout.selection", setDoc, next)` is called:
1. `commitEditorDocument` pushes contract `"editor.layout.selection"` to `editorActionStack`.
2. `setDoc(next)` updates the immutable document tree, generates history label `"editor.history.entry.align"`, and invokes `history.push(...)` atomically.
3. Undo (`⌘Z`) and Redo (`⇧⌘Z`) cleanly restore the exact prior/next document state in a single step.

### 1.5 UI Properties Component: `src/canvas/components/editor_properties/align_section.jsx`
In `src/canvas/components/editor_properties/align_section.jsx` (lines 192–275):
- Lines 194: `const canSpread = count >= 3;`
- Lines 218–275: Renders two sets of buttons when `count >= 2`:
  - `distributeNodes` (Distribute Centers: `axis="horizontal"|"vertical"`).
  - `tidyNodes` (Tidy Up: `axis="horizontal"|"vertical"`).
- Currently does NOT provide:
  - Custom Gap numerical input.
  - Spacing measurement display.
  - Distinct separation of Distribute Spacing vs Distribute Centers nomenclature and icons.

### 1.6 Current Test Coverage
Running `npm test`:
- 54 test files passed (540 tests passing).
- Zero tests in `tests/` currently import or test `align_ops.js` (`grep_search` found 0 matches for `align_ops` or `alignNodes` in `tests/`).

---

## 2. Logic Chain

### 2.1 Distribute Centers vs. Distribute Spacing
1. **Distribute Centers (`distributeNodes`)**:
   - Computes centers: $C_i = x_i + w_i / 2$.
   - Divides center-to-center span $C_{last} - C_{first}$ into $N - 1$ equal steps.
   - Result: Centers are equidistant ($C_{i+1} - C_i = \text{constant}$).
   - **Flaw for edge spacing**: When items have unequal widths ($w_1 \neq w_2$), the physical gaps between edges ($x_{i+1} - (x_i + w_i)$) vary drastically, causing uneven gaps to the human eye.
2. **Distribute Spacing (`distributeSpacingNodes`)**:
   - Preserves the outermost layers' positions ($minLayer$ and $maxLayer$).
   - Calculates remaining space between $minLayer$'s inner edge and $maxLayer$'s inner edge:
     $$\text{freeSpace} = (pos_{max} - (pos_{min} + size_{min})) - \sum_{k \in \text{inner}} size_k$$
   - Divides $\text{freeSpace}$ into $N - 1$ equal gap intervals:
     $$\text{gap} = \frac{\text{freeSpace}}{N - 1}$$
   - Places each inner item such that the edge-to-edge gap between adjacent items is identical.

### 2.2 Mathematical Formulation & Invariants
Given $N$ items along axis $A \in \{ \text{horizontal}, \text{vertical} \}$:
- For horizontal: $posKey = \text{'x'}, sizeKey = \text{'w'}$.
- For vertical: $posKey = \text{'y'}, sizeKey = \text{'h'}$.

#### Step 1: Spatial Ordering
Sort the items along the axis:
```javascript
const sortedIndices = items.map((_, i) => i).sort((a, b) => {
  const posA = items[a][posKey];
  const posB = items[b][posKey];
  if (Math.abs(posA - posB) > 1e-4) return posA - posB;
  const centerA = posA + items[a][sizeKey] / 2;
  const centerB = posB + items[b][sizeKey] / 2;
  if (Math.abs(centerA - centerB) > 1e-4) return centerA - centerB;
  return a - b;
});
```
This guarantees deterministic, stable ordering even when elements share an edge coordinate.

#### Step 2: Boundary Preservation & Free Space
Let:
- First index: $i_0 = sortedIndices[0]$
- Last index: $i_{last} = sortedIndices[N - 1]$
- $minLayer = items[i_0]$
- $maxLayer = items[i_{last}]$
- $innerIndices = sortedIndices.slice(1, N - 1)$
- $\text{innerSizeSum} = \sum_{idx \in innerIndices} items[idx][sizeKey]$
- $minEnd = minLayer[posKey] + minLayer[sizeKey]$
- $\text{freeSpace} = (maxLayer[posKey] - minEnd) - \text{innerSizeSum}$
- $\text{gap} = \frac{\text{freeSpace}}{N - 1}$

#### Step 3: Exact Node Placement
1. Anchor outermost layers:
   - $copy[i_0][posKey] = minLayer[posKey]$ (0px displacement)
   - $copy[i_{last}][posKey] = maxLayer[posKey]$ (0px displacement)
2. Place inner layers sequentially:
   - Accumulate continuous float position: $currentPos = minEnd + \text{gap}$
   - For $k = 0 \dots N - 3$:
     - $idx = innerIndices[k]$
     - $copy[idx][posKey] = \text{Math.round}(currentPos)$
     - $currentPos += items[idx][sizeKey] + \text{gap}$

#### Mathematical Proof of Boundary Invariant
Notice that at the end of the inner loop:
$$\begin{aligned}
currentPos &= minEnd + \text{gap} + \text{innerSizeSum} + (N - 2) \cdot \text{gap} \\
&= minEnd + \text{innerSizeSum} + (N - 1) \cdot \text{gap} \\
&= minEnd + \text{innerSizeSum} + \text{freeSpace} \\
&= minEnd + \text{innerSizeSum} + (maxLayer[posKey] - minEnd - \text{innerSizeSum}) \\
&= maxLayer[posKey]
\end{aligned}$$
Thus, the distance from the final inner layer's edge to $maxLayer[posKey]$ is mathematically guaranteed to equal $\text{gap}$. Because $copy[i_{last}][posKey]$ is explicitly assigned $maxLayer[posKey]$, no floating-point accumulation or pixel drift occurs on the boundaries.

### 2.3 Handling Degenerate Scenarios
1. **$N \le 1$ layers**: No spacing to distribute; return copies unchanged (0 patches).
2. **$N = 2$ layers**:
   - For *Distribute Spacing* (fixed boundaries): With 0 inner layers, both outermost layers are fixed, so it is a no-op (0 patches).
   - For *Custom Gap Input* (Requirement R3): Keep the first layer fixed at $pos_0$, place the second layer at $pos_0 + size_0 + targetGap$.
3. **Completely Overlapping Layers ($maxLayer[posKey] === minLayer[posKey]$)**:
   - If all layers have identical coordinates, $\text{freeSpace} \le 0$ and no outer baseline exists. Safely return items unchanged (no divide-by-zero or NaN coordinates).
4. **Negative Free Space (Overlapping Elements)**:
   - When $\text{freeSpace} < 0$, $\text{gap} = \frac{\text{freeSpace}}{N - 1} < 0$.
   - The algorithm applies negative gaps naturally: elements overlap by an equal amount ($|\text{gap}|$ px), while $minLayer$ and $maxLayer$ remain firmly fixed. This precisely mirrors Figma's behavior.
5. **Mixed Element Sizes**:
   - Because each item's actual bounding size ($items[idx][sizeKey]$) is individually accounted for in $\text{innerSizeSum}$ and added to $currentPos$, varying sizes (e.g. 20px icon, 300px card, 80px button) produce strictly identical edge-to-edge gaps.

### 2.4 Gap Measurement & Custom Gap Setting (R3 Integration)
1. **Measurement (`measureSpacing(nodes, axis)`)**:
   - Extract bounding items via `toItems(nodes)`.
   - Sort along axis.
   - For $N \ge 2$:
     $$\text{averageGap} = \frac{(pos_{last} - (pos_0 + size_0)) - \sum_{k=1}^{N-2} size_k}{N - 1} = \frac{\text{freeSpace}}{N - 1}$$
   - Return `{ avgGap: Math.round(gap), minGap, maxGap, isEquidistant }`.
2. **Setting Fixed Gap (`setSpacingNodes(nodes, axis, targetGap)`)**:
   - Anchor $sorted[0]$ at $minLayer[posKey]$.
   - For each subsequent node $i = 1 \dots N-1$:
     $$pos_i = pos_{i-1} + size_{i-1} + targetGap$$
   - Return patches via `toPatches`.

---

## 3. Caveats

1. **Rotated / Transformed Nodes**:
   - Measured by `nodeAABB(node)` (axis-aligned bounding box). This is standard in Figma and VOO: alignment aligns visible bounding boxes.
   - When updating node positions, `toPatches` computes `dx = patch.x + offsetX - node.x`, preserving rotation/shear without distorting node local geometry.
2. **Container / Group Nodes**:
   - `editor_engine_groups.js:layoutSelection` automatically measures container nodes as a single composite unit using `combinedBounds(groupDescendants)`.
   - When a container unit moves by $(dx, dy)$, all child descendants are moved by $(dx, dy)$ in lockstep.
3. **Pixel Snapping / Sub-pixel Rounding**:
   - `Math.round(currentPos)` is applied to integer node positions. When $\text{gap}$ has fractional pixels (e.g. 13.333px), gaps will naturally alternate between 13px and 14px, while outermost coordinates remain exact integers.
4. **Canvas Boundaries**:
   - Unlike edge alignment (which can align 1 element to canvas bounds), distribute spacing requires at least 2 elements (for custom gap) or 3 elements (for distribute spacing within selection).

---

## 4. Conclusion & Recommended Implementation Plan

### 4.1 Target File Modifications

#### File 1: `src/canvas/editor/align_ops.js`
1. **Add `distributeSpacingSelection(items, axis, customGap = null)`**:
   - Implements the exact free space mathematical formula.
   - Handles mixed sizes, negative free space, and boundary preservation.
   - Handles custom fixed gap if provided.
2. **Export `distributeSpacingNodes(nodes, axisOrOptions)`**:
   - Signature: `distributeSpacingNodes(nodes, axisOrOptions, canvasBounds = null)`
   - Accepts either `axis` string (`"horizontal" | "vertical"`) or `{ axis, gap }`.
   - Replaces/upgrades `tidyNodes` to use this rigorous engine.
3. **Export `measureSpacing(nodes, axis)`**:
   - Calculates current gaps and average gap across selection for the property inspector.

#### File 2: `src/canvas/components/editor_properties/align_section.jsx`
1. **Pass `selectedNodes`**:
   - Update `PropertiesPanelSections.jsx` to pass `selectedNodes={selectedNodes}` into `<AlignSection ... />`.
2. **Expose Gap Input Control**:
   - When `count >= 2`:
     - Measure current gap: `const spacing = measureSpacing(selectedNodes, dominantAxis)`.
     - Render Gap input box with icon/label (`Gap`, `间距`).
     - On input change / blur: call `onLayout((nodes) => distributeSpacingNodes(nodes, { axis, gap: newGap }))`.
3. **Clarify Distribute Buttons**:
   - Distribute Centers (`distributeNodes`): Tooltip "Distribute horizontal/vertical centers" / "水平/垂直中心均分".
   - Distribute Spacing (`distributeSpacingNodes`): Tooltip "Distribute horizontal/vertical spacing" / "水平/垂直等间隙均分".

### 4.2 Code Blueprint for `src/canvas/editor/align_ops.js`

```javascript
/**
 * Distribute edge-to-edge spacing evenly between elements along an axis.
 * Outermost boundary layers remain firmly anchored; inner layers are spaced evenly.
 */
export function distributeSpacingSelection(items, axis, customGap = null) {
  if (items.length < 2) return items;
  if (customGap === null && items.length < 3) return items;

  const posKey = axis === "horizontal" ? "x" : "y";
  const sizeKey = axis === "horizontal" ? "w" : "h";

  const sortedIndices = items
    .map((_, i) => i)
    .sort((a, b) => {
      const posA = items[a][posKey];
      const posB = items[b][posKey];
      if (Math.abs(posA - posB) > 1e-4) return posA - posB;
      const centerA = posA + items[a][sizeKey] / 2;
      const centerB = posB + items[b][sizeKey] / 2;
      if (Math.abs(centerA - centerB) > 1e-4) return centerA - centerB;
      return a - b;
    });

  const firstIdx = sortedIndices[0];
  const lastIdx = sortedIndices[sortedIndices.length - 1];
  const minLayer = items[firstIdx];
  const maxLayer = items[lastIdx];

  // If all items are completely stacked at the same position, no span exists
  if (customGap === null && Math.abs(maxLayer[posKey] - minLayer[posKey]) < 1e-4) {
    return items;
  }

  const copy = items.map((it) => ({ ...it }));

  if (customGap !== null && customGap !== undefined) {
    // Custom Gap Mode (R3): First element stays fixed, subsequent elements spaced by customGap
    let cur = minLayer[posKey];
    sortedIndices.forEach((idx, i) => {
      if (i === 0) {
        copy[idx][posKey] = minLayer[posKey];
      } else {
        copy[idx][posKey] = Math.round(cur);
      }
      cur = (i === 0 ? minLayer[posKey] : copy[idx][posKey]) + items[idx][sizeKey] + customGap;
    });
    return copy;
  }

  // Automatic Distribute Spacing (R2)
  const innerIndices = sortedIndices.slice(1, -1);
  const innerSizeSum = innerIndices.reduce(
    (sum, idx) => sum + items[idx][sizeKey],
    0,
  );
  const minEnd = minLayer[posKey] + minLayer[sizeKey];
  const freeSpace = maxLayer[posKey] - minEnd - innerSizeSum;
  const gap = freeSpace / (items.length - 1);

  copy[firstIdx][posKey] = minLayer[posKey];
  copy[lastIdx][posKey] = maxLayer[posKey];

  let currentPos = minEnd + gap;
  for (let i = 0; i < innerIndices.length; i++) {
    const idx = innerIndices[i];
    copy[idx][posKey] = Math.round(currentPos);
    currentPos += items[idx][sizeKey] + gap;
  }

  return copy;
}

export function distributeSpacingNodes(nodes, axisOrOptions) {
  const axis = typeof axisOrOptions === "string" ? axisOrOptions : axisOrOptions?.axis;
  const customGap = typeof axisOrOptions === "object" ? axisOrOptions?.gap : null;
  if (!DISTRIBUTE_AXES.includes(axis)) return [];
  const entries = toItems(nodes);
  return toPatches(
    entries,
    distributeSpacingSelection(
      entries.map((entry) => entry.item),
      axis,
      customGap,
    ),
  );
}

/**
 * Measure edge-to-edge gap across nodes along an axis.
 */
export function measureSpacing(nodes, axis = "horizontal") {
  if (!nodes || nodes.length < 2) return null;
  const posKey = axis === "horizontal" ? "x" : "y";
  const sizeKey = axis === "horizontal" ? "w" : "h";
  const items = nodes.map((n) => {
    const b = nodeAABB(n);
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });

  items.sort((a, b) => a[posKey] - b[posKey]);
  const gaps = [];
  for (let i = 0; i < items.length - 1; i++) {
    gaps.push(items[i + 1][posKey] - (items[i][posKey] + items[i][sizeKey]));
  }
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return {
    avgGap: Math.round(avg),
    minGap: Math.min(...gaps),
    maxGap: Math.max(...gaps),
    isEquidistant: gaps.every((g) => Math.abs(g - avg) < 1),
  };
}
```

---

## 5. Verification Method

### 5.1 Dedicated Unit Test Suite: `tests/unit/distribute_spacing.test.js`
Create a new Vitest unit test suite covering:
1. **Basic Distribute Spacing (3 equal elements)**:
   - 3 rects of 100x100 at x = [0, 150, 400].
   - Widths = 100 each. Outermost: 0..100 and 400..500.
   - Free space = (400 - 100) - 100 = 200.
   - Gap = 200 / 2 = 100.
   - Expected positions: [0, 200, 400].
   - Assert `minLayer` and `maxLayer` positions are unchanged.
2. **Mixed Element Sizes (4 elements)**:
   - Rects with widths: 50, 120, 30, 80 at x = [0, 100, 300, 600].
   - Verify all 3 gaps are equal to within 1 pixel.
3. **Negative Free Space (Overlapping)**:
   - 3 rects with widths 100 at x = [0, 50, 160].
   - Span between outermost: 160 - 100 = 60.
   - Free space = 60 - 100 = -40.
   - Gap = -20.
   - Verify rects overlap evenly by 20px, with positions [0, 80, 160].
4. **Degenerate Cases**:
   - $N = 0, 1, 2$: returns 0 patches for distribute spacing without errors.
   - Completely overlapping items ($x=100, w=50$ for all): returns 0 patches.
5. **Custom Gap (R3)**:
   - 2 rects at x = [0, 200], width 50, set gap = 30.
   - Output: rect 1 at 0, rect 2 at 80.
6. **Vertical Axis Symmetry**:
   - Run identical tests with `axis="vertical"`.
7. **Container / Group Nodes with Rotated Children**:
   - Verify `toItems` and `toPatches` handle rotated children correctly using `nodeAABB`.

### 5.2 Command Verification
1. **Unit Test Execution**:
   ```bash
   npm test
   ```
   Must pass 100% of tests including the new `tests/unit/distribute_spacing.test.js`.
2. **Design Token & Style Linter**:
   ```bash
   npm run lint:design
   ```
   Must report `design: clean — 0 violations`.
3. **Build Check**:
   ```bash
   npm run build
   ```
   Must bundle cleanly without module syntax errors.
4. **Deployment & Liveness Probe**:
   ```bash
   VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh
   curl -s -o /dev/null -w "%{http_code}\n" https://la.voo.run/editor/
   ```
   Must return HTTP 200.

### 5.3 Invalidation Conditions
This report's conclusions become invalid if:
- The coordinate contract of `nodeAABB` is changed to return unrotated bounding boxes instead of world AABBs.
- The undo contract domain for `"editor.layout.selection"` is moved away from atomic document commits.
