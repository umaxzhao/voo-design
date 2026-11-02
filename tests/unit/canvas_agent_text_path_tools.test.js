import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CANVAS_TOOL_SCHEMAS,
  executeCanvasTool,
} from "../../src/canvas/agent/canvas_tools.js";

function makeDoc(nodes = []) {
  return { id: "doc_1", canvasId: "canvas_1", width: 640, height: 480, nodes };
}

describe("text/path tool schemas", () => {
  it("exposes the text and path tools", () => {
    const names = CANVAS_TOOL_SCHEMAS.map((schema) => schema.function.name);
    for (const name of ["set_text_range_style", "get_path_nodes", "edit_path_nodes"]) {
      expect(names).toContain(name);
    }
  });
});

describe("text range style tool", () => {
  let doc;
  let editor;
  let commits;

  beforeEach(() => {
    commits = [];
    doc = makeDoc([
      { id: "text", kind: "text", text: "Hello world", x: 0, y: 0 },
    ]);
    editor = {
      getDoc: vi.fn(() => doc),
      getDocument: vi.fn(() => doc),
      getNode: vi.fn((id) => doc.nodes.find((node) => node.id === id) ?? null),
      setDoc: vi.fn((next, options) => {
        doc = next;
        commits.push(options?.name ?? "commit");
      }),
    };
    globalThis.window = { __vooEditor: editor };
  });

  it("stores a styled run for the requested range", async () => {
    const result = await executeCanvasTool("set_text_range_style", {
      layerId: "text",
      start: 0,
      end: 5,
      style: { fontWeight: "bold" },
    });

    expect(result.ok).toBe(true);
    const node = doc.nodes.find((n) => n.id === "text");
    expect(node.textRuns).toEqual([
      { start: 0, end: 5, style: { fontWeight: "bold" } },
      { start: 5, end: 11, style: {} },
    ]);
    expect(commits).toContain("AI: Set text range style");
  });

  it("splits and merges runs when applying overlapping styles", async () => {
    await executeCanvasTool("set_text_range_style", {
      layerId: "text",
      start: 0,
      end: 5,
      style: { fontWeight: "bold" },
    });
    await executeCanvasTool("set_text_range_style", {
      layerId: "text",
      start: 3,
      end: 8,
      style: { italic: true },
    });

    const node = doc.nodes.find((n) => n.id === "text");
    expect(node.textRuns).toEqual([
      { start: 0, end: 3, style: { fontWeight: "bold" } },
      { start: 3, end: 8, style: { italic: true } },
      { start: 8, end: 11, style: {} },
    ]);
  });

  it("rejects invalid ranges", async () => {
    await expect(
      executeCanvasTool("set_text_range_style", {
        layerId: "text",
        start: 2,
        end: 2,
        style: {},
      }),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });
  });

  it("falls back to a commit-only editor", async () => {
    const localDoc = makeDoc([
      { id: "text", kind: "text", text: "abc", x: 0, y: 0 },
    ]);
    const commitEditorDocument = vi.fn();
    globalThis.window = {
      __vooEditor: {
        getDoc: () => localDoc,
        getNode: (id) => localDoc.nodes.find((node) => node.id === id) ?? null,
        commitEditorDocument,
      },
    };

    await executeCanvasTool("set_text_range_style", {
      layerId: "text",
      start: 0,
      end: 3,
      style: { color: "red" },
    });
    expect(localDoc.nodes[0].textRuns).toEqual([
      { start: 0, end: 3, style: { color: "red" } },
    ]);
    expect(commitEditorDocument).toHaveBeenCalledWith({ message: "AI: Set text range style" });
  });
});

describe("path nodes tool", () => {
  let doc;
  let editor;
  let commits;

  beforeEach(() => {
    commits = [];
    doc = makeDoc([
      {
        id: "path",
        kind: "path",
        points: [
          { x: 0, y: 0, in: null, out: [10, 5] },
          { x: 100, y: 100, in: [-10, -5], out: [20, 10], close: false },
        ],
      },
    ]);
    editor = {
      getDoc: vi.fn(() => doc),
      getDocument: vi.fn(() => doc),
      getNode: vi.fn((id) => doc.nodes.find((node) => node.id === id) ?? null),
      setDoc: vi.fn((next, options) => {
        doc = next;
        commits.push(options?.name ?? "commit");
      }),
    };
    globalThis.window = { __vooEditor: editor };
  });

  it("reads anchors and handles", async () => {
    const result = await executeCanvasTool("get_path_nodes", { layerId: "path" });
    expect(result.ok).toBe(true);
    expect(result.points).toEqual(doc.nodes[0].points);
  });

  it("moves, inserts, deletes, sets handles, and sets type", async () => {
    const result = await executeCanvasTool("edit_path_nodes", {
      layerId: "path",
      ops: [
        { op: "move", index: 0, x: 5, y: 6 },
        { op: "insert", index: 1, x: 50, y: 50, in: [-1, -1], out: [1, 1] },
        { op: "setHandles", index: 2, in: [-2, -2], out: [2, 2] },
        { op: "setType", index: 2, type: "smooth", close: true },
        { op: "delete", index: 0 },
      ],
    });

    expect(result.ok).toBe(true);
    const node = doc.nodes.find((n) => n.id === "path");
    expect(node.points).toHaveLength(2);
    expect(commits).toContain("AI: Edit path nodes");
  });

  it("rejects unknown operations", async () => {
    await expect(
      executeCanvasTool("edit_path_nodes", {
        layerId: "path",
        ops: [{ op: "bogus", index: 0 }],
      }),
    ).rejects.toMatchObject({ code: "agentInvalidArgs" });
  });

  it("rejects handles containing non-numeric entries without committing", async () => {
    await expect(executeCanvasTool("edit_path_nodes", {
      layerId: "path",
      ops: [{ op: "setHandles", index: 0, handles: { in: [1, "bad"] } }],
    })).rejects.toMatchObject({ code: "agentInvalidArgs" });
    expect(commits).toHaveLength(0);
    expect(doc.nodes[0].points[0].in).toBeNull();
  });
});
