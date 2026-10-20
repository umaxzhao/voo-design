import { NODE_KIND, isRegionNode } from "./scene_model.js";
import { withNodes } from "./doc_ops_nodes.js";

/**
 * Clips one layer into a specific target (drag a layer onto another in the
 * panel, Photoshop-style). The source must paint and may not be a group row,
 * region or adjustment layer; the target must be a valid clip base below it.
 * Setting `clipTo` to the target id is all the document needs — the renderer
 * draws the chain when it reaches the target.
 */
export function clipNodeInto(doc, sourceId, targetId) {
  const source = doc.nodes.find((node) => node.id === sourceId);
  if (!source) return doc;
  if (
    isRegionNode(source) ||
    source.kind === NODE_KIND.GROUP ||
    source.kind === NODE_KIND.ADJUSTMENT
  ) {
    return doc;
  }
  const target = doc.nodes.find((node) => node.id === targetId);
  if (!target || target.visible === false) return doc;
  if (
    isRegionNode(target) ||
    target.kind === NODE_KIND.GROUP ||
    target.kind === NODE_KIND.ADJUSTMENT
  ) {
    return doc;
  }
  const sourceIndex = doc.nodes.findIndex((node) => node.id === sourceId);
  const targetIndex = doc.nodes.findIndex((node) => node.id === targetId);
  if (targetIndex >= sourceIndex) return doc;
  if (source.clipTo === targetId) return doc;
  return withNodes(
    doc,
    doc.nodes.map((node) =>
      node.id === sourceId ? { ...node, clipTo: targetId } : node,
    ),
  );
}

/**
 * The layer immediately below `node` in paint order that a clipping mask can
 * target: the next drawing node beneath it. A group row or a region is not a
 * valid base — a clipping mask needs a shape that paints.
 */
export function clipBaseBelow(doc, node) {
  const index = doc.nodes.findIndex((candidate) => candidate.id === node?.id);
  if (index <= 0) return null;
  for (let i = index - 1; i >= 0; i -= 1) {
    const below = doc.nodes[i];
    if (
      below.visible === false ||
      isRegionNode(below) ||
      below.kind === NODE_KIND.GROUP ||
      below.kind === NODE_KIND.ADJUSTMENT
    ) {
      continue;
    }
    return below;
  }
  return null;
}

/**
 * Clips the given node ids into the layer below each one (Photoshop's
 * Alt+⌘G): every selected node gains `clipTo` pointing at its nearest
 * paint-order neighbour beneath. Nodes that already point at that neighbour
 * are left alone, so repeating the shortcut on the same selection is a no-op
 * rather than a growing chain.
 */
export function createClippingMasks(doc, ids) {
  const targets = new Set(ids);
  const nodes = doc.nodes.map((node) => {
    if (
      !targets.has(node.id) ||
      isRegionNode(node) ||
      node.kind === NODE_KIND.ADJUSTMENT
    ) {
      return node;
    }
    const below = clipBaseBelow(doc, node);
    if (!below || node.clipTo === below.id) return node;
    return { ...node, clipTo: below.id };
  });
  return withNodes(doc, nodes);
}

/**
 * Releases the given nodes from their clipping masks. Without arguments every
 * clipped layer in the document is released; with ids, only those nodes.
 */
export function releaseClippingMasks(doc, ids = null) {
  const targets = ids ? new Set(ids) : null;
  const nodes = doc.nodes.map((node) => {
    if (!node.clipTo) return node;
    if (targets && !targets.has(node.id)) return node;
    const { clipTo, ...rest } = node;
    void clipTo;
    return rest;
  });
  return withNodes(doc, nodes);
}

/**
 * Releases every layer whose clip points at `baseId` — the cleanup half of
 * deleting a clipping-mask base: the mask's target is gone, so the layers
 * that sat inside it go back to being plain layers instead of dangling.
 */
export function releaseClippingMasksTo(doc, baseId) {
  const nodes = doc.nodes.map((node) => {
    if (node.clipTo !== baseId) return node;
    const { clipTo, ...rest } = node;
    void clipTo;
    return rest;
  });
  return withNodes(doc, nodes);
}
