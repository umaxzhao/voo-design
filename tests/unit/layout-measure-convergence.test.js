import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEngineInitController } from "../../src/canvas/editor/editor_engine_init.js";
import { reflowAutoLayout } from "../../src/canvas/editor/scene_auto_layout.js";
import { measureText } from "../../src/canvas/editor/scene_renderer.js";

vi.mock("../../src/canvas/editor/scene_auto_layout.js", async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, reflowAutoLayout: vi.fn(actual.reflowAutoLayout) };
});
vi.mock("../../src/canvas/editor/scene_renderer.js", () => ({ ensureImagePyramid: vi.fn(), measureText: vi.fn() }));

const frame = (patch = {}) => ({ id: "frame", kind: "group", x: 0, y: 0, width: 120,
  height: 80, autoLayout: { direction: "vertical", padding: 10 }, ...patch });
const text = (patch = {}) => ({ id: "text", kind: "text", parentId: "frame", text: "Wrapping text",
  x: 10, y: 10, width: 100, height: 20, layoutWidth: "fill", ...patch });
const controller = () => createEngineInitController({ ctx: {} });

beforeEach(() => {
  vi.clearAllMocks();
  measureText.mockImplementation((_ctx, node) => ({ width: node.width, height: node.height }));
});

describe("text and layout convergence", () => {
  it("ends a settled measurement after one real layout pass", () => {
    const c = controller();
    const doc = c.measureTextNodes({ nodes: [frame(), text()] });
    vi.clearAllMocks();
    expect(c.measureTextNodes(doc)).toBe(doc);
    expect(reflowAutoLayout).toHaveBeenCalledTimes(1);
    expect(measureText).not.toHaveBeenCalled();
    vi.clearAllMocks();
    const edited = { ...doc, nodes: [...doc.nodes, { id: "outside", kind: "rect", x: 200, y: 0, width: 20, height: 20 }] };
    const next = c.measureTextNodes(edited);
    expect(next.nodes).toEqual(edited.nodes);
    expect(reflowAutoLayout).toHaveBeenCalledTimes(1);
  });

  it("continues when a fill width changes, then measures its wrapped height", () => {
    const c = controller();
    const doc = c.measureTextNodes({ nodes: [frame(), text()] });
    measureText.mockImplementation((_ctx, node) => ({ width: node.width, height: node.width < 80 ? 40 : 20 }));
    vi.clearAllMocks();
    const next = c.measureTextNodes({ ...doc, nodes: doc.nodes.map(node => node.id === "frame" ? { ...node, width: 70 } : node) });
    expect(next.nodes[1]).toMatchObject({ width: 50, boxWidth: 50, height: 40 });
    expect(reflowAutoLayout).toHaveBeenCalledTimes(3);
    expect(measureText).toHaveBeenCalledTimes(1);
  });

  it("retains exact hug sizing after forced font metrics change", () => {
    const c = controller();
    const doc = c.measureTextNodes({ nodes: [frame({ autoLayout: { direction: "vertical", padding: 10, heightMode: "hug" } }), text()] });
    measureText.mockImplementation((_ctx, node) => ({ width: node.width, height: 35 }));
    const next = c.measureTextNodes(doc, { force: true });
    expect(next.nodes[0].height).toBe(55);
    expect(next.nodes[1]).toMatchObject({ width: 100, height: 35 });
    expect(doc.nodes[1].height).toBe(20);
  });
});
