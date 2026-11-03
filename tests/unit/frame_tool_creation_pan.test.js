import { describe, expect, it, vi, beforeEach } from "vitest";

const hooks = { slots: [], cursor: 0 };
vi.mock("react", () => ({
  useRef: (initial) => {
    const idx = hooks.cursor++;
    return (hooks.slots[idx] ??= { current: initial });
  },
  useCallback: (fn) => fn,
  useEffect: () => {},
}));

vi.mock("../../src/store/design_store.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useDesignStore: Object.assign(
      (selector) => selector(actual.useDesignStore.getState()),
      actual.useDesignStore,
    ),
  };
});

import { TOOL } from "../../src/canvas/editor/editor_constants.js";
import { useEditorCanvasGestures, isDrawingTool } from "../../src/canvas/components/editor_hooks/use_editor_canvas_gestures.js";
import { createDrawingShapesApi } from "../../src/canvas/editor/drawing_api_shapes.js";
import { createShapesPointerGestures } from "../../src/canvas/editor/editor_pointer_shapes.js";
import { createDocument } from "../../src/canvas/editor/scene_model.js";
import { createGroupNode } from "../../src/canvas/editor/scene_model_groups.js";
import { useDesignStore } from "../../src/store/design_store.js";
import * as ops from "../../src/canvas/editor/doc_ops.js";

function createMockEngine(initialDoc = createDocument(800, 600)) {
  let doc = initialDoc;
  let currentTool = TOOL.SELECT;
  let selectedId = null;

  const engine = {
    getDocument: () => doc,
    getDoc: () => doc,
    setDoc: (next) => { doc = next; },
    getTool: () => currentTool,
    setTool: vi.fn((next) => { currentTool = next; }),
    toDocPoint: vi.fn((x, y) => ({ x, y })),
    select: vi.fn((id) => { selectedId = id; }),
    getSelected: () => selectedId,
    updateNode: vi.fn((id, patch) => { doc = ops.updateNode(doc, id, patch); }),
    removeNode: vi.fn((id) => { doc = ops.removeNode(doc, id); }),
    commit: vi.fn(),
    getColor: () => "#ffffff",
    getShapeStrokeColor: () => "#000000",
    getStrokeWidth: () => 1,
    getShapeStrokeDash: () => "solid",
    getShapeOpacity: () => 1,
    getSnappingEnabled: () => false,
  };

  const shapesApi = createDrawingShapesApi({
    getDoc: engine.getDocument,
    setDoc: engine.setDoc,
    selectMany: () => {},
    getColor: engine.getColor,
  });

  return Object.assign(engine, shapesApi);
}

function mockFreeStage() {
  return {
    current: {
      style: { cursor: "default" },
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
    },
  };
}

describe("Frame tool creation and Hand tool pan", () => {
  beforeEach(() => {
    hooks.cursor = 0;
    hooks.slots = [];
    useDesignStore.setState({
      welcomeOpen: false,
      editingNodeIds: ["page-1"],
      editorCamera: { panX: 0, panY: 0, zoom: 1 },
      panEditorCamera: vi.fn((dx, dy) => {
        const cam = useDesignStore.getState().editorCamera;
        useDesignStore.setState({
          editorCamera: { ...cam, panX: cam.panX + dx, panY: cam.panY + dy },
        });
      }),
    });
  });

  describe("isDrawingTool helper", () => {
    it("recognizes frame and shape tools as drawing tools", () => {
      expect(isDrawingTool(TOOL.FRAME)).toBe(true);
      expect(isDrawingTool(TOOL.RECT)).toBe(true);
      expect(isDrawingTool(TOOL.ELLIPSE)).toBe(true);
      expect(isDrawingTool(TOOL.TEXT)).toBe(true);
      expect(isDrawingTool(TOOL.SELECT)).toBe(false);
      expect(isDrawingTool(TOOL.HAND)).toBe(false);
    });
  });

  describe("addFrameAt standalone and nested frame creation", () => {
    it("creates a nested frame inside root frame without translating root frame", () => {
      const rootFrame = {
        ...createGroupNode({ x: 0, y: 0, width: 800, height: 600 }),
        id: "root-frame",
        name: "Root Frame",
        frame: true,
        isFrame: true,
      };
      const engine = createMockEngine({ ...createDocument(800, 600), nodes: [rootFrame] });

      const newFrame = engine.addFrameAt({ x: 100, y: 100 }, { intoFrame: true });
      expect(newFrame.parentId).toBe("root-frame");

      const rootAfter = engine.getDocument().nodes.find((n) => n.id === "root-frame");
      expect(rootAfter.x).toBe(0);
      expect(rootAfter.y).toBe(0);
      expect(rootAfter.width).toBe(800);
      expect(rootAfter.height).toBe(600);
    });

    it("creates a standalone frame at document root when drawn outside any frame", () => {
      const rootFrame = {
        ...createGroupNode({ x: 0, y: 0, width: 800, height: 600 }),
        id: "root-frame",
        name: "Root Frame",
        frame: true,
        isFrame: true,
      };
      const engine = createMockEngine({ ...createDocument(800, 600), nodes: [rootFrame] });

      const standaloneFrame = engine.addFrameAt({ x: 1200, y: 100 }, { intoFrame: true });
      expect(standaloneFrame.parentId).toBeNull();

      const rootAfter = engine.getDocument().nodes.find((n) => n.id === "root-frame");
      expect(rootAfter.x).toBe(0);
      expect(rootAfter.y).toBe(0);
      expect(rootAfter.width).toBe(800);
      expect(rootAfter.height).toBe(600);
    });
  });

  describe("editor_pointer_shapes gesture with TOOL.FRAME", () => {
    it("arms TOOL.FRAME and drags to create a new Frame", () => {
      const rootFrame = {
        ...createGroupNode({ x: 0, y: 0, width: 800, height: 600 }),
        id: "root-frame",
        frame: true,
        isFrame: true,
      };
      const engine = createMockEngine({ ...createDocument(800, 600), nodes: [rootFrame] });
      engine.setTool(TOOL.FRAME);

      let gesture = null;
      const shapes = createShapesPointerGestures({
        api: engine,
        getGesture: () => gesture,
        setGesture: (val) => { gesture = val; },
      });

      shapes.startShape({ clientX: 50, clientY: 50 });
      expect(gesture).toMatchObject({ kind: "shape" });
      const createdId = gesture.id;

      shapes.dragShape({ clientX: 250, clientY: 200 });
      const createdNode = engine.getDocument().nodes.find((n) => n.id === createdId);
      expect(createdNode).toMatchObject({ width: 200, height: 150 });

      shapes.finishShape({}, gesture);
      expect(engine.commit).toHaveBeenCalled();
      expect(engine.select).toHaveBeenCalledWith(createdId);

      const rootAfter = engine.getDocument().nodes.find((n) => n.id === "root-frame");
      expect(rootAfter.x).toBe(0);
      expect(rootAfter.y).toBe(0);
    });
  });

  describe("useEditorCanvasGestures pointer down and up behaviors", () => {
    it.each([true, false])("routes free Select for isCanvasRoot=%s without changing legacy panning", isCanvasRoot => {
      const engine = createMockEngine({ ...createDocument(800, 600), isCanvasRoot });
      engine.beginFreeSelection = vi.fn(() => true);
      const panGestureRef = { current: null }, freeStageRef = mockFreeStage();
      const gestures = useEditorCanvasGestures({
        multi: true, visible: true, freeStageRef, spaceRef: { current: false }, panGestureRef,
        enginesRef: { current: new Map([["page-1", { engine }]]) }, layoutById: new Map(),
        cameraZoom: 1, tool: TOOL.SELECT, focusedId: "page-1", focusEditorPage: vi.fn(),
        handleFocusCanvas: vi.fn(), setCanvasBackgroundSelected: vi.fn(), nodeIds: ["page-1"],
      });
      const event = { button: 0, clientX: 100, clientY: 100, pointerId: 1,
        target: { closest: () => null }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
      gestures.onFreePointerDown(event);
      if (isCanvasRoot) {
        expect(engine.beginFreeSelection).toHaveBeenCalledWith(event);
        expect(panGestureRef.current).toBeNull();
      } else {
        expect(engine.beginFreeSelection).not.toHaveBeenCalled();
        expect(panGestureRef.current).toMatchObject({ button: 0, panTrigger: false });
      }
    });
    it("Hand tool initiates camera panning cleanly even over artboards", () => {
      const panGestureRef = { current: null };
      const freeStageRef = mockFreeStage();
      const gestures = useEditorCanvasGestures({
        multi: true, visible: true, freeStageRef, spaceRef: { current: false },
        panGestureRef, enginesRef: { current: new Map() }, layoutById: new Map(),
        cameraZoom: 1, tool: TOOL.HAND, focusedId: "page-1",
        focusEditorPage: vi.fn(), handleFocusCanvas: vi.fn(),
        setCanvasBackgroundSelected: vi.fn(), nodeIds: ["page-1"],
      });

      gestures.onFreePointerDown({
        button: 0, clientX: 100, clientY: 100, pointerId: 1,
        target: { closest: (s) => (s === "[data-editor-artboard]" ? {} : null) },
        preventDefault: vi.fn(), stopPropagation: vi.fn(),
      });

      expect(panGestureRef.current?.panTrigger).toBe(true);
      expect(freeStageRef.current.style.cursor).toBe("grabbing");
    });

    it("TOOL.FRAME initiates drawing and does not pan camera on empty canvas", () => {
      const panGestureRef = { current: null };
      const freeStageRef = mockFreeStage();
      const rootFrame = {
        ...createGroupNode({ x: 0, y: 0, width: 800, height: 600 }),
        id: "root-frame", frame: true, isFrame: true,
      };
      const engine = createMockEngine({ ...createDocument(800, 600), nodes: [rootFrame] });
      engine.toDocPoint = vi.fn((x, y) => ({ x, y }));

      const gestures = useEditorCanvasGestures({
        multi: true, visible: true, freeStageRef, spaceRef: { current: false },
        panGestureRef, enginesRef: { current: new Map([["page-1", { engine, ready: true }]]) },
        layoutById: new Map(), cameraZoom: 1, tool: TOOL.FRAME, focusedId: "page-1",
        focusEditorPage: vi.fn(), handleFocusCanvas: vi.fn(),
        setCanvasBackgroundSelected: vi.fn(), nodeIds: ["page-1"],
      });

      gestures.onFreePointerDown({
        button: 0, clientX: 100, clientY: 100, pointerId: 1,
        target: { closest: () => null }, preventDefault: vi.fn(), stopPropagation: vi.fn(),
      });

      expect(panGestureRef.current).toBeNull();

      gestures.onFreePointerMove({ clientX: 300, clientY: 250, pointerId: 1 });
      gestures.onFreePointerUp({ pointerId: 1, button: 0 });

      expect(engine.commit).toHaveBeenCalledWith("editor.pointer.draw");
      const createdNode = engine.getDocument().nodes.find((n) => n.id !== "root-frame");
      expect(createdNode).toMatchObject({ width: 200, height: 150 });
    });

    it("guards onFreePointerDown from panning when targetEngine hasHandleUnder is true", () => {
      const panGestureRef = { current: null };
      const freeStageRef = mockFreeStage();
      const engine = createMockEngine();
      engine.hasHandleUnder = vi.fn(({ clientX, clientY }) => clientX === 120 && clientY === 80);

      const gestures = useEditorCanvasGestures({
        multi: true, visible: true, freeStageRef, spaceRef: { current: false },
        panGestureRef, enginesRef: { current: new Map([["page-1", { engine, ready: true }]]) },
        layoutById: new Map(), cameraZoom: 1, tool: TOOL.SELECT, focusedId: "page-1",
        focusEditorPage: vi.fn(), handleFocusCanvas: vi.fn(),
        setCanvasBackgroundSelected: vi.fn(), nodeIds: ["page-1"],
      });

      gestures.onFreePointerDown({
        button: 0, clientX: 120, clientY: 80, pointerId: 1,
        target: { closest: () => null }, preventDefault: vi.fn(), stopPropagation: vi.fn(),
      });

      expect(engine.hasHandleUnder).toHaveBeenCalledWith({ clientX: 120, clientY: 80 });
      expect(panGestureRef.current).toBeNull();
    });

    it("clicking empty canvas with single page does not deselect active page", () => {
      const panGestureRef = { current: { pointerId: 1, moved: false, button: 0, panTrigger: false } };
      const focusEditorPage = vi.fn();
      const setCanvasBackgroundSelected = vi.fn();

      const gestures = useEditorCanvasGestures({
        multi: true, visible: true, freeStageRef: mockFreeStage(), spaceRef: { current: false },
        panGestureRef, enginesRef: { current: new Map([["page-1", { engine: createMockEngine() }]]) },
        layoutById: new Map(), cameraZoom: 1, tool: TOOL.SELECT, focusedId: "page-1",
        focusEditorPage, handleFocusCanvas: vi.fn(), setCanvasBackgroundSelected, nodeIds: ["page-1"],
      });

      gestures.onFreePointerUp({ pointerId: 1 });
      expect(focusEditorPage).not.toHaveBeenCalledWith(null);
      expect(setCanvasBackgroundSelected).toHaveBeenCalledWith(true);
    });

    it("clicking empty canvas with multiple pages deselects active page", () => {
      const panGestureRef = { current: { pointerId: 1, moved: false, button: 0, panTrigger: false } };
      const focusEditorPage = vi.fn();
      const gestures = useEditorCanvasGestures({
        multi: true, visible: true, freeStageRef: mockFreeStage(), spaceRef: { current: false },
        panGestureRef, enginesRef: { current: new Map() }, layoutById: new Map(),
        cameraZoom: 1, tool: TOOL.SELECT, focusedId: "page-1",
        focusEditorPage, handleFocusCanvas: vi.fn(), setCanvasBackgroundSelected: vi.fn(),
        nodeIds: ["page-1", "page-2"],
      });

      gestures.onFreePointerUp({ pointerId: 1 });
      expect(focusEditorPage).toHaveBeenCalledWith(null);
    });
  });

  describe("runTool fallback when focusedId is null", () => {
    it("automatically focuses primary artboard and sets tool when focusedId is null", () => {
      const engine = createMockEngine();
      const enginesRef = { current: new Map([["page-1", { engine, ready: true }]]) };
      const nodeIds = ["page-1", "page-2"];
      const focusEditorPage = vi.fn();
      let focusedId = null;

      const runTool = (next) => {
        let targetEngine = focusedId ? enginesRef.current.get(focusedId)?.engine : null;
        if (!focusedId && nodeIds?.length > 0) {
          const primaryId = nodeIds[0];
          focusEditorPage(primaryId);
          targetEngine = enginesRef.current.get(primaryId)?.engine ?? null;
        }
        if (!targetEngine) return;
        targetEngine.setTool(next);
      };

      runTool(TOOL.FRAME);
      expect(focusEditorPage).toHaveBeenCalledWith("page-1");
      expect(engine.setTool).toHaveBeenCalledWith(TOOL.FRAME);
    });
  });
});
