import { beforeEach, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => []);
vi.mock("react", async (original) => ({
  ...(await original()),
  useRef: (current) => ({ current }),
  useEffect: (effect) => effects.push(effect),
}));
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));
import EditorResizeHandles from "../../src/canvas/components/editor_resize_handles.jsx";

beforeEach(() => effects.splice(0));

it("moves every grip with camera-only pan and zoom frames and removes its subscription", () => {
  const viewport = { panX: 10, panY: 20, zoom: 1 };
  let render;
  const unsubscribe = vi.fn();
  const engine = {
    getDocument: () => ({ width: 100, height: 80 }),
    getViewport: () => viewport,
    subscribeRender: (listener) => { render = listener; return unsubscribe; },
  };
  const tree = EditorResizeHandles({
    engine,
    docRect: { x: 10, y: 20, width: 100, height: 80 },
    onCommit: vi.fn(),
  });
  const elements = new Map();
  for (const handle of tree.props.children) {
    const element = { style: {} };
    elements.set(handle.key, element);
    handle.ref(element);
  }
  const cleanup = effects[0]();
  expect(elements.get("left").style).toEqual({ left: "10px", top: "20px", height: "80px" });
  Object.assign(viewport, { panX: 75, panY: 90, zoom: 2 });
  render();
  expect(elements.get("left").style).toEqual({ left: "75px", top: "90px", height: "160px" });
  expect(elements.get("right").style).toEqual({ left: "275px", top: "90px", height: "160px" });
  expect(elements.get("top").style).toEqual({ left: "75px", top: "90px", width: "200px" });
  expect(elements.get("bottom").style).toEqual({ left: "75px", top: "250px", width: "200px" });
  cleanup();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
