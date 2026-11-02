import { isFrameSelectionBoundary } from "./frame-selection-unit.js";
/** Resolve clips in world coordinates without changing flat document paint order. */
const contexts = new WeakMap();

export function createFrameClipContext(nodes = []) {
  if (contexts.has(nodes)) return contexts.get(nodes);
  let byId = null;
  const ancestors = new Map();
  const framesOf = (node) => {
    if (!node.parentId) return [];
    if (ancestors.has(node.id)) return ancestors.get(node.id);
    const frames = [];
    const visited = new Set([node.id]);
    byId ??= new Map(nodes.map(item => [item.id, item]));
    let parent = byId.get(node.parentId);
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      if (isFrameSelectionBoundary(parent) && parent.clipContent !== false) frames.push(parent);
      parent = byId.get(parent.parentId);
    }
    ancestors.set(node.id, frames);
    return frames;
  };
  const context = { framesOf };
  contexts.set(nodes, context);
  return context;
}
