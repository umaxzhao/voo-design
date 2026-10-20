import {
  groupDescendants,
  isGroupNode,
  isRegionNode,
  topLevelGroupOf,
} from "./scene_model.js";
import { withNodes } from "./doc_ops_nodes.js";

/**
 * Brings a node to the very front or back of its plane in one step — the
 * Figma ⌘] / ⌘[ gesture (Photoshop's ⇧⌘] / ⇧⌘[ land there too), where the
 * ±1 step of `reorderNode` would need many presses. A folder member's whole top-level folder is the
 * movable unit, so a group and its contents travel as one block, reusing
 * `reorderGroupTo`'s block semantics.
 *
 * The same two invariants as `reorderNode` hold: a locked node keeps its
 * slot — the move may neither land on it nor push past it, so the lift stops
 * just below the first locked node above (or above the first one below) —
 * and the region plane's boundary is never crossed in either direction.
 * A refused or no-op move returns the document unchanged, so the caller can
 * skip the history entry.
 */
export function moveNodeToExtreme(doc, id, direction) {
  if (direction !== "front" && direction !== "back") return doc;
  const index = doc.nodes.findIndex((node) => node.id === id);
  if (index < 0) return doc;
  const node = doc.nodes[index];
  if (node.locked) return doc;

  const unit = topLevelGroupOf(doc, node) ?? node;
  const blockIds = new Set([
    unit.id,
    ...(isGroupNode(unit)
      ? groupDescendants(doc, unit.id).map((member) => member.id)
      : []),
  ]);
  const plane = isRegionNode(unit);
  for (const candidate of doc.nodes) {
    if (!blockIds.has(candidate.id)) continue;
    // A locked member keeps its slot with the block, so the whole unit is
    // frozen; a block that mixes region and artwork nodes has no single
    // plane to lift towards, so it is refused too.
    if (candidate.locked || isRegionNode(candidate) !== plane) return doc;
  }

  const block = doc.nodes.filter((candidate) => blockIds.has(candidate.id));
  const rest = doc.nodes.filter((candidate) => !blockIds.has(candidate.id));
  // The block's current slot in rest coordinates: every node before its
  // first member is a rest node, because group blocks stay contiguous.
  let at = 0;
  for (const candidate of doc.nodes) {
    if (blockIds.has(candidate.id)) break;
    at += 1;
  }

  let insert = at;
  if (direction === "front") {
    for (let target = at; target < rest.length; target += 1) {
      const other = rest[target];
      if (other.locked || isRegionNode(other) !== plane) break;
      insert = target + 1;
    }
  } else {
    for (let target = at - 1; target >= 0; target -= 1) {
      const other = rest[target];
      if (other.locked || isRegionNode(other) !== plane) break;
      insert = target;
    }
  }
  if (insert === at) return doc;

  return withNodes(doc, [
    ...rest.slice(0, insert),
    ...block,
    ...rest.slice(insert),
  ]);
}

/**
 * The ids to lift, ordered so the set keeps its relative stacking:
 * bottom-most first when bringing to the front (each move lands above the
 * previous one) and top-most first when sending to the back (each lands
 * below the previous one). Selection order is pick order, which is
 * unrelated to paint order, hence the doc-order sort.
 */
export function extremeOrder(doc, ids, direction) {
  const wanted = new Set(Array.isArray(ids) ? ids : [ids]);
  const ordered = doc.nodes
    .filter((node) => wanted.has(node.id))
    .map((node) => node.id);
  return direction === "back" ? ordered.reverse() : ordered;
}
