/** Build the source layer tree in front-to-back display order. */
export function sourceLayerRows(sourceDoc, labelFor, query = "") {
  const nodes = sourceDoc?.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map();
  const roots = [];
  for (const node of nodes) {
    const parentId = node.parentId || node.clipTo;
    if (parentId && parentId !== node.id && byId.has(parentId)) {
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(node);
    } else {
      roots.push(node);
    }
  }
  const indices = new Map(nodes.map((node, index) => [node.id, index]));
  const matches = (node, seen = new Set()) => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    const label = labelFor(node, indices.get(node.id));
    if (label.toLowerCase().includes(query)) return true;
    return (children.get(node.id) ?? []).some((child) => matches(child, seen));
  };
  const rows = [];
  const visited = new Set();
  const append = (node, depth) => {
    if (visited.has(node.id) || (query && !matches(node))) return;
    visited.add(node.id);
    rows.push({ node, depth, index: indices.get(node.id) });
    const descendants = children.get(node.id) ?? [];
    for (let index = descendants.length - 1; index >= 0; index -= 1)
      append(descendants[index], depth + 1);
  };
  for (let index = roots.length - 1; index >= 0; index -= 1)
    append(roots[index], 0);
  // Invalid legacy parent links remain visible rather than hiding layers.
  for (let index = nodes.length - 1; index >= 0; index -= 1)
    append(nodes[index], 0);
  return rows;
}
