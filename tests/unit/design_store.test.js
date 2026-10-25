import { describe, it, expect, beforeEach } from "vitest";
import { useDesignStore } from "../../src/store/design_store.js";
import { CANVAS_TYPE } from "../../src/canvas/editor/scene_doc_factory.js";

describe("useDesignStore Standalone Decoupled Store", () => {
  beforeEach(() => {
    // Reset state before each test
    useDesignStore.setState({
      editingNodeId: "page-1",
      editingNodeIds: ["page-1"],
      editingGroupId: null,
      nodes: [
        {
          id: "page-1",
          type: "imageEditor",
          position: { x: 0, y: 0 },
          data: {
            label: "Design 1",
            canvasType: CANVAS_TYPE.DESIGN,
            sceneDoc: { width: 1200, height: 800, layers: [] },
          },
        },
      ],
      editorCamera: { panX: 0, panY: 0, zoom: 1 },
      editorArtboardLayouts: {
        "page-1": { x: 0, y: 0, width: 1200, height: 800 },
      },
      images: {},
      isDirty: false,
    });
  });

  it("initializes with a default design artboard", () => {
    const state = useDesignStore.getState();
    expect(state.editingNodeId).toBe("page-1");
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].data.label).toBe("Design 1");
    expect(state.isDirty).toBe(false);
  });

  it("adds and focuses a new artboard page", () => {
    const store = useDesignStore.getState();
    const newPageId = store.addEditorPage({
      label: "Poster Layout",
      width: 1920,
      height: 1080,
    });

    const updated = useDesignStore.getState();
    expect(updated.nodes).toHaveLength(2);
    expect(updated.editingNodeId).toBe(newPageId);
    expect(updated.editingNodeIds).toContain(newPageId);
    expect(updated.isDirty).toBe(true);

    const newPage = updated.nodes.find((n) => n.id === newPageId);
    expect(newPage.data.label).toBe("Poster Layout");
    expect(newPage.data.editorDoc.width).toBe(1920);
    expect(newPage.data.editorDoc.height).toBe(1080);
  });

  it("duplicates an existing artboard with cloned document data", () => {
    const store = useDesignStore.getState();
    const dupId = store.duplicateEditorPage("page-1");

    const updated = useDesignStore.getState();
    expect(updated.nodes).toHaveLength(2);
    const duplicatedNode = updated.nodes.find((n) => n.id === dupId);
    expect(duplicatedNode).toBeDefined();
    expect(duplicatedNode.data.label).toBe("Design 1 Copy");
    expect(duplicatedNode.data.editorDoc.width).toBe(1200);
    expect(updated.editingNodeId).toBe(dupId);
  });

  it("renames an artboard page", () => {
    const store = useDesignStore.getState();
    store.renameEditorPage("page-1", "Hero Section");

    const updated = useDesignStore.getState();
    expect(updated.nodes[0].data.label).toBe("Hero Section");
    expect(updated.isDirty).toBe(true);
  });

  it("deletes an artboard and adjusts focused page", () => {
    const store = useDesignStore.getState();
    const page2 = store.addEditorPage({ label: "Page 2" });
    expect(useDesignStore.getState().nodes).toHaveLength(2);

    useDesignStore.getState().deleteEditorPage("page-1");
    const updated = useDesignStore.getState();
    expect(updated.nodes).toHaveLength(1);
    expect(updated.nodes[0].id).toBe(page2);
    expect(updated.editingNodeId).toBe(page2);
  });

  it("handles camera pan and zoom operations cleanly", () => {
    const store = useDesignStore.getState();
    store.panEditorCamera({ dx: 150, dy: -50 });

    let camera = useDesignStore.getState().editorCamera;
    expect(camera.panX).toBe(150);
    expect(camera.panY).toBe(-50);
    expect(camera.zoom).toBe(1);

    store.setEditorViewport({ panX: 200, panY: 300, zoom: 1.5 });
    camera = useDesignStore.getState().editorCamera;
    expect(camera.panX).toBe(200);
    expect(camera.panY).toBe(300);
    expect(camera.zoom).toBe(1.5);
  });

  it("stores image blobs and handles dirty state", () => {
    const store = useDesignStore.getState();
    store.putImageState("img-1", "data:image/png;base64,mockpngdata");

    expect(useDesignStore.getState().images["img-1"]).toBe("data:image/png;base64,mockpngdata");

    useDesignStore.setState({ isDirty: true });
    expect(useDesignStore.getState().isDirty).toBe(true);
    store.applyImageEdits();
    expect(useDesignStore.getState().isDirty).toBe(false);
  });

  it("handles newVooProject and closeProject transitions", () => {
    const store = useDesignStore.getState();
    store.newVooProject({ label: "App Redesign" });

    let state = useDesignStore.getState();
    expect(state.fileName).toBe("App Redesign.voo");
    expect(state.welcomeOpen).toBe(false);
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].data.label).toBe("App Redesign");

    // The only open project: closing it returns to the welcome page, not to a placeholder tab.
    expect(state.openDocuments).toHaveLength(1);
    store.closeProject();
    state = useDesignStore.getState();
    expect(state.openDocuments).toHaveLength(0);
    expect(state.welcomeOpen).toBe(true);
    expect(state.fileName).toBeNull();
    expect(state.nodes).toHaveLength(0);

    store.closeImageEditor();
    expect(useDesignStore.getState().welcomeOpen).toBe(true);
  });
});
