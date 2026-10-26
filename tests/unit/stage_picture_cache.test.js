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
import { interactionBackdrop } from '../../src/canvas/editor/interaction_backdrop.js';

it('keeps the interaction tier when mixed media cannot use a tile cache', () => {
  const update = vi.spyOn(interactionBackdrop, 'update').mockImplementation(() => {});
  const release = vi.spyOn(interactionBackdrop, 'release').mockImplementation(() => {});
  try {
    const ctx = { canvas: {} };
    const paint = vi.fn();
    drawCachedStage(ctx, { cameraMoving: true, cullOffscreen: false }, paint);
    expect(update).toHaveBeenCalledWith(ctx, true);
    expect(release).not.toHaveBeenCalled();
    expect(paint).toHaveBeenCalledOnce();
    releaseStagePictureCache(ctx);
    expect(release).toHaveBeenCalledOnce();
  } finally { update.mockRestore(); release.mockRestore(); }
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
