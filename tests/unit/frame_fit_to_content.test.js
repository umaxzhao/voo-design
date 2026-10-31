import { describe, expect, it, vi } from "vitest";
import { handleEditorDoubleClick } from "../../src/canvas/editor/editor_pointer_events.js";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_model.js";

function createEditorMock({
  tool = TOOL.SELECT,
  nodes = [],
  selected = null,
  hit = null,
  point = { x: 0, y: 0 },
  zoom = 1,
} = {}) {
  let doc = {
    width: 1000,
    height: 1000,
    nodes: JSON.parse(JSON.stringify(nodes)),
  };

  const updateNode = vi.fn((id, patch) => {
    const idx = doc.nodes.findIndex((n) => n.id === id);
    if (idx >= 0) {
      doc.nodes[idx] = { ...doc.nodes[idx], ...patch };
    }
  });

  const api = {
    getTool: vi.fn(() => tool),
    toDocPoint: vi.fn(() => point),
    nodeAtPoint: vi.fn(() => hit),
    getDocument: vi.fn(() => doc),
    getSelected: vi.fn(() => selected),
    getSelectedNodes: vi.fn(() => (selected ? [selected] : [])),
    getNode: vi.fn((id) => doc.nodes.find((n) => n.id === id) ?? null),
    getViewport: vi.fn(() => ({ zoom })),
    selectExactly: vi.fn(),
    select: vi.fn(),
    enterGroup: vi.fn(() => true),
    beginTextEdit: vi.fn(),
    beginEdit: vi.fn(),
    convertSelectedToPath: vi.fn(() => true),
    updateNode,
  };

  return { api, doc, updateNode };
}

describe("Frame fit-to-content on handle double-click", () => {
  it("shrinks frame to fit direct children AABB (multiple of 4) on resize handle double-click", () => {
    const frame = {
      id: "f1",
      kind: "group",
      isFrame: true,
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    };
    const c1 = {
      id: "c1",
      parentId: "f1",
      kind: "rect",
      x: 100,
      y: 80,
      width: 120,
      height: 60,
    };
    const c2 = {
      id: "c2",
      parentId: "f1",
      kind: "rect",
      x: 160,
      y: 120,
      width: 200,
      height: 100,
    };
    // Direct children union:
    // x: [100, 360] -> width: 260
    // y: [80, 220] -> height: 140

    const { api, updateNode } = createEditorMock({
      nodes: [frame, c1, c2],
      selected: frame,
      hit: frame,
      point: { x: 600, y: 400 }, // SE handle of frame
    });

    handleEditorDoubleClick({ clientX: 600, clientY: 400 }, { api });

    expect(updateNode).toHaveBeenCalledTimes(1);
    expect(updateNode).toHaveBeenCalledWith("f1", {
      x: 100,
      y: 80,
      width: 260,
      height: 140,
    });
    expect(api.selectExactly).toHaveBeenCalledWith(["f1"]);
  });

  it("strictly preserves all child absolute coordinates (VOO absolute coordinate model)", () => {
    const frame = {
      id: "f1",
      kind: "group",
      isFrame: true,
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    };
    const c1 = {
      id: "c1",
      parentId: "f1",
      kind: "rect",
      x: 120,
      y: 160,
      width: 80,
      height: 40,
    };
    const c2 = {
      id: "c2",
      parentId: "f1",
      kind: "rect",
      x: 240,
      y: 200,
      width: 40,
      height: 40,
    };

    const { api, doc } = createEditorMock({
      nodes: [frame, c1, c2],
      selected: frame,
      hit: frame,
      point: { x: 600, y: 400 },
    });

    const c1Before = { ...doc.nodes.find((n) => n.id === "c1") };
    const c2Before = { ...doc.nodes.find((n) => n.id === "c2") };

    handleEditorDoubleClick({ clientX: 600, clientY: 400 }, { api });

    const c1After = doc.nodes.find((n) => n.id === "c1");
    const c2After = doc.nodes.find((n) => n.id === "c2");

    expect(c1After.x).toBe(c1Before.x);
    expect(c1After.y).toBe(c1Before.y);
    expect(c1After.width).toBe(c1Before.width);
    expect(c1After.height).toBe(c1Before.height);

    expect(c2After.x).toBe(c2Before.x);
    expect(c2After.y).toBe(c2Before.y);
    expect(c2After.width).toBe(c2Before.width);
    expect(c2After.height).toBe(c2Before.height);
  });

  it("is a no-op on empty frame (no direct children) and produces no history", () => {
    const frame = {
      id: "f-empty",
      kind: "group",
      isFrame: true,
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    };

    const { api, updateNode } = createEditorMock({
      nodes: [frame],
      selected: frame,
      hit: frame,
      point: { x: 500, y: 400 }, // SE handle
    });

    handleEditorDoubleClick({ clientX: 500, clientY: 400 }, { api });

    expect(updateNode).not.toHaveBeenCalled();
    expect(api.enterGroup).not.toHaveBeenCalled();
  });

  it("snaps coordinates and dimensions to multiples of 4 when children are off-grid", () => {
    const frame = {
      id: "f1",
      kind: "group",
      isFrame: true,
      x: 0,
      y: 0,
      width: 500,
      height: 500,
    };
    const c1 = {
      id: "c1",
      parentId: "f1",
      kind: "rect",
      x: 101, // 101 -> 100
      y: 83,  // 83  -> 84
      width: 121, // 121 -> 120
      height: 62, // 62  -> 60
    };

    const { api, updateNode } = createEditorMock({
      nodes: [frame, c1],
      selected: frame,
      hit: frame,
      point: { x: 500, y: 500 },
    });

    handleEditorDoubleClick({ clientX: 500, clientY: 500 }, { api });

    expect(updateNode).toHaveBeenCalledWith("f1", {
      x: 100,
      y: 84,
      width: 120,
      height: 64,
    });
  });

  it("creates exactly one undo step that reverts the frame and leaves children intact", () => {
    const frame = {
      id: "f1",
      kind: "group",
      isFrame: true,
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    };
    const c1 = {
      id: "c1",
      parentId: "f1",
      kind: "rect",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };

    let doc = {
      nodes: [JSON.parse(JSON.stringify(frame)), JSON.parse(JSON.stringify(c1))],
    };

    const undoStack = [];
    const redoStack = [];

    const api = {
      getTool: vi.fn(() => TOOL.SELECT),
      toDocPoint: vi.fn(() => ({ x: 600, y: 400 })),
      nodeAtPoint: vi.fn(() => doc.nodes[0]),
      getDocument: vi.fn(() => doc),
      getSelected: vi.fn(() => doc.nodes[0]),
      getSelectedNodes: vi.fn(() => [doc.nodes[0]]),
      getNode: vi.fn((id) => doc.nodes.find((n) => n.id === id) ?? null),
      getViewport: vi.fn(() => ({ zoom: 1 })),
      selectExactly: vi.fn(),
      updateNode: vi.fn((id, patch) => {
        undoStack.push(JSON.parse(JSON.stringify(doc)));
        redoStack.length = 0;
        doc = {
          ...doc,
          nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        };
      }),
      undo() {
        if (undoStack.length === 0) return;
        redoStack.push(JSON.parse(JSON.stringify(doc)));
        doc = undoStack.pop();
      },
      redo() {
        if (redoStack.length === 0) return;
        undoStack.push(JSON.parse(JSON.stringify(doc)));
        doc = redoStack.pop();
      },
    };

    // 1. Double click handle
    handleEditorDoubleClick({ clientX: 600, clientY: 400 }, { api });

    expect(api.updateNode).toHaveBeenCalledTimes(1);
    expect(undoStack).toHaveLength(1);
    expect(doc.nodes.find((n) => n.id === "f1")).toMatchObject({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
    expect(doc.nodes.find((n) => n.id === "c1")).toMatchObject({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });

    // 2. Undo
    api.undo();
    expect(doc.nodes.find((n) => n.id === "f1")).toMatchObject({
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    });
    expect(doc.nodes.find((n) => n.id === "c1")).toMatchObject({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });

    // 3. Redo
    api.redo();
    expect(doc.nodes.find((n) => n.id === "f1")).toMatchObject({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
    expect(doc.nodes.find((n) => n.id === "c1")).toMatchObject({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
  });

  it("only measures direct children, ignoring indirect descendants (nested children)", () => {
    const frame = {
      id: "f1",
      kind: "group",
      isFrame: true,
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    };
    // Direct child group
    const directGroup = {
      id: "g1",
      parentId: "f1",
      kind: "group",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };
    // Indirect descendant (child of g1, NOT direct child of f1)
    const nestedChild = {
      id: "nested",
      parentId: "g1",
      kind: "rect",
      x: 50,
      y: 50,
      width: 400,
      height: 300,
    };

    const { api, updateNode } = createEditorMock({
      nodes: [frame, directGroup, nestedChild],
      selected: frame,
      hit: frame,
      point: { x: 600, y: 400 },
    });

    handleEditorDoubleClick({ clientX: 600, clientY: 400 }, { api });

    // Should only fit direct child g1: x: 100, y: 100, width: 200, height: 100
    expect(updateNode).toHaveBeenCalledWith("f1", {
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
  });

  it("does not mutate frame or push history when frame already fits children", () => {
    const frame = {
      id: "f1",
      kind: "group",
      isFrame: true,
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };
    const c1 = {
      id: "c1",
      parentId: "f1",
      kind: "rect",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };

    const { api, updateNode } = createEditorMock({
      nodes: [frame, c1],
      selected: frame,
      hit: frame,
      point: { x: 300, y: 200 }, // SE handle
    });

    handleEditorDoubleClick({ clientX: 300, clientY: 200 }, { api });

    expect(updateNode).not.toHaveBeenCalled();
  });

  it("supports all 4 corner resize handles (nw, ne, se, sw)", () => {
    const frame = {
      id: "f1",
      kind: "group",
      isFrame: true,
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    };
    const c1 = {
      id: "c1",
      parentId: "f1",
      kind: "rect",
      x: 200,
      y: 200,
      width: 100,
      height: 100,
    };

    const corners = [
      { name: "nw", point: { x: 100, y: 100 } },
      { name: "ne", point: { x: 500, y: 100 } },
      { name: "se", point: { x: 500, y: 400 } },
      { name: "sw", point: { x: 100, y: 400 } },
    ];

    for (const corner of corners) {
      const { api, updateNode } = createEditorMock({
        nodes: [frame, c1],
        selected: frame,
        hit: frame,
        point: corner.point,
      });

      handleEditorDoubleClick({ clientX: corner.point.x, clientY: corner.point.y }, { api });

      expect(updateNode, `Handle ${corner.name} should trigger fit`).toHaveBeenCalledWith("f1", {
        x: 200,
        y: 200,
        width: 100,
        height: 100,
      });
    }
  });

  it("is a no-op when the frame is locked or lockPosition is true", () => {
    const frame = {
      id: "f1",
      kind: "group",
      isFrame: true,
      locked: true,
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    };
    const c1 = {
      id: "c1",
      parentId: "f1",
      kind: "rect",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };

    const { api, updateNode } = createEditorMock({
      nodes: [frame, c1],
      selected: frame,
      hit: frame,
      point: { x: 600, y: 400 },
    });

    handleEditorDoubleClick({ clientX: 600, clientY: 400 }, { api });

    expect(updateNode).not.toHaveBeenCalled();
  });

  it("enters frame group when double-clicking inside frame surface, not on a resize handle", () => {
    const frame = {
      id: "f1",
      kind: "group",
      isFrame: true,
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    };
    const c1 = {
      id: "c1",
      parentId: "f1",
      kind: "rect",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };

    const { api, updateNode } = createEditorMock({
      nodes: [frame, c1],
      selected: frame,
      hit: frame,
      point: { x: 300, y: 200 }, // Center of frame, not a handle
    });

    handleEditorDoubleClick({ clientX: 300, clientY: 200 }, { api });

    expect(updateNode).not.toHaveBeenCalled();
    expect(api.enterGroup).toHaveBeenCalledWith("f1");
  });

  it("preserves priority of text double-click editing", () => {
    const frame = {
      id: "f1",
      kind: "group",
      isFrame: true,
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    };
    const textNode = {
      id: "t1",
      parentId: "f1",
      kind: "text",
      text: "Title",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
    };

    const { api, updateNode } = createEditorMock({
      nodes: [frame, textNode],
      selected: frame,
      hit: textNode,
      point: { x: 0, y: 0 },
    });

    handleEditorDoubleClick({ clientX: 0, clientY: 0 }, { api });

    expect(api.beginTextEdit).toHaveBeenCalledWith("t1");
    expect(updateNode).not.toHaveBeenCalled();
  });

  it("preserves priority of pen path double-click editing", () => {
    const frame = {
      id: "f1",
      kind: "group",
      isFrame: true,
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    };
    const penPath = {
      id: "p1",
      parentId: "f1",
      kind: "path",
      pen: true,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    const { api, updateNode } = createEditorMock({
      nodes: [frame, penPath],
      selected: frame,
      hit: penPath,
      point: { x: 0, y: 0 },
    });

    handleEditorDoubleClick({ clientX: 0, clientY: 0 }, { api });

    expect(api.beginEdit).toHaveBeenCalledWith("p1");
    expect(updateNode).not.toHaveBeenCalled();
  });

  it("preserves priority of shape-to-path double-click conversion", () => {
    const frame = {
      id: "f1",
      kind: "group",
      isFrame: true,
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    };
    const rectShape = {
      id: "r1",
      parentId: "f1",
      kind: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    const { api, updateNode } = createEditorMock({
      nodes: [frame, rectShape],
      selected: frame,
      hit: rectShape,
      point: { x: 0, y: 0 },
    });

    handleEditorDoubleClick({ clientX: 0, clientY: 0 }, { api });

    expect(api.convertSelectedToPath).toHaveBeenCalledWith("r1");
    expect(api.beginEdit).toHaveBeenCalledWith("r1");
    expect(updateNode).not.toHaveBeenCalled();
  });
});
