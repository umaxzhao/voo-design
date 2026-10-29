import { describe, it, expect, vi } from "vitest";
import { findEmptySpace } from "../../src/canvas/agent/canvas_tools_geometry.js";
import { createIcon } from "../../src/canvas/agent/canvas_tools_assets.js";
import { setFrameSlot, getFrameSlot } from "../../src/canvas/agent/canvas_tools_components.js";
import { forkFrame } from "../../src/canvas/agent/canvas_tools.js";
import {
  setAgentCursor,
  getAgentCursor,
  clearAgentCursor,
  setAgentFocusNode,
  getAgentFocusNode,
} from "../../src/canvas/editor/chrome_stage_overlays.js";

describe("find_empty_space tool", () => {
  it("returns origin coordinates when document has no top-level frames", () => {
    const editor = {
      getDocument: () => ({ nodes: [] }),
    };
    const res = findEmptySpace({ width: 1440, height: 900 }, editor);
    expect(res).toEqual({ ok: true, x: 0, y: 0, width: 1440, height: 900 });
  });

  it("finds non-overlapping space to the right of existing frames", () => {
    const editor = {
      getDocument: () => ({
        nodes: [
          { id: "f1", x: 0, y: 0, width: 1440, height: 900 },
        ],
      }),
    };
    const res = findEmptySpace({ width: 1440, height: 900, direction: "right", padding: 80 }, editor);
    expect(res.ok).toBe(true);
    expect(res.x).toBe(1520); // 1440 + 80
    expect(res.y).toBe(0);
  });

  it("finds non-overlapping space at bottom when direction is bottom", () => {
    const editor = {
      getDocument: () => ({
        nodes: [
          { id: "f1", x: 0, y: 0, width: 1440, height: 900 },
        ],
      }),
    };
    const res = findEmptySpace({ width: 1440, height: 900, direction: "bottom", padding: 80 }, editor);
    expect(res.ok).toBe(true);
    expect(res.x).toBe(0);
    expect(res.y).toBe(980); // 900 + 80
  });

  it("finds empty space adjacent to specified anchor nodeId", () => {
    const editor = {
      getDocument: () => ({
        nodes: [
          { id: "f1", x: 100, y: 100, width: 800, height: 600 },
          { id: "f2", x: 1000, y: 100, width: 800, height: 600 },
        ],
      }),
    };
    const res = findEmptySpace({ nodeId: "f1", width: 500, height: 400, direction: "bottom", padding: 40 }, editor);
    expect(res.ok).toBe(true);
    expect(res.x).toBe(100);
    expect(res.y).toBe(740); // 100 + 600 + 40
  });
});

describe("create_icon tool", () => {
  it("rejects unknown icon name with clear validation message", async () => {
    const editor = {
      getDoc: () => ({ nodes: [] }),
    };
    await expect(createIcon({ icon: "non_existent_symbol" }, { editor })).rejects.toThrow(
      'Unknown icon: "non_existent_symbol"'
    );
  });

  it("creates vector nodes from built-in Lucide icon", async () => {
    const createdNodes = [];
    const editor = {
      getDoc: () => ({ nodes: [] }),
      addRectAt: vi.fn(({ x, y }) => ({ id: "rect1", x, y })),
      addPath: vi.fn((path) => {
        const id = `path_${createdNodes.length + 1}`;
        createdNodes.push({ id, ...path });
        return { id };
      }),
      updateNode: vi.fn(),
      commitEditorDocument: vi.fn(),
    };

    // Inject mock into window.__vooEditor
    const prev = globalThis.window?.__vooEditor;
    if (!globalThis.window) globalThis.window = {};
    globalThis.window.__vooEditor = editor;

    try {
      const res = await createIcon({ icon: "search", x: 100, y: 200, size: 32, color: "#a7ffd4" });
      expect(res.ok).toBe(true);
      expect(res.icon).toBe("search");
      expect(res.size).toBe(32);
      expect(res.x).toBe(100);
      expect(res.y).toBe(200);
      expect(editor.commitEditorDocument).toHaveBeenCalled();
    } finally {
      globalThis.window.__vooEditor = prev;
    }
  });
});

describe("agent virtual cursor and focus overlays", () => {
  it("sets, updates, and clears agent virtual cursor", () => {
    clearAgentCursor();
    expect(getAgentCursor()).toBeNull();

    setAgentCursor({ x: 150, y: 250, label: "Claude Code", active: true });
    const cursor = getAgentCursor();
    expect(cursor).toMatchObject({
      x: 150,
      y: 250,
      label: "Claude Code",
    });

    clearAgentCursor();
    expect(getAgentCursor()).toBeNull();
  });

  it("updates agent cursor when setting agent focus node", () => {
    clearAgentCursor();
    setAgentFocusNode({ id: "node1", x: 200, y: 300, width: 400, height: 200 }, "AI: Creating card");
    expect(getAgentFocusNode().layerId).toBe("node1");

    const cursor = getAgentCursor();
    expect(cursor).not.toBeNull();
    expect(cursor.x).toBe(400); // 200 + 400/2
    expect(cursor.y).toBe(300);
    expect(cursor.label).toBe("Creating card");
  });
});

describe("component slots", () => {
  it("configures and retrieves component slot on a frame", () => {
    const node = { id: "f1", isFrame: true, name: "Card Slot" };
    const editor = {
      getDocument: () => ({ nodes: [node] }),
      updateNode: vi.fn((id, patch) => Object.assign(node, patch)),
      commitEditorDocument: vi.fn(),
    };

    const setRes = setFrameSlot({ frameId: "f1", slot: ["Button", "IconButton"] }, { editor });
    expect(setRes).toEqual({ ok: true, frameId: "f1", slot: ["Button", "IconButton"] });
    expect(editor.commitEditorDocument).toHaveBeenCalled();

    const getRes = getFrameSlot({ frameId: "f1" }, { editor });
    expect(getRes).toEqual({ ok: true, frameId: "f1", slot: ["Button", "IconButton"] });

    // Clear slot
    const clearRes = setFrameSlot({ frameId: "f1", slot: null }, { editor });
    expect(clearRes.slot).toBeNull();
  });
});

describe("fork_frame tool", () => {
  it("duplicates frame and positions copy at adjacent non-overlapping coordinates", () => {
    const f1 = { id: "f1", isFrame: true, name: "Landing Hero", x: 0, y: 0, width: 1440, height: 900 };
    const child1 = { id: "c1", parentId: "f1", x: 100, y: 100, width: 200, height: 50 };

    let currentSelectedId = null;
    const doc = { nodes: [f1, child1] };

    const editor = {
      getDocument: () => doc,
      getDoc: () => doc,
      getNode: (id) => doc.nodes.find((item) => item.id === id),
      selectExactly: vi.fn(([id]) => { currentSelectedId = id; }),
      getSelectedId: () => "f1_copy",
      duplicateSelected: vi.fn(() => {
        const copyFrame = { id: "f1_copy", isFrame: true, name: "Landing Hero (Copy)", x: 10, y: 10, width: 1440, height: 900 };
        const copyChild = { id: "c1_copy", parentId: "f1_copy", x: 110, y: 110, width: 200, height: 50 };
        doc.nodes.push(copyFrame, copyChild);
        currentSelectedId = "f1_copy";
      }),
      getAffectedIds: vi.fn((_doc, [id]) => [id, "c1_copy"]),
      updateNode: vi.fn((id, patch) => {
        const n = doc.nodes.find((item) => item.id === id);
        if (n) Object.assign(n, patch);
      }),
      commitEditorDocument: vi.fn(),
    };

    const res = forkFrame({ frameId: "f1", name: "Landing Hero Variant B", direction: "right", padding: 80 }, { editor });
    expect(res.ok).toBe(true);
    expect(res.sourceFrameId).toBe("f1");
    expect(res.newFrameId).toBe("f1_copy");
    expect(res.name).toBe("Landing Hero Variant B");
    expect(res.x).toBe(1520); // 1440 + 80
    expect(res.y).toBe(0);
    expect(editor.commitEditorDocument).toHaveBeenCalled();
  });
});
