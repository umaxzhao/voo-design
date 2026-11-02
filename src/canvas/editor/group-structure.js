/** Return selected roots in paint order without lifting their selected descendants. */
export function groupingRoots(doc, ids) {
  const wanted = new Set(ids);
  if (wanted.size === 0) return [];
  const byId = new Map(doc.nodes.map(node => [node.id, node]));
  /**
   * A selected unit's move already carries this node: `moveAffectedIds` follows
   * both `parentId` and `clipTo` edges, so a selected mask base drags its
   * clipped followers with it. Such a node must not also be an independent
   * root, or a layout delta (align/distribute) would displace it twice.
   */
  const carriedBySelection = node => {
    const visited = new Set([node.id]);
    const walk = candidate => {
      if (!candidate || visited.has(candidate.id)) return false;
      visited.add(candidate.id);
      if (wanted.has(candidate.id)) return true;
      return walk(byId.get(candidate.parentId)) || walk(byId.get(candidate.clipTo));
    };
    return walk(byId.get(node.parentId)) || walk(byId.get(node.clipTo));
  };
  return doc.nodes.filter(node => wanted.has(node.id) && !carriedBySelection(node));
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
