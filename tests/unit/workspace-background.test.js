import { beforeEach, expect, it } from "vitest";
import { useDesignStore } from "../../src/store/design_store.js";
import { buildProjectVooFile } from "../../src/canvas/store/project_io.js";
import { documentsToScene } from "../../src/canvas/editor/skia_scene_adapter.js";
import { frameEditorFills } from "../../src/canvas/editor/frame-fills.js";

const frame = () => ({
  width: 1200, height: 800, backgroundColor: "#9C5252", nodes: [],
  fills: [{ fill: "#9C5252", opacity: 1, visible: true }],
});

const canvasWithFrame = () => {
  const page = frame();
  return { width: page.width, height: page.height, isCanvasRoot: true, backgroundColor: "transparent", nodes: [
    { id: "authored-frame", kind: "group", isFrame: true, x: 0, y: 0, width: page.width, height: page.height,
      fill: page.backgroundColor, fills: page.fills },
  ] };
};

beforeEach(() => useDesignStore.setState({
  activeDocumentId: null, openDocuments: [], editorPageDocumentReader: null,
}));

it("changes the workspace ground without changing frame paint", () => {
  const doc = canvasWithFrame();
  const before = structuredClone(doc);
  useDesignStore.getState().loadVooProject({ vooData: { document: doc } });
  useDesignStore.getState().setCanvasBackgroundColor("#737373");
  expect(useDesignStore.getState().canvasBackgroundColor).toBe("#737373");
  expect(useDesignStore.getState().nodes[0].data.editorDoc).toMatchObject({ isCanvasRoot: true, backgroundColor: "transparent" });
  expect(useDesignStore.getState().nodes[0].data.editorDoc.nodes[0]).toMatchObject({ fill: "#9C5252", fills: doc.nodes[0].fills });
  expect(doc).toEqual(before);
});

it("saves and reopens the workspace and frame colors independently", async () => {
  useDesignStore.getState().loadVooProject({ vooData: { document: canvasWithFrame() } });
  useDesignStore.getState().setCanvasBackgroundColor("#737373");
  const { vooFile } = await buildProjectVooFile({ store: useDesignStore.getState() });
  expect(vooFile.document.canvasBackgroundColor).toBe("#737373");
  expect(vooFile.document.pages[0].sceneDoc.backgroundColor).toBe("transparent");
  expect(vooFile.document.pages[0].sceneDoc.nodes[0].fill).toBe("#9C5252");
  useDesignStore.getState().loadVooProject({ vooData: vooFile });
  expect(useDesignStore.getState().canvasBackgroundColor).toBe("#737373");
  expect(useDesignStore.getState().nodes[0].data.editorDoc.backgroundColor).toBe("transparent");
  expect(useDesignStore.getState().nodes[0].data.editorDoc.nodes).toHaveLength(1);
  expect(useDesignStore.getState().nodes[0].data.editorDoc.nodes[0].fill).toBe("#9C5252");
});

it("uses neutral gray for old projects without a workspace color", () => {
  useDesignStore.getState().loadVooProject({ vooData: { document: frame() } });
  expect(useDesignStore.getState().canvasBackgroundColor).toBe("#525252");
});

it("changes the workspace color without turning an empty painted page into a Frame", () => {
  useDesignStore.getState().loadVooProject({ vooData: { document: frame() } });
  useDesignStore.getState().setCanvasBackgroundColor("#737373");
  expect(useDesignStore.getState().canvasBackgroundColor).toBe("#737373");
  expect(useDesignStore.getState().nodes[0].data.editorDoc).toMatchObject({ isCanvasRoot: true, nodes: [], backgroundColor: "transparent" });
});

it("converts edited frame paints to visible scene fills", () => {
  expect(documentsToScene([frame()])[0].fills).toEqual([{ color: "#9C5252", opacity: 1 }]);
  expect(frameEditorFills({ fills: [{ color: "#ffffff", opacity: 0.5 }] })[0].fill).toBe("#ffffff");
});

it("keeps transparent or hidden frame fills transparent", () => {
  expect(documentsToScene([{ ...frame(), fills: [], backgroundColor: "transparent" }])[0].fills).toEqual([]);
  expect(documentsToScene([{ ...frame(), fills: [{ fill: "#9C5252", visible: false }] }])[0].fills).toEqual([]);
});
