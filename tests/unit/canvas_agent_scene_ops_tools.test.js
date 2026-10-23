if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CANVAS_TOOL_SCHEMAS, TOOL_ERROR } from "../../src/canvas/agent/canvas_tools.js";
import {
  SCENE_OPS_TOOL_SCHEMAS,
  SCENE_OPS_TOOL_EXECUTORS,
} from "../../src/canvas/agent/canvas_tools_scene_ops.js";

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
    fill: "#rrggbb",
    ...patch,
  };
}

describe("Canvas Agent Scene Ops Tools", () => {
  let mockDoc;
  let mockEditor;
  let committedDocs;

  function run(name, args) {
    return SCENE_OPS_TOOL_EXECUTORS[name](args);
  }

  beforeEach(() => {
    committedDocs = [];
    mockDoc = {
      id: "doc_ops",
      width: 1000,
      height: 800,
      nodes: [
        makeNode("frame_1", {
          type: "frame",
          kind: "frame",
          width: 400,
          height: 300,
        }),
        makeNode("a", { parentId: "frame_1" }),
        makeNode("b", { parentId: "frame_1" }),
        makeNode("c", { parentId: "frame_1" }),
      ],
    };

    mockEditor = {
      getDoc: vi.fn(() => mockDoc),
      getDocument: vi.fn(() => mockDoc),
      setDoc: vi.fn((next, options) => {
        committedDocs.push(options?.name || "commit");
        mockDoc = next;
      }),
      getNode: vi.fn((id) => mockDoc.nodes.find((node) => node.id === id) ?? null),
      selectionUnits: vi.fn(() =>
        mockDoc.nodes.filter((node) => node.id !== "frame_1"),
      ),
      getSelection: vi.fn(() => ["bool_1"]),
      selectExactly: vi.fn(),
      combineSelected: vi.fn((operation) => {
        mockDoc.nodes = [makeNode("bool_1", { kind: "boolean", operation })];
      }),
      exportNodePng: vi.fn((id) => `data:image/png;base64,PNG-${id}`),
      exportSelectionPng: vi.fn((ids) => `data:image/png;base64,PNG-${ids.join("+")}`),
    };

    globalThis.window.__vooEditor = mockEditor;
  });

  it("exports the scene op schemas and executors", () => {
    const names = SCENE_OPS_TOOL_SCHEMAS.map((schema) => schema.function.name);
    expect(names).toEqual(["boolean_combine", "set_constraints", "export_layers"]);
    for (const name of names) {
      expect(SCENE_OPS_TOOL_EXECUTORS[name]).toBeTypeOf("function");
    }
    const registered = CANVAS_TOOL_SCHEMAS.map((schema) => schema.function.name);
    for (const name of names) expect(registered).toContain(name);
  });

  describe("boolean_combine", () => {
    it("selects the operands then combines, returning the new selection", async () => {
      const result = await run("boolean_combine", {
        operation: "union",
        layerIds: ["a", "b"],
      });
      expect(mockEditor.selectExactly).toHaveBeenCalledWith(["a", "b"]);
      expect(mockEditor.combineSelected).toHaveBeenCalledWith("union");
      expect(result).toEqual({ ok: true, operation: "union", nodeIds: ["bool_1"] });
    });

    it("rejects an unknown operation with INVALID_ARGS", async () => {
      await expect(run("boolean_combine", { operation: "xor" })).rejects.toMatchObject({
        code: TOOL_ERROR.INVALID_ARGS,
      });
      await expect(run("boolean_combine", {})).rejects.toMatchObject({
        code: TOOL_ERROR.INVALID_ARGS,
      });
    });

    it("rejects when nothing is selected and no layerIds given", async () => {
      mockEditor.selectionUnits = vi.fn(() => []);
      await expect(run("boolean_combine", { operation: "union" })).rejects.toMatchObject({
        code: TOOL_ERROR.INVALID_ARGS,
      });
    });
  });

  describe("set_constraints", () => {
    it("writes constraints onto the layer and commits", async () => {
      const result = await run("set_constraints", {
        layerIds: ["a"],
        horizontal: "leftRight",
        vertical: "top",
      });
      expect(result).toEqual({ ok: true, layerIds: ["a"], cleared: false });
      const node = mockDoc.nodes.find((entry) => entry.id === "a");
      expect(node.constraints.horizontal).toBe("leftRight");
      expect(node.constraints.vertical).toBe("top");
      expect(committedDocs).toEqual(["agent.constraints"]);
    });

    it("merges with an existing horizontal mode when only vertical is given", async () => {
      const a = mockDoc.nodes.find((node) => node.id === "a");
      a.constraints = { horizontal: "center", vertical: "scale" };
      await run("set_constraints", { layerIds: ["a"], vertical: "bottom" });
      expect(mockDoc.nodes.find((node) => node.id === "a").constraints).toEqual({
        horizontal: "center",
        vertical: "bottom",
      });
    });

    it("clears constraints", async () => {
      const a = mockDoc.nodes.find((node) => node.id === "a");
      a.constraints = { horizontal: "center", vertical: "center" };
      const result = await run("set_constraints", { layerIds: ["a", "b"], clear: true });
      expect(result.cleared).toBe(true);
      expect(mockDoc.nodes.find((node) => node.id === "a").constraints).toBeUndefined();
      expect(committedDocs).toEqual(["agent.constraints"]);
    });

    it("rejects invalid modes with INVALID_ARGS", async () => {
      await expect(
        run("set_constraints", { layerIds: ["a"], horizontal: "top" }),
      ).rejects.toMatchObject({ code: TOOL_ERROR.INVALID_ARGS });
      await expect(
        run("set_constraints", { layerIds: ["a"], vertical: "left" }),
      ).rejects.toMatchObject({ code: TOOL_ERROR.INVALID_ARGS });
      await expect(run("set_constraints", { layerIds: ["a"] })).rejects.toMatchObject({
        code: TOOL_ERROR.INVALID_ARGS,
      });
    });

    it("rejects unknown layers with NODE_NOT_FOUND", async () => {
      await expect(
        run("set_constraints", { layerIds: ["ghost"], horizontal: "left" }),
      ).rejects.toMatchObject({ code: TOOL_ERROR.NODE_NOT_FOUND });
    });
  });

  describe("export_layers", () => {
    it("exports a single layer via exportNodePng", async () => {
      const result = await run("export_layers", { layerIds: ["a"] });
      expect(mockEditor.exportNodePng).toHaveBeenCalledWith("a", {});
      expect(result.ok).toBe(true);
      expect(result.mime).toBe("image/png");
      expect(result.dataUrl).toBeUndefined();
      expect(result.preview.startsWith("PNG-a")).toBe(true);
    });

    it("composites multiple layers via exportSelectionPng", async () => {
      const result = await run("export_layers", { layerIds: ["a", "b"] });
      expect(mockEditor.exportSelectionPng).toHaveBeenCalledWith(["a", "b"], {});
      expect(result.preview.startsWith("PNG-a+b")).toBe(true);
    });

    it("returns the full data URL when includeDataUrl is set", async () => {
      const result = await run("export_layers", { layerIds: ["a"], includeDataUrl: true });
      expect(result.dataUrl).toBe("data:image/png;base64,PNG-a");
    });

    it("reports NODE_NOT_FOUND for non-raster or missing exports", async () => {
      mockEditor.exportNodePng = vi.fn(() => null);
      await expect(run("export_layers", { layerIds: ["frame_1"] })).rejects.toMatchObject({
        code: TOOL_ERROR.NODE_NOT_FOUND,
      });
    });
  });
});
