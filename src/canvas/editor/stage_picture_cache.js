import { interactionBackdrop } from './interaction_backdrop.js';
import { releaseTileLayer } from './stage_tile_layer.js';
import { textMetricsRevision } from './text_metrics.js';
import { RasterTiles, changedRectBounds, drawTiles, scheduleTileRefinement, cancelTileRefinement, isTileDocument } from './raster_tiles.js';
import { effectivePage } from './scene_model.js';
import { drawPlainRects, isPlainRectList } from './render_plain_rects.js';
import { dirtyRectsToDevice, shouldUseDirtyRect } from './dirty_rect.js';

const caches = new WeakMap();
const tileCaches = new WeakMap();
const MARGIN = 160;

// Identity includes all page metadata, not just nodes: page/crop/background edits
// must never reuse pixels from the previous page. Size and DPR bound allocation.
export function pictureKey(options) {
  const { doc, dpr, stageWidth, stageHeight, docVersion } = options;
  return [dpr, stageWidth, stageHeight, docVersion,
    ...Object.keys(doc).filter(k => k !== 'nodes' && k !== 'spatialIndex' && k !== '_spatialIndex')
      .sort().flatMap(k => [k, doc[k]])];
}
export function samePictureKey(a, b) {
  return !!a && a.length === b.length && a.every((v, i) => v === b[i]);
}
export function pictureTransform(from, to, margin = MARGIN) {
  const scale = to.zoom / from.zoom;
  return { scale, x: to.panX - (from.panX + margin) * scale,
    y: to.panY - (from.panY + margin) * scale };
}
export function pictureCovers(transform, width, height, margin = MARGIN) {
  return transform.x <= 0 && transform.y <= 0 &&
    transform.x + (width + 2 * margin) * transform.scale >= width &&
    transform.y + (height + 2 * margin) * transform.scale >= height;
}

function storeCache(ctx, next) {
  const previous = caches.get(ctx);
  const retained = new Set([next?.picture?.canvas, next?.split?.below.canvas, next?.split?.above.canvas]);
  for (const canvas of [previous?.picture?.canvas, previous?.split?.below.canvas, previous?.split?.above.canvas]) {
    if (canvas && !retained.has(canvas)) canvas.width = canvas.height = 0;
  }
  if (next) caches.set(ctx, next);
  else caches.delete(ctx);
}

export function cancelStagePictureRefinement(ctx) {
  cancelTileRefinement(tileCaches.get(ctx));
}

export function releaseStagePictureCache(ctx) {
  interactionBackdrop.release(ctx);
  releaseTileLayer(ctx);
  storeCache(ctx, null);
  const tiles = tileCaches.get(ctx);
  cancelTileRefinement(tiles);
  tiles?.tiles.clear();
  if (tiles?.exact) tiles.exact.canvas.width = tiles.exact.canvas.height = 0;
  tileCaches.delete(ctx);
}

function surface(ctx, options, paint, nodes = options.doc.nodes, background = true, margin = MARGIN, dpr = options.dpr) {
  const width = options.stageWidth ?? ctx.canvas.width / options.dpr;
  const height = options.stageHeight ?? ctx.canvas.height / options.dpr;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((width + margin * 2) * dpr);
  canvas.height = Math.ceil((height + margin * 2) * dpr);
  // Match the destination raster backend: CPU and GPU antialiasing can
  // differ at fractional coordinates, even for solid rectangles.
  const target = canvas.getContext('2d', ctx.getContextAttributes?.());
  const viewport = { ...options.viewport, panX: options.viewport.panX + margin,
    panY: options.viewport.panY + margin };
  paint(target, { ...options, dpr, doc: { ...options.doc, nodes,
    backgroundColor: background ? options.doc.backgroundColor : 'transparent' },
    viewport, cullOffscreen: true, dirtyRects: null,
    stageWidth: width + margin * 2, stageHeight: height + margin * 2,
    artworkOnly: true, pageBackground: background && options.pageBackground !== false });
  return { canvas, viewport: { ...options.viewport }, margin, dpr };
}

export function drawCachedStage(ctx, options, paint) {
  if (!options.cameraMoving) releaseTileLayer(ctx);
  if (options.previewMotion) cancelStagePictureRefinement(ctx);
  // Exports, mixed layers and paint tools keep the authoritative renderer.
  const eligible = options.cullOffscreen && options.pageBackground !== false &&
    isTileDocument(options.doc.nodes) && !options.hiddenNodeId &&
    !options.paintNodeIds && !options.layerCache && !options.fullResolution &&
    !options.penDraft && !options.penEdit &&
    !(options.grid && (options.grid.enabled || options.grid.visible)) && !options.selectionTransformBox;
  if (!eligible) { releaseStagePictureCache(ctx); return paint(ctx, options); }
  interactionBackdrop.update(ctx, options.cameraMoving || options.previewMotion);
  const width = options.stageWidth ?? ctx.canvas.width / options.dpr;
  const height = options.stageHeight ?? ctx.canvas.height / options.dpr;
  // The engine supplies damage only when camera, selection, DPR and render
  // state still match the last frame. Restore that region in painter order
  // through the spatial index rather than clearing and blitting two complete
  // stage surfaces for a small moving selection (especially costly in software).
  if (!options.cameraMoving && options.previewMotion && options.dirtyRects &&
      shouldUseDirtyRect(dirtyRectsToDevice(options.dirtyRects, options.viewport,
        options.dpr, width, height), width, height, options.dpr)) {
    storeCache(ctx, null);
    return paint(ctx, options);
  }
  const key = pictureKey({ ...options, stageWidth: width, stageHeight: height });
  let cache = caches.get(ctx);
  const valid = cache && samePictureKey(cache.key, key) && cache.nodes === options.doc.nodes;
  cache = valid ? { ...cache } : { key, nodes: options.doc.nodes };
  let selected = options.selectionNode?.id;
  const prior = caches.get(ctx);
  if (!selected && prior && prior.nodes !== options.doc.nodes && prior.nodes.length === options.doc.nodes.length) {
    let changed = -1;
    for (let i = 0; i < prior.nodes.length; i++) {
      if (prior.nodes[i] === options.doc.nodes[i]) continue;
      if (changed !== -1 || prior.nodes[i].id !== options.doc.nodes[i].id) { changed = -1; break; }
      changed = i;
    }
    if (changed >= 0) selected = options.doc.nodes[changed].id;
  }
  if (!selected && prior?.split && prior.nodes === options.doc.nodes) selected = prior.split.selected;
  const splitKey = pictureKey({ ...options, stageWidth: width, stageHeight: height, docVersion: String(options.docVersion).split(':').slice(1).join(':') });
  const previous = caches.get(ctx)?.split;
  const index = selected ? options.doc.nodes.findIndex(n => n.id === selected) : -1;
  if (!options.cameraMoving && options.previewMotion && index >= 0 && !options.selectionSet &&
      isPlainRectList(options.doc.nodes) && options.doc.nodes.every(n => (n.opacity ?? 1) === 1)) {
    const nodes = options.doc.nodes;
    const reusable = previous && previous.selected === selected &&
      previous.viewport === options.viewport && samePictureKey(previous.key, splitKey) &&
      previous.nodes.length === nodes.length && previous.nodes.every((n, i) => i === index || n === nodes[i]);
    const split = reusable ? previous : {
      selected, viewport: options.viewport, key: splitKey, nodes,
      below: surface(ctx, options, paint, nodes.slice(0, index), true, 0),
      above: surface(ctx, options, paint, nodes.slice(index + 1), false, 0),
    };
    ctx.save();
    ctx.setTransform(options.dpr, 0, 0, options.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(split.below.canvas, 0, 0, width * options.dpr, height * options.dpr, 0, 0, width, height);
    ctx.save();
    ctx.translate(options.viewport.panX, options.viewport.panY);
    ctx.scale(options.viewport.zoom, options.viewport.zoom);
    const page = effectivePage(options.doc);
    ctx.beginPath(); ctx.rect(page.x, page.y, page.width, page.height); ctx.clip();
    drawPlainRects(ctx, [nodes[index]]);
    ctx.restore();
    ctx.drawImage(split.above.canvas, 0, 0, width * options.dpr, height * options.dpr, 0, 0, width, height);
    ctx.restore();
    paint(ctx, { ...options, overlaysOnly: true, dirtyRects: null });
    cache.split = split;
    storeCache(ctx, cache);
    return;
  }
  if (!options.cameraMoving && options.previewMotion) {
    storeCache(ctx, null);
    return paint(ctx, options);
  }
  // Tile identity deliberately excludes renderVersion: selection/hover and
  // inspector notifications change chrome, not immutable rectangle content.
  const tileKey = pictureKey({ ...options, docVersion: textMetricsRevision(), stageWidth: width, stageHeight: height });
  let tiles = tileCaches.get(ctx);
  if (!tiles || !samePictureKey(tiles.key, tileKey)) {
    if (tiles) { cancelTileRefinement(tiles); tiles.tiles.clear(); if (tiles.exact) tiles.exact.canvas.width = tiles.exact.canvas.height = 0; }
    tiles = { key: tileKey, nodes: options.doc.nodes, tiles: new RasterTiles() };
    tileCaches.set(ctx, tiles);
  }
  if (tiles.nodes !== options.doc.nodes) {
    cancelTileRefinement(tiles);
    const bounds = changedRectBounds(tiles.nodes, options.doc.nodes);
    if (bounds) tiles.tiles.invalidate(bounds); else tiles.tiles.clear();
    tiles.nodes = options.doc.nodes;
    if (tiles.exact) tiles.exact.canvas.width = tiles.exact.canvas.height = 0;
    tiles.exact = null;
  }
  const tileOptions = { ...options, stageWidth: width, stageHeight: height };
  if (!options.cameraMoving && width * height * options.dpr ** 2 * 4 > 48 * 1024 * 1024) {
    if (tiles.exact) tiles.exact.canvas.width = tiles.exact.canvas.height = 0;
    tiles.exact = null;
    tiles.moving = false;
    return paint(ctx, options);
  }
  if (options.cameraMoving) {
    cancelTileRefinement(tiles);
    drawTiles(ctx, tileOptions, paint, tiles);
  } else {
    const v = tiles.exact?.viewport;
    if (!v || v.zoom !== options.viewport.zoom || v.panX !== options.viewport.panX || v.panY !== options.viewport.panY) {
      if (tiles.exact) tiles.exact.canvas.width = tiles.exact.canvas.height = 0;
      tiles.exact = surface(ctx, options, paint, options.doc.nodes, true, 0);
    }
    ctx.save();
    // Copy physical pixels 1:1. Rounding a CSS size times fractional DPR can
    // leave a partial last pixel; rescaling the snapshot would blur all edges.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(tiles.exact.canvas, 0, 0);
    ctx.restore();
    paint(ctx, { ...options, overlaysOnly: true, dirtyRects: null });
    // The viewport's quiet timer triggers this branch. Never synchronously
    // rebuild all tiles after a zoom; warm one per animation frame without repainting the stage.
    if (options.requestRender) scheduleTileRefinement(tileOptions, paint, tiles);
    else tiles.moving = false;
  }
  cache.picture = null;
  cache.split = null;
  storeCache(ctx, cache);
}
