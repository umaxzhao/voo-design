import { describe, expect, it, vi } from "vitest";
import { createDocument, createImageNode, createRectNode, NODE_KIND } from "../../src/canvas/editor/scene_model.js";
import { createHistory } from "../../src/canvas/editor/editor_history.js";
import { createDrawingShapesApi } from "../../src/canvas/editor/drawing_api_shapes.js";
import { createShapesPointerGestures } from "../../src/canvas/editor/editor_pointer_shapes.js";
import { createSelectionPointerGestures } from "../../src/canvas/editor/editor_pointer_selection.js";
import { createPointerFinishDispatcher } from "../../src/canvas/editor/editor_pointer_finish.js";
import { createEngineSelectionController } from "../../src/canvas/editor/editor_engine_selection.js";
import { createSelection } from "../../src/canvas/editor/editor_selection.js";
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
    removeNode: vi.fn(id => { doc = ops.removeNode(doc, id); history.push(snapshot()); }),
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

  it.each([
    ["rect", "startShape"],
    ["ellipse", "startShape"],
    ["frame", "startShape"],
    ["star", "startPolyShape"],
    ["polygon", "startPolyShape"],
    ["arrow", "startArrow"],
  ])("restores selection and redo without committing when %s click is under 4px", (tool, start) => {
    const f = fixture(tool), before = f.snapshot(), entries = f.history.captureSession();
    f.shapes[start]({ clientX: 100, clientY: 100 });
    f.finish("pointerup");
    expect(f.snapshot()).toEqual(before);
    expect(f.history.captureSession()).toEqual(entries);
    expect(f.history.redo().doc).toEqual(f.future);
    expect(f.api.removeNode).not.toHaveBeenCalled();
    expect(f.api.commit).not.toHaveBeenCalled();
  });
});

describe("draft cancellation with intervening document edits", () => {
  it("preserves a sibling added while a text placement is open", () => {
    const f = fixture("text");
    f.shapes.startText({ clientX: 100, clientY: 100 });
    const sibling = createRectNode({ x: 200, y: 300, width: 40, height: 30 });
    f.api.setDoc(ops.addNode(f.snapshot().doc, sibling));
    f.finish("pointercancel");
    expect(f.snapshot().doc.nodes.map(node => node.id)).toContain(sibling.id);
    expect(f.snapshot().doc.nodes.some(node => node.kind === "text")).toBe(false);
    expect(f.api.commit).not.toHaveBeenCalled();
  });
  it("releases an intervening child instead of leaving a missing Frame parent", () => {
    const f = fixture("frame"), original = f.snapshot();
    f.shapes.startShape({ clientX: 100, clientY: 100 });
    const draft = f.snapshot().doc.nodes.find(node => !original.doc.nodes.some(old => old.id === node.id));
    const child = { ...createRectNode({ x: 130, y: 130, width: 40, height: 30 }), parentId: draft.id };
    f.api.setDoc(ops.addNode(f.snapshot().doc, child)); f.finish("pointercancel");
    expect(f.snapshot().doc.nodes.find(node => node.id === child.id).parentId).toBeNull();
    expect(f.snapshot().doc.nodes.some(node => node.id === draft.id)).toBe(false);
  });
});

describe("region and pixel selection gesture cancellation", () => {
  it("rolls back region and regionFree drafts on pointercancel or <2px click without losing redo", () => {
    for (const regionMode of ["rect", "free"]) {
      const f = fixture("region");
      const img = { ...createImageNode({ x: 0, y: 0, width: 200, height: 200 }), id: "img-1", visible: true };
      f.api.setDoc(ops.addNode(f.snapshot().doc, img));
      f.api.getRegionMode = () => regionMode;
      f.api.addRegion = (rect, opts) => {
        const node = { id: "reg-1", kind: NODE_KIND.REGION, hostId: opts.hostId, ...rect };
        f.api.setDoc(ops.addNode(f.snapshot().doc, node));
        f.api.select(node.id);
        return node;
      };
      const before = f.snapshot(), entries = f.history.captureSession();
      let gesture = null;
      const selGestures = createSelectionPointerGestures({
        api: f.api, imageAt: () => img, getGesture: () => gesture, setGesture: (g) => { gesture = g; },
      });
      const finish = createPointerFinishDispatcher({ api: f.api });
      selGestures.startRegion({ clientX: 20, clientY: 20 });
      selGestures.dragRegion({ clientX: 80, clientY: 70 });
      finish.finishGesture({ type: "pointercancel" }, gesture);
      expect(f.snapshot()).toEqual(before);
      expect(f.history.captureSession()).toEqual(entries);
    }
  });

  it("restores previous pixelSelection on cancelPolygonLasso and applies feather on closePolygonLasso", () => {
    const img = { ...createImageNode({ x: 0, y: 0, width: 200, height: 200 }), id: "img-1", visible: true };
    const doc = { ...createDocument(300, 300), nodes: [img] };
    const selectionController = createEngineSelectionController({
      getDoc: () => doc, setDoc: () => {}, selection: createSelection({}), cache: { get: () => null },
      viewportTools: { getViewport: () => ({ zoom: 1 }) }, maskTools: { api: { getMaskEdit: () => null } },
      paintTools: {}, historyApi: { commit: vi.fn() }, selectNode: () => {},
      getEffectiveNode: (n) => n, setTool: () => {}, requestRender: () => {}, notify: () => {},
    });
    selectionController.setPixelSelection({
      nodeId: "img-1",
      shape: "rect",
      bounds: { x: 10, y: 10, width: 40, height: 40 },
    });
    const prevSel = selectionController.getPixelSelection();
    expect(prevSel).not.toBeNull();

    // Start polygon lasso in replace mode and cancel -> restores prevSel
    selectionController.startPolygonLasso("img-1", { x: 20, y: 20 }, "replace");
    expect(selectionController.getPixelSelection()).toBeNull();
    selectionController.cancelPolygonLasso();
    expect(selectionController.getPixelSelection()).toEqual(prevSel);

    // Close polygon lasso with feather > 0 -> applies feather
    selectionController.setSelectionFeather(4);
    selectionController.startPolygonLasso("img-1", { x: 20, y: 20 }, "replace");
    selectionController.addPolygonVertex({ x: 80, y: 20 });
    selectionController.addPolygonVertex({ x: 80, y: 80 });
    expect(selectionController.closePolygonLasso()).toBe(true);
    expect(selectionController.getPixelSelection()?.feather).toBe(4);
  });
});
