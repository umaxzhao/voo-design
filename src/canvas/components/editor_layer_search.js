/** Propagate positive matches toward ancestors once, including cyclic legacy links. */
export function subtreeMatcher(nodes, childrenMap, clipMap, matchesSelf) {
  const parents = new Map();
  for (const edges of [childrenMap, clipMap]) {
    for (const [parentId, children] of edges) {
      for (const child of children) {
        if (!parents.has(child.id)) parents.set(child.id, []);
        parents.get(child.id).push(parentId);
      }
    }
  }
  const matching = new Set();
  const queue = [];
  for (const node of nodes) {
    if (!matchesSelf(node)) continue;
    matching.add(node.id);
    queue.push(node.id);
  }
  for (let index = 0; index < queue.length; index++) {
    for (const parentId of parents.get(queue[index]) ?? []) {
      if (matching.has(parentId)) continue;
      matching.add(parentId);
      queue.push(parentId);
    }
  }
  return node => matching.has(node.id);
}
