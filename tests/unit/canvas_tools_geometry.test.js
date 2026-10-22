if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeCanvasTool } from "../../src/canvas/agent/canvas_tools.js";
import { CANVAS_TOOL_SCHEMAS } from "../../src/canvas/agent/canvas_tools.js";

/** Minimal document stub: canvas elements that record drawImage calls. */
function stubDocumentCanvas({ dataUrl = "data:image/png;base64,out" } = {}) {
  const state = { canvases: [] };
  const documentStub = {
    createElement: (tag) => {
      const canvas = {
        width: 0,
        height: 0,
        dataUrl,
        getContext: () => ({
          drawImage: (source, dx, dy, dw, dh) => {
            canvas.drawArgs = { source, dx, dy, dw, dh };
          },
        }),
        toDataURL: () => canvas.dataUrl,
      };
      state.canvases.push(canvas);
      return canvas;
    },
  };
  globalThis.document = documentStub;
  return state;
}

class MockImage {
  constructor(naturalWidth, naturalHeight) {
    this.naturalWidth = naturalWidth;
    this.naturalHeight = naturalHeight;
    this.onload = null;
    this.onerror = null;
  }
  set src(value) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
}

describe("Canvas Agent Geometry Tools", () => {
  describe("schema registration", () => {
    it("registers the three geometry tools at the END of CANVAS_TOOL_SCHEMAS", () => {
      const names = CANVAS_TOOL_SCHEMAS.map((s) => s.function.name);
      expect(names.slice(-3)).toEqual(["create_path", "place_image", "capture_canvas"]);
      expect(new Set(names).size).toBe(names.length);
    });

    it("requires the core argument per tool", () => {
      const schemas = Object.fromEntries(
        CANVAS_TOOL_SCHEMAS.slice(-3).map((s) => [s.function.name, s.function.parameters]),
      );
      expect(schemas.create_path.required).toEqual(["d"]);
      expect(schemas.place_image.required).toEqual(["url"]);
      expect(schemas.capture_canvas.required).toBeUndefined();
    });
  });

  describe("create_path", () => {
    let mockDoc;
    let mockEditor;

    beforeEach(() => {
      mockDoc = { nodes: [] };
      mockEditor = {
        addPenNode: vi.fn(({ svgD, anchors, x, y, stroke, strokeWidth, fill }) => {
          expect(anchors).toBeUndefined();
          mockDoc.nodes.push({
            id: "pen_1",
            kind: "pen",
            x: x ?? 0,
            y: y ?? 0,
            stroke,
            strokeWidth,
            fill,
          });
          return { nodeId: "pen_1", kind: "pen" };
        }),
        getDoc: () => mockDoc,
        getNode: (id) => mockDoc.nodes.find((n) => n.id === id) || null,
        updateNode: vi.fn((id, patch) => {
          Object.assign(mockDoc.nodes.find((n) => n.id === id), patch);
        }),
        commitEditorDocument: vi.fn(),
      };
      globalThis.window.__vooEditor = mockEditor;
    });

    it("creates a pen node from an SVG path and applies the styling", async () => {
      const result = await executeCanvasTool("create_path", {
        d: "M 10 10 L 90 60 C 40 90, 30 20, 10 10 Z",
        x: 100,
        y: 50,
        fill: "#ff8800",
        stroke: "#222222",
        strokeWidth: 4,
        name: "Swirl",
      });

      expect(result).toEqual({ ok: true, layerId: "pen_1", kind: "pen" });
      expect(mockEditor.addPenNode).toHaveBeenCalledWith({
        svgD: "M 10 10 L 90 60 C 40 90, 30 20, 10 10 Z",
        x: 100,
        y: 50,
        stroke: "#222222",
        strokeWidth: 4,
        fill: "#ff8800",
      });
      expect(mockEditor.updateNode).toHaveBeenCalledWith("pen_1", { name: "Swirl" });
      expect(mockEditor.commitEditorDocument).toHaveBeenCalledWith({ message: "AI: Create path" });
      expect(mockEditor.getDoc().nodes.find((n) => n.id === "pen_1").name).toBe("Swirl");
    });

    it("rejects empty or non-string paths", async () => {
      await expect(executeCanvasTool("create_path", { d: "   " })).rejects.toMatchObject({
        code: "agentInvalidArgs",
      });
      await expect(executeCanvasTool("create_path", { d: 42 })).rejects.toMatchObject({
        code: "agentInvalidArgs",
      });
    });

    it("rejects non-numeric coordinates and style values", async () => {
      await expect(executeCanvasTool("create_path", { d: "M0 0 L1 1", x: "left" })).rejects.toMatchObject({
        code: "agentInvalidArgs",
      });
      await expect(executeCanvasTool("create_path", { d: "M0 0 L1 1", strokeWidth: "thick" })).rejects.toMatchObject({
        code: "agentInvalidArgs",
      });
      await expect(executeCanvasTool("create_path", { d: "M0 0 L1 1", fill: 7 })).rejects.toMatchObject({
        code: "agentInvalidArgs",
      });
    });

    it("errors like other tools when the pen node cannot be created", async () => {
      mockEditor.addPenNode = vi.fn(() => ({ nodeId: null }));
      await expect(executeCanvasTool("create_path", { d: "M0 0 L1 1" })).rejects.toMatchObject({
        code: "agentNodeNotFound",
      });
    });
  });

  describe("place_image", () => {
    let mockEditor;
    let committedMessages;

    beforeEach(() => {
      committedMessages = [];
      mockEditor = {
        insertImage: vi.fn(async (url) => {
          expect(url).toBeTypeOf("string");
          return { id: "img_9", kind: "image", src: url };
        }),
        updateNode: vi.fn(),
        commitEditorDocument: vi.fn(({ message }) => committedMessages.push(message)),
      };
      globalThis.window.__vooEditor = mockEditor;
    });

    it("inserts the image and then pins the exact geometry", async () => {
      const result = await executeCanvasTool("place_image", {
        url: "https://example.com/pic.png",
        x: 40,
        y: 80,
        width: 300,
        height: 200,
        name: "Hero image",
      });

      expect(mockEditor.insertImage).toHaveBeenCalledWith("https://example.com/pic.png");
      expect(mockEditor.updateNode).toHaveBeenCalledWith("img_9", {
        x: 40,
        y: 80,
        width: 300,
        height: 200,
        name: "Hero image",
      });
      expect(committedMessages).toEqual(["AI: Place image"]);
      expect(result).toEqual({
        ok: true,
        layerId: "img_9",
        x: 40,
        y: 80,
        width: 300,
        height: 200,
        name: "Hero image",
      });
    });

    it("skips the geometry patch when only a URL is given", async () => {
      const result = await executeCanvasTool("place_image", { url: "data:image/png;base64,AA==" });

      expect(result).toEqual({ ok: true, layerId: "img_9" });
      expect(mockEditor.updateNode).not.toHaveBeenCalled();
      expect(committedMessages).toEqual(["AI: Place image"]);
    });

    it("rejects empty urls and invalid geometry", async () => {
      await expect(executeCanvasTool("place_image", {})).rejects.toMatchObject({
        code: "agentInvalidArgs",
      });
      await expect(
        executeCanvasTool("place_image", { url: "https://x.com/a.png", width: "wide" }),
      ).rejects.toMatchObject({ code: "agentInvalidArgs" });
      await expect(
        executeCanvasTool("place_image", { url: "https://x.com/a.png", x: -10 }),
      ).resolves.toMatchObject({ ok: true });
      await expect(
        executeCanvasTool("place_image", { url: "https://x.com/a.png", width: -50 }),
      ).rejects.toMatchObject({ code: "agentInvalidArgs" });
    });
  });

  describe("capture_canvas", () => {
    let documentState;

    afterEach(() => {
      delete globalThis.document;
      delete globalThis.Image;
      vi.restoreAllMocks();
    });

    it("captures a whole canvas from exportPngCanvas, downscaled to maxSize", async () => {
      documentState = stubDocumentCanvas({ dataUrl: "data:image/png;base64,scaled" });
      const fullPage = {
        width: 2048,
        height: 1024,
        toDataURL: vi.fn(() => "data:image/png;base64,full"),
      };
      globalThis.window.__vooEditor = { exportPngCanvas: vi.fn(() => fullPage) };

      const result = await executeCanvasTool("capture_canvas", {});

      const scaled = documentState.canvases[0];
      expect(scaled.drawArgs.dw).toBe(1024);
      expect(scaled.drawArgs.dh).toBe(512);
      expect(result).toEqual({ ok: true, dataUrl: "data:image/png;base64,scaled", width: 1024, height: 512 });
    });

    it("honors a custom maxSize and defaults to 1024 only when unset", async () => {
      documentState = stubDocumentCanvas();
      globalThis.window.__vooEditor = { exportPngCanvas: () => ({ width: 2000, height: 1000, toDataURL: () => "x" }) };

      const png = await executeCanvasTool("capture_canvas", { maxSize: 500 });

      expect(documentState.canvases.at(-1).drawArgs.dw).toBe(500);
      expect(documentState.canvases.at(-1).drawArgs.dh).toBe(250);
      expect(png.width).toBe(500);
      expect(png.height).toBe(250);
    });

    it("returns the canvas untouched when it already fits maxSize", async () => {
      const smallCanvas = {
        width: 512,
        height: 256,
        toDataURL: vi.fn(() => "data:image/png;base64,asis"),
      };
      globalThis.window.__vooEditor = { exportPngCanvas: vi.fn(() => smallCanvas) };

      const result = await executeCanvasTool("capture_canvas", {});

      expect(result).toEqual({ ok: true, dataUrl: "data:image/png;base64,asis", width: 512, height: 256 });
      expect(smallCanvas.toDataURL).toHaveBeenCalledWith("image/png");
      expect(globalThis.document).toBeUndefined();
    });

    it("captures a single image layer via exportNodePng, decoding and downscaling", async () => {
      documentState = stubDocumentCanvas({ dataUrl: "data:image/png;base64,layerPng" });
      globalThis.Image = MockImage.bind(null, 3000, 1000);
      globalThis.window.__vooEditor = {
        exportPngCanvas: vi.fn(),
        exportNodePng: vi.fn(() => "data:image/png;base64,layerFullsize"),
      };

      const result = await executeCanvasTool("capture_canvas", { layerId: "img_9" });

      expect(globalThis.window.__vooEditor.exportPngCanvas).not.toHaveBeenCalled();
      const out = documentState.canvases[0];
      expect(out.drawArgs.dw).toBe(1024);
      expect(out.drawArgs.dh).toBe(341);
      expect(result).toEqual({ ok: true, dataUrl: "data:image/png;base64,layerPng", width: 1024, height: 341 });
    });

    it("returns the layer data URL as-is when the layer fits maxSize", async () => {
      globalThis.Image = MockImage.bind(null, 400, 200);
      globalThis.window.__vooEditor = {
        exportNodePng: vi.fn(() => "data:image/png;base64,tiny"),
      };

      const result = await executeCanvasTool("capture_canvas", { layerId: "img_9", maxSize: 1024 });

      expect(result).toEqual({ ok: true, dataUrl: "data:image/png;base64,tiny", width: 400, height: 200 });
    });

    it("reports agentNodeNotFound for an unknown layerId", async () => {
      globalThis.window.__vooEditor = { exportNodePng: vi.fn(() => null) };
      await expect(
        executeCanvasTool("capture_canvas", { layerId: "missing" }),
      ).rejects.toMatchObject({ code: "agentNodeNotFound" });
    });

    it("fails fast when the editor cannot rasterize anything", async () => {
      globalThis.window.__vooEditor = { exportPngCanvas: vi.fn(() => null) };
      await expect(executeCanvasTool("capture_canvas", {})).rejects.toMatchObject({
        code: "agentCaptureFailed",
      });
    });
  });

  describe("via the shared dispatcher", () => {
    beforeEach(() => {
      globalThis.window.__vooEditor = {
        addPenNode: () => ({ nodeId: "pen_d", kind: "pen" }),
        updateNode: vi.fn(),
        commitEditorDocument: vi.fn(),
      };
    });

    it("dispatches create_path / place_image / capture_canvas by name", async () => {
      const path = await executeCanvasTool("create_path", { d: "M0 0 L8 8" });
      expect(path.layerId).toBe("pen_d");

      globalThis.window.__vooEditor.insertImage = vi.fn(async () => ({ id: "img_d" }));
      const image = await executeCanvasTool("place_image", { url: "https://x.com/b.png" });
      expect(image.layerId).toBe("img_d");

      globalThis.window.__vooEditor.exportPngCanvas = () => ({
        width: 100,
        height: 50,
        toDataURL: () => "data:image/png;base64,ok",
      });
      const captured = await executeCanvasTool("capture_canvas", {});
      expect(captured.ok).toBe(true);
      expect(captured.dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it("still rejects unknown tool names", async () => {
      await expect(executeCanvasTool("create_triangle", {})).rejects.toThrow("unknown tool");
    });
  });
});
