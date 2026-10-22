/** Reflow opt-in group layouts in document coordinates. Pure scene data only. */

/**
 * Auto layout is a *document-coordinate flattening pass* over group folders.
 * Every child keeps an absolute box, so the pass resolves each group's own box
 * first and then writes absolute child positions. The public contract is
 * unchanged from the original flex-only implementation:
 *
 * - `normalizeAutoLayout(value)` accepts documents written before wrap / gap /
 *   min-max existed and fills the new fields with defaults.
 * - `reflowAutoLayout(doc)` is pure (the input document is never mutated) and
 *   idempotent (feeding its output back in returns identical geometry).
 *
 * ## Resolution order (deterministic, no oscillation)
 *
 * 1. **Hug measurement, bottom-up.** A post-order walk measures every group
 *    after its child groups, so a hug frame is sized from its children's
 *    already-resolved boxes. A `layoutWidth`/`layoutHeight: "fill"` child is
 *    measured at its current size here: filling is decided later, by the
 *    parent, and a hug parent has no free space to hand out.
 * 2. **Clamp.** Every resolved box is clamped by the group's own
 *    `minWidth`/`maxWidth`/`minHeight`/`maxHeight`. `min` wins when
 *    `min > max` (the CSS `clamp()` rule), and clamping never moves children.
 * 3. **Line breaking (wrap).** Wrapped lines are only formed against the
 *    *resolved inner main size*. A hug main axis therefore produces one line
 *    unless `maxWidth`/`maxHeight` clamps it below the content size; in that
 *    case the clamped size is kept (re-hugging after wrapping would move the
 *    target and oscillate).
 * 4. **Cross size.** A fixed cross axis keeps its (clamped) size. A hug cross
 *    axis sums its line cross sizes plus `crossGap`.
 * 5. **Placement, top-down.** For each group the parent resolves fill children
 *    (`fill` on a bounded axis receives an equal share on the main axis, and
 *    the whole inner cross on the cross axis; in a wrapped frame a cross-fill
 *    child stretches to its own line instead), positions the lines with
 *    `justifyContent` + `alignContent` + `alignItems`, translates whole
 *    subtrees, and only then recurses into child groups with the axes the
 *    parent pinned. This top-down recursion is what lets a filled nested group
 *    lay its own fill children across the imposed size.
 * 6. **Conflicts resolve toward the measured size.** A `fill` child of a hug
 *    parent keeps its measured size (the parent has no bounded axis to share),
 *    and a hug child of a fixed parent keeps its hug size unless it is itself
 *    marked `fill`. That pairing is stable across repeated passes.
 * 7. **Absolute children** are excluded from flow *and* from hug measurement;
 *    they keep their offset from the parent and are translated with the
 *    parent's subtree by `moveSubtree`.
 *
 * `justifyContent`/`alignContent` support start, center, end, space-between,
 * space-around and space-evenly (the last two are cheap here, so they ship).
 * `alignItems: "stretch"` and per-line main-axis fill are deliberately
 * omitted; see the deferred notes in the reflow tests.
 */

const DIRECTIONS = new Set(["horizontal", "vertical"]);
const ALIGNMENTS = new Set(["start", "center", "end"]);
const DISTRIBUTIONS = new Set([
  "start",
  "center",
  "end",
  "space-between",
  "space-around",
  "space-evenly",
]);

/** Wrap tolerance in document px: float sums of sizes must not wrap early. */
const EPSILON = 1e-6;

const EMPTY_PINNED = new Set();

function nonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

/** A nullable sizing constraint: `null` means "not set" in legacy documents. */
function optionalNonNegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

/**
 * CSS `clamp()` semantics: apply the maximum first, then the minimum, so a
 * document whose min exceeds its max resolves to the min (never NaN / empty).
 */
function clampDimension(value, min, max) {
  let size = nonNegative(value);
  if (max !== null) size = Math.min(size, max);
  if (min !== null) size = Math.max(size, min);
  return size;
}

function normalizePadding(value) {
  if (typeof value === "number") {
    const size = nonNegative(value);
    return { top: size, right: size, bottom: size, left: size };
  }
  if (Array.isArray(value)) {
    const [top = 0, right = top, bottom = top, left = right] = value;
    return {
      top: nonNegative(top),
      right: nonNegative(right),
      bottom: nonNegative(bottom),
      left: nonNegative(left),
    };
  }
  return {
    top: nonNegative(value?.top),
    right: nonNegative(value?.right),
    bottom: nonNegative(value?.bottom),
    left: nonNegative(value?.left),
  };
}

export function normalizeAutoLayout(value) {
  if (!value || !DIRECTIONS.has(value.direction)) return null;
  const gap = nonNegative(value.gap);
  return {
    direction: value.direction,
    wrap: value.wrap === true,
    gap,
    // New wrapped frames default their cross-axis gap to `gap`, so enabling
    // wrap on a legacy frame immediately looks like the frame's existing gap.
    crossGap: value.crossGap === null || value.crossGap === undefined
      ? gap
      : nonNegative(value.crossGap),
    padding: normalizePadding(value.padding),
    alignItems: ALIGNMENTS.has(value.alignItems) ? value.alignItems : "start",
    alignContent: DISTRIBUTIONS.has(value.alignContent)
      ? value.alignContent
      : "start",
    justifyContent: DISTRIBUTIONS.has(value.justifyContent)
      ? value.justifyContent
      : "start",
    widthMode: value.widthMode === "hug" ? "hug" : "fixed",
    heightMode: value.heightMode === "hug" ? "hug" : "fixed",
    minWidth: optionalNonNegative(value.minWidth),
    maxWidth: optionalNonNegative(value.maxWidth),
    minHeight: optionalNonNegative(value.minHeight),
    maxHeight: optionalNonNegative(value.maxHeight),
  };
}

/**
 * Groups are folders and children store absolute boxes. This pass resolves
 * layout constraints into those boxes after text measurement, so every existing
 * renderer, hit test, export and undo path sees the same geometry. Descendants
 * move with their parent; absolute children stay where the user placed them.
 */
export function reflowAutoLayout(doc) {
  if (!doc?.nodes?.some((node) => node.kind === "group" && node.autoLayout)) {
    return doc;
  }
  const nodes = doc.nodes.map((node) => ({ ...node }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }
  const measuring = new Set();
  const measured = new Set();
  const arranging = new Set();
  const arranged = new Set();

  const childrenOf = (node) => childrenByParent.get(node.id) ?? [];
  const flowChildren = (group) =>
    childrenOf(group).filter(
      (child) =>
        child.layoutPosition !== "absolute" && child.visible !== false,
    );
  const extent = (child, horizontal) =>
    nonNegative(horizontal ? child.width : child.height);
  const crossExtent = (child, horizontal) =>
    nonNegative(horizontal ? child.height : child.width);

  /** Whether `node` sits anywhere below a group folder. */
  function hasGroupAncestor(node) {
    const seen = new Set([node.id]);
    let parentId = node.parentId;
    while (parentId) {
      if (seen.has(parentId)) return true;
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) return false;
      if (parent.kind === "group") return true;
      parentId = parent.parentId;
    }
    return false;
  }

  /**
   * Splits the flow children into lines for the *resolved* main-axis space.
   * Lines are only meaningful when `wrap` is on; without wrap the flow is one
   * line even when it overflows (matching flex-nowrap / the old behaviour).
   */
  function buildLines(flow, layout, horizontal, innerMain) {
    if (flow.length === 0) return [];
    if (!layout.wrap) return [flow];
    const lines = [];
    let line = [];
    let used = 0;
    for (const child of flow) {
      const size = extent(child, horizontal);
      const addition = line.length === 0 ? size : layout.gap + size;
      if (line.length > 0 && used + addition > innerMain + EPSILON) {
        lines.push(line);
        line = [child];
        used = size;
      } else {
        line.push(child);
        used += addition;
      }
    }
    if (line.length > 0) lines.push(line);
    return lines;
  }

  /** Leading offset and extra gap for a distribution keyword. */
  function distributionOffsets(mode, free, count) {
    if (count <= 0) return { leading: 0, extra: 0 };
    switch (mode) {
      case "center":
        return { leading: free / 2, extra: 0 };
      case "end":
        return { leading: free, extra: 0 };
      case "space-between":
        return count > 1
          ? { leading: 0, extra: free / (count - 1) }
          : { leading: 0, extra: 0 };
      case "space-around":
        return { leading: free / (2 * count), extra: free / count };
      case "space-evenly":
        return {
          leading: free / (count + 1),
          extra: free / (count + 1),
        };
      default:
        return { leading: 0, extra: 0 };
    }
  }

  function moveSubtree(node, dx, dy) {
    if (dx === 0 && dy === 0) return;
    node.x += dx;
    node.y += dy;
    for (const child of childrenOf(node)) {
      moveSubtree(child, dx, dy);
    }
  }

  /** Post-order: resolve hug/clamped sizes before the parent reads them. */
  function measureGroup(group) {
    if (measured.has(group.id)) return;
    if (measuring.has(group.id)) {
      throw new Error(`auto-layout-cycle:${group.id}`);
    }
    measuring.add(group.id);
    for (const child of childrenOf(group)) {
      if (child.kind === "group") measureGroup(child);
    }
    const layout = normalizeAutoLayout(group.autoLayout);
    if (layout) {
      const horizontal = layout.direction === "horizontal";
      const mainKey = horizontal ? "width" : "height";
      const crossKey = horizontal ? "height" : "width";
      const mainMode = horizontal ? layout.widthMode : layout.heightMode;
      const crossMode = horizontal ? layout.heightMode : layout.widthMode;
      const padding = layout.padding;
      const mainLeading = horizontal ? padding.left : padding.top;
      const mainTrailing = horizontal ? padding.right : padding.bottom;
      const crossLeading = horizontal ? padding.top : padding.left;
      const crossTrailing = horizontal ? padding.bottom : padding.right;
      const flow = flowChildren(group);
      const mainHug = mainMode === "hug";
      const crossHug = crossMode === "hug";
      // Main axis: hug sums the children measured in pass 1; a fixed frame
      // keeps its existing box. Both are clamped by the frame's min/max.
      let mainSize = mainHug
        ? mainLeading +
          flow.reduce(
            (total, child) => total + extent(child, horizontal),
            0,
          ) +
          layout.gap * Math.max(0, flow.length - 1) +
          mainTrailing
        : nonNegative(group[mainKey]);
      mainSize = clampDimension(
        mainSize,
        horizontal ? layout.minWidth : layout.minHeight,
        horizontal ? layout.maxWidth : layout.maxHeight,
      );
      group[mainKey] = mainSize;
      const innerMain = Math.max(0, mainSize - mainLeading - mainTrailing);
      const lines = buildLines(flow, layout, horizontal, innerMain);
      const lineCrosses = lines.map((line) =>
        line.reduce(
          (largest, child) => Math.max(largest, crossExtent(child, horizontal)),
          0,
        ),
      );
      const crossContent =
        lineCrosses.reduce((total, size) => total + size, 0) +
        (layout.wrap
          ? layout.crossGap * Math.max(0, lines.length - 1)
          : 0);
      // Cross axis: hug sums line cross sizes (a single line is the old
      // max-child height); fixed keeps its box. Clamp afterwards.
      let crossSize = crossHug
        ? crossLeading + crossContent + crossTrailing
        : nonNegative(group[crossKey]);
      crossSize = clampDimension(
        crossSize,
        horizontal ? layout.minHeight : layout.minWidth,
        horizontal ? layout.maxHeight : layout.maxWidth,
      );
      group[crossKey] = crossSize;
    }
    measuring.delete(group.id);
    measured.add(group.id);
  }

  /**
   * Pre-order: assign fill sizes, place children, translate subtrees, then
   * recurse with the axes this group pinned so nested frames lay out against
   * the imposed size instead of their hug measurement.
   */
  function arrangeGroup(group, pinned = EMPTY_PINNED) {
    if (arranged.has(group.id)) return;
    if (arranging.has(group.id)) {
      throw new Error(`auto-layout-cycle:${group.id}`);
    }
    arranging.add(group.id);
    const children = childrenOf(group);
    const layout = normalizeAutoLayout(group.autoLayout);
    const childPins = new Map();

    /** Assign a resolved child size, honouring the child's own min/max. */
    function setChildExtent(child, axisKey, value) {
      const childLayout =
        child.kind === "group" ? normalizeAutoLayout(child.autoLayout) : null;
      const min = childLayout
        ? axisKey === "width"
          ? childLayout.minWidth
          : childLayout.minHeight
        : null;
      const max = childLayout
        ? axisKey === "width"
          ? childLayout.maxWidth
          : childLayout.maxHeight
        : null;
      child[axisKey] = clampDimension(value, min, max);
      if (axisKey === "width" && child.kind === "text") {
        child.boxWidth = child.width;
      }
      let pins = childPins.get(child);
      if (!pins) {
        pins = new Set();
        childPins.set(child, pins);
      }
      pins.add(axisKey);
    }

    if (layout) {
      const horizontal = layout.direction === "horizontal";
      const mainKey = horizontal ? "width" : "height";
      const crossKey = horizontal ? "height" : "width";
      const mainModeKey = horizontal ? "layoutWidth" : "layoutHeight";
      const crossModeKey = horizontal ? "layoutHeight" : "layoutWidth";
      const mainMode = horizontal ? layout.widthMode : layout.heightMode;
      const crossMode = horizontal ? layout.heightMode : layout.widthMode;
      const padding = layout.padding;
      const mainLeading = horizontal ? padding.left : padding.top;
      const mainTrailing = horizontal ? padding.right : padding.bottom;
      const crossLeading = horizontal ? padding.top : padding.left;
      const crossTrailing = horizontal ? padding.bottom : padding.right;
      // A parent may have imposed a fill size on this frame in step 5; the
      // frame's own min/max still win, but it must not fall back to hug.
      group[mainKey] = clampDimension(
        group[mainKey],
        horizontal ? layout.minWidth : layout.minHeight,
        horizontal ? layout.maxWidth : layout.maxHeight,
      );
      const innerMain = Math.max(
        0,
        nonNegative(group[mainKey]) - mainLeading - mainTrailing,
      );
      const flow = flowChildren(group);
      const mainHugs = mainMode === "hug" && !pinned.has(mainKey);
      const crossHugs = crossMode === "hug" && !pinned.has(crossKey);
      const lines = buildLines(flow, layout, horizontal, innerMain);
      const lineCrosses = lines.map((line) =>
        line.reduce(
          (largest, child) => Math.max(largest, crossExtent(child, horizontal)),
          0,
        ),
      );
      const crossContent =
        lineCrosses.reduce((total, size) => total + size, 0) +
        (layout.wrap
          ? layout.crossGap * Math.max(0, lines.length - 1)
          : 0);
      // A wrapped hug frame re-derives its cross size from the final lines: a
      // parent may have pinned the main axis, changing the line count from the
      // one measured bottom-up. Fully contained within this frame.
      group[crossKey] = clampDimension(
        crossHugs
          ? crossLeading + crossContent + crossTrailing
          : group[crossKey],
        horizontal ? layout.minHeight : layout.minWidth,
        horizontal ? layout.maxHeight : layout.maxWidth,
      );
      const innerCross = Math.max(
        0,
        nonNegative(group[crossKey]) - crossLeading - crossTrailing,
      );
      // Main-axis fill: only a bounded, non-wrapped axis can share free space.
      // With wrap the line distribution owns the main axis, so fill children
      // keep their measured size (documented deferral).
      if (!mainHugs && !layout.wrap) {
        const fillChildren = flow.filter(
          (child) => child[mainModeKey] === "fill",
        );
        if (fillChildren.length > 0) {
          const fixedSize = flow
            .filter((child) => child[mainModeKey] !== "fill")
            .reduce((total, child) => total + extent(child, horizontal), 0);
          const remaining = Math.max(
            0,
            innerMain -
              fixedSize -
              layout.gap * Math.max(0, flow.length - 1),
          );
          const share = remaining / fillChildren.length;
          for (const child of fillChildren) {
            setChildExtent(child, mainKey, share);
          }
        }
      }
      // Cross-axis fill: the whole inner cross normally; in a wrapped frame a
      // child stretches to its own line, not across unrelated lines.
      if (!crossHugs) {
        if (layout.wrap) {
          lines.forEach((line, index) => {
            for (const child of line) {
              if (child[crossModeKey] === "fill") {
                setChildExtent(child, crossKey, lineCrosses[index]);
              }
            }
          });
        } else {
          for (const child of flow) {
            if (child[crossModeKey] === "fill") {
              setChildExtent(child, crossKey, innerCross);
            }
          }
        }
      }
      // Place lines (alignContent) and children (justifyContent/alignItems).
      const crossFree = layout.wrap
        ? Math.max(0, innerCross - crossContent)
        : 0;
      const crossDistribution = layout.wrap
        ? distributionOffsets(
            layout.alignContent,
            crossFree,
            lines.length,
          )
        : { leading: 0, extra: 0 };
      let lineCursor = crossLeading + crossDistribution.leading;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const lineMain =
          line.reduce(
            (total, child) => total + extent(child, horizontal),
            0,
          ) +
          layout.gap * Math.max(0, line.length - 1);
        const mainFree = Math.max(0, innerMain - lineMain);
        const mainDistribution = distributionOffsets(
          layout.justifyContent,
          mainFree,
          line.length,
        );
        let cursor = mainLeading + mainDistribution.leading;
        for (const child of line) {
          let cross;
          if (layout.wrap) {
            const crossFreeInLine = Math.max(
              0,
              lineCrosses[index] - crossExtent(child, horizontal),
            );
            const crossOffset =
              layout.alignItems === "center"
                ? crossFreeInLine / 2
                : layout.alignItems === "end"
                  ? crossFreeInLine
                  : 0;
            cross = lineCursor + crossOffset;
          } else {
            // Non-wrapped frames keep the historical container-relative
            // alignment (align within the inner cross, not a line).
            const crossFreeInLine = Math.max(
              0,
              innerCross - crossExtent(child, horizontal),
            );
            const crossOffset =
              layout.alignItems === "center"
                ? crossFreeInLine / 2
                : layout.alignItems === "end"
                  ? crossFreeInLine
                  : 0;
            cross = crossLeading + crossOffset;
          }
          const x = group.x + (horizontal ? cursor : cross);
          const y = group.y + (horizontal ? cross : cursor);
          moveSubtree(child, x - child.x, y - child.y);
          cursor +=
            extent(child, horizontal) + layout.gap + mainDistribution.extra;
        }
        lineCursor +=
          lineCrosses[index] + layout.crossGap + crossDistribution.extra;
      }
    }

    for (const child of children) {
      if (child.kind !== "group") continue;
      arrangeGroup(child, childPins.get(child) ?? EMPTY_PINNED);
    }
    arranging.delete(group.id);
    arranged.add(group.id);
  }

  for (const node of nodes) {
    if (node.kind === "group") measureGroup(node);
  }
  for (const node of nodes) {
    if (node.kind === "group" && !hasGroupAncestor(node)) arrangeGroup(node);
  }
  return { ...doc, nodes };
}
