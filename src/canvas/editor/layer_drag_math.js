/**
 * Pure drag-decision helpers for the layers panel.
 *
 * The panel's reorder is a two-step decision: (1) can this row start a drag
 * at all (is it draggable, and does it have a place to go)? and (2) given
 * where the pointer lands, which slot/index does the drop map to? Both were
 * buried in the `use_layer_drag` hook (and its `beginRowDrag` / `finish`),
 * which the suite could not reach because it needs React DOM events. These
 * pure functions are the extractable core, so `node:test` can pin the decision
 * and catch a regression without a browser.
 */

import {
  allowedSlotRange,
  childSlotToRootIndex,
  slotToDocTarget,
} from "./layer_order.js";

/**
 * Whether a row may start a drag, and if so the slot space it may drop into.
 *
 * Mirrors `beginRowDrag`: a row is draggable when its node exists, is unlocked,
 * and has a non-null slot range. A group member (`isChild`) takes the caller's
 * whole-root `range`; a top-level row is bounded by `allowedSlotRange`.
 *
 * @returns {{range: {min:number,max:number}, fromDocIndex: number} | null}
 */
export function resolveDragStart(nodes, node, isChild = false, range = null) {
  if (!node || node.locked) return null;
  const slotRange = isChild ? range : allowedSlotRange(nodes, node.id);
  if (!slotRange) return null;
  // A group member is never in the top-level `nodes` list, so its start needs
  // no membership check; a top-level row must resolve to a slot range and drop
  // target from its own position there.
  const from = isChild
    ? -1
    : nodes.findIndex((candidate) => candidate.id === node.id);
  if (!isChild && from < 0) return null;
  const fromDocIndex = isChild ? -1 : nodes.length - 1 - from;
  return { range: slotRange, fromDocIndex };
}

/**
 * The drop target for a row given where it was released (`slot`), in the
 * coordinate space the caller understands. A group member maps to a
 * root-plane index; a top-level row keeps the ordinary reorder math.
 */
export function resolveDropTarget(nodes, isChild, fromDisplay, slot) {
  if (isChild) return childSlotToRootIndex(nodes.length, slot);
  return slotToDocTarget(nodes.length, fromDisplay, slot);
}

/**
 * Clamp a raw insertion slot into a row's slot range. Takes the range as an
 * explicit argument (never a closed-over variable), so a caller passing
 * `undefined` — the bug that killed every top-level layer drag when the hook
 * read the wrong `range` — becomes an immediate throw instead of a silent
 * `undefined.min` TypeError, and the mis-wiring is caught at the test layer.
 */
export function computeDropSlot(range, raw) {
  if (
    !range ||
    typeof range.min !== "number" ||
    typeof range.max !== "number"
  ) {
    throw new Error("computeDropSlot needs a numeric range {min,max}");
  }
  return Math.max(range.min, Math.min(range.max, raw));
}
