import { NODE_KIND } from "./scene_model.js";

// Document node arrays are immutable; cache ordering and exceptional hit targets.
const metadata = new WeakMap();
export function hitTestMetadata(nodes) {
  let cached = metadata.get(nodes);
  if (!cached) {
    const order = new Map();
    const byId = new Map();
    const fills = [];
    const parents = new Set();
    nodes.forEach((node, i) => {
      order.set(node.id, i);
      byId.set(node.id, node);
      if (node.parentId) parents.add(node.parentId);
      if (node.kind === NODE_KIND.CANVAS_INSTANCE && node.instance?.layoutMode === 'fill') fills.push(node);
    });
    cached = { order, byId, fills, parents, hasFillInstance: fills.length > 0 };
    metadata.set(nodes, cached);
  }
  return cached;
}
export function orderedCandidates(nodes, candidates, extra = []) {
  const { order, byId } = hitTestMetadata(nodes);
  const unique = new Map(extra.map(node => [node.id, node]));
  for (const candidate of candidates) {
    const node = candidate.node ?? byId.get(candidate.id);
    if (node && order.has(node.id)) unique.set(node.id, node);
  }
  return [...unique.values()].sort((a, b) => order.get(b.id) - order.get(a.id));
}
