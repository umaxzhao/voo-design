/**
 * Laying a selection out: aligning, distributing, and evening the gaps.
 *
 * The arithmetic lives in the shared package, so this editor and VOO Canvas
 * lay a selection out identically — including the details that are easy to
 * get subtly different, like which items stay anchored and where the rounding
 * happens. What lives here is the boundary: our nodes measured the way the
 * page actually sees them, and the results turned back into node patches.
 *
 * A rotated node is measured by its axis-aligned bounding box rather than its
 * stored rect. That is what the eye lines up against, and it is the same box
 * the selection outline and the marquee already use — so "align left" puts
 * the visible left edges in a line, not the invisible untransformed ones.
 */

import { nodeAABB } from "./scene_geometry.js";

/** Which edge or midline the shapes line up on. */
export const ALIGN_TYPES = [
  "left",
  "center",
  "right",
  "top",
  "middle",
  "bottom",
];

export const DISTRIBUTE_AXES = ["horizontal", "vertical"];

function alignSelection(items, type, canvasBounds = null) {
  if (items.length === 0) return items;
  const copy = items.map((it) => ({ ...it }));

  if (items.length === 1) {
    if (!canvasBounds) return items;
    const it = copy[0];
    if (type === "left") {
      it.x = canvasBounds.x;
    } else if (type === "center") {
      it.x = Math.round(canvasBounds.x + (canvasBounds.w - it.w) / 2);
    } else if (type === "right") {
      it.x = canvasBounds.x + canvasBounds.w - it.w;
    } else if (type === "top") {
      it.y = canvasBounds.y;
    } else if (type === "middle") {
      it.y = Math.round(canvasBounds.y + (canvasBounds.h - it.h) / 2);
    } else if (type === "bottom") {
      it.y = canvasBounds.y + canvasBounds.h - it.h;
    }
    return copy;
  }

  if (type === "left") {
    const minX = Math.min(...items.map((it) => it.x));
    copy.forEach((it) => (it.x = minX));
  } else if (type === "center") {
    const minX = Math.min(...items.map((it) => it.x));
    const maxX = Math.max(...items.map((it) => it.x + it.w));
    const midX = (minX + maxX) / 2;
    copy.forEach((it) => (it.x = Math.round(midX - it.w / 2)));
  } else if (type === "right") {
    const maxX = Math.max(...items.map((it) => it.x + it.w));
    copy.forEach((it) => (it.x = maxX - it.w));
  } else if (type === "top") {
    const minY = Math.min(...items.map((it) => it.y));
    copy.forEach((it) => (it.y = minY));
  } else if (type === "middle") {
    const minY = Math.min(...items.map((it) => it.y));
    const maxY = Math.max(...items.map((it) => it.y + it.h));
    const midY = (minY + maxY) / 2;
    copy.forEach((it) => (it.y = Math.round(midY - it.h / 2)));
  } else if (type === "bottom") {
    const maxY = Math.max(...items.map((it) => it.y + it.h));
    copy.forEach((it) => (it.y = maxY - it.h));
  }
  return copy;
}

export function distributeSelection(items, axis) {
  if (items.length < 3) return items;
  const copy = items.map((it) => ({
    ...it,
    w: it.w ?? it.width ?? 0,
    h: it.h ?? it.height ?? 0,
  }));
  if (axis === "horizontal") {
    const sortedIndices = items
      .map((_, i) => i)
      .sort((a, b) => {
        const ca = copy[a].x + copy[a].w / 2;
        const cb = copy[b].x + copy[b].w / 2;
        if (Math.abs(ca - cb) > 1e-4) return ca - cb;
        if (Math.abs(copy[a].x - copy[b].x) > 1e-4) return copy[a].x - copy[b].x;
        return a - b;
      });
    const first = copy[sortedIndices[0]];
    const last = copy[sortedIndices[sortedIndices.length - 1]];
    const startC = first.x + first.w / 2;
    const endC = last.x + last.w / 2;
    const step = (endC - startC) / (items.length - 1);
    sortedIndices.forEach((idx, i) => {
      if (i === 0) {
        copy[idx].x = items[idx].x;
      } else if (i === sortedIndices.length - 1) {
        copy[idx].x = items[idx].x;
      } else {
        copy[idx].x = Math.round(startC + i * step - copy[idx].w / 2);
      }
    });
  } else {
    const sortedIndices = items
      .map((_, i) => i)
      .sort((a, b) => {
        const ca = copy[a].y + copy[a].h / 2;
        const cb = copy[b].y + copy[b].h / 2;
        if (Math.abs(ca - cb) > 1e-4) return ca - cb;
        if (Math.abs(copy[a].y - copy[b].y) > 1e-4) return copy[a].y - copy[b].y;
        return a - b;
      });
    const first = copy[sortedIndices[0]];
    const last = copy[sortedIndices[sortedIndices.length - 1]];
    const startC = first.y + first.h / 2;
    const endC = last.y + last.h / 2;
    const step = (endC - startC) / (items.length - 1);
    sortedIndices.forEach((idx, i) => {
      if (i === 0) {
        copy[idx].y = items[idx].y;
      } else if (i === sortedIndices.length - 1) {
        copy[idx].y = items[idx].y;
      } else {
        copy[idx].y = Math.round(startC + i * step - copy[idx].h / 2);
      }
    });
  }
  return copy;
}

/**
 * Set an explicit edge-to-edge gap between adjacent items.
 * Anchors the first item at its current position, and positions each
 * subsequent item at distance `gap` from the previous item's trailing edge:
 *   P_i = P_0 + sum_{j=0}^{i-1} W_j + i * gap
 * Supports N >= 2 items, K = 0 (abutting), and K < 0 (overlapping).
 */
export function applyCustomGapToItems(items, axis, gap) {
  if (!items || items.length < 2) return items ? items.map((it) => ({ ...it })) : [];
  const copy = items.map((it) => ({
    ...it,
    w: it.w ?? it.width ?? 0,
    h: it.h ?? it.height ?? 0,
  }));
  const posKey = axis === "horizontal" ? "x" : "y";
  const sizeKey = axis === "horizontal" ? "w" : "h";

  const sortedIndices = items
    .map((_, i) => i)
    .sort((a, b) => {
      const posA = copy[a][posKey];
      const posB = copy[b][posKey];
      if (Math.abs(posA - posB) > 1e-4) return posA - posB;
      const centerA = posA + copy[a][sizeKey] / 2;
      const centerB = posB + copy[b][sizeKey] / 2;
      if (Math.abs(centerA - centerB) > 1e-4) return centerA - centerB;
      return a - b;
    });

  const firstIdx = sortedIndices[0];
  const startPos = items[firstIdx][posKey];
  copy[firstIdx][posKey] = startPos;

  let accumulatedSize = 0;
  for (let i = 1; i < sortedIndices.length; i++) {
    accumulatedSize += copy[sortedIndices[i - 1]][sizeKey];
    const target = startPos + accumulatedSize + i * gap;
    copy[sortedIndices[i]][posKey] = Math.round(target);
  }

  return copy;
}

export const setGapSelection = applyCustomGapToItems;

/**
 * Distribute edge-to-edge spacing evenly between elements along an axis.
 * Outermost boundary layers remain firmly anchored (0px displacement).
 * Inner layers are spaced evenly using closed-form positioning:
 *   freeSpace = X_{N-1} - X_0 - sum_{i=0}^{N-2} W_i
 *   gap = freeSpace / (N - 1)
 *   P_k = X_0 + sum_{j=0}^{k-1} W_j + k * gap
 * to completely eliminate cumulative floating-point rounding drift.
 *
 * If customGap is provided, delegates to applyCustomGapToItems.
 */
export function distributeSpacingSelection(items, axis, customGap = null) {
  if (customGap !== null && customGap !== undefined) {
    return applyCustomGapToItems(items, axis, customGap);
  }
  if (!items || items.length < 3) return items ? items.map((it) => ({ ...it })) : [];

  const posKey = axis === "horizontal" ? "x" : "y";
  const sizeKey = axis === "horizontal" ? "w" : "h";

  const copy = items.map((it) => ({
    ...it,
    w: it.w ?? it.width ?? 0,
    h: it.h ?? it.height ?? 0,
  }));

  const sortedIndices = items
    .map((_, i) => i)
    .sort((a, b) => {
      const posA = copy[a][posKey];
      const posB = copy[b][posKey];
      if (Math.abs(posA - posB) > 1e-4) return posA - posB;
      const centerA = posA + copy[a][sizeKey] / 2;
      const centerB = posB + copy[b][sizeKey] / 2;
      if (Math.abs(centerA - centerB) > 1e-4) return centerA - centerB;
      return a - b;
    });

  const firstIdx = sortedIndices[0];
  const lastIdx = sortedIndices[sortedIndices.length - 1];
  const minLayer = copy[firstIdx];
  const maxLayer = copy[lastIdx];

  // Strict boundary anchoring: outermost elements firmly anchored
  copy[firstIdx][posKey] = items[firstIdx][posKey];
  copy[lastIdx][posKey] = items[lastIdx][posKey];

  const startPos = items[firstIdx][posKey];
  const endPos = items[lastIdx][posKey];

  let sumSizesExceptLast = 0;
  for (let i = 0; i < sortedIndices.length - 1; i++) {
    sumSizesExceptLast += copy[sortedIndices[i]][sizeKey];
  }

  const freeSpace = endPos - startPos - sumSizesExceptLast;
  const gap = freeSpace / (sortedIndices.length - 1);

  // Closed-form intermediate item positioning eliminating floating-point rounding drift
  let accumulatedSize = 0;
  for (let k = 1; k < sortedIndices.length - 1; k++) {
    accumulatedSize += copy[sortedIndices[k - 1]][sizeKey];
    const target = startPos + accumulatedSize + k * gap;
    copy[sortedIndices[k]][posKey] = Math.round(target);
  }

  return copy;
}

export function tidyUpSelection(items, axis) {
  return distributeSpacingSelection(items, axis);
}

/**
 * Measure average edge-to-edge gap between adjacent items along an axis.
 */
export function measureSelectionGap(items, axis = null) {
  if (!items || !Array.isArray(items) || items.length < 2) return 0;

  const normalized = items.map((it) => ({
    ...it,
    x: it.x ?? 0,
    y: it.y ?? 0,
    w: it.w ?? it.width ?? 0,
    h: it.h ?? it.height ?? 0,
  }));

  let activeAxis = axis;
  if (!activeAxis || !DISTRIBUTE_AXES.includes(activeAxis)) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const it of normalized) {
      if (it.x < minX) minX = it.x;
      if (it.x + it.w > maxX) maxX = it.x + it.w;
      if (it.y < minY) minY = it.y;
      if (it.y + it.h > maxY) maxY = it.y + it.h;
    }
    activeAxis = maxX - minX >= maxY - minY ? "horizontal" : "vertical";
  }

  const posKey = activeAxis === "horizontal" ? "x" : "y";
  const sizeKey = activeAxis === "horizontal" ? "w" : "h";

  const sorted = [...normalized].sort((a, b) => {
    const posA = a[posKey];
    const posB = b[posKey];
    if (Math.abs(posA - posB) > 1e-4) return posA - posB;
    const centerA = posA + a[sizeKey] / 2;
    const centerB = posB + b[sizeKey] / 2;
    if (Math.abs(centerA - centerB) > 1e-4) return centerA - centerB;
    return 0;
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let sumSizesExceptLast = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    sumSizesExceptLast += sorted[i][sizeKey];
  }

  const totalGap = last[posKey] - first[posKey] - sumSizesExceptLast;
  const avgGap = totalGap / (sorted.length - 1);
  return Math.abs(avgGap - Math.round(avgGap)) < 1e-4
    ? Math.round(avgGap)
    : Math.round(avgGap * 10) / 10;
}

function toItems(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node) => {
    const nx = node.x ?? 0;
    const ny = node.y ?? 0;
    const w = node.width ?? node.w ?? 0;
    const h = node.height ?? node.h ?? 0;
    const normalizedNode =
      node.width !== undefined && node.height !== undefined
        ? node
        : { ...node, width: w, height: h };
    const box =
      normalizedNode.width !== undefined ||
      normalizedNode.height !== undefined ||
      normalizedNode.rotation
        ? nodeAABB(normalizedNode)
        : {
            x: nx,
            y: ny,
            width: w,
            height: h,
          };
    const boxX = Number.isFinite(box?.x) ? box.x : nx;
    const boxY = Number.isFinite(box?.y) ? box.y : ny;
    const boxW = Number.isFinite(box?.width) ? box.width : w;
    const boxH = Number.isFinite(box?.height) ? box.height : h;
    return {
      item: { id: node.id, x: boxX, y: boxY, w: boxW, h: boxH },
      offsetX: nx - boxX,
      offsetY: ny - boxY,
      from: { x: nx, y: ny },
    };
  });
}

function toPatches(entries, results) {
  const patches = [];
  results.forEach((result, index) => {
    const entry = entries[index];
    if (!entry) return;
    const { offsetX, offsetY, from } = entry;
    const x = result.x + offsetX;
    const y = result.y + offsetY;
    if (x === from.x && y === from.y) return;
    patches.push({ id: result.id ?? entry.item.id, patch: { x, y } });
  });
  return patches;
}

export function alignNodes(nodes, type, canvasBounds = null) {
  if (!ALIGN_TYPES.includes(type)) return [];
  const entries = toItems(nodes);
  return toPatches(
    entries,
    alignSelection(
      entries.map((entry) => entry.item),
      type,
      canvasBounds,
    ),
  );
}

export function distributeNodes(nodes, axis) {
  if (!DISTRIBUTE_AXES.includes(axis)) return [];
  const entries = toItems(nodes);
  return toPatches(
    entries,
    distributeSelection(
      entries.map((entry) => entry.item),
      axis,
    ),
  );
}

/**
 * Distribute horizontal or vertical spacing across nodes.
 *
 * Supports:
 * - string axis ("horizontal" | "vertical"): boundary-anchored equal-gap distribution (N >= 3)
 * - options object { axis, gap }: custom gap setting (N >= 2)
 */
export function distributeSpacingNodes(
  nodes,
  axisOrOptions,
  canvasBounds = null,
) {
  let axis = "horizontal";
  let customGap = null;

  if (typeof axisOrOptions === "string") {
    axis = axisOrOptions;
  } else if (axisOrOptions && typeof axisOrOptions === "object") {
    axis = axisOrOptions.axis || "horizontal";
    if (
      typeof axisOrOptions.gap === "number" &&
      Number.isFinite(axisOrOptions.gap)
    ) {
      customGap = axisOrOptions.gap;
    } else if (
      typeof axisOrOptions.gap === "string" &&
      axisOrOptions.gap.trim() !== "" &&
      Number.isFinite(Number(axisOrOptions.gap))
    ) {
      customGap = Number(axisOrOptions.gap);
    }
  }

  if (!DISTRIBUTE_AXES.includes(axis)) return [];
  if (!Array.isArray(nodes) || nodes.length < 2) return [];

  const entries = toItems(nodes);
  const rawItems = entries.map((entry) => entry.item);

  let results;
  if (customGap !== null) {
    results = applyCustomGapToItems(rawItems, axis, customGap);
  } else {
    if (nodes.length < 3) return [];
    results = distributeSpacingSelection(rawItems, axis);
  }

  return toPatches(entries, results);
}

/** Tidy nodes alias for backward compatibility. */
export function tidyNodes(nodes, axis, canvasBounds = null) {
  return distributeSpacingNodes(nodes, axis, canvasBounds);
}

/** Explicit custom gap adjustment across nodes. */
export function setGapNodes(nodes, options) {
  const { axis = "horizontal", gap = 0 } = options || {};
  return distributeSpacingNodes(nodes, { axis, gap });
}

/**
 * Measure edge-to-edge spacing across nodes along an axis.
 * Returns { avgGap, minGap, maxGap, isEquidistant, dominantAxis } for N >= 2 nodes,
 * or null if fewer than 2 nodes are provided.
 */
export function measureSpacing(nodes, axis = null) {
  if (!nodes || !Array.isArray(nodes) || nodes.length < 2) return null;

  const entries = toItems(nodes);
  const items = entries.map((entry) => entry.item);

  // Compute bounding box / spread to determine dominant axis
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    if (it.x < minX) minX = it.x;
    if (it.x + it.w > maxX) maxX = it.x + it.w;
    if (it.y < minY) minY = it.y;
    if (it.y + it.h > maxY) maxY = it.y + it.h;
  }

  const spanX = Math.max(0, maxX - minX);
  const spanY = Math.max(0, maxY - minY);
  const spreadDominant = spanX >= spanY ? "horizontal" : "vertical";
  const activeAxis =
    axis && DISTRIBUTE_AXES.includes(axis) ? axis : spreadDominant;
  const dominantAxis = spreadDominant;

  const posKey = activeAxis === "horizontal" ? "x" : "y";
  const sizeKey = activeAxis === "horizontal" ? "w" : "h";

  const sorted = [...items].sort((a, b) => {
    const posA = a[posKey];
    const posB = b[posKey];
    if (Math.abs(posA - posB) > 1e-4) return posA - posB;
    const centerA = posA + a[sizeKey] / 2;
    const centerB = posB + b[sizeKey] / 2;
    if (Math.abs(centerA - centerB) > 1e-4) return centerA - centerB;
    return 0;
  });

  const gaps = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap =
      sorted[i + 1][posKey] - (sorted[i][posKey] + sorted[i][sizeKey]);
    gaps.push(gap);
  }

  if (gaps.length === 0) return null;

  const minGap = Math.min(...gaps);
  const maxGap = Math.max(...gaps);
  const sum = gaps.reduce((acc, g) => acc + g, 0);
  const rawAvg = sum / gaps.length;

  const roundedAvg =
    Math.abs(rawAvg - Math.round(rawAvg)) < 1e-4
      ? Math.round(rawAvg)
      : Math.round(rawAvg * 10) / 10;
  const roundedMin =
    Math.abs(minGap - Math.round(minGap)) < 1e-4
      ? Math.round(minGap)
      : Math.round(minGap * 10) / 10;
  const roundedMax =
    Math.abs(maxGap - Math.round(maxGap)) < 1e-4
      ? Math.round(maxGap)
      : Math.round(maxGap * 10) / 10;

  return {
    avgGap: roundedAvg,
    minGap: roundedMin,
    maxGap: roundedMax,
    isEquidistant: Math.abs(maxGap - minGap) <= 1,
    dominantAxis,
    axis: activeAxis,
  };
}
