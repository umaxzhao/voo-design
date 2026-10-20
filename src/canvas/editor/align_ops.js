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

export function tidyNodes(nodes, axis) {
  if (!DISTRIBUTE_AXES.includes(axis)) return [];
  const entries = toItems(nodes);
  return toPatches(
    entries,
    tidyUpSelection(
      entries.map((entry) => entry.item),
      axis,
    ),
  );
}
