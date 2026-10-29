/** Resolve clips in world coordinates without changing flat document paint order. */
const contexts = new WeakMap();

export function createFrameClipContext(nodes = []) {
  if (contexts.has(nodes)) return contexts.get(nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ancestors = new Map();
  const framesOf = (node) => {
    if (!node.parentId) return [];
    if (ancestors.has(node.id)) return ancestors.get(node.id);
    const frames = [];
    const visited = new Set([node.id]);
    let parent = byId.get(node.parentId);
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      if (parent.isFrame && parent.clipContent !== false) frames.push(parent);
      parent = byId.get(parent.parentId);
    }
    ancestors.set(node.id, frames);
    return frames;
  };
  const context = { framesOf };
  contexts.set(nodes, context);
  return context;
}
