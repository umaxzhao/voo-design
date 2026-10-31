import { describe, expect, it } from "vitest";
import { createTransformApi } from "../../src/canvas/editor/editor_transform_api.js";
import { createClipboard } from "../../src/canvas/editor/editor_clipboard.js";
import { createEngineNodesController } from "../../src/canvas/editor/editor_engine_nodes.js";
import { createSelection } from "../../src/canvas/editor/editor_selection.js";

function createNodesFixture(initialNodes) {
  let doc = {
    canvasId: "test-canvas",
    width: 800,
    height: 600,
    nodes: initialNodes.map((node) => ({ ...node })),
  };
  const selection = createSelection({});
  const setDoc = (next) => { doc = next; };
  const controller = createEngineNodesController({
    getDoc: () => doc,
    setDoc,
    selection,
    cache: null,
    maskTools: { api: { clearMask: () => {}, getMaskEdit: () => null } },
    paintTools: {},
    penTools: {},
    releaseNodeTextures: () => {},
    getEffectiveNode: (node) => node,
    getPixelSelection: () => null,
    clearPixelSelection: () => {},
    setTool: () => {},
    requestRender: () => {},
    notify: () => {},
  });
  return { doc: () => doc, setDoc, selection, controller };
}

describe("layer hierarchy stack and group transform contracts", () => {
  it("flips a group horizontally and vertically by mirroring child coordinates across group bounds", async () => {
    let doc = {
      nodes: [
        { id: "g", kind: "group", x: 100, y: 100, width: 200, height: 100 },
        { id: "c1", kind: "rect", parentId: "g", x: 120, y: 110, width: 30, height: 20, flipH: false, flipV: false },
        { id: "c2", kind: "rect", parentId: "g", x: 250, y: 160, width: 40, height: 30, flipH: false, flipV: false },
      ],
    };
    const api = createTransformApi({
      getDoc: () => doc,
      setDoc: (next) => { doc = next; },
      getSelectedGroup: () => doc.nodes[0],
      getSelectedIds: () => ["c1", "c2"],
    });

    await api.flipHorizontal();
    const c1H = doc.nodes.find((n) => n.id === "c1");
    const c2H = doc.nodes.find((n) => n.id === "c2");
    expect(c1H.x).toBe(250);
    expect(c1H.flipH).toBe(true);
    expect(c2H.x).toBe(110);
    expect(c2H.flipH).toBe(true);

    await api.flipVertical();
    const c1V = doc.nodes.find((n) => n.id === "c1");
    const c2V = doc.nodes.find((n) => n.id === "c2");
    expect(c1V.y).toBe(170);
    expect(c1V.flipV).toBe(true);
    expect(c2V.y).toBe(110);
    expect(c2V.flipV).toBe(true);
  });

  it("pastes a copied group and preserves group unit selection with selectedGroupId", async () => {
    const f = createNodesFixture([
      { id: "g1", kind: "group", x: 50, y: 50, width: 100, height: 100 },
      { id: "c1", kind: "rect", parentId: "g1", x: 60, y: 60, width: 20, height: 20 },
    ]);
    const clipboard = createClipboard({
      getDoc: f.doc,
      setDoc: f.setDoc,
      selection: f.selection,
      selectMany: f.controller.selectMany,
      select: f.controller.select,
      getSelectedGroup: f.controller.getSelectedGroup,
      selectGroup: f.controller.selectGroup,
      removeIds: () => true,
      getPixelSelection: () => null,
      layerFromSelection: () => {},
      extractSelectionImageNode: () => null,
      deleteSelectionPixels: () => {},
      exportSelectionPng: () => null,
      maskTools: { api: { getMaskEdit: () => null } },
      getViewportCenter: () => ({ x: 200, y: 200 }),
    });

    f.controller.selectGroup("g1");
    expect(f.controller.getSelectedGroup()?.id).toBe("g1");

    await clipboard.copySelected();
    expect(clipboard.hasLayerClipboard()).toBe(true);

    clipboard.paste();
    const pastedGroup = f.doc().nodes.find((n) => n.kind === "group" && n.id !== "g1");
    expect(pastedGroup).toBeDefined();
    expect(f.controller.getSelectedGroup()?.id).toBe(pastedGroup.id);
  });
});
