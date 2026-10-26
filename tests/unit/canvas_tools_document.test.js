if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}

import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGetState = vi.fn();
vi.mock("../../src/store/design_store.js", () => ({
  useDesignStore: {
    getState: () => mockGetState(),
  },
}));

import {
  CANVAS_TOOL_SCHEMAS,
  EXECUTORS,
  executeCanvasTool,
} from "../../src/canvas/agent/canvas_tools.js";
import {
  newDocument,
  DOCUMENT_TOOL_SCHEMAS,
  DOCUMENT_TOOL_EXECUTORS,
} from "../../src/canvas/agent/canvas_tools_document.js";

describe("canvas_tools_document", () => {
  let mockStore;

  beforeEach(() => {
    mockStore = {
      isDirty: false,
      nodes: [],
      newVooProject: vi.fn(),
    };
    mockGetState.mockReturnValue(mockStore);
  });

  describe("schema and executor registration", () => {
    it("includes schema in CANVAS_TOOL_SCHEMAS and executor in EXECUTORS", () => {
      const toolSchema = CANVAS_TOOL_SCHEMAS.find(
        (s) => s.type === "function" && s.function?.name === "new_document",
      );
      expect(toolSchema).toBeDefined();
      expect(toolSchema.function.description).toBe(
        "Create and open a new blank VOO design document. Fails if the current document has unsaved changes unless force is true.",
      );

      const props = toolSchema.function.parameters.properties;
      expect(props.width).toBeDefined();
      expect(props.width.type).toBe("number");
      expect(props.height).toBeDefined();
      expect(props.height.type).toBe("number");
      expect(props.name).toBeDefined();
      expect(props.name.type).toBe("string");
      expect(props.force).toBeDefined();
      expect(props.force.type).toBe("boolean");

      expect(EXECUTORS.new_document).toBeDefined();
      expect(EXECUTORS.new_document).toBe(newDocument);
      expect(DOCUMENT_TOOL_EXECUTORS.new_document).toBe(newDocument);
      expect(DOCUMENT_TOOL_SCHEMAS[0].function.name).toBe("new_document");
    });
  });

  describe("document creation", () => {
    it("creates a document when none has content (empty nodes array)", async () => {
      const result = await executeCanvasTool("new_document", {
        width: 1920,
        height: 1080,
        name: "Dashboard",
      });

      expect(result).toEqual({
        ok: true,
        width: 1920,
        height: 1080,
        name: "Dashboard",
      });
      expect(mockStore.newVooProject).toHaveBeenCalledTimes(1);
      expect(mockStore.newVooProject).toHaveBeenCalledWith({
        label: "Dashboard",
        width: 1920,
        height: 1080,
      });
    });

    it("creates a document using default parameters when none provided", async () => {
      const result = await executeCanvasTool("new_document", {});

      expect(result).toEqual({
        ok: true,
        width: 1440,
        height: 900,
        name: "Untitled",
      });
      expect(mockStore.newVooProject).toHaveBeenCalledWith({
        label: "Untitled",
        width: 1440,
        height: 900,
      });
    });

    it("creates a document when current page has no layer content", async () => {
      mockStore.nodes = [
        {
          id: "page-1",
          type: "imageEditor",
          data: {
            editorDoc: {
              nodes: [],
            },
          },
        },
      ];

      const result = await executeCanvasTool("new_document", {
        name: "Clean Document",
      });

      expect(result).toEqual({
        ok: true,
        width: 1440,
        height: 900,
        name: "Clean Document",
      });
      expect(mockStore.newVooProject).toHaveBeenCalledWith({
        label: "Clean Document",
        width: 1440,
        height: 900,
      });
    });
  });

  describe("unsaved changes protection", () => {
    it("refuses when dirty without force (store.isDirty = true)", async () => {
      mockStore.isDirty = true;
      mockStore.nodes = [];

      const result = await executeCanvasTool("new_document", {
        name: "Rejected",
      });

      expect(result).toEqual({
        ok: false,
        error: "unsaved_changes",
      });
      expect(mockStore.newVooProject).not.toHaveBeenCalled();
    });

    it("refuses when document has standalone nodes without force", async () => {
      mockStore.isDirty = false;
      mockStore.nodes = [{ id: "layer_rect_1", type: "rect" }];

      const result = await executeCanvasTool("new_document", {
        name: "Rejected",
      });

      expect(result).toEqual({
        ok: false,
        error: "unsaved_changes",
      });
      expect(mockStore.newVooProject).not.toHaveBeenCalled();
    });

    it("refuses when document page has layers without force", async () => {
      mockStore.isDirty = false;
      mockStore.nodes = [
        {
          id: "page-1",
          type: "imageEditor",
          data: {
            editorDoc: {
              nodes: [{ id: "shape_1" }],
            },
          },
        },
      ];

      const result = await executeCanvasTool("new_document", {
        name: "Rejected",
      });

      expect(result).toEqual({
        ok: false,
        error: "unsaved_changes",
      });
      expect(mockStore.newVooProject).not.toHaveBeenCalled();
    });

    it("force creates even when document is dirty and has nodes", async () => {
      mockStore.isDirty = true;
      mockStore.nodes = [{ id: "layer_rect_1" }];

      const result = await executeCanvasTool("new_document", {
        name: "Forced Project",
        width: 1600,
        height: 1200,
        force: true,
      });

      expect(result).toEqual({
        ok: true,
        width: 1600,
        height: 1200,
        name: "Forced Project",
      });
      expect(mockStore.newVooProject).toHaveBeenCalledTimes(1);
      expect(mockStore.newVooProject).toHaveBeenCalledWith({
        label: "Forced Project",
        width: 1600,
        height: 1200,
      });
    });
  });

  describe("size validation", () => {
    it("refuses non-positive width", async () => {
      expect(await executeCanvasTool("new_document", { width: 0 })).toEqual({
        ok: false,
        error: "invalid_size",
      });
      expect(await executeCanvasTool("new_document", { width: -100 })).toEqual({
        ok: false,
        error: "invalid_size",
      });
      expect(mockStore.newVooProject).not.toHaveBeenCalled();
    });

    it("refuses non-positive height", async () => {
      expect(await executeCanvasTool("new_document", { height: 0 })).toEqual({
        ok: false,
        error: "invalid_size",
      });
      expect(await executeCanvasTool("new_document", { height: -50 })).toEqual({
        ok: false,
        error: "invalid_size",
      });
      expect(mockStore.newVooProject).not.toHaveBeenCalled();
    });

    it("refuses non-finite numbers", async () => {
      expect(await executeCanvasTool("new_document", { width: Infinity })).toEqual({
        ok: false,
        error: "invalid_size",
      });
      expect(await executeCanvasTool("new_document", { height: NaN })).toEqual({
        ok: false,
        error: "invalid_size",
      });
      expect(mockStore.newVooProject).not.toHaveBeenCalled();
    });

    it("refuses non-number types for width and height", async () => {
      expect(await executeCanvasTool("new_document", { width: "1440" })).toEqual({
        ok: false,
        error: "invalid_size",
      });
      expect(await executeCanvasTool("new_document", { height: null })).toEqual({
        ok: false,
        error: "invalid_size",
      });
      expect(await executeCanvasTool("new_document", { width: {} })).toEqual({
        ok: false,
        error: "invalid_size",
      });
      expect(mockStore.newVooProject).not.toHaveBeenCalled();
    });
  });
});
