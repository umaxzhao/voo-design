import { describe, expect, it, vi } from "vitest";
import {
  createDocument,
  createGroupNode,
  createRectNode,
  NODE_KIND,
} from "../../src/canvas/editor/scene_model.js";
import * as ops from "../../src/canvas/editor/doc_ops.js";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";
import { createHistory } from "../../src/canvas/editor/editor_history.js";
import { createSelection } from "../../src/canvas/editor/editor_selection.js";
import { createPenTools } from "../../src/canvas/editor/editor_pen.js";
import { createEngineToolsController } from "../../src/canvas/editor/editor_engine_tools.js";
import { createEngineNodesController } from "../../src/canvas/editor/editor_engine_nodes.js";
import {
  collectLayerRowNodeIds,
  isFolderSelectionRow,
} from "../../src/canvas/editor/layer_selection.js";
import { createClipboard } from "../../src/canvas/editor/editor_clipboard.js";
import { createPointerMoveDispatcher } from "../../src/canvas/editor/editor_pointer_move.js";
import { createPointerFinishDispatcher } from "../../src/canvas/editor/editor_pointer_finish.js";
import { createPointerKeyboard } from "../../src/canvas/editor/editor-pointer-bindings.js";
import { nudgeSelection } from "../../src/canvas/editor-shortcut-nudge.js";
import { unwindEscape } from "../../src/canvas/editor-shortcut-actions.js";

describe("pen tool transition lifecycle", () => {
  it("commits an open pen draft and clears draft state when switching to Select", () => {
    let doc = createDocument(400, 300);
    const selection = createSelection({});
    const penTools = createPenTools({
      getDoc: () => doc,
      setDoc: (next) => { doc = next; },
      select: (id) => selection.selectNodes(id ? [id] : []),
      getColor: () => "#ff3366",
      getStrokeWidth: () => 2,
      requestRender: () => {},
      getZoom: () => 1,
    });
    const tools = createEngineToolsController({
      getDoc: () => doc,
      setDoc: (next) => { doc = next; },
      selection,
      selectNode: (id) => selection.selectNodes(id ? [id] : []),
      crop: { beginCrop: () => {}, cancelCrop: () => {} },
      maskTools: { api: { cancelLasso: () => {}, getMaskEdit: () => null, endMaskEdit: () => {} } },
      annotations: { api: {} },
      penTools,
      selectionController: {
        getMarqueeMode: () => "rect",
        cancelPolygonLasso: () => {},
        cancelMagneticLasso: () => {},
        getSelectionTransform: () => null,
        setSelectionTransform: () => {},
      },
      paintTools: { bitmapSourceOf: () => null },
      notify: () => {},
    });

    tools.setTool(TOOL.PEN);
    penTools.api.penDown({ x: 20, y: 30 });
    penTools.api.penUp();
    penTools.api.penDown({ x: 120, y: 90 });
    penTools.api.penUp();
    expect(penTools.api.getDraft()).not.toBeNull();

    tools.setTool(TOOL.SELECT);
    expect(penTools.api.getDraft()).toBeNull();
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0].kind).toBe(NODE_KIND.PATH);
    expect(doc.nodes[0].points).toHaveLength(2);
  });
});

describe("transform handle gesture rollback and zero-drag guards", () => {
  function createTransformFixture(gestureInit) {
    const rect = createRectNode({ x: 40, y: 50, width: 100, height: 80, cornerRadius: 4 });
    const line = {
      id: "line-1",
      kind: NODE_KIND.PATH,
      x: 20,
      y: 20,
      width: 100,
      height: 40,
      points: [[0, 0], [100, 40]],
      stroke: "#fff",
      strokeWidth: 2,
    };
    let doc = { ...createDocument(500, 400), nodes: [rect, line] };
    let selectedIds = [gestureInit.id ?? rect.id];
    const history = createHistory();
    const snapshot = () => ({ doc, selectedIds: [...selectedIds] });
    history.reset(snapshot());
    doc = ops.updateNode(doc, rect.id, { x: 60 });
    history.push(snapshot());
    const futureDoc = doc;
    ({ doc, selectedIds } = history.undo());

    let gesture = { ...gestureInit, id: gestureInit.id ?? rect.id };
    const api = {
      getDocument: () => doc,
      setDoc: (next) => { doc = next; },
      getSelectedIds: () => selectedIds,
      getSelectedGroup: () => null,
      getSelected: () => doc.nodes.find((n) => n.id === selectedIds[0]) ?? null,
      select: (id) => { selectedIds = id ? [id] : []; history.updateCurrentSelection(selectedIds); },
      selectExactly: (ids) => { selectedIds = [...ids]; history.updateCurrentSelection(selectedIds); },
      captureDocumentSession: () => history.captureSession(),
      restoreDocumentSession: (session) => {
        history.restoreSession(session);
        const snap = session.entries[session.currentIndex]?.snapshot;
        doc = snap.doc;
        selectedIds = [...(snap.selectedIds ?? [])];
      },
      toDocPoint: (x, y) => ({ x, y }),
      getViewport: () => ({ zoom: 1 }),
      getSnappingEnabled: () => false,
      setGuides: () => {},
      updateNode: (id, patch) => { doc = ops.updateNode(doc, id, patch); },
      updateNodes: (updates) => { for (const u of updates) doc = ops.updateNode(doc, u.id, u); },
      commit: vi.fn(() => history.push(snapshot())),
    };

    const move = createPointerMoveDispatcher({
      api, pan: {}, drawing: {}, shapes: {}, marquee: {}, selection: {}, warp: {},
      transform: {
        dragResize: () => api.updateNode(gesture.id, { width: 160, height: 120 }),
        dragRotate: () => api.updateNode(gesture.id, { rotation: 45 }),
        dragCrop: () => {},
      },
    });
    const finish = createPointerFinishDispatcher({ api });
    const onPointerUp = (event) => {
      const current = gesture;
      gesture = null;
      finish.finishGesture(event, current);
    };
    const keyboard = createPointerKeyboard({
      stage: { style: {} }, shared: false, getGesture: () => gesture, getLastPointerEvent: () => null,
      setSpaceDown: () => {}, dispatchMove: move.dispatchMove, onPointerUp,
      hover: { updateHoverCursor: () => {} },
    });
    api.cancelActiveGesture = keyboard.cancelActiveGesture;
    return {
      api, history, futureDoc, snapshot,
      move: (event) => move.dispatchMove(event, gesture),
      finish: onPointerUp,
    };
  }

  const cases = [
    ["resize", { kind: "resize", handle: "se", start: { x: 140, y: 130 } }],
    ["rotate", { kind: "rotate", center: { x: 90, y: 90 }, initialAngle: 0, startRotation: 0 }],
    ["cornerRadius", { kind: "cornerRadius", handle: "radius-nw", start: { x: 40, y: 50 }, initialRadius: 4, maxRadius: 40, isIndependent: false }],
    ["endpoint", { kind: "endpoint", id: "line-1", index: 1 }],
  ];

  it.each(cases)("rolls back %s on Escape without committing or losing redo", (_name, init) => {
    const f = createTransformFixture(init);
    const before = f.snapshot(), sessionBefore = f.history.captureSession();
    f.move({ clientX: 180, clientY: 160 });
    expect(f.snapshot().doc).not.toEqual(before.doc);
    expect(unwindEscape({ engine: f.api, tool: TOOL.SELECT })).toBe(true);
    expect(f.snapshot()).toEqual(before);
    expect(f.history.captureSession()).toEqual(sessionBefore);
    expect(f.history.redo().doc).toEqual(f.futureDoc);
    expect(f.api.commit).not.toHaveBeenCalled();
  });

  it.each(cases)("does not commit or clear redo when %s handle is clicked without dragging", (_name, init) => {
    const f = createTransformFixture(init);
    f.finish({ type: "pointerup" });
    expect(f.api.commit).not.toHaveBeenCalled();
    expect(f.history.canRedo()).toBe(true);
  });
});

describe("keyboard arrow nudging for groups and pen anchors", () => {
  it("moves a selected Auto Layout group container together with its children", () => {
    const group = {
      ...createGroupNode({ x: 100, y: 100, width: 120, height: 80 }),
      id: "auto-group",
      autoLayout: { direction: "vertical", gap: 8, padding: 0, alignItems: "start", justifyContent: "start", widthMode: "hug", heightMode: "hug" },
    };
    const childA = { ...createRectNode({ x: 100, y: 100, width: 60, height: 24 }), id: "child-a", parentId: group.id };
    const childB = { ...createRectNode({ x: 100, y: 132, width: 60, height: 24 }), id: "child-b", parentId: group.id };
    let doc = { ...createDocument(500, 400), nodes: [group, childA, childB] };
    const engine = {
      isEditing: () => false,
      getSelectedGroup: () => doc.nodes.find((n) => n.id === group.id),
      getSelectedNodes: () => doc.nodes.filter((n) => n.id === childA.id || n.id === childB.id),
      moveNodesBy: (ids, dx, dy) => { doc = ops.moveWithFollowers(doc, ids, dx, dy); },
      commit: vi.fn(),
    };
    nudgeSelection({ engine, nudgedRef: { current: false } }, 15, 20);
    expect(doc.nodes.find((n) => n.id === group.id)).toMatchObject({ x: 115, y: 120 });
    expect(doc.nodes.find((n) => n.id === childA.id)).toMatchObject({ x: 115, y: 120 });
    expect(doc.nodes.find((n) => n.id === childB.id)).toMatchObject({ x: 115, y: 152 });
  });

  it("expands pen node bounds when nudging an anchor outside its initial box, including resized paths", () => {
    let doc = {
      ...createDocument(400, 300),
      nodes: [{
        id: "pen-1", kind: NODE_KIND.PATH, pen: true,
        x: 50, y: 60, width: 80, height: 60, baseWidth: 40, baseHeight: 30,
        points: [{ x: 10, y: 10, out: [5, 0] }, { x: 40, y: 30, in: [-5, 0] }],
      }],
    };
    let commits = 0;
    const penTools = createPenTools({
      getDoc: () => doc,
      setDoc: (next, opts) => { doc = next; if (opts?.commit !== false) commits += 1; },
      select: () => {},
      getColor: () => "#fff", getStrokeWidth: () => 2, requestRender: () => {}, getZoom: () => 1,
    });
    penTools.api.beginEdit("pen-1");
    // Zero-drag click on existing anchor does not commit history
    penTools.api.editDown({ x: 70, y: 80 });
    penTools.api.editUp();
    expect(commits).toBe(0);

    // Drag and cancelEditDrag restores preDragPoints while keeping edit session open
    penTools.api.editDown({ x: 70, y: 80 });
    penTools.api.editMove({ x: 90, y: 100 });
    expect(penTools.api.cancelEditDrag()).toBe(true);
    expect(penTools.api.isEditing()).toBe(true);
    expect(doc.nodes[0].points[0].x).toBe(10);

    // Nudge outside resized box scales all anchors/handles to new unit-scale baseWidth/baseHeight
    penTools.api.nudgeActiveAnchor(-30, -30);
    const updated = doc.nodes[0];
    expect(updated).toMatchObject({ x: 40, y: 50, width: 90, height: 70, baseWidth: 90, baseHeight: 70 });
    expect(updated.points[0]).toMatchObject({ x: 0, y: 0, out: [10, 0] });
    expect(updated.points[1]).toMatchObject({ x: 90, y: 70, in: [-10, 0] });
  });

  it("supports bend and cut sub-tools on rotated paths and rebases split open paths in stack order", () => {
    let doc = {
      ...createDocument(400, 300),
      nodes: [
        {
          id: "rot-path", kind: NODE_KIND.PATH, pen: true, closed: false, rotation: 90,
          x: 50, y: 100, width: 100, height: 0, baseWidth: 100, baseHeight: 0,
          points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }],
        },
        { ...createRectNode({ x: 250, y: 50, width: 40, height: 40 }), id: "top-rect" },
      ],
    };
    let commits = 0;
    const penTools = createPenTools({
      getDoc: () => doc,
      setDoc: (next, opts) => { doc = next; if (opts?.commit !== false) commits += 1; },
      select: () => {},
      getColor: () => "#fff", getStrokeWidth: () => 2, requestRender: () => {}, getZoom: () => 1,
    });
    penTools.api.beginEdit("rot-path");
    // Center ofrot-path is (100, 100); rotated +90 deg maps local (25, 0) -> doc (100, 75)
    expect(penTools.api.bendDown({ x: 100, y: 75 })).toBe(true);
    penTools.api.bendUp();
    expect(commits).toBe(0); // zero-drag bend click does not commit

    // Cut at middle anchor (local (50, 0) -> doc (100, 100)) splits into 2 rebased paths before top-rect
    expect(penTools.api.cutAt({ x: 100, y: 100 })).toBe(true);
    expect(doc.nodes.map((n) => n.id)).toEqual(["rot-path", expect.any(String), "top-rect"]);
    expect(doc.nodes[0]).toMatchObject({ x: 74.5, y: 74.5, width: 51 });
    expect(doc.nodes[1]).toMatchObject({ x: 74.5, y: 124.5, width: 51 });
    expect(doc.nodes[1].points[0]).toMatchObject({ x: 0.5, y: 0.5 });
  });
});

describe("group, frame, and clipboard selection unit consistency", () => {
  function createNodesFixture(nodes) {
    let doc = { ...createDocument(600, 400), nodes };
    const historySignals = [];
    const selection = createSelection({});
    const controller = createEngineNodesController({
      getDoc: () => doc, setDoc: (next) => { doc = next; }, selection, cache: {},
      maskTools: { api: { getMaskEdit: () => null }, maskSourceOf: () => null },
      paintTools: { bitmapSourceOf: () => null }, penTools: { api: {} },
      releaseNodeTextures: () => {}, getEffectiveNode: (n) => n, getPixelSelection: () => null,
      clearPixelSelection: () => {}, setTool: () => {}, requestRender: () => {}, notify: () => {},
      onSelectionUnitChange: (groupId) => { historySignals.push({ groupId, ids: [...selection.getIds()] }); },
    });
    return { doc: () => doc, setDoc: (next) => { doc = next; }, selection, controller, historySignals };
  }

  it("includes nested Frames in a group unit selection and records updated IDs on selection unit change", () => {
    const folder = { ...createGroupNode({ x: 0, y: 0, width: 200, height: 200 }), id: "folder" };
    const nestedFrame = { ...createGroupNode({ x: 10, y: 10, width: 100, height: 100 }), id: "nested-frame", isFrame: true, parentId: "folder" };
    const leaf = { ...createRectNode({ x: 20, y: 20, width: 30, height: 30 }), id: "leaf", parentId: "folder" };
    const f = createNodesFixture([folder, nestedFrame, leaf]);

    f.controller.selectGroup("folder");
    expect(f.controller.getSelectedIds()).toEqual(["nested-frame", "leaf"]);
    expect(f.controller.getSelectedGroup()?.id).toBe("folder");
    expect(f.historySignals.at(-1)).toEqual({ groupId: "folder", ids: ["nested-frame", "leaf"] });
  });

  it("duplicates a selected group as a group unit, preserves resized pen geometry on duplicate, and deletes empty selected groups", () => {
    const folder = { ...createGroupNode({ x: 10, y: 10, width: 100, height: 80 }), id: "g-1" };
    const child = {
      id: "c-1", kind: NODE_KIND.PATH, pen: true, parentId: "g-1",
      x: 20, y: 20, width: 80, height: 60, baseWidth: 40, baseHeight: 30,
      points: [{ x: 0, y: 0 }, { x: 40, y: 30, in: [-10, -5] }],
    };
    const emptyFolder = { ...createGroupNode({ x: 200, y: 10, width: 50, height: 50 }), id: "g-empty" };
    const f = createNodesFixture([folder, child, emptyFolder]);
    const removedBatches = [];
    const clipboard = createClipboard({
      getDoc: f.doc, setDoc: f.setDoc, selection: f.selection,
      selectMany: f.controller.selectMany, select: f.controller.select,
      getSelectedGroup: f.controller.getSelectedGroup, selectGroup: f.controller.selectGroup,
      removeIds: (ids) => { removedBatches.push(ids); return true; },
      getPixelSelection: () => null, layerFromSelection: () => {},
      extractSelectionImageNode: () => null, deleteSelectionPixels: () => {},
      exportSelectionPng: () => null, maskTools: { api: { getMaskEdit: () => null } },
      getViewportCenter: () => ({ x: 200, y: 150 }),
    });

    f.controller.selectGroup("g-1");
    clipboard.duplicateSelected();

    const duplicatedGroup = f.doc().nodes.find((n) => n.kind === "group" && !["g-1", "g-empty"].includes(n.id));
    const duplicatedChild = f.doc().nodes.find((n) => n.kind === "path" && n.id !== "c-1");
    expect(f.controller.getSelectedGroup()?.id).toBe(duplicatedGroup.id);
    expect(f.controller.getSelectedIds()).toEqual([duplicatedChild.id]);
    expect(duplicatedChild).toMatchObject({ width: 80, height: 60, baseWidth: 80, baseHeight: 60 });
    expect(duplicatedChild.points[1]).toMatchObject({ x: 80, y: 60, in: [-20, -10] });

    f.controller.selectGroup("g-empty");
    clipboard.deleteSelected();
    expect(removedBatches.at(-1)).toEqual(["g-empty"]);
  });

  it("distinguishes ordinary folders from Frames and Boolean layers in layer row selection", () => {
    const folder = { id: "folder", kind: "group" };
    const nestedGroup = { id: "nested-group", kind: "group", parentId: "folder" };
    const deepLeaf = { id: "deep-leaf", kind: "rect", parentId: "nested-group" };
    const frame = { id: "frame", kind: "group", isFrame: true };
    const booleanNode = { id: "bool-1", kind: "boolean", operation: "union" };
    const objects = [folder, nestedGroup, deepLeaf, frame, booleanNode];

    expect(isFolderSelectionRow(folder)).toBe(true);
    expect(isFolderSelectionRow(frame)).toBe(false);
    expect(isFolderSelectionRow(booleanNode)).toBe(false);
    expect(collectLayerRowNodeIds(objects, [{ node: folder }, { node: frame }, { node: booleanNode }])).toEqual([
      "deep-leaf",
      "frame",
      "bool-1",
    ]);
  });
});
