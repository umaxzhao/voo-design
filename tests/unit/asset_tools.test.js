import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateVector,
  stockImage,
  vectorizeImage,
  transformPathData,
} from "../../src/canvas/agent/canvas_tools_assets.js";

function installEditor(overrides = {}) {
  const created = [];
  const updates = [];
  const editor = {
    getDoc: () => ({ width: 800, height: 600, nodes: overrides.nodes ?? [] }),
    addRectAt: ({ x, y }) => {
      const node = { id: `rect-${created.length + 1}`, x, y };
      created.push(node);
      return node;
    },
    addPenNode: ({ svgD, x, y, fill }) => {
      const node = { id: `path-${created.length + 1}`, svgD, x, y, fill };
      created.push(node);
      return { nodeId: node.id };
    },
    updateNode: (id, patch) => updates.push({ id, patch }),
    selectExactly: () => {},
    groupSelection: () => ({ id: "group-1" }),
    getSelectedId: () => "group-1",
    insertImage: async (url) => {
      const node = { id: `image-${created.length + 1}`, url };
      created.push(node);
      return node;
    },
    commitEditorDocument: () => {},
    ...overrides,
  };
  globalThis.window = globalThis.window ?? {};
  globalThis.window.__vooEditor = editor;
  return { editor, created, updates };
}

describe("asset tools", () => {
  afterEach(() => {
    if (globalThis.window) delete globalThis.window.__vooEditor;
  });

  describe("transformPathData", () => {
    it("translates and scales absolute M/L pairs and keeps Z", () => {
      expect(transformPathData("M0,0L10,10Z", { x: 5, y: 7, scaleX: 2, scaleY: 3 })).toBe("M5,7L25,37Z");
    });
    it("returns an empty string for empty input", () => {
      expect(transformPathData("")).toBe("");
      expect(transformPathData(null)).toBe("");
    });
  });

  describe("generate_vector", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="30" height="20" fill="#ff0000"/><path d="M50 50 L80 80 L50 80 Z" fill="#00ff00"/></svg>';

    it("lands model SVG as editable nodes", async () => {
      const { created } = installEditor();
      const result = await generateVector(
        { prompt: "a red mark", width: 200, height: 200 },
        { llm: { complete: async () => svg } },
      );
      expect(result.layerIds.length).toBe(2);
      expect(result.groupId).toBe("group-1");
      expect(created.length).toBe(2);
      expect(result.warnings).toBeInstanceOf(Array);
    });

    it("accepts fenced SVG output", async () => {
      installEditor();
      const result = await generateVector(
        { prompt: "mark" },
        { llm: { complete: async () => "```svg\n" + svg + "\n```" } },
      );
      expect(result.layerIds.length).toBe(2);
    });

    it("errors clearly when no API text model is available", async () => {
      installEditor();
      await expect(generateVector({ prompt: "mark" }, {})).rejects.toMatchObject({
        code: "agentVectorNeedsApiModel",
        message: expect.stringContaining("build_layout path nodes"),
      });
    });

    it("errors when the model returns no SVG", async () => {
      installEditor();
      await expect(
        generateVector({ prompt: "mark" }, { llm: { complete: async () => "I cannot draw that." } }),
      ).rejects.toMatchObject({ code: "agentVectorEmpty" });
    });
  });

  describe("vectorize_image", () => {
    function squareBitmap(size = 8, rgba = [255, 0, 0, 255]) {
      const data = new Uint8Array(size * size * 4);
      for (let index = 0; index < size * size; index += 1) {
        data.set(rgba, index * 4);
      }
      return { data, width: size, height: size };
    }

    it("traces an image layer into paths", async () => {
      const { created } = installEditor({
        nodes: [{ id: "img", kind: "image", src: "data:image/png;base64,xx", x: 0, y: 0, width: 8, height: 8 }],
      });
      const result = await vectorizeImage(
        { layerId: "img", colors: 4 },
        { decodeImage: async () => squareBitmap(8) },
      );
      expect(result.layerIds.length).toBeGreaterThanOrEqual(1);
      expect(result.paths).toBeGreaterThanOrEqual(1);
      expect(created.some((node) => node.id.startsWith("path-"))).toBe(true);
    });

    it("requires a raster source", async () => {
      installEditor({ nodes: [{ id: "img", kind: "image", x: 0, y: 0, width: 8, height: 8 }] });
      await expect(vectorizeImage({ layerId: "img" }, { decodeImage: async () => squareBitmap() })).rejects.toMatchObject({
        code: "agentImageSourceRequired",
      });
    });

    it("reports an unknown layer", async () => {
      installEditor();
      await expect(vectorizeImage({ layerId: "missing" }, { decodeImage: async () => squareBitmap() })).rejects.toMatchObject({
        code: "agentNodeNotFound",
      });
    });
  });

  describe("stock_image", () => {
    function installFetch(payload) {
      return async (url) => ({
        ok: true,
        status: 200,
        json: async () => {
          expect(String(url)).toContain("api.openverse.org");
          expect(String(url)).toContain("q=fern");
          return payload;
        },
      });
    }

    it("places Openverse results and records attribution", async () => {
      installEditor();
      const result = await stockImage(
        { query: "fern", count: 2 },
        {
          fetch: installFetch({
            results: [
              { url: "https://example.com/a.jpg", title: "Fern A", creator: "Ann", license: "cc0", foreign_landing_url: "https://example.com/a" },
              { url: "https://example.com/b.jpg", title: "Fern B", creator: "Bob", license: "by", foreign_landing_url: "https://example.com/b" },
            ],
          }),
        },
      );
      expect(result.layerIds.length).toBe(2);
      expect(result.attributions).toHaveLength(2);
      expect(result.attributions[0].creator).toBe("Ann");
    });

    it("errors when the search has no results", async () => {
      installEditor();
      await expect(
        stockImage({ query: "fern" }, { fetch: installFetch({ results: [] }) }),
      ).rejects.toMatchObject({ code: "agentStockUnavailable" });
    });
  });
});
