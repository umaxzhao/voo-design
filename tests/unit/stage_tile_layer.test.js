import { createEngineSampler } from '../../src/canvas/editor/editor_engine_sampling.js';
import { it, expect, vi } from 'vitest';
import { presentTileLayer, releaseTileLayer, chromeBounds, syncTileLayerCanvas } from '../../src/canvas/editor/stage_tile_layer.js';
function fixture() {
  const doc = { defaultView: { getComputedStyle: e => ({ visibility: e.style.visibility || 'visible', display: 'block', zIndex: 'auto' }) } };
  class Element {
    constructor() { this.style = {}; this.children = []; this.ownerDocument = doc; this.attrs = {}; this.width = 514; this.height = 514; }
    get isConnected() { return !!this.parentElement; }
    get nextSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] ?? null; }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k] ?? null; }
    append(e) { e.remove(); this.children.push(e); e.parentElement = this; }
    insertBefore(e, next) { e.remove(); const i = this.children.indexOf(next); this.children.splice(i < 0 ? this.children.length : i, 0, e); e.parentElement = this; }
    remove() { if (this.parentElement) { const a = this.parentElement.children; a.splice(a.indexOf(this), 1); this.parentElement = null; } }
    getContext() { return { setTransform() {}, clearRect() {} }; }
  }
  doc.createElement = () => new Element();
  const parent = new Element(), canvas = new Element(); parent.append(canvas);
  const ctx = { canvas }, tile = { canvas: new Element() };
  const o = { stageWidth: 1000, stageHeight: 700, dpr: 2, viewport: { zoom: 2, panX: 10, panY: 20 } };
  return { parent, canvas, ctx, tile, o };
}
it('reuses the same DOM tile pixels across camera transforms and releases presentation state', () => {
  const { parent, canvas, ctx, tile, o } = fixture(), paint = vi.fn();
  presentTileLayer(ctx, o, paint, [{ x: 0, y: 0, tile }], .5, 512, 1);
  const root = parent.children[1], world = root.children[0], wrapper = world.children[0];
  expect(canvas.style.visibility).toBe('hidden');
  expect(world.style.transform).toBe('matrix(0.5,0,0,0.5,10,20)');
  presentTileLayer(ctx, { ...o, viewport: { ...o.viewport, panX: 50 } }, paint, [{ x: 0, y: 0, tile }], .5, 512, 1);
  expect(world.children[0]).toBe(wrapper);
  expect(wrapper.children[0]).toBe(tile.canvas);
  expect(world.style.transform).toBe('matrix(0.5,0,0,0.5,50,20)');
  expect(paint).not.toHaveBeenCalled();
  releaseTileLayer(ctx);
  expect(parent.children).toEqual([canvas]);
  expect(canvas.style.visibility).toBeUndefined();
  expect(tile.canvas.parentElement).toBeNull();
});
it('crops selection chrome to a small screen-space canvas and removes exposed tiles', () => {
  const { parent, ctx, tile, o } = fixture(), paint = vi.fn();
  const selected = { ...o, selectionRect: { x: 20, y: 10, width: 30, height: 20 } };
  expect(chromeBounds(selected)).toEqual({ x: 0, y: 0, width: 162, height: 120 });
  presentTileLayer(ctx, selected, paint, [{ x: 0, y: 0, tile }], .5, 512, 1);
  const root = parent.children[1], overlay = root.children[1];
  expect(overlay.width).toBe(324); expect(overlay.height).toBe(240);
  expect(paint.mock.lastCall[1]).toMatchObject({ overlaysOnly: true, viewport: { panX: 10, panY: 20 } });
  presentTileLayer(ctx, o, paint, [], .5, 512, 1);
  expect(root.children[0].children).toHaveLength(0);
  expect(overlay.width).toBe(0);
  releaseTileLayer(ctx);
});
it('never presents a hidden fallback over an active renderer', () => {
  const { parent, canvas, ctx, tile, o } = fixture();
  canvas.setAttribute('data-renderer-active', 'false');
  presentTileLayer(ctx, o, vi.fn(), [{ x: 0, y: 0, tile }], 1, 512, 1);
  expect(parent.children).toEqual([canvas]);
});

it('updates hidden pixels only when a sampler explicitly requests them', () => {
  const { ctx, tile, o } = fixture(), paint = vi.fn();
  presentTileLayer(ctx, o, paint, [{ x: 0, y: 0, tile }], .5, 512, 1);
  expect(paint).not.toHaveBeenCalled();
  expect(syncTileLayerCanvas(ctx)).toBe(true);
  expect(paint).toHaveBeenCalledWith(ctx, { ...o, dirtyRects: null });
  releaseTileLayer(ctx);
  expect(syncTileLayerCanvas(ctx)).toBe(false);
});

it('synchronizes the current document and camera before an eyedropper reads hidden pixels', () => {
  const { ctx, tile, o } = fixture(), events = [], doc = { nodes: [] };
  const viewport = { zoom: 3, panX: 30, panY: 40 };
  const paint = vi.fn(() => events.push('sync'));
  ctx.getImageData = vi.fn(() => { events.push('read'); return { data: [17, 34, 51, 255] }; });
  presentTileLayer(ctx, o, paint, [{ x: 0, y: 0, tile }], .5, 512, 1);
  const sampler = createEngineSampler({ ctx, getDoc: () => doc,
    viewportTools: { getViewport: () => viewport }, getRenderedDpr: () => 2, DROPPER_SAMPLE_RADII: [0] });
  expect(sampler.sampleColorAt({ x: 5, y: 10 })).toBe('#112233');
  expect(events).toEqual(['sync', 'read']);
  expect(paint.mock.lastCall[1]).toMatchObject({ doc, viewport, cullOffscreen: false, spatialIndex: null });
  expect(ctx.getImageData).toHaveBeenCalledWith(90, 140, 1, 1);
  releaseTileLayer(ctx);
});

it('paints chrome synchronously with every camera transform while moving', () => {
  const { parent, ctx, tile, o } = fixture();
  const selected = { ...o, cameraMoving: true,
    selectionRect: { x: 100, y: 100, width: 30, height: 20 } };
  const paint = vi.fn((_target, options) => {
    const root = parent.children[1], world = root.children[0];
    expect(world.style.transform).toBe(expectedTransform);
    expect(root.children[1].parentElement).toBe(root);
    expect(options).toMatchObject({ cameraMoving: true, overlaysOnly: true });
    const bounds = chromeBounds(current);
    expect(options.viewport).toEqual({ ...current.viewport,
      panX: current.viewport.panX - bounds.x,
      panY: current.viewport.panY - bounds.y });
  });
  let current, expectedTransform;
  try {
    for (const [zoom, panX, panY, ratio] of [[2, 10, 20, .5], [2.5, 35, 45, .625], [3, 60, 70, .75]]) {
      current = { ...selected, viewport: { zoom, panX, panY } };
      expectedTransform = `matrix(${ratio},0,0,${ratio},${panX},${panY})`;
      const before = paint.mock.calls.length;
      presentTileLayer(ctx, current, paint, [{ x: 0, y: 0, tile }], ratio, 512, 1);
      expect(paint).toHaveBeenCalledTimes(before + 1);
    }
  } finally {
    releaseTileLayer(ctx);
  }
});
