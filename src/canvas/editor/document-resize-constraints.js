import { applyConstraints, reflowConstraints } from "./scene_constraints.js";

/** Resolve from original boxes so historical centering never adds a second delta. */
export function reflowDocumentResize(before, resized) {
  const beforeBoxes = new Map(before.nodes.map((node) => [node.id, node]));
  const next = reflowConstraints(resized, {
    oldBox: { x: 0, y: 0, width: before.width, height: before.height },
    newBox: { x: 0, y: 0, width: resized.width, height: resized.height },
    beforeBoxes,
  });
  return reflowDescendants(before, next, next.nodes.filter((node) => !node.parentId).map((node) => node.id));
}

function reflowDescendants(before, next, rootIds) {
  if (next === before) return before;
  // Node coordinates are document-absolute. Moving/resizing a constrained
  // container must carry its descendants, including nested pinned children.
  const beforeBoxes = new Map(before.nodes.map((node) => [node.id, node]));
  const byId = new Map(next.nodes.map((node) => [node.id, node]));
  const children = new Map();
  for (const node of next.nodes) {
    if (!node.parentId) continue;
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node.id);
  }
  const queue = rootIds.map((id) => byId.get(id)).filter(Boolean);
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

/**
 * Resize a frame node and reflow its constrained children.
 *
 * `reflowDocumentResize` only covers the page box. A frame inside the page
 * resizes through the node panel, which historically changed the frame box but
 * left its children where they were; this is the same policy applied to one
 * node's box. `patch` uses the document's x/y/width/height names.
 */
export function reflowFrameNodeResize(doc, frameId, patch = {}) {
  if (!doc?.nodes || !frameId) return doc;
  const frame = doc.nodes.find((node) => node.id === frameId);
  if (!frame) return doc;
  const oldBox = {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  };
  const nextBox = {
    ...oldBox,
    ...(patch.x !== undefined ? { x: patch.x } : {}),
    ...(patch.y !== undefined ? { y: patch.y } : {}),
    ...(patch.width !== undefined ? { width: patch.width } : {}),
    ...(patch.height !== undefined ? { height: patch.height } : {}),
  };
  const reflowed = reflowConstraints(doc, {
    parentId: frameId,
    oldBox,
    newBox: nextBox,
  });
  return reflowDescendants(doc, reflowed, [frameId]);
}
