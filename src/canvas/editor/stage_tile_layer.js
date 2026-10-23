// Present stable raster tiles as compositor resources. Updating their shared
// CSS transform avoids uploading the entire engine canvas on every camera frame.
const layers = new WeakMap();

export function releaseTileLayer(ctx) {
  const layer = layers.get(ctx);
  if (!layer) return;
  ctx.canvas.style.visibility = layer.visibility;
  for (const entry of layer.entries.values()) entry.canvas.remove();
  if (layer.overlay) layer.overlay.width = layer.overlay.height = 0;
  layer.root.remove();
  layers.delete(ctx);
}

// Sampling is exceptional during a camera gesture. Synchronize the hidden
// engine canvas on demand rather than submitting another full bitmap per frame.
export function syncTileLayerCanvas(ctx, resolveOptions = null) {
  const layer = layers.get(ctx);
  if (!layer) return false;
  layer.paint(ctx, { ...layer.options, ...resolveOptions?.(), dirtyRects: null });
  return true;
}

const otherChrome = o => o.cropRect || o.marqueeRect || o.textDraftRect || o.lasso ||
  o.pixelSelection || o.polygonDraft || o.magneticLassoDraft || o.removeStroke ||
  o.patchDraft || o.gesturePreview || o.bitmapPreview || o.clonePreview ||
  o.cloneSource || o.selectionTransformBox || o.guides?.length;

export function chromeBounds(options) {
  const { stageWidth: width, stageHeight: height, viewport: v } = options;
  if (otherChrome(options)) return { x: 0, y: 0, width, height };
  const rects = options.selectionSet?.length ? options.selectionSet :
    options.selectionRect ? [options.selectionRect] : [];
  if (!rects.length) return null;
  const boxWidth = Math.max(...rects.map(r => r.x + r.width)) - Math.min(...rects.map(r => r.x));
  const boxHeight = Math.max(...rects.map(r => r.y + r.height)) - Math.min(...rects.map(r => r.y));
  const label = `${Math.round(options.selectionNode?.width ?? boxWidth)} × ${Math.round(options.selectionNode?.height ?? boxHeight)}`;
  const padX = Math.max(40, label.length * 6 + 10), pad = 40, dpr = options.dpr;
  const left = Math.max(0, Math.floor((Math.min(...rects.map(r => r.x)) * v.zoom + v.panX - padX) * dpr) / dpr);
  const top = Math.max(0, Math.floor((Math.min(...rects.map(r => r.y)) * v.zoom + v.panY - pad) * dpr) / dpr);
  const right = Math.min(width, Math.ceil((Math.max(...rects.map(r => r.x + r.width)) * v.zoom + v.panX + padX) * dpr) / dpr);
  const bottom = Math.min(height, Math.ceil((Math.max(...rects.map(r => r.y + r.height)) * v.zoom + v.panY + pad) * dpr) / dpr);
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

export function presentTileLayer(ctx, options, paint, visible, ratio, tileSize, bleed) {
  const canvas = ctx.canvas, doc = canvas.ownerDocument;
  if (!canvas.isConnected || !canvas.parentElement || !doc ||
      canvas.getAttribute('data-renderer-active') === 'false') {
    releaseTileLayer(ctx);
    return;
  }
  let layer = layers.get(ctx);
  if (!layer) {
    const style = doc.defaultView.getComputedStyle(canvas);
    // Never expose a hidden 2D fallback above an active Skia/DOM renderer.
    if (style.visibility === 'hidden' || style.display === 'none') return;
    const root = doc.createElement('div'), world = doc.createElement('div');
    root.setAttribute('data-canvas-tile-layer', '');
    root.setAttribute('aria-hidden', 'true');
    Object.assign(root.style, { position: 'absolute', left: '0', top: '0',
      overflow: 'hidden', pointerEvents: 'none', zIndex: style.zIndex });
    Object.assign(world.style, { position: 'absolute', left: '0', top: '0',
      transformOrigin: '0 0', willChange: 'transform' });
    root.append(world);
    canvas.parentElement.insertBefore(root, canvas.nextSibling);
    layer = { root, world, visibility: canvas.style.visibility, entries: new Map() };
    layers.set(ctx, layer);
    canvas.style.visibility = 'hidden';
  }
  layer.options = options; layer.paint = paint;
  layer.root.style.width = `${options.stageWidth}px`;
  layer.root.style.height = `${options.stageHeight}px`;
  const { panX, panY } = options.viewport;
  layer.world.style.transform = `matrix(${ratio},0,0,${ratio},${panX},${panY})`;
  const keep = new Set();
  for (const { x, y, tile } of visible) {
    const key = `${x}:${y}`;
    keep.add(key);
    let entry = layer.entries.get(key);
    if (entry?.canvas === tile.canvas) continue;
    if (entry) { entry.canvas.remove(); entry.wrapper.remove(); }
    const wrapper = doc.createElement('div');
    Object.assign(wrapper.style, { position: 'absolute', overflow: 'hidden',
      left: `${x * tileSize}px`, top: `${y * tileSize}px`,
      width: `${tileSize}px`, height: `${tileSize}px` });
    Object.assign(tile.canvas.style, { position: 'absolute', left: `${-bleed}px`, top: `${-bleed}px`,
      width: `${tileSize + 2 * bleed}px`, height: `${tileSize + 2 * bleed}px`,
      transform: 'translateZ(0)', willChange: 'transform', imageRendering: 'pixelated' });
    wrapper.append(tile.canvas);
    layer.world.append(wrapper);
    layer.entries.set(key, { wrapper, canvas: tile.canvas });
  }
  for (const [key, entry] of layer.entries) if (!keep.has(key)) {
    entry.canvas.remove(); entry.wrapper.remove(); layer.entries.delete(key);
  }
  const bounds = chromeBounds(options);
  if (!bounds) {
    if (layer.overlay) { layer.overlay.remove(); layer.overlay.width = layer.overlay.height = 0; layer.overlay = null; }
    return true;
  }
  if (!layer.overlay) {
    layer.overlay = doc.createElement('canvas');
    Object.assign(layer.overlay.style, { position: 'absolute', pointerEvents: 'none' });
    layer.overlay.getContext('2d', ctx.getContextAttributes?.());
    layer.root.append(layer.overlay);
  }
  const overlay = layer.overlay;
  const width = Math.round(bounds.width * options.dpr), height = Math.round(bounds.height * options.dpr);
  if (overlay.width !== width) overlay.width = width;
  if (overlay.height !== height) overlay.height = height;
  Object.assign(overlay.style, { left: `${bounds.x}px`, top: `${bounds.y}px`,
    width: `${bounds.width}px`, height: `${bounds.height}px` });
  const target = overlay.getContext('2d');
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.clearRect(0, 0, width, height);
  paint(target, { ...options, overlaysOnly: true, dirtyRects: null,
    stageWidth: bounds.width, stageHeight: bounds.height,
    viewport: { ...options.viewport, panX: panX - bounds.x, panY: panY - bounds.y } });
  return true;
}
