import { applyConstraints, reflowConstraints } from "./scene_constraints.js";

/** Resolve from original boxes so historical centering never adds a second delta. */
export function reflowDocumentResize(before, resized) {
  const beforeBoxes = new Map(before.nodes.map((node) => [node.id, node]));
  const next = reflowConstraints(resized, {
    oldBox: { x: 0, y: 0, width: before.width, height: before.height },
    newBox: { x: 0, y: 0, width: resized.width, height: resized.height },
    beforeBoxes,
  });
  // Node coordinates are document-absolute. Moving/resizing a constrained
  // container must carry its descendants, including nested pinned children.
  const byId = new Map(next.nodes.map((node) => [node.id, node]));
  const children = new Map();
  for (const node of next.nodes) {
    if (!node.parentId) continue;
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node.id);
  }
  const queue = next.nodes.filter((node) => !node.parentId && children.has(node.id));
  const visited = new Set();
  for (let index = 0; index < queue.length; index += 1) {
    const parent = queue[index];
    if (visited.has(parent.id)) continue;
    visited.add(parent.id);
    const oldParent = beforeBoxes.get(parent.id);
    if (!oldParent) continue;
    const dx = parent.x - oldParent.x;
    const dy = parent.y - oldParent.y;
    for (const id of children.get(parent.id) ?? []) {
      const child = byId.get(id);
      const original = beforeBoxes.get(id);
      if (!original || original.hostId) continue;
      // Auto-layout owns flow geometry; its existing engine pass runs next.
      const box = child.constraints && (!parent.autoLayout || child.layoutPosition === "absolute")
        ? applyConstraints(original, oldParent, parent, child.constraints)
        : { x: original.x + dx, y: original.y + dy };
      const resolved = { ...child, ...box };
      byId.set(id, resolved);
      if (children.has(id)) queue.push(resolved);
    }
  }
  return { ...next, nodes: next.nodes.map((node) => byId.get(node.id)) };
}
