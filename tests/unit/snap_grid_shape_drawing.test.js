import { describe, expect, it, beforeEach } from "vitest";
import { setSetting, getSetting } from "../../src/shared/settings.js";
import { createDocument, createRectNode } from "../../src/canvas/editor/scene_model.js";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";
import { createDrawingShapesApi } from "../../src/canvas/editor/drawing_api_shapes.js";
import { createShapesPointerGestures } from "../../src/canvas/editor/editor_pointer_shapes.js";
import { absolutePathEndpoints } from "../../src/canvas/editor/shape_geometry.js";
import {
  isSnapToGridActive,
  getShapeGridSize,
  snapCoordinateToGrid,
  snapPointToGrid,
  snapBoxToGrid,
  calculateArrowEndpoints,
} from "../../src/canvas/editor/shape_snapping.js";
import * as ops from "../../src/canvas/editor/doc_ops.js";

function createShapeDrawingFixture({
  tool = TOOL.RECT,
  snappingEnabled = true,
  grid = null,
} = {}) {
  let doc = createDocument(1200, 800);
  let gesture = null;
  let selectedId = null;

  const api = {
    getDocument: () => doc,
    getEvaluatedDocument: () => doc,
    setDoc: (next) => {
      doc = next;
    },
    getTool: () => tool,
    setTool: (next) => {
      tool = next;
    },
    toDocPoint: (x, y) => ({ x, y }),
    select: (id) => {
      selectedId = id;
    },
    getSelectedId: () => selectedId,
    getColor: () => "#3b82f6",
    getShapeStrokeColor: () => "#1e40af",
    getStrokeWidth: () => 1,
    getShapeStrokeDash: () => "solid",
    getShapeOpacity: () => 1,
    getSnappingEnabled: () => snappingEnabled,
    getGrid: () => grid,
    getViewport: () => ({ zoom: 1 }),
    setGuides: () => {},
    updateNode: (id, patch) => {
      doc = ops.updateNode(doc, id, patch);
    },
    removeNode: (id) => {
      doc = ops.removeNode(doc, id);
    },
    commit: () => {},
  };

  Object.assign(
    api,
    createDrawingShapesApi({
      getDoc: api.getDocument,
      setDoc: api.setDoc,
      getColor: api.getColor,
    }),
  );

  const shapes = createShapesPointerGestures({
    api,
    getGesture: () => gesture,
    setGesture: (next) => {
      gesture = next;
    },
  });

  return { api, shapes, getGesture: () => gesture, getDoc: () => doc };
}

describe("Shape grid snapping helpers", () => {
  beforeEach(() => {
    setSetting("voo.editor.snapToGrid", false);
    setSetting("voo.editor.gridSize", null);
  });

  it("snaps coordinates to nearest grid multiple", () => {
    expect(snapCoordinateToGrid(124, 8)).toBe(128);
    expect(snapCoordinateToGrid(124, 4)).toBe(124);
    expect(snapCoordinateToGrid(125, 4)).toBe(124);
    expect(snapCoordinateToGrid(126, 4)).toBe(128);
    expect(snapCoordinateToGrid(233, 8)).toBe(232);
    expect(snapCoordinateToGrid(233, 16)).toBe(240);
  });

  it("snaps 2D points to grid", () => {
    const pt = snapPointToGrid({ x: 124, y: 87 }, 8);
    expect(pt).toEqual({ x: 128, y: 88 });
  });

  it("snaps bounding boxes (x, y, width, height) to grid multiples", () => {
    const box = snapBoxToGrid({ x: 124, y: 87, width: 233, height: 153 }, 8);
    expect(box.x).toBe(128);
    expect(box.y).toBe(88);
    expect(box.width).toBe(232);
    expect(box.height).toBe(152);
    expect(box.x % 8).toBe(0);
    expect(box.y % 8).toBe(0);
    expect(box.width % 8).toBe(0);
    expect(box.height % 8).toBe(0);
  });

  it("resolves grid size from setting, engine grid, or default 8", () => {
    expect(getShapeGridSize({})).toBe(8);

    setSetting("voo.editor.gridSize", 4);
    expect(getShapeGridSize({})).toBe(4);

    setSetting("voo.editor.gridSize", null);
    expect(getShapeGridSize({ getGrid: () => ({ size: 16 }) })).toBe(16);
  });

  it("respects master switches and modifier keys for snap activation", () => {
    setSetting("voo.editor.snapToGrid", true);
    expect(isSnapToGridActive({})).toBe(true);

    // Meta / Ctrl disables snapping temporarily
    expect(isSnapToGridActive({}, { metaKey: true })).toBe(false);
    expect(isSnapToGridActive({}, { ctrlKey: true })).toBe(false);

    // Engine snapping master switch
    expect(isSnapToGridActive({ getSnappingEnabled: () => false })).toBe(false);
  });
});

describe("Shape drawing with Snap to Grid enabled", () => {
  beforeEach(() => {
    setSetting("voo.editor.snapToGrid", true);
    setSetting("voo.editor.gridSize", 8);
  });

  it("snaps start point, current point, and resulting width/height to 8px grid", () => {
    const fixture = createShapeDrawingFixture({ tool: TOOL.RECT });
    const { shapes, getGesture, getDoc } = fixture;

    // Pointer down at non-aligned coordinate (124, 87)
    shapes.startShape({ clientX: 124, clientY: 87 });
    const gesture = getGesture();
    expect(gesture.start).toEqual({ x: 128, y: 88 });

    // Drag to non-aligned coordinate (357, 240)
    shapes.dragShape({ clientX: 357, clientY: 240 });

    const rectNode = getDoc().nodes.find((n) => n.id === gesture.id);
    expect(rectNode).toBeDefined();

    // Coordinates and dimensions must be exact multiples of 8:
    // start (128, 88), current snapped (360, 240) -> width: 232 (29*8), height: 152 (19*8)
    expect(rectNode.x).toBe(128);
    expect(rectNode.y).toBe(88);
    expect(rectNode.width).toBe(232);
    expect(rectNode.height).toBe(152);

    expect(rectNode.x % 8).toBe(0);
    expect(rectNode.y % 8).toBe(0);
    expect(rectNode.width % 8).toBe(0);
    expect(rectNode.height % 8).toBe(0);
    expect((rectNode.x + rectNode.width) % 8).toBe(0);
    expect((rectNode.y + rectNode.height) % 8).toBe(0);
  });

  it("snaps accurately to 4px grid when configured", () => {
    setSetting("voo.editor.gridSize", 4);
    const fixture = createShapeDrawingFixture({ tool: TOOL.RECT });
    const { shapes, getGesture, getDoc } = fixture;

    shapes.startShape({ clientX: 125, clientY: 87 });
    const gesture = getGesture();
    expect(gesture.start).toEqual({ x: 124, y: 88 });

    shapes.dragShape({ clientX: 358, clientY: 241 });
    const rectNode = getDoc().nodes.find((n) => n.id === gesture.id);

    expect(rectNode.x).toBe(124);
    expect(rectNode.y).toBe(88);
    expect(rectNode.width).toBe(236); // 360 - 124 = 236 (59 * 4)
    expect(rectNode.height).toBe(152); // 240 - 88 = 152 (38 * 4)

    expect(rectNode.x % 4).toBe(0);
    expect(rectNode.y % 4).toBe(0);
    expect(rectNode.width % 4).toBe(0);
    expect(rectNode.height % 4).toBe(0);
  });

  it("maintains grid multiples when dragging with Shift key (1:1 aspect square)", () => {
    const fixture = createShapeDrawingFixture({ tool: TOOL.RECT });
    const { shapes, getGesture, getDoc } = fixture;

    shapes.startShape({ clientX: 100, clientY: 100 });
    const gesture = getGesture();
    // 100 snaps to 104 on 8px grid
    expect(gesture.start).toEqual({ x: 104, y: 104 });

    shapes.dragShape({ clientX: 250, clientY: 200, shiftKey: true });
    const rectNode = getDoc().nodes.find((n) => n.id === gesture.id);

    expect(rectNode.width).toBe(rectNode.height);
    expect(rectNode.x % 8).toBe(0);
    expect(rectNode.y % 8).toBe(0);
    expect(rectNode.width % 8).toBe(0);
    expect(rectNode.height % 8).toBe(0);
  });

  it("maintains grid multiples when dragging with Alt key (draw from center)", () => {
    const fixture = createShapeDrawingFixture({ tool: TOOL.RECT });
    const { shapes, getGesture, getDoc } = fixture;

    shapes.startShape({ clientX: 100, clientY: 100 });
    const gesture = getGesture();

    shapes.dragShape({ clientX: 200, clientY: 160, altKey: true });
    const rectNode = getDoc().nodes.find((n) => n.id === gesture.id);

    expect(rectNode.x % 8).toBe(0);
    expect(rectNode.y % 8).toBe(0);
    expect(rectNode.width % 8).toBe(0);
    expect(rectNode.height % 8).toBe(0);
  });

  it("snaps ellipse and frame tools to grid multiples", () => {
    for (const tool of [TOOL.ELLIPSE, TOOL.FRAME]) {
      const fixture = createShapeDrawingFixture({ tool });
      const { shapes, getGesture, getDoc } = fixture;

      shapes.startShape({ clientX: 124, clientY: 87 });
      const gesture = getGesture();
      shapes.dragShape({ clientX: 357, clientY: 240 });

      const node = getDoc().nodes.find((n) => n.id === gesture.id);
      expect(node.x % 8).toBe(0);
      expect(node.y % 8).toBe(0);
      expect(node.width % 8).toBe(0);
      expect(node.height % 8).toBe(0);
    }
  });

  it("snaps polygon and star gesture origins and drag bounds to grid", () => {
    for (const tool of [TOOL.POLYGON, TOOL.STAR]) {
      const fixture = createShapeDrawingFixture({ tool });
      const { shapes, getGesture, getDoc } = fixture;

      shapes.startPolyShape({ clientX: 124, clientY: 87 });
      const gesture = getGesture();
      expect(gesture.start).toEqual({ x: 128, y: 88 });

      shapes.dragShape({ clientX: 357, clientY: 240 });
      const node = getDoc().nodes.find((n) => n.id === gesture.id);
      expect(node).toBeDefined();
      expect(node.kind).toBe("path");
      expect(node.poly).toBe(true);
    }
  });

  it("snaps arrow endpoints in document space to grid lines", () => {
    const fixture = createShapeDrawingFixture({ tool: TOOL.ARROW });
    const { shapes, getGesture, getDoc } = fixture;

    shapes.startArrow({ clientX: 124, clientY: 87 });
    const gesture = getGesture();
    shapes.dragArrow({ clientX: 357, clientY: 240 });

    const node = getDoc().nodes.find((n) => n.id === gesture.id);
    const endpoints = absolutePathEndpoints(node);
    expect(endpoints[0].x).toBe(128);
    expect(endpoints[0].y).toBe(88);
    expect(endpoints[1].x).toBe(360);
    expect(endpoints[1].y).toBe(240);
    expect(endpoints[0].x % 8).toBe(0);
    expect(endpoints[0].y % 8).toBe(0);
    expect(endpoints[1].x % 8).toBe(0);
    expect(endpoints[1].y % 8).toBe(0);
  });
});

describe("Shape drawing with Snap to Grid disabled", () => {
  beforeEach(() => {
    setSetting("voo.editor.snapToGrid", false);
    setSetting("voo.editor.gridSize", 8);
  });

  it("does NOT forcibly snap coordinates or dimensions when snapToGrid is false", () => {
    const fixture = createShapeDrawingFixture({ tool: TOOL.RECT });
    const { shapes, getGesture, getDoc } = fixture;

    shapes.startShape({ clientX: 124, clientY: 87 });
    const gesture = getGesture();
    expect(gesture.start).toEqual({ x: 124, y: 87 });

    shapes.dragShape({ clientX: 357, clientY: 240 });
    const rectNode = getDoc().nodes.find((n) => n.id === gesture.id);

    // Raw coordinates preserved without snapping
    expect(rectNode.x).toBe(124);
    expect(rectNode.y).toBe(87);
    expect(rectNode.width).toBe(233);
    expect(rectNode.height).toBe(153);
  });

  it("bypasses snapping when metaKey is pressed even if snapToGrid is true", () => {
    setSetting("voo.editor.snapToGrid", true);
    const fixture = createShapeDrawingFixture({ tool: TOOL.RECT });
    const { shapes, getGesture, getDoc } = fixture;

    shapes.startShape({ clientX: 124, clientY: 87, metaKey: true });
    const gesture = getGesture();
    expect(gesture.start).toEqual({ x: 124, y: 87 });

    shapes.dragShape({ clientX: 357, clientY: 240, metaKey: true });
    const rectNode = getDoc().nodes.find((n) => n.id === gesture.id);

    expect(rectNode.x).toBe(124);
    expect(rectNode.y).toBe(87);
    expect(rectNode.width).toBe(233);
    expect(rectNode.height).toBe(153);
  });
});
