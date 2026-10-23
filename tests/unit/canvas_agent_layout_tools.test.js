if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CANVAS_TOOL_LAYOUT_SCHEMAS,
  LAYOUT_TOOL_EXECUTORS,
} from "../../src/canvas/agent/canvas_tools_layout.js";
import { TOOL_ERROR } from "../../src/canvas/agent/canvas_tools.js";

function makeNode(id, patch = {}) {
  return {
    id,
    name: id,
    type: "rect",
    kind: "rect",
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    ...patch,
  };
}

describe("Canvas Agent Layout Tools", () => {
  let mockDoc;
  let mockEditor;
  let committedActions;
  let selectedIds;
  let nextId;
  let undoCalls;
  let redoCalls;

  function run(name, args) {
    return LAYOUT_TOOL_EXECUTORS[name](args);
  }

  beforeEach(() => {
    committedActions = [];
    selectedIds = [];
    nextId = 0;
    undoCalls = 0;
    redoCalls = 0;

    mockDoc = {
      id: "doc_layout",
      width: 1000,
      height: 800,
      nodes: [
        makeNode("frame_1", {
          name: "Page Frame",
          type: "frame",
          kind: "frame",
          x: 100,
          y: 100,
          width: 400,
          height: 300,
        }),
        makeNode("a", {
          name: "Card A",
          parentId: "frame_1",
          x: 110,
          y: 120,
          width: 80,
          height: 40,
        }),
        makeNode("b", {
          name: "Headline",
          type: "text",
          kind: "text",
          parentId: "frame_1",
          x: 220,
          y: 140,
          width: 60,
          height: 80,
        }),
        makeNode("c", {
          name: "Card C",
          parentId: "frame_1",
          x: 330,
          y: 200,
          width: 40,
          height: 20,
        }),
        makeNode("group_1", {
          name: "Toolbar",
          type: "group",
          kind: "group",
          x: 600,
          y: 100,
          width: 120,
          height: 120,
        }),
        makeNode("g1", {
          name: "Tool One",
          parentId: "group_1",
          x: 610,
          y: 110,
        }),
        makeNode("g2", {
          name: "Tool Two",
          parentId: "group_1",
          x: 660,
          y: 110,
        }),
        makeNode("group_2", {
          name: "Fallback Group",
          type: "group",
          kind: "group",
          x: 600,
          y: 300,
          width: 120,
          height: 120,
        }),
        makeNode("h1", {
          name: "Fallback One",
          parentId: "group_2",
          x: 610,
          y: 310,
        }),
        makeNode("h2", {
          name: "Fallback Two",
          parentId: "group_2",
          x: 660,
          y: 310,
        }),
      ],
    };

    const findNode = (id) => mockDoc.nodes.find((node) => node.id === id) ?? null;

    mockEditor = {
      getDoc: vi.fn(() => mockDoc),
      getDocument: vi.fn(() => mockDoc),
      getNode: vi.fn(findNode),
      updateNode: vi.fn((id, patch) => {
        const node = findNode(id);
        if (node) Object.assign(node, patch);
      }),
      commitEditorDocument: vi.fn((options) => {
        committedActions.push(options?.message || "commit");
      }),
      addRectAt: vi.fn(({ x, y }) => {
        const node = makeNode(`rect_${++nextId}`, {
          name: "Rectangle",
          x,
          y,
          width: 0,
          height: 0,
          fill: "#999999",
        });
        mockDoc.nodes.push(node);
        return node;
      }),
      selectExactly: vi.fn((ids) => {
        selectedIds = [...(ids ?? [])];
      }),
      ungroupSelection: vi.fn(() => {
        const groupId = selectedIds[0];
        const group = findNode(groupId);
        if (!group) return;
        const released = mockDoc.nodes
          .filter((node) => node.parentId === groupId)
          .map((node) => node.id);
        mockDoc.nodes = mockDoc.nodes
          .filter((node) => node.id !== groupId)
          .map((node) => {
            if (node.parentId !== groupId) return node;
            const { parentId, ...rest } = node;
            return rest;
          });
        selectedIds = released;
      }),
      undo: vi.fn(async () => {
        undoCalls += 1;
      }),
      redo: vi.fn(async () => {
        redoCalls += 1;
      }),
    };

    globalThis.window.__vooEditor = mockEditor;
  });

  it("exports the layout schemas and executors", () => {
    const names = CANVAS_TOOL_LAYOUT_SCHEMAS.map((schema) => schema.function.name);
    expect(names).toEqual([
      "align_layers",
      "distribute_layers",
      "create_frame",
      "ungroup_layers",
      "find_layers",
      "undo",
      "redo",
    ]);
    for (const name of names) {
      expect(LAYOUT_TOOL_EXECUTORS[name]).toBeTypeOf("function");
    }

    const distribute = CANVAS_TOOL_LAYOUT_SCHEMAS.find(
      (schema) => schema.function.name === "distribute_layers",
    );
    expect(distribute.function.parameters.properties.layerIds.minItems).toBe(3);
    expect(distribute.function.parameters.properties.axis.enum).toEqual([
      "horizontal",
      "vertical",
    ]);
    expect(distribute.function.parameters.properties.spacing.type).toBe("number");

    const create = CANVAS_TOOL_LAYOUT_SCHEMAS.find(
      (schema) => schema.function.name === "create_frame",
    );
    expect(create.function.parameters.required).toEqual([
      "x",
      "y",
      "width",
      "height",
    ]);
    expect(create.function.parameters.properties.layout.enum).toEqual([
      "none",
      "horizontal",
      "vertical",
    ]);
  });

  it("aligns a selection to its own left edge", () => {
    const result = run("align_layers", {
      layerIds: ["a", "b", "c"],
      align: "left",
    });

    expect(result).toEqual({
      ok: true,
      align: "left",
      relativeTo: "selection",
      moved: 2,
    });
    expect(mockDoc.nodes.find((node) => node.id === "a").x).toBe(110);
    expect(mockDoc.nodes.find((node) => node.id === "b").x).toBe(110);
    expect(mockDoc.nodes.find((node) => node.id === "c").x).toBe(110);
    expect(mockDoc.nodes.find((node) => node.id === "frame_1").x).toBe(100);
    expect(committedActions).toContain("AI: Align Layers");
  });

  it("aligns to the first listed layer", () => {
    const result = run("align_layers", {
      layerIds: ["c", "a", "b"],
      align: "right",
      relativeTo: "first",
    });

    expect(result.moved).toBe(2);
    expect(mockDoc.nodes.find((node) => node.id === "c").x).toBe(330);
    expect(mockDoc.nodes.find((node) => node.id === "a").x).toBe(290);
    expect(mockDoc.nodes.find((node) => node.id === "b").x).toBe(310);
  });

  it("aligns to the shared parent frame", () => {
    const result = run("align_layers", {
      layerIds: ["a", "b", "c"],
      align: "bottom",
      relativeTo: "parent",
    });

    expect(result.moved).toBe(3);
    expect(mockDoc.nodes.find((node) => node.id === "a").y).toBe(360);
    expect(mockDoc.nodes.find((node) => node.id === "b").y).toBe(320);
    expect(mockDoc.nodes.find((node) => node.id === "c").y).toBe(380);
  });

  it("rejects invalid alignment arguments", () => {
    expect(() =>
      run("align_layers", { layerIds: ["a"], align: "diagonal" }),
    ).toThrow(TOOL_ERROR.INVALID_ARGS);
    expect(() =>
      run("align_layers", {
        layerIds: ["a"],
        align: "left",
        relativeTo: "canvas",
      }),
    ).toThrow(TOOL_ERROR.INVALID_ARGS);
    expect(() =>
      run("align_layers", { layerIds: ["missing"], align: "left" }),
    ).toThrow(TOOL_ERROR.NODE_NOT_FOUND);
  });

  it("distributes layers with even edge-to-edge spacing", () => {
    mockDoc.nodes.find((node) => node.id === "a").x = 0;
    mockDoc.nodes.find((node) => node.id === "a").width = 20;
    mockDoc.nodes.find((node) => node.id === "b").x = 50;
    mockDoc.nodes.find((node) => node.id === "b").width = 40;
    mockDoc.nodes.find((node) => node.id === "c").x = 270;
    mockDoc.nodes.find((node) => node.id === "c").width = 50;

    const result = run("distribute_layers", {
      layerIds: ["a", "b", "c"],
      axis: "horizontal",
    });

    expect(result).toEqual({
      ok: true,
      axis: "horizontal",
      spacing: null,
      moved: 1,
    });
    expect(mockDoc.nodes.find((node) => node.id === "a").x).toBe(0);
    expect(mockDoc.nodes.find((node) => node.id === "b").x).toBe(125);
    expect(mockDoc.nodes.find((node) => node.id === "c").x).toBe(270);
    expect(committedActions).toContain("AI: Distribute Layers");
  });

  it("distributes layers at a fixed gap", () => {
    mockDoc.nodes.find((node) => node.id === "a").x = 0;
    mockDoc.nodes.find((node) => node.id === "a").width = 20;
    mockDoc.nodes.find((node) => node.id === "b").x = 50;
    mockDoc.nodes.find((node) => node.id === "b").width = 40;
    mockDoc.nodes.find((node) => node.id === "c").x = 270;
    mockDoc.nodes.find((node) => node.id === "c").width = 50;

    const result = run("distribute_layers", {
      layerIds: ["a", "b", "c"],
      axis: "horizontal",
      spacing: 30,
    });

    expect(result).toEqual({
      ok: true,
      axis: "horizontal",
      spacing: 30,
      moved: 1,
    });
    expect(mockDoc.nodes.find((node) => node.id === "a").x).toBe(0);
    expect(mockDoc.nodes.find((node) => node.id === "b").x).toBe(50);
    expect(mockDoc.nodes.find((node) => node.id === "c").x).toBe(120);
  });

  it("requires at least three layers for distribution", () => {
    expect(() =>
      run("distribute_layers", { layerIds: ["a", "b"], axis: "horizontal" }),
    ).toThrow(TOOL_ERROR.INVALID_ARGS);
    expect(() =>
      run("distribute_layers", {
        layerIds: ["a", "b", "c"],
        axis: "diagonal",
      }),
    ).toThrow(TOOL_ERROR.INVALID_ARGS);
  });

  it("creates a frame with geometry and fill", () => {
    const result = run("create_frame", {
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      name: "Hero Frame",
      fill: "#112233",
    });

    expect(result).toEqual({ ok: true, layerId: "rect_1" });
    expect(mockEditor.addRectAt).toHaveBeenCalledWith({ x: 10, y: 20 });
    const frame = mockDoc.nodes.find((node) => node.id === "rect_1");
    expect(frame).toMatchObject({
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      name: "Hero Frame",
      fill: "#112233",
      isFrame: true,
    });
    expect(frame.autoLayout).toBeUndefined();
    expect(committedActions).toContain("AI: Create frame");
  });

  it("creates a frame and applies Auto-Layout", () => {
    const result = run("create_frame", {
      x: 30,
      y: 40,
      width: 400,
      height: 240,
      layout: "horizontal",
      gap: 12,
      padding: 8,
    });

    expect(result).toEqual({ ok: true, layerId: "rect_1" });
    const frame = mockDoc.nodes.find((node) => node.id === "rect_1");
    expect(frame.autoLayout).toEqual({
      direction: "horizontal",
      gap: 12,
      padding: 8,
    });
    expect(mockEditor.updateNode).toHaveBeenCalledWith("rect_1", {
      autoLayout: { direction: "horizontal", gap: 12, padding: 8 },
    });
    expect(committedActions).toContain("AI: Create frame");
    expect(committedActions).toContain("AI: Mutate Auto Layout");
  });

  it("rejects invalid frame arguments", () => {
    expect(() =>
      run("create_frame", { x: 0, y: 0, width: 10, height: 10, layout: "grid" }),
    ).toThrow(TOOL_ERROR.INVALID_ARGS);
    expect(() =>
      run("create_frame", { x: 0, y: 0, width: "wide", height: 10 }),
    ).toThrow(TOOL_ERROR.INVALID_ARGS);
  });

  it("ungroups through the editor selection API", () => {
    const result = run("ungroup_layers", { groupId: "group_1" });

    expect(result).toEqual({
      ok: true,
      groupId: "group_1",
      released: ["g1", "g2"],
    });
    expect(mockEditor.selectExactly).toHaveBeenCalledWith(["group_1"]);
    expect(mockEditor.ungroupSelection).toHaveBeenCalled();
    expect(mockDoc.nodes.some((node) => node.id === "group_1")).toBe(false);
    expect(mockDoc.nodes.find((node) => node.id === "g1").parentId).toBeUndefined();
    expect(mockDoc.nodes.find((node) => node.id === "g2").parentId).toBeUndefined();
  });

  it("falls back to releasing children when the editor has no ungroup API", () => {
    delete mockEditor.ungroupSelection;

    const result = run("ungroup_layers", { groupId: "group_2" });

    expect(result.released).toEqual(["h1", "h2"]);
    expect(mockDoc.nodes.some((node) => node.id === "group_2")).toBe(false);
    expect(mockDoc.nodes.find((node) => node.id === "h1").parentId).toBeUndefined();
    expect(mockDoc.nodes.find((node) => node.id === "h2").parentId).toBeUndefined();
    expect(committedActions).toContain("AI: Ungroup Layers");
  });

  it("rejects ungrouping a non-container layer", () => {
    expect(() => run("ungroup_layers", { groupId: "a" })).toThrow(
      expect.objectContaining({ code: TOOL_ERROR.INVALID_ARGS }),
    );
    expect(() => run("ungroup_layers", { groupId: "missing" })).toThrow(
      TOOL_ERROR.NODE_NOT_FOUND,
    );
  });

  it("finds layers by name substring and kind", () => {
    const byName = run("find_layers", { name: "HEAD" });
    expect(byName.ok).toBe(true);
    expect(byName.layers.map((layer) => layer.id)).toEqual(["b"]);
    expect(byName.layers[0]).toMatchObject({
      name: "Headline",
      kind: "text",
      bounds: { x: 220, y: 140, width: 60, height: 80 },
    });

    const byKind = run("find_layers", { kind: "rect" });
    expect(byKind.layers.map((layer) => layer.id)).toEqual([
      "a",
      "c",
      "g1",
      "g2",
      "h1",
      "h2",
    ]);

    const frames = run("find_layers", { kind: "frame" });
    expect(frames.layers.map((layer) => layer.id)).toEqual(["frame_1"]);
  });

  it("returns an empty layer list when nothing matches", () => {
    expect(run("find_layers", { name: "nothing-here" }).layers).toEqual([]);
    expect(run("find_layers", { kind: "video" }).layers).toEqual([]);
  });

  it("undos and redoes the requested number of steps", async () => {
    await expect(run("undo", { steps: 2 })).resolves.toEqual({
      ok: true,
      steps: 2,
    });
    expect(undoCalls).toBe(2);

    await expect(run("redo", {})).resolves.toEqual({ ok: true, steps: 1 });
    expect(redoCalls).toBe(1);
  });

  it("validates history steps and missing editor support", async () => {
    await expect(run("undo", { steps: 0 })).rejects.toMatchObject({
      code: TOOL_ERROR.INVALID_ARGS,
    });
    delete mockEditor.redo;
    await expect(run("redo", {})).rejects.toMatchObject({
      code: TOOL_ERROR.INVALID_ARGS,
    });
  });

  it("throws agentNoEditor when no editor is available", () => {
    globalThis.window.__vooEditor = null;
    expect(() =>
      run("align_layers", { layerIds: ["a"], align: "left" }),
    ).toThrow(TOOL_ERROR.NO_EDITOR);
  });
});
