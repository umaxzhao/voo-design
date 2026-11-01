import { reconcileBooleanDocument } from "./boolean-node-reconcile.js";
import { normalizeAutoLayout, nonNegative, clampDimension, distributionOffsets } from "./auto-layout-values.js";
import { shareAutoLayoutNodes } from "./auto-layout-sharing.js";

// Wrap comparisons tolerate floating point accumulation without wrapping early.
const EPSILON = 1e-6;
const EMPTY_PINNED = new Set();

/** Measure nested folders bottom-up, then place their document-space children. */
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
      // `alignItems: "stretch"` gives every flow child the full line cross: a
      // hug cross axis has no free space to hand out, so it keeps the measured
      // sizes (same rule as cross-axis fill).
      if (!crossHugs && layout.alignItems === "stretch") {
        if (layout.wrap) {
          lines.forEach((line, index) => {
            for (const child of line) {
              setChildExtent(child, crossKey, lineCrosses[index]);
            }
          });
        } else {
          for (const child of flow) {
            setChildExtent(child, crossKey, innerCross);
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
  const shared = shareAutoLayoutNodes(doc.nodes, nodes);
  const next = reconcileBooleanDocument(doc, { ...doc, nodes: shared }, { inheritChildren: true });
  return next.nodes === doc.nodes ? doc : next;
}
