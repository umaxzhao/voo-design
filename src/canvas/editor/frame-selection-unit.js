import { NODE_KIND } from "./scene_doc_factory.js";
import { toNodeLocal } from "./scene_geometry.js";

const FRAME_EDGE_HIT_PX = 4;

/** Frames own a selectable surface; their contents remain independently editable. */
export function isFrameSelectionBoundary(node) {
  return Boolean(node && (node.isFrame || node.frame || node.containerType === "frame" || node.kind === "frame"));
}

/** Treat the visible inner edge as a drag target at any canvas zoom. */
export function isFrameEdgeHit(node, point, toDocPoint, event) {
  const local = toNodeLocal(node, point);
  const horizontal = toNodeLocal(node, toDocPoint(event.clientX + FRAME_EDGE_HIT_PX, event.clientY));
  const vertical = toNodeLocal(node, toDocPoint(event.clientX, event.clientY + FRAME_EDGE_HIT_PX));
  const toleranceX = Math.hypot(horizontal.x - local.x, vertical.x - local.x);
  const toleranceY = Math.hypot(horizontal.y - local.y, vertical.y - local.y);
  return local.x >= 0 && local.y >= 0 && local.x <= node.width && local.y <= node.height &&
    (local.x <= toleranceX || node.width - local.x <= toleranceX ||
      local.y <= toleranceY || node.height - local.y <= toleranceY);
}

const indexes = new WeakMap();
function indexedNodes(nodes) {
  const cached = indexes.get(nodes);
  if (cached?.length === nodes.length) return cached.byId;
  const byId = new Map();
  for (const node of nodes) if (!byId.has(node.id)) byId.set(node.id, node);
  indexes.set(nodes, { length: nodes.length, byId });
  return byId;
}

/** Promote ordinary groups/booleans, stopping before the nearest Frame. */
export function frameSelectionUnit(doc, node) {
  if (!node) return null;
  const byId = indexedNodes(doc.nodes);
  const seen = new Set([node.id]);
  let current = node;
  while (current.parentId) {
    if (seen.has(current.parentId)) return node;
    seen.add(current.parentId);
    const parent = byId.get(current.parentId);
    if (isFrameSelectionBoundary(parent)) break;
    if (!parent || ![NODE_KIND.GROUP, NODE_KIND.BOOLEAN].includes(parent.kind)) return node;
    current = parent;
  }
  return current;
}
