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
import { nodeAABB } from "./scene_geometry.js";
import { SpatialIndex } from "./spatial_index.js";

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
 * Returns a world-space AABB that includes strokes, drop shadows, and blur margins.
 */
export function nodeVisualAABB(node) {
  const box = nodeAABB(node);
  let pad = 0;
  if (node.strokeWidth) pad += Number(node.strokeWidth) || 0;
  if (Array.isArray(node.effects)) {
    for (const ef of node.effects) {
      if (!ef || ef.enabled === false) continue;
      if (ef.type === "drop-shadow" || ef.type === "inner-shadow") {
        pad +=
          (Number(ef.blur) || 0) * 2 +
          (Number(ef.spread) || 0) +
          Math.max(Math.abs(ef.offset?.x || 0), Math.abs(ef.offset?.y || 0));
      } else if (ef.type === "layer-blur") {
        pad += (Number(ef.blur) || 0) * 2;
      }
    }
  } else if (node.shadow) {
    pad +=
      (Number(node.shadow.blur) || 0) * 2 +
      Math.max(Math.abs(node.shadow.x || 0), Math.abs(node.shadow.y || 0));
  }
  if (pad === 0) return box;
  return {
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
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
 * nodes, and a clip base and the layers clipped to it form one chain.
 * Standalone shapes/images with drop-shadows or blurs can be culled safely
 * using their expanded visual AABB.
 *
 * @param {{nodes: Array<object>}} doc
 * @returns {Set<string>}
 */
// The set depends only on the node list, so it is reused across pan and zoom
// frames and rebuilt when the list changes.
const cullableCache = new WeakMap();

export function cullableNodeIds(doc) {
  const nodes = doc?.nodes ?? [];
  const cached = cullableCache.get(nodes);
  if (cached && cached.length === nodes.length) return cached.ids;
  const ids = buildCullableIds(nodes);
  cullableCache.set(nodes, { length: nodes.length, ids });
  return ids;
}

function buildCullableIds(nodes) {
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

/**
 * Builds an R-Tree spatial index for a list of document nodes.
 * @param {Array<object>} nodes
 * @returns {SpatialIndex}
 */
export function buildSpatialIndex(nodes) {
  const index = new SpatialIndex();
  const items = (nodes ?? []).map((node) => {
    const box = nodeVisualAABB(node);
    return {
      id: node.id,
      minX: box.x,
      minY: box.y,
      maxX: box.x + box.width,
      maxY: box.y + box.height,
      node,
    };
  });
  index.load(items);
  return index;
}

const nonCullableCache = new WeakMap();

export function nonCullableNodeIds(doc) {
  const nodes = doc?.nodes ?? [];
  const cached = nonCullableCache.get(nodes);
  if (cached && cached.length === nodes.length) return cached.ids;
  const cullable = cullableNodeIds(doc);
  const ids = new Set();
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (!cullable.has(node.id)) ids.add(node.id);
  }
  nonCullableCache.set(nodes, { length: nodes.length, ids });
  return ids;
}

/**
 * Returns the Set of node IDs that should be submitted to the painter for the current visible rect.
 * Off-screen cullable nodes are excluded via spatial index search in O(log N + K) time.
 * Non-cullable nodes (groups, adjustments, effects, clip bases) are always kept.
 *
 * @param {{nodes: Array<object>}} doc
 * @param {{minX: number, minY: number, maxX: number, maxY: number} | null} visibleRect
 * @param {SpatialIndex} [spatialIndex]
 * @returns {Set<string>}
 */
export function visibleNodeIds(doc, visibleRect, spatialIndex = null) {
  if (!doc?.nodes) return new Set();
  const nodes = doc.nodes;
  if (!visibleRect) {
    return new Set(nodes.map((n) => n.id));
  }

  const index = spatialIndex ?? doc.spatialIndex ?? doc._spatialIndex;

  if (index) {
    const hits = index.search(visibleRect);
    const visibleIds = new Set();
    for (let i = 0; i < hits.length; i += 1) {
      visibleIds.add(hits[i].id);
    }
    const nonCullable = nonCullableNodeIds(doc);
    if (nonCullable.size > 0) {
      for (const id of nonCullable) {
        visibleIds.add(id);
      }
    }
    return visibleIds;
  }

  const cullable = cullableNodeIds(doc);
  // Fallback linear check
  const visibleIds = new Set();
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (!cullable.has(node.id) || !isBoxOffscreen(nodeVisualAABB(node), visibleRect)) {
      visibleIds.add(node.id);
    }
  }
  return visibleIds;
}

export const queryVisibleNodeIds = visibleNodeIds;

