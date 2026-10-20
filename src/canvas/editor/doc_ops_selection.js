import {
  isGroupNode,
  isHiddenByGroup,
  isLockedByGroup,
} from "./scene_model.js";
import { nodeAABB, rectsIntersect, toNodeLocal } from "./scene_geometry.js";

function nodeIntersectsMarquee(node, rect) {
  if (!rectsIntersect(nodeAABB(node), rect)) return false;
  if (!((node.rotation ?? 0) || (node.shear ?? 0))) return true;

  const c1 = toNodeLocal(node, { x: rect.x, y: rect.y });
  const c2 = toNodeLocal(node, { x: rect.x + rect.width, y: rect.y });
  const c3 = toNodeLocal(node, {
    x: rect.x + rect.width,
    y: rect.y + rect.height,
  });
  const c4 = toNodeLocal(node, { x: rect.x, y: rect.y + rect.height });

  const minX = Math.min(c1.x, c2.x, c3.x, c4.x);
  const maxX = Math.max(c1.x, c2.x, c3.x, c4.x);
  const minY = Math.min(c1.y, c2.y, c3.y, c4.y);
  const maxY = Math.max(c1.y, c2.y, c3.y, c4.y);

  return maxX >= 0 && minX <= node.width && maxY >= 0 && minY <= node.height;
}

/**
 * The nodes a marquee drag picks up, in document order.
 *
 * Touching counts, not containing: a marquee that only clips a corner selects
 * the node. That is what every editor does, and it is what makes a quick drag
 * across a row of shapes pick up the whole row instead of quietly missing the
 * ones whose far edge fell outside the box.
 *
 * A rotated node is measured by its true oriented box rather than its loose
 * AABB, preventing empty corners from erroneously triggering selection.
 * Locked and hidden nodes are not selectable and never appear.
 */
export function nodesWithin(doc, rect) {
  if (!rect || !doc) return [];
  return doc.nodes.filter((node) => {
    if (isGroupNode(node)) return false;
    if (node.visible === false || node.locked) return false;
    if (isHiddenByGroup(doc, node) || isLockedByGroup(doc, node)) return false;
    return nodeIntersectsMarquee(node, rect);
  });
}
