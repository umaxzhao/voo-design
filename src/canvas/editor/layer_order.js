/**
 * Index mapping between the layers panel and the document.
 *
 * The document's node list is bottom-up; the panel displays it reversed,
 * topmost layer first, like every image editor. These helpers are pure so
 * `node:test` can pin down the drag-to-reorder math without a DOM.
 */

import { isRegionNode } from "./scene_model.js";

/** Display position (0 = top row) → document stack index (0 = bottom). */
export function displayToDocIndex(count, displayIndex) {
  return count - 1 - displayIndex;
}

/**
 * Maps a drop slot to the document index the dragged node should occupy.
 *
 * Slots number the gaps between displayed rows: slot 0 sits above the top
 * row, slot `count` below the bottom one. Rows below the dragged one close
 * up when it lifts out, which is why a slot past its row maps one lower.
 */
export function slotToDocTarget(count, fromDisplay, slot) {
  const clamped = Math.max(0, Math.min(count, slot));
  const display = clamped <= fromDisplay ? clamped : clamped - 1;
  return displayToDocIndex(count, display);
}

/**
 * The root-plane position a dragged group member lands at when dropped on a
 * root slot — "pull this layer out of its folder".
 *
 * Slots gap the *displayed* top-level rows (slot 0 above the top row, slot
 * `rootCount` below the bottom one), while a root-plane index is measured
 * against the plane's bottom-up stack (index 0 is the bottom, `rootCount`
 * the top). A member lifted out of its folder leaves no top-level gap behind
 * — it was never a top-level row — so it maps straight to a root index, with
 * the two directions inverting each other.
 */
export function childSlotToRootIndex(rootCount, slot) {
  const clamped = Math.max(0, Math.min(rootCount, Math.round(slot)));
  return rootCount - clamped;
}

/**
 * The gap the pointer is over, from the rows' screen rectangles in display
 * order. A pointer above a row's vertical midpoint inserts above that row.
 */
export function insertionSlotAt(rowRects, pointerY) {
  for (let i = 0; i < rowRects.length; i += 1) {
    const mid = rowRects[i].top + rowRects[i].height / 2;
    if (pointerY < mid) return Number.isFinite(rowRects[i].position) ? rowRects[i].position : i;
  }
  if (Number.isFinite(rowRects.at(-1)?.position)) return rowRects.at(-1).position + 1;
  return rowRects.length;
}

/**
 * The slots a node may drop into, in display order, or null when it cannot
 * move at all (missing or locked — a locked node is never draggable).
 *
 * A locked node keeps its slot, so the range stops at the nearest locked
 * neighbour on either side; a region may not leave the region plane at the
 * top of the stack, nor may an artwork node enter it.
 */
export function allowedSlotRange(nodes, id) {
  const count = nodes.length;
  const from = nodes.findIndex((node) => node.id === id);
  if (from < 0 || nodes[from].locked) return null;
  const firstRegion = nodes.findIndex(isRegionNode);
  let lo;
  let hi;
  if (isRegionNode(nodes[from])) {
    lo = firstRegion;
    hi = count - 1;
  } else {
    lo = 0;
    hi = firstRegion < 0 ? count - 1 : firstRegion - 1;
  }
  for (let i = from - 1; i >= lo; i -= 1) {
    if (nodes[i].locked) {
      lo = i + 1;
      break;
    }
  }
  for (let i = from + 1; i <= hi; i += 1) {
    if (nodes[i].locked) {
      hi = i - 1;
      break;
    }
  }
  // A document target of t displays at count-1-t, and the dragged row lifts
  // out of the list, so the slot range reaches one gap past each end.
  return { min: count - 1 - hi, max: count - lo };
}
