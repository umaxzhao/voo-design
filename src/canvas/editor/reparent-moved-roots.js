import { isHiddenByGroup, isLockedByGroup } from "./scene_model.js";
import { toNodeLocal } from "./scene_geometry.js";
import { createFrameClipContext } from "./frame-clip-context.js";
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

function containsPoint(node, point) {
  if (!(node.width > 0) || !(node.height > 0)) return false;
  const local = toNodeLocal(node, point);
  return local.x >= 0 && local.y >= 0 && local.x <= node.width && local.y <= node.height;
}

/** Match visible paint order, including clipping ancestors, rather than area. */
function visibleDropFrame(doc, point) {
  const clips = createFrameClipContext(doc.nodes);
  for (let index = doc.nodes.length - 1; index >= 0; index--) {
    const node = doc.nodes[index];
    if (!isFrameSelectionBoundary(node) || node.visible === false || node.locked) continue;
    if (isHiddenByGroup(doc, node) || isLockedByGroup(doc, node)) continue;
    if (!containsPoint(node, point)) continue;
    if (clips.framesOf(node).every(ancestor => containsPoint(ancestor, point))) return node;
  }
  return null;
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
    const target = visibleDropFrame(targets, {
      x: (node.x ?? 0) + (node.width ?? 0) / 2,
      y: (node.y ?? 0) + (node.height ?? 0) / 2,
    });
    if (target && node.parentId !== target.id) next = moveIntoGroup(next, id, target.id);
    else if (!target && node.parentId) next = moveNodeToRoot(next, id, next.nodes.length);
  }
  return next;
}
