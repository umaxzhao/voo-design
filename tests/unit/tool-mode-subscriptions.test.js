import { expect, it, vi } from "vitest";
import { createEngineToolsController } from "../../src/canvas/editor/editor_engine_tools.js";
import { TOOL } from "../../src/canvas/editor/tool_ids.js";

function controller(notify = vi.fn()) {
  return createEngineToolsController({
    getDoc: () => ({ nodes: [] }), setDoc: vi.fn(),
    selection: { getId: () => null }, selectNode: vi.fn(),
    crop: { beginCrop: vi.fn(), cancelCrop: vi.fn() },
    maskTools: { api: { cancelLasso: vi.fn(), getMaskEdit: () => null, endMaskEdit: vi.fn() } },
    annotations: { api: {} }, penTools: { api: {} },
    selectionController: { getMarqueeMode: () => "rect", cancelPolygonLasso: vi.fn(),
      cancelMagneticLasso: vi.fn(), getSelectionTransform: () => null, setSelectionTransform: vi.fn() },
    paintTools: {}, notify,
  });
}

it("publishes changed modes before deferred UI notification and releases listeners", () => {
  const notify = vi.fn(), tools = controller(notify), changes = [];
  const unsubscribe = tools.subscribeTool(tool => changes.push([tool, tools.getTool(), notify.mock.calls.length]));
  tools.setTool(TOOL.RECT);
  expect(changes).toEqual([[TOOL.RECT, TOOL.RECT, 0]]);
  tools.setTool(TOOL.RECT);
  expect(changes).toHaveLength(1);
  unsubscribe(); tools.setTool(TOOL.ELLIPSE);
  expect(changes).toHaveLength(1);
  const late = vi.fn(); tools.subscribeTool(late); tools.clearToolSubscriptions();
  tools.setTool(TOOL.SELECT);
  expect(late).not.toHaveBeenCalled();
});

it("rejects invalid tool subscriptions immediately", () => {
  expect(() => controller().subscribeTool(null)).toThrow(TypeError);
});
