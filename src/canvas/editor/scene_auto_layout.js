/** Reflow opt-in group layouts in document coordinates. Pure scene data only. */

const DIRECTIONS = new Set(["horizontal", "vertical"]);
const ALIGNMENTS = new Set(["start", "center", "end"]);
const JUSTIFICATIONS = new Set(["start", "center", "end", "space-between"]);

function nonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
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
  return {
    direction: value.direction,
    gap: nonNegative(value.gap),
    padding: normalizePadding(value.padding),
    alignItems: ALIGNMENTS.has(value.alignItems) ? value.alignItems : "start",
    justifyContent: JUSTIFICATIONS.has(value.justifyContent)
      ? value.justifyContent
      : "start",
    widthMode: value.widthMode === "hug" ? "hug" : "fixed",
    heightMode: value.heightMode === "hug" ? "hug" : "fixed",
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
  const completed = new Set();
  const visiting = new Set();

  function moveSubtree(node, dx, dy) {
    if (dx === 0 && dy === 0) return;
    node.x += dx;
    node.y += dy;
    for (const child of childrenByParent.get(node.id) ?? []) {
      moveSubtree(child, dx, dy);
    }
  }

  function layoutGroup(group) {
    if (completed.has(group.id)) return;
    if (visiting.has(group.id)) {
      throw new Error(`auto-layout-cycle:${group.id}`);
    }
    visiting.add(group.id);
    const children = childrenByParent.get(group.id) ?? [];
    for (const child of children) {
      if (child.kind === "group") layoutGroup(child);
    }
    const layout = normalizeAutoLayout(group.autoLayout);
    if (layout) {
      const flow = children.filter(
        (child) =>
          child.layoutPosition !== "absolute" && child.visible !== false,
      );
      const horizontal = layout.direction === "horizontal";
      const mainKey = horizontal ? "width" : "height";
      const crossKey = horizontal ? "height" : "width";
      const mainModeKey = horizontal ? "layoutWidth" : "layoutHeight";
      const crossModeKey = horizontal ? "layoutHeight" : "layoutWidth";
      const mainHugs =
        (horizontal ? layout.widthMode : layout.heightMode) === "hug";
      const crossHugs =
        (horizontal ? layout.heightMode : layout.widthMode) === "hug";
      const padding = layout.padding;
      const mainLeading = horizontal ? padding.left : padding.top;
      const mainTrailing = horizontal ? padding.right : padding.bottom;
      const crossLeading = horizontal ? padding.top : padding.left;
      const crossTrailing = horizontal ? padding.bottom : padding.right;
      const mainSize = (child) =>
        nonNegative(horizontal ? child.width : child.height);
      const crossSize = (child) =>
        nonNegative(horizontal ? child.height : child.width);
      const mainContent =
        flow.reduce((total, child) => total + mainSize(child), 0) +
        layout.gap * Math.max(0, flow.length - 1);
      const crossContent = Math.max(0, ...flow.map(crossSize));
      if (horizontal && layout.widthMode === "hug") {
        group.width = mainLeading + mainContent + mainTrailing;
      }
      if (horizontal && layout.heightMode === "hug") {
        group.height = crossLeading + crossContent + crossTrailing;
      }
      if (!horizontal && layout.widthMode === "hug") {
        group.width = crossLeading + crossContent + crossTrailing;
      }
      if (!horizontal && layout.heightMode === "hug") {
        group.height = mainLeading + mainContent + mainTrailing;
      }
      const innerMain = Math.max(
        0,
        (horizontal ? group.width : group.height) - mainLeading - mainTrailing,
      );
      const innerCross = Math.max(
        0,
        (horizontal ? group.height : group.width) -
          crossLeading -
          crossTrailing,
      );
      // A fixed container shares remaining main-axis space equally between
      // fill children. Hug containers keep their measured child sizes.
      if (!mainHugs) {
        const fillChildren = flow.filter(
          (child) => child[mainModeKey] === "fill",
        );
        if (fillChildren.length > 0) {
          const fixedSize = flow
            .filter((child) => child[mainModeKey] !== "fill")
            .reduce((total, child) => total + mainSize(child), 0);
          const remaining = Math.max(
            0,
            innerMain - fixedSize - layout.gap * Math.max(0, flow.length - 1),
          );
          for (const child of fillChildren) {
            child[mainKey] = remaining / fillChildren.length;
            if (mainKey === "width" && child.kind === "text") {
              child.boxWidth = child.width;
            }
          }
        }
      }
      if (!crossHugs) {
        for (const child of flow) {
          if (child[crossModeKey] === "fill") {
            child[crossKey] = innerCross;
            if (crossKey === "width" && child.kind === "text") {
              child.boxWidth = child.width;
            }
          }
        }
      }
      const resolvedMainContent =
        flow.reduce((total, child) => total + mainSize(child), 0) +
        layout.gap * Math.max(0, flow.length - 1);
      const free = Math.max(0, innerMain - resolvedMainContent);
      let cursor =
        mainLeading +
        (layout.justifyContent === "center"
          ? free / 2
          : layout.justifyContent === "end"
            ? free
            : 0);
      const extraGap =
        layout.justifyContent === "space-between" && flow.length > 1
          ? free / (flow.length - 1)
          : 0;
      for (const child of flow) {
        const crossFree = Math.max(0, innerCross - crossSize(child));
        const cross =
          crossLeading +
          (layout.alignItems === "center"
            ? crossFree / 2
            : layout.alignItems === "end"
              ? crossFree
              : 0);
        const x = group.x + (horizontal ? cursor : cross);
        const y = group.y + (horizontal ? cross : cursor);
        moveSubtree(child, x - child.x, y - child.y);
        cursor += mainSize(child) + layout.gap + extraGap;
      }
    }
    visiting.delete(group.id);
    completed.add(group.id);
  }

  for (const node of nodes) {
    if (node.kind === "group" && byId.has(node.id)) layoutGroup(node);
  }
  return { ...doc, nodes };
}
