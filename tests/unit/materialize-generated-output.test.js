import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useDesignStore } from "../../src/store/design_store.js";
import { createEditorGeneratedOutput, createOutpaintScenePatch } from "../../src/canvas/editor/editor_generated_output.js";
import { loadLocale } from "../../src/shared/i18n.js";

const storage = vi.hoisted(() => ({ putImage: vi.fn(), deleteImage: vi.fn() }));
vi.mock("../../src/canvas/store/db.js", () => storage);

const dataUrl = "data:image/png;base64,aW1hZ2U=";
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
let snapshot;
let sourcePage;

function result(extra = {}) {
  return createEditorGeneratedOutput({ dataUrl, operation: "aiRepaint",
    sourceWorkflowNodeId: sourcePage.id, sourceSceneNodeId: "image",
    sourceSnapshot: snapshot, parameters: { prompt: "Keep the source" }, ...extra });
}

beforeAll(() => loadLocale("en"));
beforeEach(() => {
  vi.clearAllMocks();
  storage.putImage.mockResolvedValue(true);
  storage.deleteImage.mockResolvedValue(true);
  snapshot = { version: 2, canvasId: "source", canvasType: "design", isCanvasRoot: true,
    width: 200, height: 100, nodes: [
      { id: "frame", kind: "group", isFrame: true, clipContent: true, x: 0, y: 0, width: 200, height: 100, fill: "#ffffff" },
      { id: "image", kind: "image", imageId: "original-image", parentId: "frame", x: 0, y: 0, width: 200, height: 100, opacity: 0.8, cornerRadius: 5 },
      { id: "label", kind: "text", text: "Source", x: 80, y: 30, width: 20, height: 10 },
    ] };
  sourcePage = { id: "source-page", type: "imageEditor", position: { x: 0, y: 0 },
    data: { label: "Source", canvasType: "design", editorDoc: snapshot } };
  useDesignStore.setState({ activeDocumentId: "origin-document", editorPageSession: 20,
    editingNodeId: sourcePage.id, editingNodeIds: [sourcePage.id], openDocuments: [{ id: "origin-document" }],
    nodes: [sourcePage], images: { "original-image": dataUrl }, isDirty: false,
    editorPageDocumentReader: null, editorArtboardLayouts: { [sourcePage.id]: { x: 20, y: 40, width: 200, height: 100 } } });
});

describe("generated editor candidate publication", () => {
  it("opens an existing page by joining the editor session and preserves its source", () => {
    const second = { ...sourcePage, id: "another-page" };
    useDesignStore.setState({ nodes: [sourcePage, second], welcomeOpen: true });
    expect(useDesignStore.getState().openExistingEditorPage(second.id)).toBe(true);
    expect(useDesignStore.getState().editingNodeIds).toEqual([sourcePage.id, second.id]);
    expect(useDesignStore.getState().editingNodeId).toBe(second.id);
    expect(useDesignStore.getState().welcomeOpen).toBe(false);
    expect(useDesignStore.getState().openExistingEditorPage(sourcePage.id)).toBe(true);
    expect(useDesignStore.getState().editingNodeIds).toEqual([sourcePage.id, second.id]);
  });

  it("does not change the editor session when asked to open a missing page", () => {
    const state = useDesignStore.getState();
    expect(state.openExistingEditorPage("missing")).toBe(false);
    expect(useDesignStore.getState()).toBe(state);
  });

  it("persists the new asset and publishes the complete independent page atomically", async () => {
    const before = JSON.stringify(snapshot);
    const commits = [];
    const unsubscribe = useDesignStore.subscribe(state => {
      if (state.nodes.length > 1) commits.push({ nodes: state.nodes, images: state.images, dirty: state.isDirty });
    });
    let published;
    try { published = await useDesignStore.getState().materializeEditorGeneratedOutput({ result: result() }); }
    finally { unsubscribe(); }
    const state = useDesignStore.getState();
    const candidate = state.nodes.find(node => node.id === published.candidateNodeId);
    expect(storage.putImage).toHaveBeenCalledWith(published.imageId, dataUrl);
    expect(commits).toHaveLength(1);
    expect(commits[0].images[published.imageId]).toBe(dataUrl);
    expect(commits[0].dirty).toBe(true);
    expect(state.nodes[0]).toBe(sourcePage);
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(candidate.type).toBe("imageEditor");
    expect(candidate.data.label).toContain("Generative Fill");
    expect(candidate.data.editorDoc.nodes[1]).toMatchObject({ id: "image", imageId: published.imageId,
      parentId: "frame", opacity: 0.8, cornerRadius: 5 });
    expect(candidate.data.editorDoc.nodes[2]).toEqual(snapshot.nodes[2]);
    expect(candidate.data.generatedOutput).toMatchObject({ operation: "aiRepaint", sourceWorkflowNodeId: sourcePage.id,
      sourceSceneNodeId: "image", sourceDocumentId: "origin-document" });
    expect(JSON.stringify(candidate.data.generatedOutput)).not.toContain("data:image/");
    expect(state.editorArtboardLayouts[published.candidateNodeId].x).toBe(284);
    expect(state.editingNodeId).toBe(sourcePage.id);
  });

  it("places repeated candidates to the right without replacing or overlapping a previous result", async () => {
    const first = await useDesignStore.getState().materializeEditorGeneratedOutput({ result: result() });
    const second = await useDesignStore.getState().materializeEditorGeneratedOutput({ result: result() });
    const state = useDesignStore.getState();
    expect(state.nodes).toHaveLength(3);
    expect(first.candidateNodeId).not.toBe(second.candidateNodeId);
    expect(state.editorArtboardLayouts[second.candidateNodeId].x).toBeGreaterThan(
      state.editorArtboardLayouts[first.candidateNodeId].x + 200);
  });

  it("outpaint grows the copied document, shifts other layers and expands clipping ancestors", async () => {
    const patch = createOutpaintScenePatch(snapshot, { x: -20, y: -10, width: 240, height: 130 });
    const published = await useDesignStore.getState().materializeEditorGeneratedOutput({ result: result({ operation: "outpaint", scenePatch: patch }) });
    const doc = useDesignStore.getState().nodes.find(node => node.id === published.candidateNodeId).data.editorDoc;
    expect([doc.width, doc.height]).toEqual([240, 130]);
    expect(doc.nodes[1]).toMatchObject({ id: "image", parentId: "frame", x: 0, y: 0, width: 240, height: 130 });
    expect(doc.nodes[0]).toMatchObject({ clipContent: true, x: 0, y: 0, width: 240, height: 130 });
    expect(doc.nodes[2]).toMatchObject({ x: 100, y: 40, text: "Source" });
    expect(snapshot.nodes[2].x).toBe(80);
    expect(snapshot.width).toBe(200);
  });

  it("does not leave a candidate or dirty metadata when asset persistence fails", async () => {
    const error = new Error("Storage is unavailable");
    storage.putImage.mockRejectedValueOnce(error);
    await expect(useDesignStore.getState().materializeEditorGeneratedOutput({ result: result() })).rejects.toBe(error);
    expect(useDesignStore.getState().nodes).toEqual([sourcePage]);
    expect(useDesignStore.getState().isDirty).toBe(false);
    expect(Object.keys(useDesignStore.getState().images)).toEqual(["original-image"]);
  });

  it("captures the originating document before the lazy module import", async () => {
    const task = useDesignStore.getState().materializeEditorGeneratedOutput({ result: result() });
    useDesignStore.setState({ activeDocumentId: "another-document" });
    await expect(task).rejects.toThrow("source changed");
    expect(storage.putImage).not.toHaveBeenCalled();
    expect(useDesignStore.getState().nodes).toEqual([sourcePage]);
  });

  it.each(["document", "page", "deleted", "away-and-back"])(
    "rejects a source invalidated by %s while the asset is being persisted",
    async (change) => {
      const started = deferred(), finish = deferred();
      storage.putImage.mockImplementationOnce(async () => { started.resolve(); await finish.promise; return true; });
      const task = useDesignStore.getState().materializeEditorGeneratedOutput({ result: result() });
      await started.promise;
      if (change === "document") useDesignStore.setState({ activeDocumentId: "another-document" });
      if (change === "page") useDesignStore.setState({ editingNodeId: "another-page" });
      if (change === "deleted") useDesignStore.getState().deleteEditorPage(sourcePage.id);
      if (change === "away-and-back") {
        useDesignStore.setState({ editingNodeId: "another-page" });
        useDesignStore.setState({ editingNodeId: sourcePage.id });
      }
      finish.resolve();
      await expect(task).rejects.toThrow("source changed");
      expect(useDesignStore.getState().nodes.some(node => node.id.startsWith("page-generated-"))).toBe(false);
      expect(storage.deleteImage).toHaveBeenCalledTimes(1);
    },
  );

  it("uses the authoritative live page reader to reject an image deleted during persistence", async () => {
    let live = snapshot;
    useDesignStore.setState({ editorPageDocumentReader: () => live });
    const started = deferred(), finish = deferred();
    storage.putImage.mockImplementationOnce(async () => { started.resolve(); await finish.promise; return true; });
    const task = useDesignStore.getState().materializeEditorGeneratedOutput({ result: result() });
    await started.promise;
    live = { ...snapshot, nodes: snapshot.nodes.filter(node => node.id !== "image") };
    finish.resolve();
    await expect(task).rejects.toThrow("source image changed");
    expect(useDesignStore.getState().nodes).toEqual([sourcePage]);
    expect(storage.deleteImage).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported patches or clipping transforms before writing assets", async () => {
    const malformed = result(); malformed.scenePatch = { type: "unknown" };
    await expect(useDesignStore.getState().materializeEditorGeneratedOutput({ result: malformed })).rejects.toThrow("scenePatch.type");
    snapshot.nodes[0].rotation = 90;
    const patch = createOutpaintScenePatch(snapshot, { x: -20, y: -10, width: 240, height: 130 });
    await expect(useDesignStore.getState().materializeEditorGeneratedOutput({ result: result({ operation: "outpaint", scenePatch: patch }) })).rejects.toThrow("transformed clipping frames");
    expect(storage.putImage).not.toHaveBeenCalled();
    expect(useDesignStore.getState().nodes).toEqual([sourcePage]);
  });
});
