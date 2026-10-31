import { describe, expect, it, vi } from "vitest";
import { createDocument, createRectNode } from "../../src/canvas/editor/scene_model.js";
import { createHistory } from "../../src/canvas/editor/editor_history.js";
import { createDrawingShapesApi } from "../../src/canvas/editor/drawing_api_shapes.js";
import { createShapesPointerGestures } from "../../src/canvas/editor/editor_pointer_shapes.js";
import { createPointerFinishDispatcher } from "../../src/canvas/editor/editor_pointer_finish.js";
import * as ops from "../../src/canvas/editor/doc_ops.js";

function fixture(tool) {
  const existing = createRectNode({ x: 10, y: 10, width: 40, height: 30 });
  let doc = { ...createDocument(600, 500), nodes: [existing] }, ids = [existing.id], gesture;
  const history = createHistory();
  const snapshot = () => ({ doc, selectedIds: [...ids] });
  history.reset(snapshot());
  doc = ops.updateNode(doc, existing.id, { x: 20 }); history.push(snapshot());
  const future = doc;
  ({ doc, selectedIds: ids } = history.undo());
  const selectExactly = next => { ids = next; history.updateCurrentSelection(ids); };
  const api = {
    getDocument: () => doc, getSelectedIds: () => ids, getTool: () => tool,
    setDoc: next => { doc = next; }, toDocPoint: (x, y) => ({ x, y }),
    select: id => selectExactly(id ? [id] : []), selectExactly,
    mute: run => history.mute(run), getColor: () => "#123456",
    getSnappingEnabled: () => false, nodeAtPoint: () => null, setTextDraftRect: vi.fn(),
    updateNode: (id, patch) => { doc = ops.updateNode(doc, id, patch); },
    commit: vi.fn(() => history.push(snapshot())),
    beginTextEdit: vi.fn(), setTool: vi.fn(),
  };
  Object.assign(api, createDrawingShapesApi({ getDoc: api.getDocument, setDoc: api.setDoc, getColor: api.getColor }));
  const shapes = createShapesPointerGestures({ api, getGesture: () => gesture, setGesture: value => { gesture = value; } });
  const finish = createPointerFinishDispatcher({ api });
  return { api, shapes, history, snapshot, future, finish: type => finish.finishGesture({ type }, gesture) };
}

describe("cancelled drawing transactions", () => {
  it.each([
    ["rect", "startShape", "dragShape"], ["ellipse", "startShape", "dragShape"],
    ["frame", "startShape", "dragShape"], ["star", "startPolyShape", "dragShape"],
    ["polygon", "startPolyShape", "dragShape"], ["arrow", "startArrow", "dragArrow"],
    ["text", "startText", "dragText"],
  ])("restores document, selection and redo after cancelling %s", (tool, start, drag) => {
    const f = fixture(tool), before = f.snapshot(), entries = f.history.captureSession();
    f.shapes[start]({ clientX: 100, clientY: 100 });
    f.shapes[drag]({ clientX: 180, clientY: 160 });
    expect(f.snapshot().doc).not.toEqual(before.doc);
    f.finish("pointercancel");
    expect(f.snapshot()).toEqual(before);
    expect(f.history.captureSession()).toEqual(entries);
    expect(f.history.redo().doc).toEqual(f.future);
    expect(f.api.commit).not.toHaveBeenCalled();
    expect(f.api.beginTextEdit).not.toHaveBeenCalled();
  });
});
