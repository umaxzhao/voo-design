import { it, expect, vi } from 'vitest';
import { RasterTiles, TILE_SIZE, tileRange, zoomBucket, changedRectBounds, drawTiles, refineTiles, isTileDocument, scheduleTileRefinement, cancelTileRefinement } from '../../src/canvas/editor/raster_tiles.js';
import { drawCachedStage, releaseStagePictureCache, cancelStagePictureRefinement } from '../../src/canvas/editor/stage_picture_cache.js';
import { createRectNode } from '../../src/canvas/editor/scene_model.js';
const tile = (x = 0) => ({ canvas: { width: 16, height: 16 }, bounds: { x, y: 0, width: 10, height: 10 } });
it('evicts the least recently used raster and frees its backing store within byte budget', () => {
  const cache = new RasterTiles(2048);
  const a = tile(), b = tile(20), c = tile(40);
  cache.put('a', a); cache.put('b', b); cache.get('a'); cache.put('c', c);
  expect(cache.get('a')).toBe(a);
  expect(cache.get('b')).toBeUndefined();
  expect(b.canvas.width).toBe(0);
  expect(cache.bytes).toBe(2048);
  cache.clear(); expect(cache.bytes).toBe(0);
  expect(a.canvas.height).toBe(0);
});
it('invalidates only intersecting tiles, including the old and new edit bounds', () => {
  const cache = new RasterTiles(); const a = tile(), b = tile(20);
  cache.put('a', a); cache.put('b', b);
  const before = [{ id: 'a', x: 1, y: 1, width: 2, height: 2 }, { id: 'b', x: 100 }];
  const after = [{ ...before[0], x: 5 }, before[1]];
  cache.invalidate(changedRectBounds(before, after));
  expect(cache.get('a')).toBeUndefined(); expect(cache.get('b')).toBe(b);
  expect(changedRectBounds(before, [...before].reverse())).toBeNull();
});
it('covers negative camera coordinates with fixed physical size tiles and stable zoom buckets', () => {
  expect(tileRange({ zoom: 1, panX: 20, panY: -20 }, 800, 600, 1)).toEqual({ left: -1, top: 0, right: 1, bottom: 1 });
  expect(zoomBucket(1.01)).toBe(1);
  expect(TILE_SIZE).toBe(512);
});
function withCanvas(run) {
  const surfaces = [];
  const context = () => ({ canvas: { width: 800, height: 600 }, save() {}, restore() {}, setTransform() {}, clearRect() {}, drawImage: vi.fn() });
  vi.stubGlobal('document', { createElement: () => { const c = { getContext: context }; surfaces.push(c); return c; } });
  try { run(context(), surfaces); } finally { vi.unstubAllGlobals(); }
}
const options = () => ({ doc: { nodes: [createRectNode({})] }, viewport: { zoom: 1, panX: 0, panY: 0 }, dpr: 1,
  stageWidth: 800, stageHeight: 600, cullOffscreen: true, cameraMoving: true, docVersion: '1:1' });
it('reuses pan tiles, freezes raster scale during zoom, and refines only one tile per settled frame', () => withCanvas((ctx) => {
  const cache = { tiles: new RasterTiles() }, paint = vi.fn(), o = options();
  drawTiles(ctx, o, paint, cache);
  expect(paint.mock.calls.filter(c => c[1].artworkOnly)).toHaveLength(4);
  drawTiles(ctx, { ...o, viewport: { zoom: 1, panX: -10, panY: -10 } }, paint, cache);
  expect(paint.mock.calls.filter(c => c[1].artworkOnly)).toHaveLength(4);
  drawTiles(ctx, { ...o, viewport: { zoom: 2, panX: 0, panY: 0 } }, paint, cache);
  expect(cache.scale).toBe(1);
  expect(paint.mock.calls.filter(c => c[1].artworkOnly)).toHaveLength(4);
  const n = paint.mock.calls.length;
  expect(refineTiles({ ...o, viewport: { ...o.viewport, zoom: 2 } }, paint, cache)).toBe(true);
  expect(paint.mock.calls.length).toBe(n + 1);
  expect(cache.scale).toBe(2);
  cache.tiles.clear();
}));
it('keeps content on chrome/revision changes, rebuilds exact content after edits, and releases memory', () => withCanvas((ctx, surfaces) => {
  const paint = vi.fn(); const o = { ...options(), cameraMoving: false };
  drawCachedStage(ctx, o, paint);
  const count = surfaces.length;
  drawCachedStage(ctx, { ...o, docVersion: '1:2', selectionNode: o.doc.nodes[0] }, paint);
  expect(surfaces).toHaveLength(count);
  expect(paint.mock.lastCall[1].overlaysOnly).toBe(true);
  drawCachedStage(ctx, { ...o, doc: { ...o.doc, nodes: [{ ...o.doc.nodes[0], x: 30 }] } }, paint);
  expect(surfaces[0].width).toBe(0);
  expect(surfaces).toHaveLength(count + 1);
  releaseStagePictureCache(ctx);
  expect(surfaces.every(c => c.width === 0 && c.height === 0)).toBe(true);
}));
it('invalidates inserted and removed content without discarding distant tiles', () => {
  const a = createRectNode({ x: 0, y: 0, width: 5, height: 5 });
  const b = createRectNode({ x: 20, y: 0, width: 5, height: 5 });
  expect(changedRectBounds([a], [a, b])).toEqual([{ x: 20, y: 0, width: 5, height: 5 }]);
  expect(changedRectBounds([a, b], [a])).toEqual([{ x: 20, y: 0, width: 5, height: 5 }]);
});
it('bounds extreme zoom-out work instead of iterating an enormous source tile grid', () => withCanvas((ctx, surfaces) => {
  const cache = { tiles: new RasterTiles(), moving: true, scale: 100 };
  const paint = vi.fn(), o = { ...options(), viewport: { zoom: .001, panX: 0, panY: 0 } };
  drawTiles(ctx, o, paint, cache);
  expect(paint).toHaveBeenCalledTimes(1);
  expect(paint).toHaveBeenCalledWith(ctx, o);
  expect(surfaces).toHaveLength(0);
  expect(cache.moving).toBe(false);
}));
it('does not allocate an additional unbounded settled viewport snapshot', () => withCanvas((ctx, surfaces) => {
  const paint = vi.fn(); const o = { ...options(), cameraMoving: false, dpr: 4, stageWidth: 4000, stageHeight: 3000 };
  drawCachedStage(ctx, o, paint);
  expect(paint).toHaveBeenCalledTimes(1);
  expect(paint).toHaveBeenCalledWith(ctx, o);
  expect(surfaces).toHaveLength(0);
  releaseStagePictureCache(ctx);
}));
it('copies settled snapshots in physical pixels without rescaling fractional-DPR edges', () => withCanvas((ctx) => {
  const o = { ...options(), cameraMoving: false, dpr: 1.25, stageWidth: 801, stageHeight: 601 };
  drawCachedStage(ctx, o, vi.fn());
  expect(ctx.drawImage.mock.lastCall.slice(1)).toEqual([0, 0]);
  releaseStagePictureCache(ctx);
}));

it('keeps transformed, shifted, backdrop-dependent and animated scenes on the authoritative renderer', () => {
  const text = { kind: 'text', text: 'hello' };
  expect(isTileDocument([text])).toBe(true);
  for (const change of [{ baselineShift: 10 }, { warpMesh: {} }, { perspectiveCorners: [] },
    { direction: 'vertical' }, { backgroundBlur: 8 }, { parentId: 'group' }]) {
    expect(isTileDocument([{ ...text, ...change }])).toBe(false);
  }
  expect(isTileDocument([{ kind: 'video' }])).toBe(false);
});

it('warms one tile per animation frame without requesting stage redraws, and cancels stale refinement', () => withCanvas(() => {
  const pending = new Map(); let next = 0;
  vi.stubGlobal('requestAnimationFrame', cb => { pending.set(++next, cb); return next; });
  vi.stubGlobal('cancelAnimationFrame', id => pending.delete(id));
  const cache = { tiles: new RasterTiles() }, paint = vi.fn();
  scheduleTileRefinement(options(), paint, cache);
  expect(paint).not.toHaveBeenCalled();
  const [id, cb] = pending.entries().next().value; pending.delete(id); cb();
  expect(paint.mock.calls.filter(c => c[1].artworkOnly)).toHaveLength(1);
  expect(pending.size).toBe(1);
  cancelTileRefinement(cache);
  expect(pending.size).toBe(0);
  cache.tiles.clear();
}));

it('cancels background work as soon as an input requests a new stage frame', () => withCanvas((ctx) => {
  const pending = new Map(); let next = 0;
  vi.stubGlobal('requestAnimationFrame', cb => { pending.set(++next, cb); return next; });
  vi.stubGlobal('cancelAnimationFrame', id => pending.delete(id));
  drawCachedStage(ctx, { ...options(), cameraMoving: false, requestRender: vi.fn() }, vi.fn());
  expect(pending.size).toBe(1);
  cancelStagePictureRefinement(ctx);
  expect(pending.size).toBe(0);
  releaseStagePictureCache(ctx);
}));

it('invalidates glyph overhang across a tile boundary without dropping distant text tiles', () => {
  const cache = new RasterTiles();
  cache.put('near', tile(200)); cache.put('far', tile(500));
  const text = { kind: 'text', id: 't', x: 210.5, y: 1, width: 20, height: 20, fontSize: 20, text: 'italic f' };
  cache.invalidate(changedRectBounds([text], [{ ...text, text: 'new ink' }]));
  expect(cache.get('near')).toBeUndefined();
  expect(cache.get('far')).toBeDefined();
  cache.clear();
});
