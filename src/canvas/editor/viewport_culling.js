/**
 * Viewport culling for the on-screen stage paint loop.
 *
 * The 2D stage paints every node on every frame, so a document with many
 * off-screen layers pays for all of them on each pan or zoom. Ported in spirit
 * from voo-canvas (lib/viewport-culling.ts): pure AABB math, with a margin so
 * nodes just outside the edge stay painted. Only nodes whose pixels cannot
 * depend on other nodes are eligible; see `cullableNodeIds`.
 */

import { NODE_KIND } from "./scene_model.js";

/**
 * World-space margin kept around the screen. It covers stroke overhang and
 * the small edge jitter of a pan in progress, matching voo-canvas.
 */
export const CULL_MARGIN_WORLD_PX = 240;

/**
 * World-space rectangle that the screen shows, grown by `margin` on each side.
 * The viewport follows the editor's model: screen = world * zoom + pan.
 *
 * @param {{panX: number, panY: number, zoom: number}} viewport
 * @param {number} screenWidth CSS pixels
 * @param {number} screenHeight CSS pixels
 * @param {number} [margin]
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
 */
export function visibleWorldRect(
  viewport,
  screenWidth,
  screenHeight,
  margin = CULL_MARGIN_WORLD_PX,
) {
  const zoom = viewport.zoom || 1;
  return {
    minX: (0 - viewport.panX) / zoom - margin,
    minY: (0 - viewport.panY) / zoom - margin,
    maxX: (screenWidth - viewport.panX) / zoom + margin,
    maxY: (screenHeight - viewport.panY) / zoom + margin,
  };
}

/**
 * True when a world-space box lies entirely outside the visible rectangle.
 * Touching the edge counts as visible, so the test never drops a node that
 * is only just in view.
 *
 * @param {{x: number, y: number, width: number, height: number}} box
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} visible
 */
export function isBoxOffscreen(box, visible) {
  return (
    box.x + box.width < visible.minX ||
    box.x > visible.maxX ||
    box.y + box.height < visible.minY ||
    box.y > visible.maxY
  );
}

/**
 * Ids of nodes that may be skipped when they are off-screen.
 *
 * A node is excluded, and so always painted, when skipping it could change
 * what is visible: adjustment layers and boolean groups composite over other
 * nodes, a clip base and the layers clipped to it form one chain, and nodes
 * with effects (shadows, glows) paint beyond their box. Everything else is a
 * self-contained picture of its own box.
 *
 * @param {{nodes: Array<object>}} doc
 * @returns {Set<string>}
 */
export function cullableNodeIds(doc) {
  const nodes = doc?.nodes ?? [];
  const clipBaseIds = new Set();
  for (const node of nodes) {
    if (node.clipTo) clipBaseIds.add(node.clipTo);
  }
  const ids = new Set();
  for (const node of nodes) {
    if (node.clipTo || clipBaseIds.has(node.id)) continue;
    if (node.kind === NODE_KIND.ADJUSTMENT || node.kind === NODE_KIND.BOOLEAN) continue;
    if (node.kind === NODE_KIND.GROUP) continue;
    if (Array.isArray(node.effects) && node.effects.length > 0) continue;
    ids.add(node.id);
  }
  return ids;
}
