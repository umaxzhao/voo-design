import { groupDescendants, isGroupNode, isRegionNode } from "./scene_model.js";

/** Preserve group subtrees and selection order while moving sibling blocks. */
export function reorderLayerBatch(doc, ids, direction) {
  if (![1, -1].includes(direction) || !ids?.length || doc.nodes.length < 2) return null;
  const selected = new Set(ids);
  const byId = new Map(doc.nodes.map(node => [node.id, node]));
  const selectedAncestor = node => {
    const visited = new Set();
    for (let parent = byId.get(node.parentId); parent && !visited.has(parent.id); parent = byId.get(parent.parentId)) {
      if (selected.has(parent.id)) return true;
      visited.add(parent.id);
    }
    return false;
  };
  const roots = doc.nodes.filter(node => selected.has(node.id) && !selectedAncestor(node));
  if (direction > 0) roots.reverse();
  const blockIds = node => new Set([node.id, ...(isGroupNode(node)
    ? groupDescendants(doc, node.id).map(child => child.id) : [])]);
  let nodes = doc.nodes;
  for (const root of roots) {
    const siblings = nodes.filter(node => (node.parentId ?? null) === (root.parentId ?? null));
    const index = siblings.findIndex(node => node.id === root.id);
    const neighbor = siblings[index + direction];
    if (!neighbor || selected.has(neighbor.id) || isRegionNode(root) !== isRegionNode(neighbor)) continue;
    const moving = blockIds(root);
    const adjacent = blockIds(neighbor);
    if (nodes.some(node => (moving.has(node.id) || adjacent.has(node.id)) && node.locked)) continue;
    const block = nodes.filter(node => moving.has(node.id));
    const rest = nodes.filter(node => !moving.has(node.id));
    let target = rest.findIndex(node => adjacent.has(node.id));
    if (direction > 0) {
      for (let i = target; i < rest.length; i++) if (adjacent.has(rest[i].id)) target = i + 1;
    }
    nodes = [...rest.slice(0, target), ...block, ...rest.slice(target)];
  }
  return nodes === doc.nodes ? null : nodes;
}
