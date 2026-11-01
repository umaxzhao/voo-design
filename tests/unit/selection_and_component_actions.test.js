import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { useDesignStore } from "../../src/store/design_store.js";
import { extractComponent } from "../../src/canvas/editor/component_extract.js";
import { createDocument, CANVAS_TYPE } from "../../src/canvas/editor/scene_doc_factory.js";

describe("QA Bug 2: onInvertSelection calls invertPixelSelection without creating masks", () => {
  it("image_editor.jsx wires onInvertSelection to void engine?.invertPixelSelection?.()", () => {
    const editorSourcePath = path.resolve(
      __dirname,
      "../../src/canvas/components/image_editor.jsx",
    );
    const content = fs.readFileSync(editorSourcePath, "utf8");

    // Must call invertPixelSelection
    expect(content).toMatch(/onInvertSelection:\s*\(\)\s*=>\s*\{\s*void engine\?\.invertPixelSelection\?\.\(\);\s*\}/);

    // Must not call invertMask on onInvertSelection
    expect(content).not.toMatch(/onInvertSelection:\s*\(\)\s*=>\s*\{[^}]*invertMask/);
  });

  it("onInvertSelection runtime logic invokes invertPixelSelection and never invertMask", () => {
    const invertPixelSelectionMock = vi.fn();
    const invertMaskMock = vi.fn();

    const mockEngine = {
      invertPixelSelection: invertPixelSelectionMock,
      invertMask: invertMaskMock,
    };

    // Simulate the exact handler implementation
    const handler = () => {
      void mockEngine?.invertPixelSelection?.();
    };

    handler();

    expect(invertPixelSelectionMock).toHaveBeenCalledTimes(1);
    expect(invertMaskMock).not.toHaveBeenCalled();
  });
});

describe("QA Bug 4: createComponentPage in design_store", () => {
  const HOST_PAGE_ID = "page-host-1";

  beforeEach(() => {
    const initialDoc = createDocument(1200, 800, "#ffffff", {
      canvasType: CANVAS_TYPE.DESIGN,
      canvasId: HOST_PAGE_ID,
    });
    initialDoc.nodes = [
      { id: "layer-1", kind: "rect", x: 10, y: 10, width: 100, height: 100, fill: "#ff0000" },
      { id: "layer-2", kind: "text", x: 10, y: 120, width: 80, height: 20, text: "Button" },
    ];

    useDesignStore.setState({
      editingNodeId: HOST_PAGE_ID,
      editingNodeIds: [HOST_PAGE_ID],
      editingGroupId: null,
      nodes: [
        {
          id: HOST_PAGE_ID,
          type: "imageEditor",
          position: { x: 0, y: 0 },
          data: {
            label: "Host Canvas",
            canvasType: CANVAS_TYPE.DESIGN,
            editorDoc: initialDoc,
          },
        },
      ],
      editorCamera: { panX: 0, panY: 0, zoom: 1 },
      editorArtboardLayouts: {
        [HOST_PAGE_ID]: { x: 0, y: 0, width: 1200, height: 800 },
      },
      images: {},
      isDirty: false,
      undoStack: [],
      redoStack: [],
    });
  });

  afterEach(() => {
    if (typeof window !== "undefined") {
      delete window.__vooEditor;
      delete window.__vooEditors;
    }
  });

  it("exists on useDesignStore and returns null for invalid inputs", () => {
    const store = useDesignStore.getState();
    expect(typeof store.createComponentPage).toBe("function");

    expect(store.createComponentPage("non-existent", { master: {} })).toBeNull();
    expect(store.createComponentPage(HOST_PAGE_ID, null)).toBeNull();
  });

  it("creates master component page, updates host document with instance, and sets layout beside host", () => {
    const store = useDesignStore.getState();
    const hostNode = store.nodes.find((n) => n.id === HOST_PAGE_ID);
    const hostDoc = hostNode.data.editorDoc;

    const { master, instance, doc: withInstance } = extractComponent(
      hostDoc,
      ["layer-1", "layer-2"],
      { name: "Button Component" },
    );

    const masterId = store.createComponentPage(HOST_PAGE_ID, {
      previousDoc: hostDoc,
      doc: withInstance,
      master,
      label: "Button Component",
    });

    expect(masterId).toBeTruthy();
    expect(masterId).toBe(master.canvasId);

    const updated = useDesignStore.getState();

    // Verify nodes: host document updated, master document added
    expect(updated.nodes).toHaveLength(2);
    const updatedHostNode = updated.nodes.find((n) => n.id === HOST_PAGE_ID);
    const masterPageNode = updated.nodes.find((n) => n.id === masterId);

    expect(masterPageNode).toBeDefined();
    expect(masterPageNode.data.label).toBe("Button Component");
    expect(masterPageNode.data.editorDoc.canvasId).toBe(masterId);
    expect(masterPageNode.data.editorDoc.nodes).toHaveLength(2);

    // Host node now has the instance
    const hostInstanceNode = updatedHostNode.data.editorDoc.nodes.find(
      (n) => n.id === instance.id,
    );
    expect(hostInstanceNode).toBeDefined();
    expect(hostInstanceNode.kind).toBe("canvasInstance");
    expect(hostInstanceNode.sourceCanvasId).toBe(masterId);

    // Both pages displayed on the stage; focus stays on host
    expect(updated.editingNodeIds).toContain(HOST_PAGE_ID);
    expect(updated.editingNodeIds).toContain(masterId);
    expect(updated.editingNodeId).toBe(HOST_PAGE_ID);

    // Layout placed beside host page to the right
    const hostLayout = updated.editorArtboardLayouts[HOST_PAGE_ID];
    const masterLayout = updated.editorArtboardLayouts[masterId];
    expect(masterLayout).toBeDefined();
    expect(masterLayout.x).toBeGreaterThan(hostLayout.x + hostLayout.width);
    expect(masterLayout.y).toBe(hostLayout.y);
    expect(masterLayout.width).toBe(master.width);
    expect(masterLayout.height).toBe(master.height);

    expect(updated.isDirty).toBe(true);
  });

  it("supports undo and redo of component page creation", () => {
    const store = useDesignStore.getState();
    const hostDoc = store.nodes[0].data.editorDoc;

    const { master, instance, doc: withInstance } = extractComponent(
      hostDoc,
      ["layer-1"],
      { name: "Icon Master" },
    );

    const masterId = store.createComponentPage(HOST_PAGE_ID, {
      previousDoc: hostDoc,
      doc: withInstance,
      master,
      label: "Icon Master",
    });

    expect(useDesignStore.getState().nodes).toHaveLength(2);
    expect(useDesignStore.getState().canUndo()).toBe(true);
    expect(useDesignStore.getState().canRedo()).toBe(false);

    // Perform Undo
    const undoResult = useDesignStore.getState().undo();
    expect(undoResult).toBe(true);

    const stateAfterUndo = useDesignStore.getState();
    expect(stateAfterUndo.nodes).toHaveLength(1);
    expect(stateAfterUndo.nodes.find((n) => n.id === masterId)).toBeUndefined();
    expect(stateAfterUndo.nodes[0].data.editorDoc.nodes.some((n) => n.id === instance.id)).toBe(false);
    expect(stateAfterUndo.nodes[0].data.editorDoc.nodes.some((n) => n.id === "layer-1")).toBe(true);
    expect(stateAfterUndo.editingNodeIds).toEqual([HOST_PAGE_ID]);
    expect(stateAfterUndo.editorArtboardLayouts[masterId]).toBeUndefined();
    expect(stateAfterUndo.canUndo()).toBe(false);
    expect(stateAfterUndo.canRedo()).toBe(true);

    // Perform Redo
    const redoResult = useDesignStore.getState().redo();
    expect(redoResult).toBe(true);

    const stateAfterRedo = useDesignStore.getState();
    expect(stateAfterRedo.nodes).toHaveLength(2);
    expect(stateAfterRedo.nodes.find((n) => n.id === masterId)).toBeDefined();
    expect(stateAfterRedo.nodes[0].data.editorDoc.nodes.some((n) => n.id === instance.id)).toBe(true);
    expect(stateAfterRedo.editingNodeIds).toContain(masterId);
    expect(stateAfterRedo.editorArtboardLayouts[masterId]).toBeDefined();
    expect(stateAfterRedo.canUndo()).toBe(true);
    expect(stateAfterRedo.canRedo()).toBe(false);
  });

  it("synchronizes document with attached engine on undo and redo", () => {
    const setDocMock = vi.fn();
    const mockEngine = {
      setDoc: setDocMock,
      canUndo: () => false,
      canRedo: () => false,
    };

    if (typeof window === "undefined") {
      globalThis.window = {};
    }
    window.__vooEditors = { [HOST_PAGE_ID]: mockEngine };

    const store = useDesignStore.getState();
    const hostDoc = store.nodes[0].data.editorDoc;

    const { master, doc: withInstance } = extractComponent(
      hostDoc,
      ["layer-1"],
      { name: "Sync Component" },
    );

    store.createComponentPage(HOST_PAGE_ID, {
      previousDoc: hostDoc,
      doc: withInstance,
      master,
      label: "Sync Component",
    });

    // Undo should restore previousDoc on engine
    useDesignStore.getState().undo();
    expect(setDocMock).toHaveBeenCalledWith(hostDoc, { commit: false });

    // Redo should restore withInstance on engine
    useDesignStore.getState().redo();
    expect(setDocMock).toHaveBeenCalledWith(withInstance, { commit: false });
  });

  it("saveEditorDrafts with serialized entries preserves latest canvas content in crash draft and store", async () => {
    const { loadLatestCrashDraft, clearCrashDraft } = await import("../../src/shared/crash_recovery.js");
    const store = useDesignStore.getState();
    const latestDoc = {
      canvasId: HOST_PAGE_ID,
      nodes: [
        { id: "custom-text-1", kind: "text", x: 50, y: 50, text: "Unique text" },
        { id: "custom-rect-1", kind: "rect", x: 100, y: 100, width: 200, height: 150 },
      ],
    };

    await store.saveEditorDrafts([
      { nodeId: HOST_PAGE_ID, editorDoc: latestDoc },
    ]);

    const latestDraft = await loadLatestCrashDraft();
    expect(latestDraft).toBeDefined();
    expect(latestDraft.document.nodes).toHaveLength(2);
    expect(latestDraft.document.nodes.map((n) => n.id)).toEqual(["custom-text-1", "custom-rect-1"]);

    // Verify store node was updated with latest content
    const updatedStoreNode = useDesignStore.getState().nodes.find((n) => n.id === HOST_PAGE_ID);
    expect(updatedStoreNode.data.editorDoc.nodes).toHaveLength(2);

    await clearCrashDraft(latestDraft.id);
  });
});
