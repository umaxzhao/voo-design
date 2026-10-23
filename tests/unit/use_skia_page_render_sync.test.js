import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Node-only hook runner: preserve hook slots and run effect cleanup before
// changed dependencies, and on unmount, without loading a browser/Skia runtime.
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
vi.mock("../../src/store/design_store.js", () => ({ useDesignStore: {} }));
const host = vi.hoisted(() => ({ resize: vi.fn(), draw: vi.fn(), dispose: vi.fn() }));
vi.mock("../../src/canvas/editor/skia_host.js", () => ({
  createSkiaHost: vi.fn(async () => host),
}));
import { useSkiaPage } from "../../src/canvas/use_skia_page.js";

function render(props) {
  hooks.cursor = 0;
  const result = useSkiaPage(props);
  for (const effect of hooks.pending.splice(0)) effect();
  return result;
}
function unmount() {
  for (const slot of hooks.slots) slot.cleanup?.();
  hooks.slots = [];
}
function makeEngine() {
  const listeners = new Set();
  const unsubscribe = vi.fn();
  return {
    getDocument: vi.fn(() => ({ id: "live" })),
    getViewport: vi.fn(() => ({ panX: 10, panY: 20, zoom: 1 })),
    getNodeBitmap: vi.fn(() => ({ src: "bitmap-url" })),
    subscribeRender: vi.fn(listener => {
      listeners.add(listener);
      return () => { unsubscribe(); listeners.delete(listener); };
    }),
    emit: () => listeners.forEach(listener => listener()),
    listeners,
    unsubscribe,
  };
}
let props;
beforeEach(async () => {
  vi.clearAllMocks();
  host.draw.mockResolvedValue(undefined);
  vi.stubGlobal("window", { devicePixelRatio: 2 });
  props = {
    enabled: true, engine: makeEngine(), doc: { id: "react-snapshot" }, revision: 1,
    canvasRef: { current: {} }, stageRef: { current: { clientWidth: 800, clientHeight: 600 } },
  };
  render(props);
  await Promise.resolve(); // Host initialization sets ready; flush that render.
  expect(render(props).status).toBe("ready");
});
afterEach(() => { unmount(); vi.unstubAllGlobals(); });

it("unsubscribes on unmount and subsequent engine frames cannot paint", () => {
  expect(props.engine.listeners.size).toBe(1);
  props.engine.emit();
  expect(host.draw).toHaveBeenCalledTimes(2);
  unmount();
  expect(props.engine.unsubscribe).toHaveBeenCalledTimes(1);
  expect(props.engine.listeners.size).toBe(0);
  expect(host.dispose).toHaveBeenCalledTimes(1);
  props.engine.emit();
  expect(host.draw).toHaveBeenCalledTimes(2);
});

it("unsubscribes from a replaced engine and only the new engine paints", () => {
  const previous = props.engine;
  props = { ...props, engine: makeEngine() };
  render(props);
  expect(previous.unsubscribe).toHaveBeenCalledTimes(1);
  expect(previous.listeners.size).toBe(0);
  expect(props.engine.listeners.size).toBe(1);
  host.draw.mockClear();
  previous.emit();
  expect(host.draw).not.toHaveBeenCalled();
  props.engine.emit();
  expect(host.draw).toHaveBeenCalledTimes(1);
});

it("resubscribes on doc/revision changes and paints the live document and camera each frame", () => {
  for (const change of [{ doc: { id: "new-react-snapshot" } }, { revision: 2 }]) {
    props = { ...props, ...change };
    const liveDoc = { id: `engine-${props.revision}`, nodes: [] };
    props.engine.getDocument.mockReturnValue(liveDoc);
    props.engine.getViewport.mockReturnValue({ panX: 30, panY: 40, zoom: 1.5 });
    const cleanups = props.engine.unsubscribe.mock.calls.length;
    render(props);
    expect(props.engine.unsubscribe).toHaveBeenCalledTimes(cleanups + 1);
    expect(props.engine.listeners.size).toBe(1);
    expect(host.draw.mock.lastCall[0]).toMatchObject({
      docs: [liveDoc], revision: props.revision,
      viewport: { x: 30, y: 40, panX: 30, panY: 40, zoom: 1.5, width: 800, height: 600, devicePixelRatio: 2 },
    });
    expect(host.draw.mock.lastCall[0].docs[0]).toBe(liveDoc);
    // Advance engine state without a React render, then emit the next rAF.
    const nextDoc = { id: "next-live-document" };
    props.engine.getDocument.mockReturnValue(nextDoc);
    props.engine.getViewport.mockReturnValue({ panX: 50, panY: 60, zoom: 2 });
    const paints = host.draw.mock.calls.length;
    props.engine.emit();
    expect(host.draw).toHaveBeenCalledTimes(paints + 1);
    const frame = host.draw.mock.lastCall[0];
    expect(frame.docs[0]).toBe(nextDoc);
    expect(frame.viewport).toMatchObject({ x: 50, y: 60, panX: 50, panY: 60, zoom: 2 });
    const node = { id: "image" };
    expect(frame.resolveImageUrl(node)).toBe("bitmap-url");
    expect(props.engine.getNodeBitmap).toHaveBeenLastCalledWith(node);
  }
});
