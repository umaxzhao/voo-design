import { beforeEach, expect, it, vi } from "vitest";
import { renderEngineStage } from "../../src/canvas/editor/editor_engine_render.js";
import { draw } from "../../src/canvas/editor/scene_renderer.js";
vi.mock("../../src/canvas/editor/scene_renderer.js", () => ({ draw: vi.fn(), resizeCanvas: vi.fn() }));
beforeEach(() => { globalThis.window = { devicePixelRatio: 1 }; vi.clearAllMocks(); });
const frame = { id: "frame", kind: "group", isFrame: true, x: 100, y: 80, width: 500, height: 400 };
const children = [
  { id: "text", kind: "text", parentId: "frame", x: 120, y: 50, width: 80, height: 20 },
  { id: "rect", kind: "rect", parentId: "frame", x: 140, y: 180, width: 60, height: 40 },
];
function render(selectedContainer, ids = children.map(n => n.id)) {
  renderEngineStage({ ctx: {}, canvas: {}, stage: { clientWidth: 900, clientHeight: 700 },
    doc: { width: 1000, height: 800, nodes: [frame, ...children] },
    selection: { getId: () => ids.at(-1), getIds: () => ids }, selectedContainer,
    viewportTools: { getViewport: () => ({ zoom: 1, panX: 0, panY: 0 }) },
    tool: "select", crop: { getCropRect: () => null }, annotations: { getEditingTextId: () => null, getEditingRegionId: () => null },
    maskTools: { api: { getLasso: () => null } }, paintTools: {},
    penTools: { api: { getEdit: () => null, getDraft: () => null, insertionPreview: () => null } },
    getEffectiveNode: n => n,
  });
  return draw.mock.calls[0][1];
}
it.each(["frame", "isFrame", "containerType"])("uses only the selected frame's bounds (%s)", flag => {
  const selected = { ...frame, isFrame: false, [flag]: flag === "containerType" ? "frame" : true };
  const options = render(selected);
  expect(options.selectionNode).toEqual(selected);
  expect(options.selectionRect).toEqual({ x: 100, y: 80, width: 500, height: 400 });
  expect(options.selectionSet).toBeNull();
  expect(options.selectionHandles).toBe(true);
});
it("preserves explicit child multi-selection", () => {
  expect(render(null).selectionSet).toEqual(children);
});
it("uses the frame even with only one child selected", () => {
  expect(render(frame, ["rect"]).selectionNode).toEqual(frame);
});
