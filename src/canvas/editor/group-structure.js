/** Return selected roots in paint order without lifting their selected descendants. */
export function groupingRoots(doc, ids) {
  const wanted = new Set(ids);
  if (wanted.size === 0) return [];
  const byId = new Map(doc.nodes.map(node => [node.id, node]));
  return doc.nodes.filter(node => {
    if (!wanted.has(node.id)) return false;
    const visited = new Set([node.id]);
    for (let parent = byId.get(node.parentId); parent && !visited.has(parent.id); parent = byId.get(parent.parentId)) {
      if (wanted.has(parent.id)) return false;
      visited.add(parent.id);
    }
    return true;
  });
}

/** A group spanning different Frames belongs to their nearest common container. */
export function sharedGroupParent(doc, members) {
  const byId = new Map(doc.nodes.map(node => [node.id, node]));
  const parents = members.map(node => {
    const chain = [], visited = new Set([node.id]);
    for (let parent = byId.get(node.parentId); parent && !visited.has(parent.id); parent = byId.get(parent.parentId)) {
      visited.add(parent.id); chain.push(parent.id);
    }
    return chain;
  });
  return parents[0]?.find(id => parents.every(chain => chain.includes(id))) ?? null;
}
