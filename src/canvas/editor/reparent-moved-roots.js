import { visibleFrameAtPoint } from "./frame-target.js";
import { isFrameSelectionBoundary } from "./frame-selection-unit.js";
import { moveIntoGroup, moveNodeToRoot } from "./doc_ops_groups.js";

function hasMovingAncestor(node, movedIds, byId) {
  const seen = new Set([node.id]);
  let parentId = node.parentId;
  while (parentId && !seen.has(parentId)) {
    if (movedIds.has(parentId)) return true;
    seen.add(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
  return false;
}

/** A move's descendants travel with their parent, never as independent drops. */
export function reparentMovedRoots(doc, origins) {
  if (!doc?.isCanvasRoot || !Array.isArray(origins)) return doc;
  const byId = new Map(doc.nodes.map(node => [node.id, node]));
  const movedIds = new Set(origins.map(origin => origin.id));
  // A selected unit cannot be dropped into itself or one of its moved children.
  const targets = { ...doc, nodes: doc.nodes.filter(node => !movedIds.has(node.id)) };
  let next = doc;
  for (const { id } of origins) {
    const node = byId.get(id);
    if (!node || (isFrameSelectionBoundary(node) && !node.parentId) || hasMovingAncestor(node, movedIds, byId)) continue;
    const target = visibleFrameAtPoint(targets, {
      x: (node.x ?? 0) + (node.width ?? 0) / 2,
      y: (node.y ?? 0) + (node.height ?? 0) / 2,
    });
    if (target && node.parentId !== target.id) next = moveIntoGroup(next, id, target.id);
    else if (!target && node.parentId) next = moveNodeToRoot(next, id, next.nodes.length);
  }
  return next;
}
