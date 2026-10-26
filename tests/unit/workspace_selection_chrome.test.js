import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../src/canvas/editor/scene_renderer.js", () => ({
  draw: vi.fn(),
  resizeCanvas: vi.fn(),
}));
vi.mock("../../src/store/design_store.js", () => ({ useDesignStore: {} }));

import { draw } from "../../src/canvas/editor/scene_renderer.js";
import { renderEngineArtwork, renderEngineChrome, renderEngineStage } from "../../src/canvas/editor/editor_engine_render.js";
import { attachWorkspaceChrome } from "../../src/canvas/use_workspace_chrome.js";

let resizeCallback;
let observer;
let canvas;
let context;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", {
    devicePixelRatio: 2,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback) {
      resizeCallback = callback;
      observer = this;
    }
    observe = vi.fn();
    disconnect = vi.fn();
  });
  context = { setTransform: vi.fn(), clearRect: vi.fn() };
  canvas = { width: 1600, height: 1200, getContext: () => context };
});
afterEach(() => vi.unstubAllGlobals());

it("preserves frame fill and artwork while excluding interaction chrome on fallback", () => {
  const options = {
    doc: { backgroundColor: "#171717", nodes: [{ id: "rect", kind: "rect" }] },
    stageWidth: 800, stageHeight: 600, dpr: 2, dirtyRects: [{ x: 10 }],
  };
  renderEngineArtwork(canvas, options);
  expect(draw).toHaveBeenCalledWith(context, expect.objectContaining({
    doc: options.doc, artworkOnly: true, overlaysOnly: false, dirtyRects: null,
  }));
});

it("forwards live pixel, marquee, and lasso state from the page to the workspace chrome", () => {
  const pixelSelection = { contours: [[[10, 20], [80, 20], [80, 60]]], nodeId: "image" };
  const marqueeRect = { x: 10, y: 20, width: 70, height: 40 };
  const lasso = { points: [[20, 30], [40, 50]], pending: false };
  let options;
  const noop = () => null;
  renderEngineStage({
    ctx: {}, canvas: {}, stage: { clientWidth: 800, clientHeight: 600 },
    doc: { width: 800, height: 600, nodes: [] },
    selection: { getId: noop, getIds: () => [] },
    viewportTools: { getViewport: () => ({ zoom: 1, panX: 0, panY: 0 }) },
    crop: { getCropRect: noop },
    annotations: { getEditingTextId: noop, getEditingRegionId: noop },
    maskTools: { api: { getLasso: () => lasso } }, paintTools: {},
    penTools: { api: { getEdit: noop, getDraft: noop, insertionPreview: noop } },
    pixelSelection, marqueeRect, antsOffset: 3,
    onRenderOptions: value => { options = value; },
    paintStage: false,
  });
  expect(draw).not.toHaveBeenCalled();
  const viewport = { zoom: 1.5, panX: 300, panY: 120 };
  renderEngineChrome(canvas, options, viewport, 800, 600);
  expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1600, 1200);
  expect(draw.mock.lastCall).toEqual([context, expect.objectContaining({
    pixelSelection, marqueeRect, lasso, antsOffset: 3, viewport,
    overlaysOnly: true, pageBackground: false, dirtyRects: null, dpr: 2,
    stageWidth: 800, stageHeight: 600,
  })]);
});

it("clears stale chrome while the next focused engine is not yet ready", () => {
  renderEngineChrome(canvas, null, {}, 800, 600);
  expect(context.clearRect).toHaveBeenCalledOnce();
  expect(draw).not.toHaveBeenCalled();
});

it("follows engine-only gesture frames, shared camera, layout, and resize without React notifications", () => {
  const engineListeners = new Set();
  const cameraListeners = new Set();
  const engine = {
    renderChrome: vi.fn(),
    subscribeRender: listener => {
      engineListeners.add(listener);
      return () => engineListeners.delete(listener);
    },
  };
  let editorCamera = { panX: 30, panY: 40, zoom: 2 };
  const store = {
    getState: () => ({ editorCamera }),
    subscribe: listener => {
      cameraListeners.add(listener);
      return () => cameraListeners.delete(listener);
    },
  };
  const stage = { clientWidth: 800, clientHeight: 600 };
  const layout = { x: 100, y: 50 };
  const connection = attachWorkspaceChrome({ canvas, stage, engine, store, getLayout: () => layout });
  expect(engine.renderChrome).toHaveBeenLastCalledWith(canvas,
    { panX: 230, panY: 140, zoom: 2 }, 800, 600);
  engine.renderChrome.mockClear();
  engineListeners.forEach(listener => listener());
  expect(engine.renderChrome).toHaveBeenCalledOnce();

  const previous = editorCamera;
  editorCamera = { panX: -10, panY: 20, zoom: 0.5 };
  cameraListeners.forEach(listener => listener({ editorCamera }, { editorCamera: previous }));
  expect(engine.renderChrome).toHaveBeenLastCalledWith(canvas,
    { panX: 40, panY: 45, zoom: 0.5 }, 800, 600);
  layout.x = 300;
  stage.clientWidth = 1000;
  resizeCallback();
  expect(engine.renderChrome).toHaveBeenLastCalledWith(canvas,
    { panX: 140, panY: 45, zoom: 0.5 }, 1000, 600);

  connection.dispose();
  expect(engineListeners.size).toBe(0);
  expect(cameraListeners.size).toBe(0);
  expect(observer.disconnect).toHaveBeenCalledOnce();
  expect(window.removeEventListener).toHaveBeenCalledWith("resize", connection.paint);
  expect(context.clearRect).toHaveBeenCalledOnce();
});
