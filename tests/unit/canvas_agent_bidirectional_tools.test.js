if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  executeCanvasTool,
  CANVAS_TOOL_SCHEMAS,
  TOOL_ERROR,
} from "../../src/canvas/agent/canvas_tools.js";
import {
  getAgentFocusNode,
  clearAgentFocusNode,
} from "../../src/canvas/editor/chrome_stage_overlays.js";

describe("Canvas Agent Bidirectional Tools & Visual Feedback", () => {
  let mockDoc;
  let mockEditor;
  let committedActions;

  beforeEach(() => {
    clearAgentFocusNode();
    committedActions = [];

    mockDoc = {
      id: "doc_1",
      nodes: [
        {
          id: "frame_hero",
          name: "Hero Section",
          type: "frame",
          kind: "group",
          isFrame: true,
          x: 100,
          y: 200,
          width: 800,
          height: 600,
          rotation: 0,
          fills: [{ type: "solid", color: "#1e1e24" }],
          strokes: [],
          cornerRadius: 16,
          autoLayout: { enabled: true, direction: "vertical", gap: 24, padding: 32 },
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
          fontSize: 36,
          fills: [{ type: "solid", color: "#ffffff" }],
        },
        {
          id: "btn_cta",
          name: "CTA Button",
          type: "frame",
          parentId: "frame_hero",
          x: 132,
          y: 304,
          width: 140,
          height: 44,
          cornerRadius: 8,
          fills: [{ type: "solid", color: "#a7ffd4" }],
        },
        {
          id: "btn_label",
          name: "CTA Label",
          type: "text",
          kind: "text",
          parentId: "btn_cta",
          x: 144,
          y: 316,
          width: 116,
          height: 20,
          text: "Get started",
        },
      ],
    };

    mockEditor = {
      getSelectedId: vi.fn(() => "frame_hero"),
      getSelectedIds: vi.fn(() => ["frame_hero"]),
      getNode: vi.fn((id) => mockDoc.nodes.find((n) => n.id === id) || null),
      getDoc: vi.fn(() => mockDoc),
      updateNode: vi.fn((id, patch) => {
        const node = mockDoc.nodes.find((n) => n.id === id);
        if (node) {
          Object.assign(node, patch);
        }
      }),
      updateNodes: vi.fn((updates) => {
        for (const u of updates) {
          const node = mockDoc.nodes.find((n) => n.id === u.id);
          if (node) {
            Object.assign(node, u);
          }
        }
      }),
      commitEditorDocument: vi.fn((opt) => {
        committedActions.push(opt?.message || "commit");
      }),
      requestRender: vi.fn(),
    };

    globalThis.window.__vooEditor = mockEditor;
  });

  it("exposes all bidirectional tool schemas", () => {
    const names = CANVAS_TOOL_SCHEMAS.map((s) => s.function.name);
    expect(names).toContain("inspect_layer_tree");
    expect(names).toContain("mutate_layer_layout");
    expect(names).toContain("mutate_layer_style");
    expect(names).toContain("mutate_layer_text");
    expect(names).toContain("mutate_auto_layout");
    expect(names).toContain("batch_mutate_layers");
  });

  it("publishes a complete generate_image_web schema", () => {
    const schema = CANVAS_TOOL_SCHEMAS.find((entry) => entry.function.name === "generate_image_web");
    expect(schema).toBeTruthy();
    const params = schema.function.parameters;
    expect(params.required).toEqual(["provider", "prompt"]);
    expect(params.properties.provider.enum).toEqual(["chatgpt", "gemini"]);
    expect(params.properties.prompt.type).toBe("string");
    expect(params.properties.count).toMatchObject({ type: "integer", minimum: 1, maximum: 4 });
    expect(params.properties.x.type).toBe("number");
    expect(params.properties.y.type).toBe("number");
    expect(params.properties.width.type).toBe("number");
  });

  it("inspects layer tree of a specific node and returns hierarchy", async () => {
    const result = await executeCanvasTool("inspect_layer_tree", {
      layerId: "frame_hero",
    });

    expect(result.root.id).toBe("frame_hero");
    expect(result.root.name).toBe("Hero Section");
    expect(result.root.width).toBe(800);
    expect(result.root.autoLayout.enabled).toBe(true);
    expect(result.children.length).toBe(2);
    expect(result.children[0].id).toBe("text_title");
  });

  it("returns kind and parentId with recursive nesting up to the default depth", async () => {
    const result = await executeCanvasTool("inspect_layer_tree", {
      layerId: "frame_hero",
    });

    expect(result.root.kind).toBe("group");
    expect(result.root.parentId).toBe(null);

    const cta = result.children.find((child) => child.id === "btn_cta");
    expect(cta.kind).toBe("frame");
    expect(cta.parentId).toBe("frame_hero");

    const label = cta.children.find((child) => child.id === "btn_label");
    expect(label.kind).toBe("text");
    expect(label.parentId).toBe("btn_cta");
    expect(label.children).toEqual([]);
  });

  it("honors a small depth so huge trees stay compact", async () => {
    const directOnly = await executeCanvasTool("inspect_layer_tree", {
      layerId: "frame_hero",
      depth: 1,
    });
    const cta = directOnly.children.find((child) => child.id === "btn_cta");
    expect(cta.children).toBeUndefined();

    const rootNodeOnly = await executeCanvasTool("inspect_layer_tree", {
      layerId: "frame_hero",
      depth: 0,
    });
    expect(rootNodeOnly.root.children).toBeUndefined();
  });

  it("inspects the whole document as nested top-level layers", async () => {
    mockEditor.getSelectedId = vi.fn(() => null);
    const result = await executeCanvasTool("inspect_layer_tree", {});

    expect(result.totalCount).toBe(mockDoc.nodes.length);
    const root = result.layers.find((layer) => layer.id === "frame_hero");
    expect(root.parentId).toBe(null);
    expect(root.children.map((child) => child.id)).toEqual([
      "text_title",
      "btn_cta",
    ]);
  });

  it("mutates layer layout and triggers visual focus feedback", async () => {
    const result = await executeCanvasTool("mutate_layer_layout", {
      layerId: "frame_hero",
      patch: { width: 960, height: 720 },
    });

    expect(result.ok).toBe(true);
    expect(mockEditor.updateNode).toHaveBeenCalledWith("frame_hero", {
      width: 960,
      height: 720,
    });
    expect(committedActions).toContain("AI: Mutate Layer Layout");

    // Check visual feedback overlay status
    const focus = getAgentFocusNode();
    expect(focus).not.toBeNull();
    expect(focus.layerId).toBe("frame_hero");
    expect(focus.status).toBe("AI: Updating layout");
  });

  it("moves a frame and its descendants together through the layout tool", async () => {
    mockEditor.moveNodeBy = vi.fn();
    const result = await executeCanvasTool("mutate_layer_layout", {
      layerId: "frame_hero",
      patch: { x: 140, y: 170, width: 960 },
    });

    expect(result.ok).toBe(true);
    expect(mockEditor.moveNodeBy).toHaveBeenCalledWith("frame_hero", 40, -30);
    expect(mockEditor.updateNode).toHaveBeenCalledWith("frame_hero", { width: 960 });
    expect(committedActions).toContain("AI: Mutate Layer Layout");
  });

  it("mutates layer style (fills, cornerRadius, opacity)", async () => {
    const result = await executeCanvasTool("mutate_layer_style", {
      layerId: "btn_cta",
      patch: { cornerRadius: 12, opacity: 0.9 },
    });

    expect(result.ok).toBe(true);
    expect(mockEditor.updateNode).toHaveBeenCalledWith("btn_cta", {
      cornerRadius: 12,
      opacity: 0.9,
    });
    expect(committedActions).toContain("AI: Mutate Layer Style");

    const focus = getAgentFocusNode();
    expect(focus.layerId).toBe("btn_cta");
    expect(focus.status).toBe("AI: Updating style");
  });

  it("mutates layer text and typography", async () => {
    const result = await executeCanvasTool("mutate_layer_text", {
      layerId: "text_title",
      patch: { textContent: "The Next-Gen Canvas Studio", fontSize: 44 },
    });

    expect(result.ok).toBe(true);
    expect(mockEditor.updateNode).toHaveBeenCalledWith("text_title", {
      text: "The Next-Gen Canvas Studio",
      fontSize: 44,
    });
    expect(committedActions).toContain("AI: Mutate Layer Text");
  });

  it("mutates auto-layout properties", async () => {
    const result = await executeCanvasTool("mutate_auto_layout", {
      layerId: "frame_hero",
      config: { enabled: true, direction: "horizontal", gap: 16, padding: 24 },
    });

    expect(result.ok).toBe(true);
    expect(mockEditor.updateNode).toHaveBeenCalledWith("frame_hero", {
      autoLayout: { enabled: true, direction: "horizontal", gap: 16, padding: 24 },
    });
    expect(committedActions).toContain("AI: Mutate Auto Layout");
  });

  it("executes batch mutations across multiple layers in a single commit", async () => {
    const result = await executeCanvasTool("batch_mutate_layers", {
      mutations: [
        { type: "layout", layerId: "frame_hero", patch: { width: 1000 } },
        { type: "text", layerId: "text_title", patch: { textContent: "Updated Title" } },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(mockEditor.updateNodes).toHaveBeenCalled();
    expect(committedActions).toContain("AI: Batch Mutate Layers");
  });

  it("throws agentNodeNotFound when target layer does not exist", async () => {
    await expect(
      executeCanvasTool("mutate_layer_layout", {
        layerId: "non_existent_id",
        patch: { width: 200 },
      }),
    ).rejects.toThrow(TOOL_ERROR.NODE_NOT_FOUND);
  });
});
