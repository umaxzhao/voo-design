import { describe, expect, it } from "vitest";
import { createClipboard } from "../../src/canvas/editor/editor_clipboard.js";
import {
  createDocument,
  createRectNode,
} from "../../src/canvas/editor/scene_model.js";

describe("layer clipboard cut", () => {
  it("copies and removes the selected object, then clears its selection", async () => {
    let doc = createDocument(400, 300);
    const node = createRectNode({
      x: 20,
      y: 30,
      width: 80,
      height: 50,
      fill: "#ff0000",
    });
    doc.nodes.push(node);
    let selectedIds = [node.id];
    const clipboard = createClipboard({
      getDoc: () => doc,
      setDoc: (next) => { doc = next; },
      selection: { getIds: () => selectedIds },
      selectMany: (ids) => { selectedIds = ids; },
      select: (id) => { selectedIds = id ? [id] : []; },
      removeIds: (ids) => {
        const removed = new Set(ids);
        const nodes = doc.nodes.filter((candidate) => !removed.has(candidate.id));
        if (nodes.length === doc.nodes.length) return false;
        doc = { ...doc, nodes };
        return true;
      },
      getPixelSelection: () => null,
      layerFromSelection: () => {},
      extractSelectionImageNode: () => null,
      deleteSelectionPixels: () => {},
      exportSelectionPng: () => null,
      maskTools: {},
      getViewportCenter: () => ({ x: 200, y: 150 }),
    });

    await clipboard.cutSelected();

    expect(doc.nodes).toEqual([]);
    expect(selectedIds).toEqual([]);
    expect(clipboard.hasLayerClipboard()).toBe(true);
  });
});
