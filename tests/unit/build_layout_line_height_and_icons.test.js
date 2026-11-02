import { describe, expect, it, vi } from "vitest";
import { textLineHeight } from "../../src/canvas/editor/text_metrics.js";
import { elementFor } from "../../src/canvas/editor/skia_adapter_elements.js";
import { reflowAutoLayout } from "../../src/canvas/editor/scene_auto_layout.js";
import {
  buildLayout,
  createLayoutNode,
  BUILD_LAYOUT_SCHEMA,
} from "../../src/canvas/agent/canvas_tools_build_layout.js";

function createMockEditor() {
  const nodes = new Map();
  const add = vi.fn(({ x, y }) => {
    const node = { id: `node-${nodes.size}`, x, y };
    nodes.set(node.id, node);
    return node;
  });
  const addText = vi.fn(({ x, y }, text) => {
    const node = { id: `node-${nodes.size}`, x, y, text, kind: "text" };
    nodes.set(node.id, node);
    return node;
  });
  const addPen = vi.fn(({ svgD, x = 0, y = 0, stroke, strokeWidth, fill }) => {
    const node = { id: `node-${nodes.size}`, kind: "path", svgD, x, y, stroke, strokeWidth, fill };
    nodes.set(node.id, node);
    return { nodeId: node.id, kind: "path" };
  });
  return {
    nodes,
    getDoc: () => ({ nodes: Array.from(nodes.values()) }),
    getDocument: () => ({ nodes: Array.from(nodes.values()) }),
    setDoc: vi.fn((next) => {
      nodes.clear();
      for (const n of next.nodes ?? []) nodes.set(n.id, n);
    }),
    getNode: (id) => nodes.get(id),
    addFrameAt: add,
    addRectAt: add,
    addEllipseAt: add,
    addTextAt: addText,
    addPenNode: addPen,
    updateNode: vi.fn((id, patch) => {
      const existing = nodes.get(id) ?? {};
      const updated = Object.assign(existing, patch);
      nodes.set(id, updated);
      return updated;
    }),
    commitEditorDocument: vi.fn(),
    beginBatch: vi.fn(),
    endBatch: vi.fn(),
  };
}

describe("build_layout lineHeight contract and Lucide icons", () => {
  describe("a) fontSize 16 + lineHeight 24 resolves to 24px line height (ratio 1.5), not 384px", () => {
    it("calculates 24px line height from textLineHeight rather than 384px", () => {
      const node = { fontSize: 16, lineHeight: 24 };
      const lh = textLineHeight(node);
      expect(lh).toBe(24);
      expect(lh).not.toBe(384);
    });

    it("normalizes lineHeight > 3 to ratio (24/16 = 1.5) in createLayoutNode", () => {
      const editor = createMockEditor();
      const node = {
        type: "text",
        name: "Headline",
        x: 0,
        y: 0,
        width: 200,
        height: 24,
        fontSize: 16,
        lineHeight: 24,
      };
      const id = createLayoutNode(editor, node);
      const created = editor.nodes.get(id);
      expect(created.lineHeight).toBe(1.5);
      expect(node.lineHeight).toBe(1.5);
    });

    it("normalizes Skia element lineHeight to 24px CanvasKit pixels rather than 384px", () => {
      const node = {
        id: "t1",
        kind: "text",
        fontSize: 16,
        lineHeight: 24,
        bounds: { x: 0, y: 0, width: 200, height: 24 },
      };
      const el = elementFor(node, 0, 0, 0);
      expect(el.lineHeight).toBe(24);
      expect(el.lineHeight).not.toBe(384);
    });
  });

  describe("b) fontSize 14 + lineHeight 21 resolves to 21px line height", () => {
    it("calculates 21px line height from textLineHeight", () => {
      const node = { fontSize: 14, lineHeight: 21 };
      expect(textLineHeight(node)).toBe(21);
    });

    it("normalizes lineHeight 21 to ratio 1.5 in createLayoutNode", () => {
      const editor = createMockEditor();
      const node = {
        type: "text",
        name: "Body Text",
        x: 0,
        y: 0,
        width: 180,
        height: 21,
        fontSize: 14,
        lineHeight: 21,
      };
      const id = createLayoutNode(editor, node);
      const created = editor.nodes.get(id);
      expect(created.lineHeight).toBe(1.5);
    });

    it("normalizes Skia element lineHeight to 21px for fontSize 14 + lineHeight 21", () => {
      const node = {
        id: "t2",
        kind: "text",
        fontSize: 14,
        lineHeight: 21,
        bounds: { x: 0, y: 0, width: 180, height: 21 },
      };
      const el = elementFor(node, 0, 0, 0);
      expect(el.lineHeight).toBe(21);
    });
  });

  describe("c) Profile Card with autoLayout stays compact (~148px) with 16/24 text, not 972px", () => {
    it("keeps Profile Card vertical autoLayout height compact (~148px) instead of blowing up to 972px", () => {
      // With the ratio normalization, 16/24 text has line height 24px
      const titleHeight = textLineHeight({ fontSize: 16, lineHeight: 24 }); // 24
      const bioHeight = 20; // compact bio line
      const avatarHeight = 48;
      const paddingTop = 16;
      const paddingBottom = 16;
      const gap = 12;

      // Card layout: padding (16) + avatar (48) + gap (12) + title (24) + gap (12) + bio (20) + padding (16) = 148px
      const compactDoc = {
        nodes: [
          {
            id: "card",
            kind: "group",
            type: "frame",
            x: 0,
            y: 0,
            width: 280,
            height: 50,
            autoLayout: {
              direction: "vertical",
              gap,
              padding: { top: paddingTop, right: 16, bottom: paddingBottom, left: 16 },
              heightMode: "hug",
            },
          },
          { id: "avatar", parentId: "card", kind: "rect", x: 0, y: 0, width: 48, height: avatarHeight },
          { id: "title", parentId: "card", kind: "text", x: 0, y: 0, width: 200, height: titleHeight },
          { id: "bio", parentId: "card", kind: "text", x: 0, y: 0, width: 200, height: bioHeight },
        ],
      };

      const resolved = reflowAutoLayout(compactDoc);
      const card = resolved.nodes.find((n) => n.id === "card");
      expect(card.height).toBe(148);
      expect(card.height).not.toBe(972);

      // Contrast with unnormalized calculation where 16/24 text would be 384px each:
      const buggedTitleHeight = 16 * 24; // 384px
      const buggedBioHeight = 16 * 24; // 384px
      const buggedButtonHeight = 88;
      const buggedDoc = {
        nodes: [
          {
            id: "card",
            kind: "group",
            type: "frame",
            x: 0,
            y: 0,
            width: 280,
            height: 50,
            autoLayout: {
              direction: "vertical",
              gap: 12,
              padding: { top: 16, right: 16, bottom: 16, left: 16 },
              heightMode: "hug",
            },
          },
          { id: "avatar", parentId: "card", kind: "rect", x: 0, y: 0, width: 48, height: 48 },
          { id: "title", parentId: "card", kind: "text", x: 0, y: 0, width: 200, height: buggedTitleHeight },
          { id: "bio", parentId: "card", kind: "text", x: 0, y: 0, width: 200, height: buggedBioHeight },
          { id: "btn", parentId: "card", kind: "rect", x: 0, y: 0, width: 100, height: buggedButtonHeight },
        ],
      };
      const buggedResolved = reflowAutoLayout(buggedDoc);
      const buggedCard = buggedResolved.nodes.find((n) => n.id === "card");
      expect(buggedCard.height).toBe(972);
    });
  });

  describe("d) LLM tolerance: node with layout: 'none', id or backgroundColor does not error", () => {
    it("handles id and backgroundColor as fill when fill is not specified", () => {
      const editor = createMockEditor();
      const node = {
        id: "custom-box-id",
        type: "rect",
        name: "Background Box",
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        backgroundColor: "#6366f1",
      };
      const id = createLayoutNode(editor, node);
      const created = editor.nodes.get(id);
      expect(created.fill).toBe("#6366f1");
    });

    it("preserves explicit fill over backgroundColor", () => {
      const editor = createMockEditor();
      const node = {
        id: "box-2",
        type: "rect",
        name: "Box",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        fill: "#10b981",
        backgroundColor: "#ef4444",
      };
      const id = createLayoutNode(editor, node);
      expect(editor.nodes.get(id).fill).toBe("#10b981");
    });

    it("accepts layout: 'none' without agentInvalidArgs error", () => {
      const editor = createMockEditor();
      const node = {
        id: "card-root",
        type: "frame",
        name: "Root Card",
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        layout: "none",
      };
      expect(() => createLayoutNode(editor, node)).not.toThrow();
    });

    it("uses node.layout when autoLayout does not specify direction", () => {
      const editor = createMockEditor();
      const node = {
        type: "frame",
        name: "Column",
        x: 0,
        y: 0,
        width: 200,
        height: 300,
        layout: "vertical",
        autoLayout: { gap: 16 },
      };
      const id = createLayoutNode(editor, node);
      expect(editor.nodes.get(id).autoLayout).toMatchObject({
        direction: "vertical",
        gap: 16,
      });
    });

    it("allows id, layout: 'none', and backgroundColor in BUILD_LAYOUT schema and validation", () => {
      const editor = createMockEditor();
      const prev = globalThis.window?.__vooEditor;
      if (!globalThis.window) globalThis.window = {};
      globalThis.window.__vooEditor = editor;

      try {
        const res = buildLayout({
          nodes: [
            {
              id: "profile-card-layer",
              type: "rect",
              name: "Card",
              x: 10,
              y: 10,
              width: 200,
              height: 100,
              layout: "none",
              backgroundColor: "#2563eb",
            },
          ],
        });
        expect(res.count).toBe(1);
        expect(editor.nodes.get(res.created[0].id).fill).toBe("#2563eb");
      } finally {
        globalThis.window.__vooEditor = prev;
      }
    });
  });

  describe("e) type: 'icon' + icon: 'user-plus' creates layer with Lucide icon metadata", () => {
    it("creates vector path node and records icon: 'user-plus' metadata", () => {
      const editor = createMockEditor();
      const node = {
        type: "icon",
        name: "User Plus Icon",
        icon: "user-plus",
        x: 20,
        y: 30,
        width: 24,
        height: 24,
        stroke: "#ffffff",
        strokeWidth: 2,
      };
      const id = createLayoutNode(editor, node);
      const created = editor.nodes.get(id);

      expect(created).toBeDefined();
      expect(created.icon).toBe("user-plus");
      expect(created.svgD).toBeDefined();
      expect(created.svgD.length).toBeGreaterThan(10);
      expect(node.icon).toBe("user-plus");
    });

    it("builds tree with type: 'icon' via buildLayout", () => {
      const editor = createMockEditor();
      const prev = globalThis.window?.__vooEditor;
      if (!globalThis.window) globalThis.window = {};
      globalThis.window.__vooEditor = editor;

      try {
        const res = buildLayout({
          nodes: [
            {
              type: "icon",
              name: "Add User",
              icon: "user-plus",
              x: 0,
              y: 0,
              width: 32,
              height: 32,
              stroke: "#000000",
            },
          ],
        });
        expect(res.count).toBe(1);
        expect(res.created[0]).toMatchObject({
          name: "Add User",
          type: "icon",
        });
        const layer = editor.nodes.get(res.created[0].id);
        expect(layer.icon).toBe("user-plus");
      } finally {
        globalThis.window.__vooEditor = prev;
      }
    });

    it("rejects unrecognized icon names in validation", () => {
      const editor = createMockEditor();
      const prev = globalThis.window?.__vooEditor;
      if (!globalThis.window) globalThis.window = {};
      globalThis.window.__vooEditor = editor;

      try {
        expect(() =>
          buildLayout({
            nodes: [
              {
                type: "icon",
                name: "Unknown",
                icon: "non-existent-lucide-icon-12345",
                x: 0,
                y: 0,
                width: 24,
                height: 24,
              },
            ],
          })
        ).toThrow(/not a recognized Lucide icon/);
      } finally {
        globalThis.window.__vooEditor = prev;
      }
    });

    it("documents Lucide icons in BUILD_LAYOUT_SCHEMA", () => {
      expect(BUILD_LAYOUT_SCHEMA.function.description).toContain("icon");
      expect(BUILD_LAYOUT_SCHEMA.function.description).toContain("lineHeight");
    });
  });
});
