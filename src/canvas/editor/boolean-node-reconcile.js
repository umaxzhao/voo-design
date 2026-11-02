import { syncBooleanNode } from "./scene_model_node_builders.js";
import { booleanBoxChanged, positiveBooleanBox, resizeBooleanSources, transformBooleanChild } from "./boolean-box-transform.js";
import { bakeUnrepresentableBooleanOperand } from "./boolean-operand-bake.js";

/**
 * Reconcile one mutation, before history snapshots or painting. Explicitly
 * changed child boxes win over a parent's implicit transform in batch edits.
 */
export function reconcileBooleanNodes(before, rawNodes, { inheritChildren = false } = {}) {
  if (!rawNodes.some((node) => node.kind === "boolean")) return rawNodes;
  const old = new Map((before.nodes ?? []).map((node) => [node.id, node]));
  const raw = new Map(rawNodes.map((node) => [node.id, node]));
  const next = new Map(raw);
  const children = new Map();
  for (const node of rawNodes) {
    if (!node.parentId) continue;
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node.id);
  }
  const visited = new Set(), visiting = new Set();
  const removed = new Set();
  function removeDescendants(id) {
    for (const childId of children.get(id) ?? []) {
      if (removed.has(childId)) continue;
      removed.add(childId); removeDescendants(childId);
    }
  }
  function resolve(id) {
    if (removed.has(id)) return null;
    if (visited.has(id) || visiting.has(id)) return next.get(id);
    visiting.add(id);
    let node = next.get(id);
    if (node?.kind !== "boolean") { visiting.delete(id); return node; }
    const previous = old.get(id);
    const ownBoxChanged = previous && booleanBoxChanged(previous, node);
    // Generated nested geometry can legitimately be subpixel. Clamp only the
    // directly requested box, never an operand inherited from a parent scale.
    if (ownBoxChanged && node === raw.get(id)) node = positiveBooleanBox(node, previous);
    next.set(id, node);
    const childIds = children.get(id) ?? [];
    if (ownBoxChanged) {
      for (const childId of childIds) {
        const priorChild = old.get(childId), rawChild = raw.get(childId);
        if (!priorChild || !inheritChildren && booleanBoxChanged(priorChild, rawChild)) continue;
        const source = { ...next.get(childId), x: priorChild.x, y: priorChild.y,
          width: priorChild.width, height: priorChild.height };
        let transformed = transformBooleanChild(source, previous, node);
        if (transformed.kind === "boolean" && transformed.sources === priorChild.sources) {
          transformed = { ...transformed, sources: resizeBooleanSources(transformed.sources, priorChild, transformed) };
        }
        const baked = bakeUnrepresentableBooleanOperand(transformed);
        if (baked.kind !== transformed.kind && transformed.kind === "boolean") removeDescendants(childId);
        next.set(childId, baked);
      }
      if (!childIds.length && node.sources === previous.sources) {
        node = { ...node, sources: resizeBooleanSources(node.sources, previous, node) };
        next.set(id, node);
      }
    }
    for (const childId of childIds) resolve(childId);
    if (childIds.length) {
      const childNodes = childIds.map((childId) => next.get(childId));
      const childrenMoved = childNodes.some((child) => booleanBoxChanged(old.get(child.id), child));
      // A transformed container keeps its pivot stable during operand edits.
      // Painting/export derive their actual extent from its merged contours.
      const preserveBox = Boolean(ownBoxChanged || previous && !childrenMoved || node.rotation || node.shear || node.flipH || node.flipV);
      node = syncBooleanNode(node, childNodes, { preserveBox });
      next.set(id, node);
    }
    visiting.delete(id); visited.add(id);
    return node;
  }
  // Ancestors must transform descendants before nested snapshots are rebuilt.
  const roots = rawNodes.filter((node) => node.kind === "boolean" && raw.get(node.parentId)?.kind !== "boolean");
  for (const node of roots) resolve(node.id);
  for (const node of rawNodes) if (node.kind === "boolean") resolve(node.id);
  return rawNodes.filter((node) => !removed.has(node.id)).map((node) => next.get(node.id));
}

export function reconcileBooleanDocument(before, next, options) {
  if (before === next) return next;
  const nodes = reconcileBooleanNodes(before, next.nodes, options);
  return nodes === next.nodes ? next : { ...next, nodes };
}
