import { effectivePage } from './scene_model.js';
import { drawPlainRects, isPlainRectList } from './render_plain_rects.js';

const caches = new WeakMap();
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

export function releaseStagePictureCache(ctx) { storeCache(ctx, null); }

function surface(ctx, options, paint, nodes = options.doc.nodes, background = true, margin = MARGIN, dpr = options.dpr) {
  const width = options.stageWidth ?? ctx.canvas.width / options.dpr;
  const height = options.stageHeight ?? ctx.canvas.height / options.dpr;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((width + margin * 2) * dpr);
  canvas.height = Math.ceil((height + margin * 2) * dpr);
  const target = canvas.getContext('2d');
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
  // Exports, mixed layers and paint tools keep the authoritative renderer.
  const eligible = options.cullOffscreen && options.pageBackground !== false &&
    isPlainRectList(options.doc.nodes) && !options.hiddenNodeId &&
    !options.paintNodeIds && !options.layerCache && !options.fullResolution &&
    !options.penDraft && !options.penEdit &&
    !(options.grid && (options.grid.enabled || options.grid.visible)) && !options.selectionTransformBox;
  if (!eligible) { releaseStagePictureCache(ctx); return paint(ctx, options); }
  const width = options.stageWidth ?? ctx.canvas.width / options.dpr;
  const height = options.stageHeight ?? ctx.canvas.height / options.dpr;
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
      options.doc.nodes.every(n => (n.opacity ?? 1) === 1)) {
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
  // Settled frames always use the authoritative renderer, including selections.
  if (!options.cameraMoving) {
    paint(ctx, options);
    cache.picture = null;
    cache.split = null;
    cache.viewport = options.viewport;
    storeCache(ctx, cache);
    return;
  }
  cache.split = null;
  // At most 1.5x the viewport in either dimension; camera previews need no
  // more than one source pixel per CSS pixel. Settled output uses full DPR.
  const margin = Math.min(MARGIN, width / 4, height / 4);
  let transform = cache.picture && pictureTransform(cache.picture.viewport, options.viewport, cache.picture.margin);
  if (!transform || !pictureCovers(transform, width, height, margin)) {
    cache.picture = surface(ctx, options, paint, options.doc.nodes, true, margin, Math.min(options.dpr, 1));
    transform = pictureTransform(cache.picture.viewport, options.viewport, margin);
  }
  ctx.save();
  ctx.setTransform(options.dpr, 0, 0, options.dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  // Crop the source to the visible destination: zooming in must not submit
  // a huge scaled overscan surface to the software rasterizer.
  ctx.imageSmoothingEnabled = false;
  const sourceScale = cache.picture.dpr / transform.scale;
  ctx.drawImage(cache.picture.canvas,
    -transform.x * sourceScale, -transform.y * sourceScale,
    width * sourceScale, height * sourceScale, 0, 0, width, height);
  ctx.restore();
  paint(ctx, { ...options, overlaysOnly: true, dirtyRects: null });
  storeCache(ctx, cache);
}
