if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  executeCanvasTool,
  CANVAS_TOOL_SCHEMAS,
  TOOL_ERROR,
} from "../../src/canvas/agent/canvas_tools.js";
import { clearAgentFocusNode } from "../../src/canvas/editor/chrome_stage_overlays.js";

describe("Canvas Agent Build Tools", () => {
  let mockDoc;
  let mockEditor;
  let committedActions;
  let selectedIds;
  let nextId;

  function addNode(node) {
    mockDoc.nodes.push(node);
    return node;
  }

  beforeEach(() => {
    clearAgentFocusNode();
    committedActions = [];
    selectedIds = ["frame_hero"];
    nextId = 0;

    mockDoc = {
      id: "doc_1",
      nodes: [
        {
          id: "frame_hero",
          name: "Hero Section",
          type: "frame",
          kind: "frame",
          x: 100,
          y: 200,
          width: 800,
          height: 600,
        },
        {
          id: "text_title",
          name: "Hero Title",
          type: "text",
          kind: "text",
          parentId: "frame_hero",
          x: 132,
          y: 232,
          width: 500,
          height: 48,
          text: "Welcome to VOO",
        },
        {
          id: "btn_cta",
          name: "CTA Button",
          type: "frame",
          kind: "frame",
          parentId: "frame_hero",
          x: 132,
          y: 304,
          width: 140,
          height: 44,
        },
      ],
    };

    const findIndex = (id) => mockDoc.nodes.findIndex((node) => node.id === id);

    mockEditor = {
      getSelectedId: vi.fn(() => selectedIds[0] ?? null),
      getSelectedIds: vi.fn(() => [...selectedIds]),
      getNode: vi.fn((id) => mockDoc.nodes.find((node) => node.id === id) || null),
      getDoc: vi.fn(() => mockDoc),
      updateNode: vi.fn((id, patch) => {
        const node = mockDoc.nodes.find((each) => each.id === id);
        if (node) Object.assign(node, patch);
      }),
      commitEditorDocument: vi.fn((options) => {
        committedActions.push(options?.message || "commit");
      }),
      selectExactly: vi.fn((ids) => {
        selectedIds = [...(ids ?? [])];
      }),
      addRectAt: vi.fn(({ x, y }) =>
        addNode({
          id: `rect_${++nextId}`,
          name: "Rectangle",
          type: "rect",
          kind: "rect",
          x,
          y,
          width: 0,
          height: 0,
        }),
      ),
      addEllipseAt: vi.fn(({ x, y }) =>
        addNode({
          id: `ellipse_${++nextId}`,
          name: "Ellipse",
          type: "ellipse",
          kind: "ellipse",
          x,
          y,
          width: 0,
          height: 0,
        }),
      ),
      addTextAt: vi.fn(({ x, y }, text) =>
        addNode({
          id: `text_${++nextId}`,
          name: "Text",
          type: "text",
          kind: "text",
          x,
          y,
          width: 0,
          height: 0,
          text,
        }),
      ),
      removeIds: vi.fn((ids) => {
        const removed = new Set(ids);
        mockDoc.nodes = mockDoc.nodes.filter((node) => !removed.has(node.id));
        selectedIds = [];
        return true;
      }),
      removeNode: vi.fn((id) => {
        mockDoc.nodes = mockDoc.nodes.filter((node) => node.id !== id);
        selectedIds = [];
      }),
      duplicateSelected: vi.fn(() => {
        const source = mockDoc.nodes.find((node) => node.id === selectedIds[0]);
        if (!source) return;
        const copy = { ...source, id: `copy_${++nextId}` };
        addNode(copy);
        selectedIds = [copy.id];
      }),
      groupSelection: vi.fn(() => {
        const members = mockDoc.nodes.filter((node) => selectedIds.includes(node.id));
        const left = Math.min(...members.map((node) => node.x));
        const top = Math.min(...members.map((node) => node.y));
        const right = Math.max(...members.map((node) => node.x + node.width));
        const bottom = Math.max(...members.map((node) => node.y + node.height));
        const group = {
          id: `group_${++nextId}`,
          name: "Group",
          type: "group",
          kind: "group",
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        };
        mockDoc.nodes = mockDoc.nodes.map((node) =>
          selectedIds.includes(node.id) ? { ...node, parentId: group.id } : node,
        );
        addNode(group);
        selectedIds = [group.id];
        return group.id;
      }),
      moveToFront: vi.fn((ids) => {
        const moving = mockDoc.nodes.filter((node) => ids.includes(node.id));
        mockDoc.nodes = [
          ...mockDoc.nodes.filter((node) => !ids.includes(node.id)),
          ...moving,
        ];
      }),
      moveToBack: vi.fn((ids) => {
        const moving = mockDoc.nodes.filter((node) => ids.includes(node.id));
        mockDoc.nodes = [
          ...moving,
          ...mockDoc.nodes.filter((node) => !ids.includes(node.id)),
        ];
      }),
      reorderNodeTo: vi.fn((id, index) => {
        const from = findIndex(id);
        if (from < 0) return;
        const [node] = mockDoc.nodes.splice(from, 1);
        mockDoc.nodes.splice(index, 0, node);
      }),
    };

    globalThis.window.__vooEditor = mockEditor;
  });

  it("exposes all build tool schemas", () => {
    const names = CANVAS_TOOL_SCHEMAS.map((schema) => schema.function.name);
    expect(names).toContain("create_shape");
    expect(names).toContain("delete_layers");
    expect(names).toContain("duplicate_layer");
    expect(names).toContain("select_layers");
    expect(names).toContain("group_layers");
    expect(names).toContain("reorder_layer");
    expect(names).toContain("rename_layer");
  });

  it("creates a rectangle with geometry, name, and fill", async () => {
    const result = await executeCanvasTool("create_shape", {
      kind: "rect",
      x: 40,
      y: 60,
      width: 320,
      height: 180,
      fill: "#ff8800",
      name: "Hero Card",
    });

    expect(result).toEqual({ ok: true, layerId: "rect_1" });
    expect(mockEditor.addRectAt).toHaveBeenCalledWith({ x: 40, y: 60 });
    expect(mockEditor.updateNode).toHaveBeenCalledWith("rect_1", {
      width: 320,
      height: 180,
      name: "Hero Card",
      fill: "#ff8800",
    });
    expect(committedActions).toContain("AI: Create shape");
  });

  it("creates an ellipse", async () => {
    const result = await executeCanvasTool("create_shape", {
      kind: "ellipse",
      x: 10,
      y: 20,
      width: 80,
      height: 80,
    });

    expect(result.layerId).toBe("ellipse_1");
    expect(mockEditor.addEllipseAt).toHaveBeenCalledWith({ x: 10, y: 20 });
    expect(mockEditor.updateNode).toHaveBeenCalledWith("ellipse_1", {
      width: 80,
      height: 80,
    });
  });

  it("creates a text layer with its content", async () => {
    const result = await executeCanvasTool("create_shape", {
      kind: "text",
      x: 12,
      y: 24,
      width: 240,
      height: 40,
      text: "Build with AI",
    });

    expect(result.layerId).toBe("text_1");
    expect(mockEditor.addTextAt).toHaveBeenCalledWith({ x: 12, y: 24 }, "Build with AI");
    expect(mockEditor.updateNode).toHaveBeenCalledWith("text_1", {
      width: 240,
      height: 40,
    });
  });

  it("rejects an invalid shape kind", async () => {
    await expect(
      executeCanvasTool("create_shape", {
        kind: "star",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      }),
    ).rejects.toThrow(TOOL_ERROR.INVALID_ARGS);
  });

  it("deletes layers with removeIds and commits", async () => {
    const result = await executeCanvasTool("delete_layers", {
      layerIds: ["text_title", "btn_cta"],
    });

    expect(result).toEqual({
      ok: true,
      count: 2,
    });
    expect(mockEditor.removeIds).toHaveBeenCalledWith(["text_title", "btn_cta"]);
    expect(mockEditor.removeNode).not.toHaveBeenCalled();
    expect(committedActions).toContain("AI: Delete layers");
    expect(mockDoc.nodes.map((node) => node.id)).toEqual(["frame_hero"]);
  });

  it("falls back to removeNode when removeIds is unavailable", async () => {
    delete mockEditor.removeIds;

    await executeCanvasTool("delete_layers", {
      layerIds: ["text_title", "btn_cta"],
    });

    expect(mockEditor.removeNode).toHaveBeenCalledWith("text_title");
    expect(mockEditor.removeNode).toHaveBeenCalledWith("btn_cta");
  });

  it("throws agentNodeNotFound when deleting an unknown layer", async () => {
    await expect(
      executeCanvasTool("delete_layers", { layerIds: ["missing_layer"] }),
    ).rejects.toThrow(TOOL_ERROR.NODE_NOT_FOUND);
    expect(mockEditor.removeIds).not.toHaveBeenCalled();
  });

  it("duplicates a layer and returns the new selected id", async () => {
    const result = await executeCanvasTool("duplicate_layer", { layerId: "frame_hero" });

    expect(result).toEqual({ ok: true, layerId: "copy_1" });
    expect(mockEditor.selectExactly).toHaveBeenCalledWith(["frame_hero"]);
    expect(mockEditor.duplicateSelected).toHaveBeenCalled();
    expect(mockEditor.getSelectedId).toHaveBeenCalled();
  });

  it("throws agentNodeNotFound when duplicating an unknown layer", async () => {
    await expect(
      executeCanvasTool("duplicate_layer", { layerId: "missing_layer" }),
    ).rejects.toThrow(TOOL_ERROR.NODE_NOT_FOUND);
    expect(mockEditor.duplicateSelected).not.toHaveBeenCalled();
  });

  it("selects exactly the requested layers", async () => {
    const result = await executeCanvasTool("select_layers", {
      layerIds: ["text_title", "btn_cta"],
    });

    expect(result).toEqual({ ok: true, layerIds: ["text_title", "btn_cta"] });
    expect(mockEditor.selectExactly).toHaveBeenCalledWith(["text_title", "btn_cta"]);
  });

  it("throws agentNodeNotFound when selecting an unknown layer", async () => {
    await expect(
      executeCanvasTool("select_layers", { layerIds: ["frame_hero", "missing_layer"] }),
    ).rejects.toThrow(TOOL_ERROR.NODE_NOT_FOUND);
    expect(mockEditor.selectExactly).not.toHaveBeenCalled();
  });

  it("groups layers, applies an optional name, and returns the group id", async () => {
    const result = await executeCanvasTool("group_layers", {
      layerIds: ["text_title", "btn_cta"],
      name: "Hero Content",
    });

    expect(result).toEqual({ ok: true, groupId: "group_1" });
    expect(mockEditor.selectExactly).toHaveBeenCalledWith(["text_title", "btn_cta"]);
    expect(mockEditor.groupSelection).toHaveBeenCalled();
    expect(mockEditor.updateNode).toHaveBeenCalledWith("group_1", { name: "Hero Content" });
    expect(committedActions).toContain("AI: Group Layers");

    const group = mockDoc.nodes.find((node) => node.id === "group_1");
    expect(group.kind).toBe("group");
    expect(mockDoc.nodes.find((node) => node.id === "text_title").parentId).toBe("group_1");
  });

  it("throws agentNodeNotFound when grouping an unknown layer", async () => {
    await expect(
      executeCanvasTool("group_layers", {
        layerIds: ["frame_hero", "missing_layer"],
      }),
    ).rejects.toThrow(TOOL_ERROR.NODE_NOT_FOUND);
    expect(mockEditor.groupSelection).not.toHaveBeenCalled();
  });

  it("reorders a layer to the front and back", async () => {
    await executeCanvasTool("reorder_layer", {
      layerId: "text_title",
      position: "front",
    });
    expect(mockEditor.moveToFront).toHaveBeenCalledWith(["text_title"]);

    await executeCanvasTool("reorder_layer", {
      layerId: "text_title",
      position: "back",
    });
    expect(mockEditor.moveToBack).toHaveBeenCalledWith(["text_title"]);
  });

  it("reorders a layer to a numeric stack index", async () => {
    const result = await executeCanvasTool("reorder_layer", {
      layerId: "text_title",
      position: 2.4,
    });

    expect(result).toEqual({ ok: true, layerId: "text_title", position: 2 });
    expect(mockEditor.reorderNodeTo).toHaveBeenCalledWith("text_title", 2);
  });

  it("rejects an invalid reorder position", async () => {
    await expect(
      executeCanvasTool("reorder_layer", {
        layerId: "frame_hero",
        position: "middle",
      }),
    ).rejects.toThrow(TOOL_ERROR.INVALID_ARGS);
  });

  it("throws agentNodeNotFound when reordering an unknown layer", async () => {
    await expect(
      executeCanvasTool("reorder_layer", {
        layerId: "missing_layer",
        position: "front",
      }),
    ).rejects.toThrow(TOOL_ERROR.NODE_NOT_FOUND);
    expect(mockEditor.moveToFront).not.toHaveBeenCalled();
  });

  it("renames a layer and commits", async () => {
    const result = await executeCanvasTool("rename_layer", {
      layerId: "frame_hero",
      name: "Landing Hero",
    });

    expect(result).toEqual({ ok: true, layerId: "frame_hero", name: "Landing Hero" });
    expect(mockEditor.updateNode).toHaveBeenCalledWith("frame_hero", {
      name: "Landing Hero",
    });
    expect(committedActions).toContain("AI: Rename Layer");
  });

  it("throws agentNodeNotFound when renaming an unknown layer", async () => {
    await expect(
      executeCanvasTool("rename_layer", {
        layerId: "missing_layer",
        name: "Nope",
      }),
    ).rejects.toThrow(TOOL_ERROR.NODE_NOT_FOUND);
    expect(mockEditor.updateNode).not.toHaveBeenCalled();
  });
});
