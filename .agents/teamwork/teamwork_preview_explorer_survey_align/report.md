# Comprehensive Survey & Specification Report: Align & Distribute Ops

**Investigation Subject**: Alignment, Distribute Centers, Distribute Spacing (Equal Gaps), and Explicit Gap $K$ Controls in VOO Design.  
**Author**: Align & Distribute Explorer Subagent  
**Date**: 2026-10-20  
**Target Files Analyzed**:
- `src/canvas/editor/align_ops.js`
- `src/canvas/editor/editor_engine_groups.js`
- `src/canvas/editor/editor_engine_nodes.js`
- `src/canvas/undo-action-contracts.js`
- `src/canvas/editor/editor_undo_actions.js`
- `src/canvas/components/editor_properties/align_section.jsx`
- `src/canvas/components/editor_properties/properties_panel_sections.jsx`
- `vendor/voo-canvas-core/dist/lib/align.js`

---

## 1. Executive Summary

In professional design software (such as Figma and Affinity Designer), multi-object arrangement comprises two distinct distribution paradigms:
1. **Distribute Centers**: Equalizes distance between the center coordinates of consecutive shapes. When shapes have unequal sizes, the visual whitespace (gaps) between them is unequal.
2. **Distribute Spacing (Equal Gaps / Tidy Up)**: Equalizes the clear edge-to-edge whitespace between consecutive shapes while strictly keeping the outermost two shapes fixed in place.
3. **Explicit Gap $K$**: Adjusts the edge-to-edge distance between consecutive shapes to an exact user-specified pixel value (e.g. `16px`, `24px`), applicable to both 2 items and $3+$ items.

Our code investigation revealed that while VOO Design contains an initial `distributeSelection` and `tidyUpSelection` in `src/canvas/editor/align_ops.js`, the current implementation has key defects:
- `tidyUpSelection` accumulates sequential floating-point coordinates with `Math.round(curX)`, causing the last anchor shape to drift by $\pm 1\text{px}$ instead of remaining strictly pinned.
- Sorting is solely by `a.x - b.x` without tie-breakers, leading to unstable ordering when objects share edge positions or overlap.
- The UI in `align_section.jsx` disables spreading for 2 items (`count < 3`) and completely lacks an interactive Gap measurement and numeric input control.
- No Vitest unit test suite exists for alignment and distribution operations.

This report provides the exact mathematical formulations, closed-form equations, robust algorithms, edge-case solutions, undo/redo integration paths, and UI designs required to achieve full parity with Figma.

---

## 2. Codebase Dissection & Current State

### 2.1 `src/canvas/editor/align_ops.js`

`align_ops.js` acts as the geometric layout engine for selections. It transforms node objects into normalized coordinate items, executes the layout mathematics, and outputs minimal patch diffs (`{ id, patch: { x, y } }`).

#### Measurement & Coordinate Normalization:
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
```
- Rotated or transformed shapes are measured using their Axis-Aligned Bounding Box (`nodeAABB(node)`).
- When a patch changes the bounding box position to `result.x`, the original node coordinate is restored via `x = result.x + offsetX`, ensuring shape rotation anchors and internal origins remain undisturbed.

#### Existing Distribute Centers (`distributeSelection`):
```javascript
function distributeSelection(items, axis) {
  if (items.length < 3) return items;
  const copy = items.map((it) => ({ ...it }));
  if (axis === "horizontal") {
    const sortedIndices = items
      .map((_, i) => i)
      .sort((a, b) => items[a].x + items[a].w / 2 - (items[b].x + items[b].w / 2));
    const first = items[sortedIndices[0]];
    const last = items[sortedIndices[sortedIndices.length - 1]];
    const startC = first.x + first.w / 2;
    const endC = last.x + last.w / 2;
    const step = (endC - startC) / (items.length - 1);
    sortedIndices.forEach((idx, i) => {
      copy[idx].x = Math.round(startC + i * step - copy[idx].w / 2);
    });
  } ...
}
```
- **Characteristics**: Sorts by center point; sets center of item $i$ to $C_i = C_0 + i \cdot \text{step}$.
- **Defect in Current Implementation**: For $i = 0$ and $i = N - 1$, `Math.round(startC + i * step - copy[idx].w / 2)` can produce a $1\text{px}$ jitter due to floating point roundoff rather than strictly guaranteeing identity for the first and last items.

#### Existing Tidy Up (`tidyUpSelection`):
```javascript
function tidyUpSelection(items, axis) {
  if (items.length < 3) return items;
  const copy = items.map((it) => ({ ...it }));
  if (axis === "horizontal") {
    const sortedIndices = items.map((_, i) => i).sort((a, b) => items[a].x - items[b].x);
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
  } ...
}
```
**Critical Bugs & Deficiencies**:
1. **Cumulative Drift**: `curX += copy[idx].w + gap` adds unrounded floating-point `gap` across items. When $N=4$ and $\text{gap} = 10.333$, item 3 may round to $X_{\text{last}} \pm 1\text{px}$. The last anchor item moves, violating the hard requirement that outer items remain fixed.
2. **Anchor Mismatch**: `maxX` is computed as $\max(x_i + w_i)$. If an internal item is wider than the rightmost item and extends further right, `maxX` comes from that internal item. The last item in `sortedIndices` will be pushed all the way to `maxX`, destroying the original boundary.
3. **Unstable Sort**: Sorting solely by `items[a].x - items[b].x` produces non-deterministic order if two items share the same left edge.

---

### 2.2 Engine Execution & Undo/Redo Integration

In `src/canvas/editor/editor_engine_groups.js`:
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

#### Key Architecture Strengths Found:
1. **Selection Units & Group Isolation**:
   - `selectionUnits()` in `editor_engine_nodes.js` automatically ignores locked layers (`node.locked` and `isLockedByGroup`).
   - Group members are resolved to their top-level group unit (`topLevelGroupOf(doc, node) ?? node`).
   - When a group moves by $(dx, dy)$, all of its descendants are recursively updated by $(dx, dy)$ in lines 197–204.
2. **Atomic Undo/Redo**:
   - The entire multi-item transformation is accumulated in immutable `next` and committed via:
     `commitEditorDocument("editor.layout.selection", setDoc, next)`
   - In `editor_undo_actions.js`, `"editor.layout.selection"` is registered with boundary `ATOMIC` and label `"editor.history.entry.align"`.
   - Result: Hitting `Cmd+Z` undoes the entire alignment, distribution, or gap adjustment in a single history step.

---

## 3. Distribute Centers vs. Distribute Spacing (Gaps)

### 3.1 Geometric Comparison

Consider three horizontal boxes $A, B, C$:
- Box $A$: $x = 0$, width $= 20$ (bounds $[0, 20]$, center $= 10$).
- Box $B$: $x = 100$, width $= 100$ (bounds $[100, 200]$, center $= 150$).
- Box $C$: $x = 240$, width $= 20$ (bounds $[240, 260]$, center $= 250$).

#### Outcome with Distribute Centers:
- First center $C_A = 10$, last center $C_C = 250$.
- Step $= (250 - 10) / 2 = 120$.
- Target centers: $C_A = 10$, $C_B = 130$, $C_C = 250$.
- Resulting positions:
  - $A: [0, 20]$ (center 10)
  - $B: [80, 180]$ (center 130)
  - $C: [240, 260]$ (center 250)
- Resulting Gaps:
  - Gap $(A, B) = 80 - 20 = \mathbf{60\text{px}}$
  - Gap $(B, C) = 240 - 180 = \mathbf{60\text{px}}$
- *Note*: If Box $B$ has width $20$ and Box $C$ has width $100$:
  - Centers: $A=10$, $B=130$, $C=250$.
  - Box $A: [0, 20]$
  - Box $B: [120, 140]$ (width 20)
  - Box $C: [200, 300]$ (width 100)
  - Gap $(A, B) = 120 - 20 = \mathbf{100\text{px}}$
  - Gap $(B, C) = 200 - 140 = \mathbf{60\text{px}}$
  - **Visual Failure**: Centers are equidistant, but the visual whitespace is severely unbalanced ($100\text{px}$ vs $60\text{px}$).

#### Outcome with Distribute Spacing (Equal Gaps):
- Total span between outer anchors: $X_{\text{start}} = 0$, $X_{\text{end\_right}} = 300$.
- Sum of widths $= 20 + 20 + 100 = 140\text{px}$.
- Total gap space $= 300 - 0 - 140 = 160\text{px}$.
- Equal gap $g = 160 / 2 = \mathbf{80\text{px}}$.
- Resulting positions:
  - Box $A: [0, 20]$
  - Box $B: [20 + 80, 100 + 20] = [100, 120]$
  - Box $C: [120 + 80, 200 + 100] = [200, 300]$
  - Gap $(A, B) = 100 - 20 = \mathbf{80\text{px}}$
  - Gap $(B, C) = 200 - 120 = \mathbf{80\text{px}}$
  - **Visual Perfection**: Whitespace between shapes is identical ($80\text{px}$ each). Outer boxes $A$ and $C$ did not move.

---

## 4. Mathematical Algorithms for Distribute Spacing

### 4.1 Formal Formulation (Horizontal Spacing)

Let the input selection be a set of $N$ items $\mathcal{S} = \{I_0, I_1, \dots, I_{N-1}\}$ where each item has bounding box $(x_i, y_i, w_i, h_i)$.
For Horizontal Spacing, the active coordinate is $x$ and dimension is $w$.

#### Step 1: Stable Multi-Key Spatial Sorting
Sort items from left to right using a stable three-tier key:
$$\text{key}(I) = \left( x_I,\; x_I + \frac{w_I}{2},\; \text{index}_I \right)$$
Let the sorted sequence be $\mathcal{A} = [A_0, A_1, \dots, A_{N-1}]$.

#### Step 2: Outer Anchor Invariance
The outer two items are:
- Left Anchor: $A_0$ at position $X_0 = A_0.x$.
- Right Anchor: $A_{N-1}$ at position $X_{N-1} = A_{N-1}.x$.

By definition, their target positions are strictly pinned:
$$A_0.x' = X_0$$
$$A_{N-1}.x' = X_{N-1}$$

#### Step 3: Exact Equal Gap Calculation
The total space spanned between the right edge of $A_0$ and the left edge of $A_{N-1}$ is:
$$\text{InnerSpan} = X_{N-1} - (X_0 + A_0.w)$$
The sum of widths of the $N - 2$ internal items is:
$$W_{\text{internal}} = \sum_{i=1}^{N-2} A_i.w$$
The total available gap space distributed across the $N - 1$ intervals is:
$$G_{\text{total}} = \text{InnerSpan} - W_{\text{internal}} = X_{N-1} - X_0 - \sum_{i=0}^{N-2} A_i.w$$
The exact equal gap is:
$$g = \frac{G_{\text{total}}}{N - 1} = \frac{X_{N-1} - X_0 - \sum_{i=0}^{N-2} A_i.w}{N - 1}$$

#### Step 4: Closed-Form Target Coordinates (Zero Cumulative Drift)
For each internal item $k \in \{1, 2, \dots, N-2\}$:
$$P_k = X_0 + \sum_{j=0}^{k-1} A_j.w + k \cdot g$$
The pixel-aligned coordinate is:
$$A_k.x' = \operatorname{round}(P_k)$$

#### Mathematical Proof of Outer Invariance:
For $k = 0$:
$$P_0 = X_0 + 0 + 0 = X_0 \implies A_0.x' = X_0 \quad \text{(Q.E.D.)}$$
For $k = N - 1$:
$$P_{N-1} = X_0 + \sum_{j=0}^{N-2} A_j.w + (N-1) \cdot \frac{X_{N-1} - X_0 - \sum_{j=0}^{N-2} A_j.w}{N - 1} = X_{N-1} \implies A_{N-1}.x' = X_{N-1} \quad \text{(Q.E.D.)}$$

Because $P_k$ is computed directly from $X_0$, the prefix sum of widths $\sum_{j=0}^{k-1} A_j.w$, and $k \cdot g$, **there is zero roundoff accumulation**. Every item lands within $\pm 0.5\text{px}$ of the analytical optimum, and the outer anchors never move.

---

### 4.2 Vertical Spacing Formulation

By replacing $x \to y$ and $w \to h$:
$$\text{key}(I) = \left( y_I,\; y_I + \frac{h_I}{2},\; \text{index}_I \right)$$
$$Y_0 = A_0.y, \quad Y_{N-1} = A_{N-1}.y$$
$$g_y = \frac{Y_{N-1} - Y_0 - \sum_{i=0}^{N-2} A_i.h}{N - 1}$$
For $k \in \{1, \dots, N-2\}$:
$$A_k.y' = \operatorname{round}\left( Y_0 + \sum_{j=0}^{k-1} A_j.h + k \cdot g_y \right)$$
$$A_0.y' = Y_0, \quad A_{N-1}.y' = Y_{N-1}$$

---

## 5. Explicit Gap $K$ Adjustment & Gap Measurement

### 5.1 Setting Explicit Gap $K$

When a user enters a gap value $K$ in the properties panel (e.g. $K = 16\text{px}$), the items must be rearranged with an edge-to-edge distance of exactly $K$.

#### Leading-Edge Anchor Rule:
In alignment workflows, anchoring at the first item ($A_0$) preserves the left or top alignment established against margins or guidelines.
1. Sort items stably along the active axis: $\mathcal{A} = [A_0, A_1, \dots, A_{N-1}]$.
2. Fix the initial item: $A_0.x' = A_0.x$.
3. Sequentially place each subsequent item $i \in \{1, \dots, N-1\}$:
   $$A_i.x' = \operatorname{round}\left( A_0.x + \sum_{j=0}^{i-1} A_j.w + i \cdot K \right)$$
   For integer $K$, this reduces to exact recurrence:
   $$A_i.x' = A_{i-1}.x' + A_{i-1}.w + K$$

#### Universal Applicability:
- **$N = 2$ items**:
  $$A_0.x' = A_0.x$$
  $$A_1.x' = A_0.x + A_0.w + K$$
  Directly adjusts the distance between two selected cards or buttons.
- **$N \ge 3$ items**:
  Maintains exact spacing $K$ across all adjacent pairs.
- **$K = 0$**: Snaps items edge-to-edge (abutting).
- **$K < 0$**: Creates controlled negative overlap (e.g. $-8\text{px}$ avatar stack).

---

### 5.2 Measuring Current / Average Selection Gap

To populate the Gap input box when multiple shapes are selected:
1. Sort the items along the active axis: $\mathcal{A} = [A_0, \dots, A_{N-1}]$.
2. Compute the exact average gap:
   $$\overline{g} = \frac{A_{N-1}.\text{pos} - A_0.\text{pos} - \sum_{i=0}^{N-2} A_i.\text{size}}{N - 1}$$
3. Display format:
   - If $|\overline{g} - \operatorname{round}(\overline{g})| < 0.05$, display integer: $\operatorname{round}(\overline{g})$ (e.g. `16`).
   - Else display one decimal place: $\overline{g}.\text{toFixed}(1)$ (e.g. `16.5`).
4. Automatic Dominant Axis Detection:
   If no axis is explicitly toggled:
   $$\Delta x = \max(x + w) - \min(x)$$
   $$\Delta y = \max(y + h) - \min(y)$$
   If $\Delta x \ge \Delta y$, the dominant axis is Horizontal; otherwise Vertical.

---

## 6. Comprehensive Edge-Case Matrix

| Edge Case | Manifestation | Root Cause / Risk | Algorithmic Solution |
|---|---|---|---|
| **$N = 2$ Items on Distribute** | Only 2 items selected; user clicks "Distribute Spacing". | $N - 1 = 1$, but outer two items are pinned, leaving 0 internal items to move. | `distributeSpacingSelection` gracefully returns items unmodified if $N < 3$. Button disabled in UI with tooltip `Select 3 or more layers`. |
| **$N = 2$ Items on Gap $K$** | 2 items selected; user edits Gap input to $24\text{px}$. | Previous system treated gap as spread-only. | `setGapSelection` works for $N \ge 2$, anchoring $A_0$ and moving $A_1$ to $A_0.x + A_0.w + K$. |
| **Overlapping Items ($g < 0$)** | Total span smaller than sum of item sizes ($G_{\text{total}} < 0$). | Division yields negative gap. Naive algorithms clip to 0 or crash. | Algorithm computes exact negative $g$. Internal items overlap symmetrically with $|g|\text{px}$ overlap while anchors remain pinned. |
| **Identical Position / Concentric** | Two items have identical $x$ ($A_1.x == A_2.x$). | Unstable `Array.prototype.sort()` can cause jitter or inversion. | Multi-tier sorting: primary $x$, secondary center $x + w/2$, tertiary selection index. Guarantees deterministic, stable layout. |
| **Enclosed / Giant Item** | One item's span $[0, 500]$ completely encloses internal items $[50, 100]$. | Enclosing item has both $\min(x)$ and $\max(x+w)$. | Multi-tier sorting orders by left edge and center. If $A_0$ and $A_{N-1}$ are distinct, internal items space evenly between them. |
| **Fractional Pixel Gaps** | $G_{\text{total}} / (N-1)$ is fractional (e.g. $10\text{px} / 3 = 3.333\text{px}$). | Sequential rounding `curX += round(gap)` causes cumulative 1–2px drift. | Direct formula $P_k = X_0 + \sum W_j + k \cdot g$ evaluated with `Math.round(P_k)`. Zero cumulative drift; individual gaps differ by at most $1\text{px}$. |
| **Zero-Dimension Items** | Line layer or point with $w = 0$ or $h = 0$. | Potential division by zero if size is denominator. | Denominator is always $N - 1 > 0$. $w_i = 0$ contributes $0$ to $\sum W$, math remains 100% stable. |
| **Locked Layers & Groups** | Selection contains locked items or items inside groups. | Inadvertent modification of locked layers or breaking group coordinates. | Handled automatically at controller layer by `selectionUnits()`. Locked layers filtered out; groups treated as unified bounding units with recursive descendant displacement. |

---

## 7. Concrete Implementation Specification

### 7.1 Refactored Functions in `src/canvas/editor/align_ops.js`

```javascript
/**
 * Distribute horizontal or vertical spacing such that the edge-to-edge
 * visual gap between consecutive items is equal.
 * The outermost two items are strictly anchored in place.
 */
export function distributeSpacingSelection(items, axis) {
  if (items.length < 3) return items;
  const copy = items.map((it) => ({ ...it }));
  const posKey = axis === "horizontal" ? "x" : "y";
  const sizeKey = axis === "horizontal" ? "w" : "h";

  // Multi-tier stable sort along the axis
  const sortedIndices = items
    .map((_, i) => i)
    .sort((a, b) => {
      const pa = items[a][posKey];
      const pb = items[b][posKey];
      if (pa !== pb) return pa - pb;
      const ca = pa + items[a][sizeKey] / 2;
      const cb = pb + items[b][sizeKey] / 2;
      if (ca !== cb) return ca - cb;
      return a - b;
    });

  const firstIdx = sortedIndices[0];
  const lastIdx = sortedIndices[sortedIndices.length - 1];
  const startPos = items[firstIdx][posKey];
  const endPos = items[lastIdx][posKey];

  // Sum widths/heights of all items except the last
  let sumSizesExceptLast = 0;
  for (let i = 0; i < sortedIndices.length - 1; i++) {
    sumSizesExceptLast += items[sortedIndices[i]][sizeKey];
  }

  const totalGap = endPos - startPos - sumSizesExceptLast;
  const gap = totalGap / (sortedIndices.length - 1);

  // Outer two items strictly pinned
  copy[firstIdx][posKey] = items[firstIdx][posKey];
  copy[lastIdx][posKey] = items[lastIdx][posKey];

  let accumulatedSize = 0;
  for (let i = 1; i < sortedIndices.length - 1; i++) {
    accumulatedSize += items[sortedIndices[i - 1]][sizeKey];
    const target = startPos + accumulatedSize + i * gap;
    copy[sortedIndices[i]][posKey] = Math.round(target);
  }

  return copy;
}

/**
 * Set an explicit edge-to-edge gap K between adjacent items.
 * Anchors the first item at its current position, and places each
 * subsequent item at distance K from the previous item's trailing edge.
 */
export function setGapSelection(items, axis, gap) {
  if (items.length < 2) return items;
  const copy = items.map((it) => ({ ...it }));
  const posKey = axis === "horizontal" ? "x" : "y";
  const sizeKey = axis === "horizontal" ? "w" : "h";

  const sortedIndices = items
    .map((_, i) => i)
    .sort((a, b) => {
      const pa = items[a][posKey];
      const pb = items[b][posKey];
      if (pa !== pb) return pa - pb;
      const ca = pa + items[a][sizeKey] / 2;
      const cb = pb + items[b][sizeKey] / 2;
      if (ca !== cb) return ca - cb;
      return a - b;
    });

  const firstIdx = sortedIndices[0];
  let curPos = items[firstIdx][posKey];

  sortedIndices.forEach((idx, i) => {
    copy[idx][posKey] = Math.round(curPos);
    curPos += items[idx][sizeKey] + gap;
  });

  return copy;
}

/**
 * Measure the average edge-to-edge gap between adjacent items along an axis.
 */
export function measureSelectionGap(items, axis) {
  if (!items || items.length < 2) return 0;
  const posKey = axis === "horizontal" ? "x" : "y";
  const sizeKey = axis === "horizontal" ? "w" : "h";

  const sorted = [...items].sort((a, b) => {
    const pa = a[posKey];
    const pb = b[posKey];
    if (pa !== pb) return pa - pb;
    return pa + a[sizeKey] / 2 - (pb + b[sizeKey] / 2);
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let sumSizesExceptLast = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    sumSizesExceptLast += sorted[i][sizeKey];
  }

  const totalGap = last[posKey] - first[posKey] - sumSizesExceptLast;
  const avgGap = totalGap / (sorted.length - 1);
  return Math.round(avgGap * 10) / 10;
}
```

#### Node Adapter Wrappers:
```javascript
export function distributeSpacingNodes(nodes, axis) {
  if (!DISTRIBUTE_AXES.includes(axis)) return [];
  const entries = toItems(nodes);
  return toPatches(
    entries,
    distributeSpacingSelection(
      entries.map((entry) => entry.item),
      axis,
    ),
  );
}

// Keep tidyNodes as alias for backward compatibility
export const tidyNodes = distributeSpacingNodes;

export function setGapNodes(nodes, options) {
  const { axis = "horizontal", gap = 0 } = options || {};
  if (!DISTRIBUTE_AXES.includes(axis)) return [];
  const entries = toItems(nodes);
  return toPatches(
    entries,
    setGapSelection(
      entries.map((entry) => entry.item),
      axis,
      gap,
    ),
  );
}
```

---

### 7.2 UI Architecture in `align_section.jsx`

In `src/canvas/components/editor_properties/align_section.jsx`:
1. Receive `selectedNodes` and `count` (passed down from `properties_panel_sections.jsx`).
2. Add interactive Gap Row when `count >= 2`:
   - Auto-detect dominant axis (`horizontal` vs `vertical`).
   - Display measured gap in input box: `const currentGap = measureSelectionGap(selectedNodes, axis)`.
   - On change / blur: invoke `onLayout(setGapNodes, { axis, gap: nextGap })`.
   - Adhere strictly to `Design.md` dark-mode tokens (`bg-white/[0.06]`, `text-neutral-100`, `focus-visible:ring-1 focus-visible:ring-[#E5B2FF]/40`).
3. Tooltips & i18n keys:
   - Horizontal Equal Gaps: `editor.props.tidy.horizontal` ("Even horizontal gaps" / "水平均分间距")
   - Vertical Equal Gaps: `editor.props.tidy.vertical` ("Even vertical gaps" / "垂直均分间距")
   - Horizontal Equal Centers: `editor.props.distribute.horizontal` ("Even horizontal centres" / "水平均分中心")
   - Vertical Equal Centers: `editor.props.distribute.vertical` ("Even vertical centres" / "垂直均分中心")
   - Gap Input: `editor.props.gap` ("Gap" / "间距")

---

## 8. Vitest Automated Test Matrix

A comprehensive new test suite must be added at `tests/unit/align_distribute_spacing.test.js`:

```
tests/unit/align_distribute_spacing.test.js
├── alignNodes
│   ├── aligns left, center, right across multiple shapes
│   ├── aligns top, middle, bottom across multiple shapes
│   └── aligns single node against canvasBounds
├── distributeNodes (Distribute Centers)
│   ├── equalizes center distances for 3+ shapes of identical size
│   ├── equalizes center distances for 3+ shapes of varying sizes
│   └── ignores execution if items.length < 3
├── distributeSpacingNodes (Distribute Spacing / Gaps)
│   ├── strictly preserves outer two items at exact starting coordinates
│   ├── equalizes edge-to-edge gaps for 3+ items with unequal widths
│   ├── handles vertical axis distribution with unequal heights
│   ├── handles fractional pixel gaps without cumulative drift
│   ├── handles overlapping elements and negative gaps gracefully
│   └── preserves positions when items.length < 3
├── setGapNodes
│   ├── sets explicit gap K=16 across 2 selected items
│   ├── sets explicit gap K=24 across 4 items (anchoring first item)
│   ├── sets explicit abutting gap K=0
│   └── sets explicit negative gap K=-8 (overlapping avatar stack)
└── measureSelectionGap
    ├── accurately measures positive gap for 2 items
    ├── accurately measures average gap across 3+ items
    └── returns 0 for single item or null input
```

---

## 9. Conclusion & Implementation Readiness

The mathematical algorithms, transaction contracts, edge cases, and UI requirements for Distribute Spacing and Gap Controls are fully surveyed and formalized. The implementation can proceed cleanly with zero architectural churn, adhering strictly to VOO Design design tokens, Vitest unit testing standards, and the production deployment rules.
