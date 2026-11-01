import { visibleFrameAtPoint, containsFramePoint } from "./frame-target.js";
import { isFrameSelectionBoundary } from "./frame-selection-unit.js";
import { moveIntoGroup, moveNodeToRoot } from "./doc_ops_groups.js";
import { toNodeLocal } from "./scene_geometry.js";

export const REPARENT_HYSTERESIS = 12;

export function isInsideFrameInset(frame, point, hysteresis = REPARENT_HYSTERESIS) {
  if (!frame || !point || !containsFramePoint(frame, point)) return false;
  const local = toNodeLocal(frame, point);
  const width = frame.width ?? 0;
  const height = frame.height ?? 0;
  const h = Math.max(0, Math.min(hysteresis, width / 2, height / 2));
  return (
    local.x >= h &&
    local.x <= width - h &&
    local.y >= h &&
    local.y <= height - h
  );
}

function findParentFrame(node, byId) {
  const seen = new Set();
  let currentId = node.parentId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const parent = byId.get(currentId);
    if (!parent) break;
    if (isFrameSelectionBoundary(parent)) return parent;
    currentId = parent.parentId;
  }
  return null;
}

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
export function reparentMovedRoots(doc, origins, options = {}) {
  if (!doc?.isCanvasRoot || !Array.isArray(origins)) return doc;
  const hysteresis =
    typeof options === "number"
      ? options
      : (options?.hysteresis ?? REPARENT_HYSTERESIS);
  const byId = new Map(doc.nodes.map(node => [node.id, node]));
  const movedIds = new Set(origins.map(origin => origin.id));
  // A selected unit cannot be dropped into itself or one of its moved children.
  const targets = { ...doc, nodes: doc.nodes.filter(node => !movedIds.has(node.id)) };
  let next = doc;
  for (const { id } of origins) {
    const node = byId.get(id);
    if (!node || (isFrameSelectionBoundary(node) && !node.parentId) || hasMovingAncestor(node, movedIds, byId)) continue;
    const center = {
      x: (node.x ?? 0) + (node.width ?? 0) / 2,
      y: (node.y ?? 0) + (node.height ?? 0) / 2,
    };

    const oldParentFrame = findParentFrame(node, byId);

    // Rule 1: Leaving old parent requires center to be strictly outside the old parent's inset rect.
    if (oldParentFrame && isInsideFrameInset(oldParentFrame, center, hysteresis)) {
      continue;
    }

    const target = visibleFrameAtPoint(targets, center);
    if (target) {
      if (oldParentFrame && target.id === oldParentFrame.id) {
        continue;
      }
      // Rule 2: Entering new Frame requires center to be strictly inside the new Frame's inset rect.
      if (isInsideFrameInset(target, center, hysteresis)) {
        if (node.parentId !== target.id) {
          next = moveIntoGroup(next, id, target.id);
        }
      }
    } else if (node.parentId) {
      next = moveNodeToRoot(next, id, next.nodes.length);
    }
  }
  return next;
}
