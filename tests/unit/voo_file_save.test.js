import { describe, it, expect, beforeEach, vi } from "vitest";

if (!globalThis.window) {
  globalThis.window = globalThis;
}
if (!globalThis.document) {
  globalThis.document = {
    createElement: vi.fn(),
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
  };
}

import { useDesignStore } from "../../src/store/design_store.js";
import { saveVooProject, openVooProject } from "../../src/canvas/store/project_io.js";
import { isValidVooFile } from "../../electron/voo_format.js";
import { useEditorAutosave } from "../../src/canvas/components/editor_hooks/use_editor_autosave.js";

describe("Photoshop-style .voo File Save Mechanism", () => {
  beforeEach(() => {
    // Reset store state before each test
    useDesignStore.setState({
      editingNodeId: "page-1",
      editingNodeIds: ["page-1"],
      nodes: [
        {
          id: "page-1",
          type: "imageEditor",
          position: { x: 0, y: 0 },
          data: {
            label: "Design 1",
            canvasType: "design",
            sceneDoc: {
              version: 1,
              width: 1200,
              height: 800,
              nodes: [
                { id: "rect-1", kind: "shape", shape: "rect", x: 10, y: 10, width: 100, height: 100 },
              ],
            },
          },
        },
      ],
      editorArtboardLayouts: {
        "page-1": { x: 0, y: 0, width: 1200, height: 800 },
      },
      editorCamera: { panX: 0, panY: 0, zoom: 1 },
      filePath: null,
      fileHandle: null,
      fileName: "Untitled.voo",
      isDirty: false,
      images: {},
    });

    delete window.electronAPI;
  });

  it("by default, document is unsaved with no file path", () => {
    const state = useDesignStore.getState();
    expect(state.filePath).toBeNull();
    expect(state.fileName).toBe("Untitled.voo");
    expect(state.isDirty).toBe(false);
  });

  it("useEditorAutosave in disabled mode performs no background writes or errors", async () => {
    const setError = vi.fn();
    const saver = useEditorAutosave({
      enginesRef: { current: new Map() },
      snapshotsRef: { current: new Map() },
      nodeIds: ["page-1"],
      disabled: true,
      setApplyError: setError,
    });

    expect(saver.needsSave()).toBe(false);
    expect(saver.hasUnsaved()).toBe(false);
    await saver.flush();
    expect(setError).not.toHaveBeenCalled();
  });

  it("first save (Ctrl+S) prompts user with save dialog in Electron and saves .voo", async () => {
    let writtenPath = null;
    let writtenContent = null;

    window.electronAPI = {
      saveFileDialog: vi.fn().mockResolvedValue("/Users/test/Documents/MyDesign.voo"),
      writeFile: vi.fn().mockImplementation(async (path, content) => {
        writtenPath = path;
        writtenContent = content;
        return true;
      }),
    };

    const res = await saveVooProject({
      store: useDesignStore.getState(),
      saveAs: false,
    });

    expect(window.electronAPI.saveFileDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: "Untitled.voo",
        filters: [{ name: "VOO Design Document", extensions: ["voo"] }],
      }),
    );
    expect(window.electronAPI.writeFile).toHaveBeenCalled();
    expect(writtenPath).toBe("/Users/test/Documents/MyDesign.voo");

    const parsed = JSON.parse(writtenContent);
    expect(isValidVooFile(parsed)).toBe(true);
    expect(parsed.format).toBe("voo-editor");
    expect(parsed.version).toBe(2);
    expect(parsed.document.pages).toHaveLength(1);

    const state = useDesignStore.getState();
    expect(state.filePath).toBe("/Users/test/Documents/MyDesign.voo");
    expect(state.fileName).toBe("MyDesign.voo");
    expect(state.isDirty).toBe(false);
  });

  it("subsequent save (Ctrl+S) directly saves to existing filePath without dialog", async () => {
    useDesignStore.setState({
      filePath: "/Users/test/Documents/MyDesign.voo",
      fileName: "MyDesign.voo",
      isDirty: true,
    });

    window.electronAPI = {
      saveFileDialog: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(true),
    };

    const res = await saveVooProject({
      store: useDesignStore.getState(),
      saveAs: false,
    });

    expect(window.electronAPI.saveFileDialog).not.toHaveBeenCalled();
    expect(window.electronAPI.writeFile).toHaveBeenCalledWith(
      "/Users/test/Documents/MyDesign.voo",
      expect.any(String),
    );
    expect(useDesignStore.getState().isDirty).toBe(false);
  });

  it("Save As (Ctrl+Shift+S) always prompts save dialog even if filePath exists", async () => {
    useDesignStore.setState({
      filePath: "/Users/test/Documents/Original.voo",
      fileName: "Original.voo",
      isDirty: false,
    });

    window.electronAPI = {
      saveFileDialog: vi.fn().mockResolvedValue("/Users/test/Documents/Copy.voo"),
      writeFile: vi.fn().mockResolvedValue(true),
    };

    const res = await saveVooProject({
      store: useDesignStore.getState(),
      saveAs: true,
    });

    expect(window.electronAPI.saveFileDialog).toHaveBeenCalled();
    expect(window.electronAPI.writeFile).toHaveBeenCalledWith(
      "/Users/test/Documents/Copy.voo",
      expect.any(String),
    );
    expect(useDesignStore.getState().filePath).toBe("/Users/test/Documents/Copy.voo");
    expect(useDesignStore.getState().fileName).toBe("Copy.voo");
  });

  it("opens a .voo file and hydrates multi-page document cleanly", async () => {
    const testVooData = {
      format: "voo-editor",
      version: 2,
      kind: "design",
      document: {
        version: 1,
        width: 1920,
        height: 1080,
        nodes: [],
        pages: [
          {
            id: "imported-page-1",
            label: "Poster Artboard",
            canvasType: "design",
            sceneDoc: { version: 1, width: 1920, height: 1080, nodes: [] },
          },
          {
            id: "imported-page-2",
            label: "Mobile Variant",
            canvasType: "design",
            sceneDoc: { version: 1, width: 750, height: 1334, nodes: [] },
          },
        ],
        editorArtboardLayouts: {
          "imported-page-1": { x: 0, y: 0, width: 1920, height: 1080 },
          "imported-page-2": { x: 2100, y: 0, width: 750, height: 1334 },
        },
      },
      assets: {},
    };

    const file = {
      name: "PosterProject.voo",
      text: async () => JSON.stringify(testVooData),
    };

    const res = await openVooProject({
      store: useDesignStore.getState(),
      fileOrPath: file,
    });

    expect(res.success).toBe(true);
    const updated = useDesignStore.getState();
    expect(updated.nodes).toHaveLength(2);
    expect(updated.nodes[0].data.label).toBe("Poster Artboard");
    expect(updated.nodes[1].data.label).toBe("Mobile Variant");
    expect(updated.fileName).toBe("PosterProject.voo");
    expect(updated.isDirty).toBe(false);
  });
});
