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
import { createSkiaHost } from "../../src/canvas/editor/skia_host.js";

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
    canvasRef: { current: { addEventListener: vi.fn(), removeEventListener: vi.fn() } },
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
  vi.restoreAllMocks();
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

it("paints live object drag previews before React updates and releases the subscription", () => {
  const initial = { id: "document", nodes: [{ id: "rect", x: 10 }] };
  let current = initial;
  let repaint;
  const unsubscribe = vi.fn();
  props = {
    ...props,
    docs: [{ ...initial, id: "artboard" }],
    livePageId: "artboard",
    spatialIndex: { stale: true },
    liveEngine: {
      getDocument: () => current,
      subscribeRender(callback) { repaint = callback; return unsubscribe; },
    },
  };
  render(props);
  rafCallbacks.splice(0).forEach(cb => cb());
  host.draw.mockClear();
  current = { ...initial, nodes: [{ id: "rect", x: 80 }] };
  repaint();
  expect(host.draw).toHaveBeenCalledTimes(1);
  const painted = host.draw.mock.calls[0][0];
  expect(painted.docs[0].id).toBe("artboard");
  expect(painted.docs[0].nodes).toBe(current.nodes);
  expect(painted.spatialIndex).toBeNull();
  for (const slot of hooks.slots) slot.cleanup?.();
  hooks.slots = [];
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it("exposes initialization failure so ordinary frames use the full artwork fallback", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  for (const slot of hooks.slots) slot.cleanup?.();
  hooks.slots = [];
  vi.mocked(createSkiaHost).mockRejectedValueOnce(new Error("GPU unavailable"));
  render(props);
  await Promise.resolve();
  await Promise.resolve();
  expect(render(props).status).toBe("unavailable");
});

it("switches away from an opaque GPU surface when drawing fails", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  host.draw.mockRejectedValueOnce(new Error("Surface lost"));
  store.setCamera({ panX: 80, panY: 50, zoom: 1 });
  await Promise.resolve();
  expect(render(props).status).toBe("unavailable");
});

it("switches to fallback after a synchronous surface resize failure", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  host.resize.mockImplementationOnce(() => { throw new Error("Resize failed"); });
  props.stageRef.current.clientWidth = 900;
  store.setCamera({ panX: 90, panY: 50, zoom: 1 });
  expect(render(props).status).toBe("unavailable");
});

it("handles GPU context loss and removes its listener on unmount", () => {
  const canvas = props.canvasRef.current;
  const onLost = canvas.addEventListener.mock.calls.find(([name]) => name === "webglcontextlost")[1];
  const event = { preventDefault: vi.fn() };
  onLost(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(render(props).status).toBe("unavailable");
  for (const slot of hooks.slots) slot.cleanup?.();
  hooks.slots = [];
  expect(canvas.removeEventListener).toHaveBeenCalledWith("webglcontextlost", onLost);
});
