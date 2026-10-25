import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Node-only hook runner (same pattern as use_skia_page_render_sync.test.js).
const hooks = vi.hoisted(() => ({ slots: [], cursor: 0, pending: [] }));
vi.mock("react", () => ({
  useRef(initial) {
    const index = hooks.cursor++;
    return hooks.slots[index] ??= { current: initial };
  },
  useState(initial) {
    const index = hooks.cursor++;
    hooks.slots[index] ??= { value: initial };
    return [hooks.slots[index].value, value => { hooks.slots[index].value = value; }];
  },
  useEffect(effect, deps) {
    const index = hooks.cursor++;
    const previous = hooks.slots[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
      hooks.pending.push(() => {
        previous?.cleanup?.();
        hooks.slots[index] = { deps, cleanup: effect() };
      });
    }
  },
}));

// Minimal store double: set() replaces editorCamera and notifies synchronously.
const store = vi.hoisted(() => {
  const listeners = new Set();
  const state = { editorCamera: { panX: 0, panY: 0, zoom: 1 } };
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setCamera(editorCamera) {
      const previous = { ...state };
      state.editorCamera = editorCamera;
      for (const listener of [...listeners]) listener(state, previous);
    },
    size: () => listeners.size,
  };
});
vi.mock("../../src/store/design_store.js", () => ({ useDesignStore: store }));
const host = vi.hoisted(() => ({ resize: vi.fn(), draw: vi.fn(), dispose: vi.fn() }));
vi.mock("../../src/canvas/editor/skia_host.js", () => ({
  createSkiaHost: vi.fn(async () => host),
}));
import { useWorkspaceSkia } from "../../src/canvas/use_skia_page.js";

function render(props) {
  hooks.cursor = 0;
  const result = useWorkspaceSkia(props);
  for (const effect of hooks.pending.splice(0)) effect();
  return result;
}

let props;
let rafCallbacks;
beforeEach(async () => {
  vi.clearAllMocks();
  rafCallbacks = [];
  host.draw.mockResolvedValue(undefined);
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("requestAnimationFrame", cb => rafCallbacks.push(cb));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  props = {
    enabled: true,
    subscribeCamera: true,
    canvasRef: { current: {} },
    stageRef: { current: { clientWidth: 800, clientHeight: 600 } },
    docs: [],
  };
  render(props);
  await Promise.resolve();
  render(props);
  // Drop the initial scheduled paint so only pan steps are counted.
  rafCallbacks.splice(0).forEach(cb => cb());
  host.draw.mockClear();
});
afterEach(() => {
  for (const slot of hooks.slots) slot.cleanup?.();
  hooks.slots = [];
  vi.unstubAllGlobals();
});

it("repaints the canvas in the same tick as the overlay for every middle-button pan step", () => {
  // Stand-in for the DOM overlay subscriber (artboard layer transform).
  const overlayCameras = [];
  const unsubscribe = store.subscribe(state => overlayCameras.push(state.editorCamera));

  const steps = [
    { panX: 10, panY: 4, zoom: 1 },
    { panX: 25, panY: 9, zoom: 1 },
    { panX: 31, panY: 20, zoom: 1 },
  ];
  steps.forEach((camera, index) => {
    store.setCamera(camera);
    // One repaint per pan move, already issued before the event returns.
    expect(host.draw).toHaveBeenCalledTimes(index + 1);
    const { viewport } = host.draw.mock.calls[index][0];
    const overlay = overlayCameras[index];
    expect(overlay).toBe(camera);
    expect(viewport.panX).toBe(overlay.panX);
    expect(viewport.panY).toBe(overlay.panY);
    expect(viewport.x).toBe(overlay.panX);
    expect(viewport.y).toBe(overlay.panY);
  });
  // Nothing was deferred to a later frame.
  expect(rafCallbacks).toHaveLength(0);
  unsubscribe();
});

it("stops repainting once the workspace unmounts", () => {
  for (const slot of hooks.slots) slot.cleanup?.();
  hooks.slots = [];
  store.setCamera({ panX: 1, panY: 1, zoom: 1 });
  expect(host.draw).not.toHaveBeenCalled();
});
