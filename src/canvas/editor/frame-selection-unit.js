import { NODE_KIND } from "./scene_doc_factory.js";

/** Frames own a selectable surface; their contents remain independently editable. */
export function isFrameSelectionBoundary(node) {
  return Boolean(node && (node.isFrame || node.frame || node.containerType === "frame" || node.kind === "frame"));
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
