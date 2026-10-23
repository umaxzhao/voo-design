import { describe, it, expect, vi } from 'vitest';
import { createCameraRafBatcher } from '../../src/canvas/camera_raf.js';
function setup() {
  let camera = { panX: 1, panY: 2, zoom: 1 };
  const frames = [];
  const setCamera = vi.fn(value => { camera = value; });
  const batch = createCameraRafBatcher({ getCamera: () => camera, setCamera, requestAnimationFrame: cb => frames.push(cb) });
  return { batch, frames, setCamera, camera: () => camera };
}
describe('camera rAF batching', () => {
  it('accumulates pan and zoom into one camera update per frame', () => {
    const s = setup();
    for (let i = 0; i < 200; i++) s.batch.pan(2, -1);
    s.batch.zoom(prev => ({ zoom: prev.zoom * 2 }));
    expect(s.frames).toHaveLength(1);
    expect(s.setCamera).not.toHaveBeenCalled();
    s.frames.shift()();
    expect(s.camera()).toEqual({ panX: 401, panY: -198, zoom: 2 });
    expect(s.setCamera).toHaveBeenCalledTimes(1);
    s.batch.pan(1, 1);
    s.frames.shift()();
    expect(s.setCamera).toHaveBeenCalledTimes(2);
  });
  it('flushes immediately and ignores stale frames and disposal', () => {
    const s = setup();
    s.batch.pan(3, 4);
    s.batch.flush();
    s.batch.pan(5, 6);
    s.frames.shift()();
    expect(s.setCamera).toHaveBeenCalledTimes(1);
    s.frames.shift()();
    expect(s.camera()).toEqual({ panX: 9, panY: 12, zoom: 1 });
    s.batch.pan(10, 10);
    s.batch.dispose();
    s.frames.shift()();
    s.batch.pan(1, 1);
    s.batch.flush();
    expect(s.setCamera).toHaveBeenCalledTimes(2);
  });
});

it('batches store pan calls while discrete camera sets stay immediate', async () => {
  const frames = [];
  vi.stubGlobal('requestAnimationFrame', cb => frames.push(cb));
  const { useDesignStore } = await import('../../src/store/design_store.js');
  const store = useDesignStore;
  store.getState().setEditorCamera({ panX: 0, panY: 0, zoom: 1 });
  const updates = vi.fn();
  const unsubscribe = store.subscribe(updates);
  try {
    for (let i = 0; i < 100; i++) store.getState().panEditorCamera(2, 3);
    expect(updates).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    frames.shift()();
    expect(updates).toHaveBeenCalledTimes(1);
    expect(store.getState().editorCamera).toEqual({ panX: 200, panY: 300, zoom: 1 });
    store.getState().panEditorCamera(10, 10);
    store.getState().setEditorCamera({ panX: 5, panY: 6, zoom: 2 });
    expect(store.getState().editorCamera).toEqual({ panX: 5, panY: 6, zoom: 2 });
    frames.shift()();
    expect(store.getState().editorCamera).toEqual({ panX: 5, panY: 6, zoom: 2 });
  } finally { unsubscribe(); vi.unstubAllGlobals(); }
});
