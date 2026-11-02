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

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// A canvas blur(σ) filter fades out by about three sigma.
const BLUR_REACH = 3;

/** How far a canvas shadow (`shadowBlur` + offset + spread) reaches past the shape. */
function shadowReach(effect) {
  if (!effect || effect.enabled === false) return 0;
  const offsetX = effect.offsetX ?? effect.x ?? effect.offset?.x;
  const offsetY = effect.offsetY ?? effect.y ?? effect.offset?.y;
  return (
    Math.max(0, num(effect.blur)) * 2 +
    Math.max(0, num(effect.spread)) +
    Math.max(Math.abs(num(offsetX)), Math.abs(num(offsetY)))
  );
}

/**
 * Padding, in world units, that scales with the node: strokes and the layer
 * blur filter (which the renderer multiplies by the device scale).
 */
export function nodeWorldEffectPad(node) {
  let pad = 0;
  if (node.stroke && node.strokeWidth) pad = Math.max(pad, num(node.strokeWidth));
  const effects = node.effects;
  if (effects && !Array.isArray(effects) && effects.stroke?.enabled) {
    pad = Math.max(pad, num(effects.stroke.width));
  }
  let blur = num(node.layerBlur);
  if (Array.isArray(effects)) {
    for (const ef of effects) {
      if (!ef || ef.enabled === false) continue;
      if (ef.type === "layer-blur") blur = Math.max(blur, num(ef.blur));
    }
  }
  return pad + Math.max(0, blur) * BLUR_REACH;
}

/**
 * Padding of the node's canvas shadows (drop shadow, outer glow, text
 * shadow). `shadowBlur` and `shadowOffset*` ignore the context transform,
 * so this reach is measured in device pixels, not world units.
 */
export function nodeScreenEffectPad(node) {
  if (!node) return 0;
  let pad = shadowReach(node.shadow?.enabled ? node.shadow : null);
  const effects = node.effects;
  if (Array.isArray(effects)) {
    for (const ef of effects) {
      if (ef?.type === "drop-shadow") pad = Math.max(pad, shadowReach(ef));
    }
  } else if (effects) {
    if (effects.shadow?.enabled) pad = Math.max(pad, shadowReach(effects.shadow));
    if (effects.glow?.enabled) pad = Math.max(pad, shadowReach(effects.glow));
  }
  return pad;
}

/**
 * World-space AABB of everything the node paints: geometry, strokes, layer
 * blur and canvas shadows. Shadows are counted at one world unit per device
 * pixel, which is exact at zoom × dpr = 1; at other zooms the culling query
 * adds `maxScreenEffectPad(doc)` on top, see `cullMarginWorld`.
 */
export function nodeVisualAABB(node) {
  const box = nodeAABB(node);
  const pad = nodeWorldEffectPad(node) + nodeScreenEffectPad(node);
  if (pad === 0) return box;
  return {
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
}

const screenPadCache = new WeakMap();

/** Largest device-pixel shadow reach over the document's nodes. */
export function maxScreenEffectPad(doc) {
  const nodes = doc?.nodes ?? [];
  const cached = screenPadCache.get(nodes);
  if (cached !== undefined) return cached;
  let max = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    const pad = nodeScreenEffectPad(nodes[i]);
    if (pad > max) max = pad;
  }
  screenPadCache.set(nodes, max);
  return max;
}

/**
 * World-space culling margin for the current zoom: the base margin plus the
 * widest shadow converted from device pixels to world units.
 */
export function cullMarginWorld(doc, zoom, dpr = 1) {
  const scale = Math.max(1e-6, (zoom || 1) * (dpr || 1));
  return CULL_MARGIN_WORLD_PX + maxScreenEffectPad(doc) / scale;
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
 * Nodes with shadows, glows or blurs stay eligible: their visual AABB plus
 * the zoom-dependent shadow margin covers every pixel they paint.
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
    ids.add(node.id);
  }
  return ids;
}

function indexItem(node) {
  const box = nodeVisualAABB(node);
  return {
    id: node.id,
    minX: box.x,
    minY: box.y,
    maxX: box.x + box.width,
    maxY: box.y + box.height,
    node,
  };
}

// Per index: the node list it reflects and id -> { node, item } for each entry.
const indexState = new WeakMap();

/**
 * Builds an R-Tree spatial index for a list of document nodes.
 * @param {Array<object>} nodes
 * @returns {SpatialIndex}
 */
export function buildSpatialIndex(nodes) {
  const index = new SpatialIndex();
  const list = nodes ?? [];
  index.load(list.map(indexItem));
  const entries = new Map();
  for (const item of index.all()) entries.set(item.id, { node: item.node, item });
  indexState.set(index, { nodes: list, entries });
  return index;
}

/**
 * Above this share of changed nodes a bulk STR reload is both faster and
 * packs a tighter tree than one-by-one updates.
 */
const REBUILD_RATIO = 0.25;
const MIN_INCREMENTAL_BUDGET = 32;

/**
 * Brings `index` in line with `nodes` and returns it, or a fresh index when
 * there is none to update.
 *
 * Documents are immutable and an edit replaces only the nodes it touches, so
 * a node whose object is unchanged keeps its entry. Dragging one layer in a
 * 10k-node page then costs one remove + insert instead of a full rebuild.
 *
 * @param {SpatialIndex | null} index
 * @param {Array<object>} nodes
 * @returns {SpatialIndex}
 */
export function syncSpatialIndex(index, nodes) {
  const list = nodes ?? [];
  const state = index ? indexState.get(index) : null;
  if (!state) return buildSpatialIndex(list);
  if (state.nodes === list) return index;

  const budget = Math.max(MIN_INCREMENTAL_BUDGET, list.length * REBUILD_RATIO);
  const { entries } = state;
  const seen = new Set();
  const changed = [];
  for (let i = 0; i < list.length; i += 1) {
    const node = list[i];
    const id = String(node.id);
    seen.add(id);
    if (entries.get(id)?.node === node) continue;
    changed.push(node);
    if (changed.length > budget) return buildSpatialIndex(list);
  }
  const removedIds = [];
  if (entries.size + changed.length > seen.size) {
    for (const id of entries.keys()) {
      if (!seen.has(id)) removedIds.push(id);
    }
  }
  if (changed.length + removedIds.length > budget) return buildSpatialIndex(list);

  for (const id of removedIds) {
    index.remove(entries.get(id).item);
    entries.delete(id);
  }
  for (const node of changed) {
    const id = String(node.id);
    const previous = entries.get(id);
    if (previous) index.remove(previous.item);
    const item = index.insert(indexItem(node));
    if (item) entries.set(id, { node, item });
  }
  state.nodes = list;
  return index;
}

/**
 * Attaches `index` to `doc` as a non-enumerable property, so `{ ...doc }`
 * copies made by edits never carry an index describing the old node list.
 */
export function attachSpatialIndex(doc, index) {
  if (!doc || typeof doc !== "object" || !Object.isExtensible(doc)) return;
  Object.defineProperty(doc, "spatialIndex", {
    value: index,
    configurable: true,
    enumerable: false,
    writable: true,
  });
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
export function visibleNodeIds(doc, visibleRect, spatialIndex = null, allCullable = false) {
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
    const nonCullable = allCullable ? null : nonCullableNodeIds(doc);
    if (nonCullable?.size > 0) {
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

