import { presentTileLayer, releaseTileLayer } from './stage_tile_layer.js';
import { nodeVisualAABB } from './viewport_culling.js';
import { isPlainRect } from './render_plain_rects.js';
const eligibleLists = new WeakMap();
// Backdrop filters, masks, animation and mixed DOM layers retain the exact
// renderer. Text and solid rectangles have local, immutable paint inputs.
export function isTileDocument(nodes) {
  if (eligibleLists.has(nodes)) return eligibleLists.get(nodes);
  const eligible = nodes.every(n => isPlainRect(n) || (n.kind === 'text' &&
    !n.parentId && !n.maskBase && !n.clipTo && !n.rotation && !n.shear && !n.flipH && !n.flipV &&
    !n.layerBlur && !n.backgroundBlur && !n.noise && !n.textPath &&
    !n.warpMesh && !n.perspectiveCorners && !n.perspectiveQuad && !n.puppetPins?.length &&
    !n.baselineShift && n.direction !== 'vertical' &&
    !n.shadow?.enabled && (!n.blendMode || n.blendMode === 'source-over') &&
    !Object.values(n.effects ?? {}).some(e => e?.enabled)));
  eligibleLists.set(nodes, eligible);
  return eligible;
}

// Bounded document-space raster tiles. A zoom gesture keeps its source level;
// settling refines one visible tile per frame at the final resolution.
export const TILE_SIZE = 512;
export const TILE_MEMORY_LIMIT = 48 * 1024 * 1024;
const BLEED = 1;

export function zoomBucket(zoom) {
  return 2 ** (Math.round(Math.log2(zoom) * 4) / 4);
}
export function tileRange(viewport, width, height, scale) {
  const span = TILE_SIZE / scale;
  return {
    left: Math.floor(-viewport.panX / viewport.zoom / span),
    top: Math.floor(-viewport.panY / viewport.zoom / span),
    right: Math.ceil((width - viewport.panX) / viewport.zoom / span) - 1,
    bottom: Math.ceil((height - viewport.panY) / viewport.zoom / span) - 1,
  };
}
export class RasterTiles {
  constructor(limit = TILE_MEMORY_LIMIT) {
    this.limit = limit;
    this.bytes = 0;
    this.tiles = new Map();
  }
  get(key) {
    const tile = this.tiles.get(key);
    if (tile) { this.tiles.delete(key); this.tiles.set(key, tile); }
    return tile;
  }
  delete(key) {
    const tile = this.tiles.get(key);
    if (!tile) return;
    this.bytes -= tile.bytes;
    tile.canvas.width = tile.canvas.height = 0;
    this.tiles.delete(key);
  }
  put(key, tile) {
    this.delete(key);
    tile.bytes = tile.canvas.width * tile.canvas.height * 4;
    this.tiles.set(key, tile);
    this.bytes += tile.bytes;
    while (this.bytes > this.limit && this.tiles.size) this.delete(this.tiles.keys().next().value);
  }
  invalidate(bounds) {
    for (const [key, tile] of this.tiles) {
      const b = tile.bounds;
      if (bounds.some(a => a.x <= b.x + b.width && a.x + a.width >= b.x &&
        a.y <= b.y + b.height && a.y + a.height >= b.y)) this.delete(key);
    }
  }
  clear() { for (const key of this.tiles.keys()) this.delete(key); }
}

function dirtyNodeBounds(node) {
  const bounds = nodeVisualAABB(node);
  if (node.kind !== 'text') return bounds;
  // Advance boxes omit italic bearings and glyph ink overhang. Conservatively
  // cover one em beyond them when invalidating text edits across tile edges.
  const pad = Math.max(1, Number(node.fontSize) || 16);
  return { x: bounds.x - pad, y: bounds.y - pad,
    width: bounds.width + 2 * pad, height: bounds.height + 2 * pad };
}

export function changedRectBounds(before, after) {
  // Reordering changes painter order, so conservatively invalidate everything.
  if (before.length !== after.length || before.some((n, i) => n.id !== after[i].id)) {
    const previous = new Map(before.map((node, i) => [node.id, { node, i }]));
    const nextIds = new Set(after.map(n => n.id));
    const bounds = [];
    let lastIndex = -1;
    for (const node of after) {
      const old = previous.get(node.id);
      if (old && old.i < lastIndex) return null;
      if (old) lastIndex = old.i;
      if (old?.node === node) continue;
      if (old) bounds.push(dirtyNodeBounds(old.node));
      bounds.push(dirtyNodeBounds(node));
    }
    for (const node of before) if (!nextIds.has(node.id)) bounds.push(dirtyNodeBounds(node));
    return bounds;
  }
  const bounds = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    for (const n of [before[i], after[i]]) bounds.push(dirtyNodeBounds(n));
  }
  return bounds;
}

export function paintTile(options, paint, scale, x, y) {
  const span = TILE_SIZE / scale;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_SIZE + BLEED * 2;
  const bounds = { x: x * span, y: y * span, width: span, height: span };
  // Painting the bleed avoids seams while scaling neighboring tiles.
  paint(canvas.getContext('2d', { willReadFrequently: true }), { ...options, dpr: 1,
    viewport: { zoom: scale, panX: -x * TILE_SIZE + BLEED, panY: -y * TILE_SIZE + BLEED },
    stageWidth: canvas.width, stageHeight: canvas.height,
    artworkOnly: true, dirtyRects: null });
  return { canvas, bounds, scale };
}

export function drawTiles(ctx, options, paint, cache) {
  const { viewport, dpr, stageWidth: width, stageHeight: height } = options;
  if (!cache.moving || cache.scale == null) cache.scale = zoomBucket(viewport.zoom) * Math.min(dpr, 2);
  const scale = cache.scale;
  const range = tileRange(viewport, width, height, scale);
  const count = (range.right - range.left + 1) * (range.bottom - range.top + 1);
  if (!Number.isFinite(count) || count * (TILE_SIZE + BLEED * 2) ** 2 * 4 > cache.tiles.limit) {
    // Extreme zoom-out or enormous stages must not allocate/iterate an
    // unbounded source grid. Rebase on the next frame after an exact paint.
    cache.moving = false;
    releaseTileLayer(ctx);
    return paint(ctx, options);
  }
  const ratio = viewport.zoom / scale;
  const visible = [];
  for (let y = range.top; y <= range.bottom; y++) {
    for (let x = range.left; x <= range.right; x++) {
      const key = `${scale}:${x}:${y}`;
      let tile = cache.tiles.get(key);
      if (!tile) {
        tile = paintTile(options, paint, scale, x, y);
        cache.tiles.put(key, tile);
      }
      visible.push({ x, y, tile });
    }
  }
  if (presentTileLayer(ctx, options, paint, visible, ratio, TILE_SIZE, BLEED)) {
    cache.moving = true;
    return;
  }
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  for (const { x, y, tile } of visible) {
      const dx = x * TILE_SIZE * ratio + viewport.panX;
      const dy = y * TILE_SIZE * ratio + viewport.panY;
      // Clip/crop in source space: huge zoom factors must not submit huge
      // destination surfaces to a software rasterizer.
      const left = Math.max(0, dx), top = Math.max(0, dy);
      const right = Math.min(width, dx + TILE_SIZE * ratio);
      const bottom = Math.min(height, dy + TILE_SIZE * ratio);
      if (right > left && bottom > top) ctx.drawImage(tile.canvas,
        BLEED + (left - dx) / ratio, BLEED + (top - dy) / ratio,
        (right - left) / ratio, (bottom - top) / ratio,
        left, top, right - left, bottom - top);
  }
  ctx.restore();
  paint(ctx, { ...options, overlaysOnly: true, dirtyRects: null });
  cache.moving = true;
}

export function refineTiles(options, paint, cache) {
  cache.moving = false;
  cache.scale = zoomBucket(options.viewport.zoom) * Math.min(options.dpr, 2);
  const range = tileRange(options.viewport, options.stageWidth, options.stageHeight, cache.scale);
  const count = (range.right - range.left + 1) * (range.bottom - range.top + 1);
  if (!Number.isFinite(count) || count * (TILE_SIZE + BLEED * 2) ** 2 * 4 > cache.tiles.limit) return false;
  for (let y = range.top; y <= range.bottom; y++) {
    for (let x = range.left; x <= range.right; x++) {
      const key = `${cache.scale}:${x}:${y}`;
      if (cache.tiles.get(key)) continue;
      cache.tiles.put(key, paintTile(options, paint, cache.scale, x, y));
      return true;
    }
  }
  return false;
}

export function cancelTileRefinement(cache) {
  if (cache?.refineFrame) cancelAnimationFrame(cache.refineFrame);
  if (cache) cache.refineFrame = 0;
}
export function scheduleTileRefinement(options, paint, cache) {
  if (cache.refineFrame) return;
  cache.moving = false;
  const step = () => {
    cache.refineFrame = 0;
    if (!cache.moving && refineTiles(options, paint, cache)) {
      cache.refineFrame = requestAnimationFrame(step);
    }
  };
  cache.refineFrame = requestAnimationFrame(step);
}
