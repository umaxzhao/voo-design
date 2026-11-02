import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Polyfill window and CustomEvent for Node.js test environment
if (typeof globalThis.CustomEvent === "undefined") {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, eventInitDict = {}) {
      this.type = type;
      this.detail = eventInitDict.detail || null;
    }
  };
}

const windowListeners = new Map();
if (typeof globalThis.window === "undefined") {
  globalThis.window = {
    addEventListener: (type, fn) => {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      if (windowListeners.has(type)) windowListeners.get(type).delete(fn);
    },
    dispatchEvent: (event) => {
      const set = windowListeners.get(event?.type);
      if (set) {
        for (const fn of Array.from(set)) fn(event);
      }
      return true;
    },
  };
}

// Mock i18n
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({
    t: (key) => key,
    locale: "en",
    toggleLocale: () => {},
  }),
}));

import EditorContextualAiInput, {
  extractNodeContext,
} from "../../src/canvas/components/editor_contextual_ai_input.jsx";
import { dispatchToAgent } from "../../src/canvas/components/dispatch_to_agent.js";
import { useDesignStore } from "../../src/store/design_store.js";

describe("Contextual Island & Agent Dispatch (Pen App Style)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Tier 1: Context Extraction (extractNodeContext)", () => {
    it("correctly extracts metadata for image nodes", () => {
      const node = {
        id: "img-42",
        kind: "image",
        name: "Hero Photo",
        x: 100.4,
        y: 200.8,
        width: 800.2,
        height: 600.1,
        url: "https://example.com/hero.jpg",
      };

      const ctx = extractNodeContext(node);
      expect(ctx).toBeDefined();
      expect(ctx.nodeId).toBe("img-42");
      expect(ctx.layerType).toBe("image");
      expect(ctx.name).toBe("Hero Photo");
      expect(ctx.badge).toBe("@Hero Photo");
      expect(ctx.dimensions).toEqual({ x: 100, y: 201, width: 800, height: 600 });
      expect(ctx.imageAsset).toBe("https://example.com/hero.jpg");
    });

    it("correctly extracts metadata for frames and artboards", () => {
      const node = {
        id: "frame-1",
        kind: "rect",
        isFrame: true,
        name: "Dashboard Card",
        x: 0,
        y: 0,
        width: 400,
        height: 300,
      };

      const ctx = extractNodeContext(node);
      expect(ctx.layerType).toBe("frame");
      expect(ctx.name).toBe("Dashboard Card");
      expect(ctx.badge).toBe("@Dashboard Card");
      expect(ctx.dimensions.width).toBe(400);
      expect(ctx.dimensions.height).toBe(300);
    });

    it("correctly extracts metadata for text nodes", () => {
      const node = {
        id: "text-99",
        kind: "text",
        name: "Headline",
        text: "Make Design Fast",
        x: 50,
        y: 80,
        width: 320,
        height: 48,
      };

      const ctx = extractNodeContext(node);
      expect(ctx.layerType).toBe("text");
      expect(ctx.textContent).toBe("Make Design Fast");
      expect(ctx.badge).toBe("@Headline");
    });

    it("correctly extracts metadata for shape nodes", () => {
      const node = {
        id: "shape-5",
        kind: "ellipse",
        name: "Avatar Circle",
        x: 10,
        y: 10,
        width: 64,
        height: 64,
      };

      const ctx = extractNodeContext(node);
      expect(ctx.layerType).toBe("shape");
      expect(ctx.badge).toBe("@Avatar Circle");
    });

    it("returns null when node is null or undefined", () => {
      expect(extractNodeContext(null)).toBeNull();
      expect(extractNodeContext(undefined)).toBeNull();
    });
  });

  describe("Tier 2: Agent Dispatching (dispatchToAgent)", () => {
    it("dispatches custom DOM events and invokes store methods", () => {
      const dispatchSpy = vi.fn();
      window.addEventListener("voo:agent-dispatch", dispatchSpy);

      const promptSpy = vi.fn();
      window.addEventListener("voo:agent-prompt", promptSpy);

      const openSpy = vi.fn();
      window.addEventListener("voo:open-agent-panel", openSpy);

      const storeDispatch = vi.fn();
      const storeOpen = vi.fn();
      useDesignStore.setState({
        dispatchToAgent: storeDispatch,
        setAgentOpen: storeOpen,
      });

      const context = {
        nodeId: "test-node",
        layerType: "image",
        name: "Photo",
        badge: "@Photo",
      };

      const payload = dispatchToAgent({
        prompt: "Vectorize this photo",
        intent: "vectorize",
        tool: "vectorize",
        context,
        autoSend: true,
      });

      expect(payload.prompt).toBe("Vectorize this photo");
      expect(payload.intent).toBe("vectorize");
      expect(payload.tool).toBe("vectorize");
      expect(payload.context).toBe(context);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(dispatchSpy.mock.calls[0][0].detail).toEqual(payload);

      expect(promptSpy).not.toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalledTimes(1);

      expect(storeDispatch).toHaveBeenCalledWith(payload);
      expect(storeOpen).toHaveBeenCalledWith(true);

      window.removeEventListener("voo:agent-dispatch", dispatchSpy);
      window.removeEventListener("voo:agent-prompt", promptSpy);
      window.removeEventListener("voo:open-agent-panel", openSpy);
    });

    it("handles empty prompt gracefully and sets defaults", () => {
      const payload = dispatchToAgent({
        intent: "rewrite",
        context: { name: "Text", badge: "@Text" },
      });

      expect(payload.prompt).toBe("rewrite");
      expect(payload.intent).toBe("rewrite");
      expect(payload.autoSend).toBe(true);
    });
  });

  describe("Tier 3: EditorContextualAiInput Component", () => {
    it("renders contextual placeholder without a decorative sparkles icon", () => {
      const node = { id: "1", kind: "image", name: "Cover" };
      const html = renderToStaticMarkup(
        <EditorContextualAiInput selectedNode={node} />
      );

      expect(html).toContain('data-testid="editor-contextual-ai-form"');
      expect(html).toContain('placeholder="Ask AI to edit @Cover..."');
      expect(html).not.toContain("lucide-sparkles");
    });

    it("renders contextual placeholder for text and frame nodes", () => {
      const textNode = { id: "2", kind: "text", name: "Title" };
      const textHtml = renderToStaticMarkup(
        <EditorContextualAiInput selectedNode={textNode} />
      );
      expect(textHtml).toContain('placeholder="Ask AI to rewrite @Title..."');

      const frameNode = { id: "3", isFrame: true, name: "Card" };
      const frameHtml = renderToStaticMarkup(
        <EditorContextualAiInput selectedNode={frameNode} />
      );
      expect(frameHtml).toContain('placeholder="Ask AI to layout @Card..."');
    });

    it("renders contextual placeholder for shape nodes", () => {
      const shapeNode = { id: "4", kind: "rect", name: "Box" };
      const shapeHtml = renderToStaticMarkup(
        <EditorContextualAiInput selectedNode={shapeNode} />
      );
      expect(shapeHtml).toContain('placeholder="Ask AI to modify @Box..."');
    });

    it("renders fallback placeholder when no node is selected", () => {
      const html = renderToStaticMarkup(
        <EditorContextualAiInput selectedNode={null} />
      );
      expect(html).toContain('placeholder="Ask AI to edit selection..."');
    });

    it("renders submit button with arrow up icon and disabled attribute when empty", () => {
      const node = { id: "1", kind: "text", name: "Hero" };
      const html = renderToStaticMarkup(
        <EditorContextualAiInput selectedNode={node} />
      );
      expect(html).toContain('data-testid="editor-contextual-ai-submit"');
      expect(html).toContain("disabled");
      expect(html).toContain("bg-[#E5B2FF]");
    });
  });

  describe("Tier 5: Contextual AI Actions Contract & Dispatch Payloads", () => {
    it("dispatches image actions with correct intent, tool, and metadata", () => {
      const node = {
        id: "img-9",
        kind: "image",
        name: "Landscape",
        x: 0,
        y: 0,
        width: 1200,
        height: 800,
        url: "https://example.com/landscape.png",
      };

      const context = extractNodeContext(node);
      expect(context.badge).toBe("@Landscape");

      const vectorizePayload = dispatchToAgent({
        prompt: `Vectorize @${context.name} into clean editable SVG paths`,
        intent: "vectorize",
        tool: "vectorize",
        context,
        autoSend: true,
      });

      expect(vectorizePayload.tool).toBe("vectorize");
      expect(vectorizePayload.intent).toBe("vectorize");
      expect(vectorizePayload.prompt).toContain("@Landscape");
      expect(vectorizePayload.context.dimensions.width).toBe(1200);

      const mattingPayload = dispatchToAgent({
        prompt: `Remove background and isolate subject from @${context.name}`,
        intent: "remove_background",
        tool: "matting",
        context,
        autoSend: true,
      });

      expect(mattingPayload.tool).toBe("matting");
      expect(mattingPayload.intent).toBe("remove_background");
    });

    it("dispatches frame and text actions with corresponding tool names", () => {
      const frameNode = {
        id: "frame-card",
        isFrame: true,
        name: "Pricing Card",
        width: 320,
        height: 480,
      };

      const frameContext = extractNodeContext(frameNode);
      const framePayload = dispatchToAgent({
        prompt: `Generate responsive layout structure in @${frameContext.name}`,
        intent: "generate_layout",
        tool: "generate_layout",
        context: frameContext,
        autoSend: true,
      });

      expect(framePayload.tool).toBe("generate_layout");
      expect(framePayload.context.layerType).toBe("frame");
      expect(framePayload.context.badge).toBe("@Pricing Card");

      const textNode = {
        id: "txt-1",
        kind: "text",
        name: "Call to Action",
        text: "Click Here Now",
      };

      const textContext = extractNodeContext(textNode);
      const textPayload = dispatchToAgent({
        prompt: `Rewrite and polish @${textContext.name} with engaging tone`,
        intent: "rewrite",
        tool: "rewrite",
        context: textContext,
        autoSend: true,
      });

      expect(textPayload.tool).toBe("rewrite");
      expect(textPayload.context.layerType).toBe("text");
      expect(textPayload.context.textContent).toBe("Click Here Now");
    });
  });
});
