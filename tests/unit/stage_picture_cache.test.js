import { expect, it } from 'vitest';
import { pictureKey, samePictureKey, pictureTransform, pictureCovers } from '../../src/canvas/editor/stage_picture_cache.js';
it('invalidates on document revision, page, size, DPR and theme changes', () => {
  const base = { doc: { id: 'page1', backgroundColor: '#fff' }, docVersion: '1:1', dpr: 1, stageWidth: 800, stageHeight: 600 };
  const key = pictureKey(base);
  expect(samePictureKey(key, pictureKey({ ...base }))).toBe(true);
  for (const change of [{ docVersion: '2:1' }, { docVersion: '1:2' }, { dpr: 2 }, { stageWidth: 900 }, { stageHeight: 700 },
    { doc: { ...base.doc, id: 'page2' } }, { doc: { ...base.doc, backgroundColor: '#000' } }]) {
    expect(samePictureKey(key, pictureKey({ ...base, ...change }))).toBe(false);
  }
});
it('transforms overscan around camera origin and detects exposed edges', () => {
  const camera = { zoom: 1, panX: 10, panY: 20 };
  const t = pictureTransform(camera, { zoom: 2, panX: 30, panY: 50 });
  expect(t).toEqual({ scale: 2, x: -310, y: -310 });
  expect(pictureCovers(t, 800, 600)).toBe(true);
  expect(pictureCovers(pictureTransform(camera, { ...camera, panX: 500 }), 800, 600)).toBe(false);
});

import { vi } from 'vitest';
import { drawCachedStage, releaseStagePictureCache } from '../../src/canvas/editor/stage_picture_cache.js';
import { createRectNode } from '../../src/canvas/editor/scene_model.js';
it('reuses camera pixels, rerenders exposed areas, and returns to exact paint on settle', () => {
  const context = () => ({ canvas: { width: 800, height: 600 }, save() {}, restore() {}, setTransform() {}, clearRect() {}, drawImage: vi.fn() });
  const ctx = context();
  vi.stubGlobal('document', { createElement: () => ({ getContext: context }) });
  try {
    const paint = vi.fn();
    const options = { doc: { nodes: [createRectNode({})] }, viewport: { zoom: 1, panX: 0, panY: 0 }, dpr: 1,
      stageWidth: 800, stageHeight: 600, cullOffscreen: true, cameraMoving: true, docVersion: '1:1' };
    drawCachedStage(ctx, options, paint);
    expect(paint.mock.calls.filter(c => c[1].artworkOnly)).toHaveLength(1);
    drawCachedStage(ctx, { ...options, viewport: { ...options.viewport, panX: 20 } }, paint);
    expect(paint.mock.calls.filter(c => c[1].artworkOnly)).toHaveLength(1);
    drawCachedStage(ctx, { ...options, viewport: { ...options.viewport, panX: 500 } }, paint);
    expect(paint.mock.calls.filter(c => c[1].artworkOnly)).toHaveLength(2);
    drawCachedStage(ctx, { ...options, docVersion: '2:1' }, paint);
    expect(paint.mock.calls.filter(c => c[1].artworkOnly)).toHaveLength(3);
    const settled = { ...options, cameraMoving: false };
    drawCachedStage(ctx, settled, paint);
    expect(paint).toHaveBeenLastCalledWith(ctx, settled);
  } finally { vi.unstubAllGlobals(); }
});
it('keeps split layers for large drag damage and invalidates changes above the selection', () => {
  const context = () => ({ canvas: { width: 800, height: 600 }, save() {}, restore() {}, setTransform() {}, clearRect() {},
    translate() {}, scale() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, drawImage() {} });
  const ctx = context();
  vi.stubGlobal('document', { createElement: () => ({ getContext: context }) });
  try {
    const nodes = [createRectNode({}), createRectNode({}), createRectNode({})];
    const paint = vi.fn();
    const options = { doc: { width: 800, height: 600, nodes }, selectionNode: nodes[1],
      viewport: { zoom: 1, panX: 0, panY: 0 }, dpr: 1, stageWidth: 800, stageHeight: 600,
      cullOffscreen: true, previewMotion: true, docVersion: '1:1',
      dirtyRects: { x: 0, y: 0, width: 800, height: 600 } };
    drawCachedStage(ctx, options, paint);
    expect(paint.mock.calls.filter(c => c[1].artworkOnly).map(c => c[1].doc.nodes)).toEqual([[nodes[0]], [nodes[2]]]);
    const moved = { ...nodes[1], x: 90 };
    drawCachedStage(ctx, { ...options, doc: { ...options.doc, nodes: [nodes[0], moved, nodes[2]] },
      selectionNode: moved, docVersion: '2:1' }, paint);
    expect(paint.mock.calls.filter(c => c[1].artworkOnly)).toHaveLength(2);
    drawCachedStage(ctx, { ...options, doc: { ...options.doc, nodes: [nodes[0], moved, { ...nodes[2], fill: '#ff0000' }] },
      selectionNode: moved, docVersion: '3:1' }, paint);
    expect(paint.mock.calls.filter(c => c[1].artworkOnly)).toHaveLength(4);
  } finally { vi.unstubAllGlobals(); }
});

it('bounds high-DPR previews, crops zoom blits, and releases all surfaces', () => {
  const surfaces = [];
  const context = () => ({ canvas: { width: 1600, height: 1200 }, save() {}, restore() {}, setTransform() {}, clearRect() {}, drawImage: vi.fn() });
  const ctx = context();
  vi.stubGlobal('document', { createElement: () => {
    const canvas = { getContext: context }; surfaces.push(canvas); return canvas;
  } });
  try {
    const paint = vi.fn();
    const options = { doc: { nodes: [createRectNode({})] }, viewport: { zoom: 1, panX: 0, panY: 0 }, dpr: 2,
      stageWidth: 800, stageHeight: 600, cullOffscreen: true, cameraMoving: true, docVersion: '1:1' };
    drawCachedStage(ctx, options, paint);
    expect(surfaces[0]).toMatchObject({ width: 1100, height: 900 });
    expect(paint.mock.calls[0][1]).toMatchObject({ dpr: 1, cullOffscreen: true, artworkOnly: true });
    const zoomed = { ...options, viewport: { zoom: 2, panX: -400, panY: -300 } };
    drawCachedStage(ctx, zoomed, paint);
    expect(surfaces).toHaveLength(1);
    expect(ctx.drawImage.mock.lastCall.slice(1)).toEqual([350, 300, 400, 300, 0, 0, 800, 600]);
    expect(paint.mock.lastCall[1]).toMatchObject({ overlaysOnly: true, viewport: zoomed.viewport });
    expect(ctx.imageSmoothingEnabled).toBe(false);
    drawCachedStage(ctx, { ...zoomed, docVersion: '2:1' }, paint);
    expect(surfaces[0]).toMatchObject({ width: 0, height: 0 });
    releaseStagePictureCache(ctx);
    expect(surfaces.every(c => c.width === 0 && c.height === 0)).toBe(true);
  } finally { vi.unstubAllGlobals(); }
});

it('keeps translucent drag previews and filtered layer passes on the exact renderer', () => {
  const ctx = {};
  const paint = vi.fn();
  const options = { doc: { nodes: [createRectNode({ opacity: 0.5 })] }, viewport: { zoom: 1, panX: 0, panY: 0 },
    dpr: 1, stageWidth: 800, stageHeight: 600, cullOffscreen: true, previewMotion: true };
  drawCachedStage(ctx, options, paint);
  expect(paint).toHaveBeenLastCalledWith(ctx, options);
  const filtered = { ...options, cameraMoving: true, paintNodeIds: new Set() };
  drawCachedStage(ctx, filtered, paint);
  expect(paint).toHaveBeenLastCalledWith(ctx, filtered);
});

it('rebuilds cached pixels for edits, undo, page/background, resize and DPR changes', () => {
  const surfaces = [];
  const context = () => ({ canvas: { width: 800, height: 600 }, save() {}, restore() {}, setTransform() {}, clearRect() {}, drawImage() {} });
  const ctx = context();
  vi.stubGlobal('document', { createElement: () => {
    const canvas = { getContext: context }; surfaces.push(canvas); return canvas;
  } });
  try {
    const original = [createRectNode({})];
    let options = { doc: { id: 'page1', nodes: original, backgroundColor: '#ffffff' },
      viewport: { zoom: 1, panX: 0, panY: 0 }, dpr: 1, stageWidth: 800, stageHeight: 600,
      cullOffscreen: true, cameraMoving: true, docVersion: '1:1' };
    const paint = vi.fn();
    drawCachedStage(ctx, options, paint);
    const changes = [
      { doc: { ...options.doc, nodes: [{ ...original[0], x: 100 }] }, docVersion: '2:1' },
      { doc: options.doc, docVersion: '3:1' }, // undo to original immutable list
      { doc: { ...options.doc, id: 'page2' } },
      { doc: { ...options.doc, backgroundColor: '#000000' } },
      { stageWidth: 900 }, { stageHeight: 700 }, { dpr: 2 },
    ];
    for (const change of changes) {
      options = { ...options, ...change };
      drawCachedStage(ctx, options, paint);
      expect(surfaces.at(-2)).toMatchObject({ width: 0, height: 0 });
    }
    expect(paint.mock.calls.filter(c => c[1].artworkOnly)).toHaveLength(8);
    drawCachedStage(ctx, { ...options, cameraMoving: false }, paint);
    expect(surfaces.every(c => c.width === 0 && c.height === 0)).toBe(true);
  } finally { vi.unstubAllGlobals(); }
});

it('composites drag layers below, moving rectangle, above, then live overlays', () => {
  const events = [];
  const blits = [];
  const context = () => ({ canvas: { width: 800, height: 600 }, save() {}, restore() {}, setTransform() {}, clearRect() {},
    translate() {}, scale() {}, beginPath() {}, rect() {}, clip() {}, fillRect() { events.push('moving'); },
    drawImage(canvas, ...args) { events.push(canvas.label); blits.push(args); } });
  const ctx = context();
  let count = 0;
  vi.stubGlobal('document', { createElement: () => ({ label: ++count === 1 ? 'below' : 'above', getContext: context }) });
  try {
    const nodes = [createRectNode({}), createRectNode({}), createRectNode({})];
    const paint = (_, options) => { if (options.overlaysOnly) events.push('overlays'); };
    const options = { doc: { nodes }, selectionNode: nodes[1], viewport: { zoom: 1, panX: 0, panY: 0 },
      dpr: 1.25, stageWidth: 801, stageHeight: 601, cullOffscreen: true, previewMotion: true };
    drawCachedStage(ctx, options, paint);
    expect(blits).toEqual([
      [0, 0, 1001.25, 751.25, 0, 0, 801, 601],
      [0, 0, 1001.25, 751.25, 0, 0, 801, 601],
    ]);
    expect(events).toEqual(['below', 'moving', 'above', 'overlays']);
    releaseStagePictureCache(ctx);
  } finally { vi.unstubAllGlobals(); }
});

it('repaints small preview damage directly instead of allocating full-stage layers', () => {
  const ctx = {};
  const paint = vi.fn();
  const createElement = vi.fn();
  vi.stubGlobal('document', { createElement });
  try {
    const nodes = [createRectNode({ x: 50, y: 50 })];
    const options = { doc: { nodes }, selectionNode: nodes[0],
      viewport: { zoom: 1, panX: 0, panY: 0 }, dpr: 1,
      stageWidth: 800, stageHeight: 600, cullOffscreen: true,
      previewMotion: true, dirtyRects: { x: 10, y: 10, width: 100, height: 100 } };
    drawCachedStage(ctx, options, paint);
    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint).toHaveBeenCalledWith(ctx, options);
    expect(createElement).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

it('releases camera surfaces when switching to a local drag repaint', () => {
  const context = () => ({ canvas: { width: 800, height: 600 }, save() {}, restore() {},
    setTransform() {}, clearRect() {}, drawImage() {} });
  const ctx = context();
  const surfaces = [];
  vi.stubGlobal('document', { createElement: () => {
    const canvas = { getContext: context }; surfaces.push(canvas); return canvas;
  } });
  try {
    const paint = vi.fn();
    const options = { doc: { nodes: [createRectNode({})] },
      viewport: { zoom: 1, panX: 0, panY: 0 }, dpr: 1,
      stageWidth: 800, stageHeight: 600, cullOffscreen: true, cameraMoving: true };
    drawCachedStage(ctx, options, paint);
    expect(surfaces).toHaveLength(1);
    const preview = { ...options, cameraMoving: false, previewMotion: true,
      dirtyRects: { x: 10, y: 10, width: 100, height: 100 } };
    drawCachedStage(ctx, preview, paint);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).toMatchObject({ width: 0, height: 0 });
    expect(paint).toHaveBeenLastCalledWith(ctx, preview);
  } finally { releaseStagePictureCache(ctx); vi.unstubAllGlobals(); }
});
