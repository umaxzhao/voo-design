import { isLockedByGroup } from "./scene_model.js";
import { withNodes } from "./doc_ops_nodes.js";

/** Shifts a node by a delta, used by dragging and arrow-key nudges. */
export function moveNodeBy(doc, id, dx, dy) {
  const node = doc.nodes.find((candidate) => candidate.id === id);
  // A folder's lock reaches every node inside it, not just the folder row;
  // a position lock freezes the box the same way a full lock does.
  if (!node || node.locked || node.lockPosition || isLockedByGroup(doc, node))
    return doc;
  return moveWithFollowers(doc, [id], dx, dy);
}

/**
 * The ids that must travel with a move of `ids`: the ids themselves, every
 * descendant of a group in the set, and every layer clipped into a moved
 * node — chained, so a follower that is itself a base pulls its own
 * followers. Photoshop's groups and clipping masks move as one unit; the
 * children keep their relative arrangement.
 */
export function moveAffectedIds(doc, ids) {
  const affected = new Set();
  const queue = ids.filter((id) => doc.nodes.some((node) => node.id === id));
  while (queue.length) {
    const id = queue.pop();
    if (affected.has(id)) continue;
    affected.add(id);
    for (const node of doc.nodes) {
      if (
        (node.parentId === id || node.clipTo === id) &&
        !affected.has(node.id)
      ) {
        queue.push(node.id);
      }
    }
  }
  return [...affected];
}

/**
 * Moves a set of nodes and everything that belongs to them (see
 * moveAffectedIds) by the same delta, one history entry, so a folder drag
 * carries its children and a clip base carries its clipped layers. Any
 * locked member refuses the whole move — nothing shears off.
 */
export function moveWithFollowers(doc, ids, dx, dy) {
  const affected = moveAffectedIds(doc, ids);
  if (affected.length === 0) return doc;
  for (const id of affected) {
    const node = doc.nodes.find((candidate) => candidate.id === id);
    if (!node || node.locked || node.lockPosition || isLockedByGroup(doc, node))
      return doc;
  }
  return withNodes(
    doc,
    doc.nodes.map((node) =>
      affected.includes(node.id)
        ? { ...node, x: node.x + dx, y: node.y + dy }
        : node,
    ),
  );
}
