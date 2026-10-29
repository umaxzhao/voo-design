import { describe, expect, it } from "vitest";
import { createClipboard } from "../../src/canvas/editor/editor_clipboard.js";
import { createEngineNodeOps } from "../../src/canvas/editor/editor_engine_node_ops.js";
import {
  createDocument,
  createGroupNode,
} from "../../src/canvas/editor/scene_model.js";

describe("deleting a duplicated empty Frame", () => {
  it("removes only the duplicate and preserves the original Frame", () => {
    let doc = createDocument(800, 600);
    const original = {
      ...createGroupNode({ x: 40, y: 50, width: 320, height: 240 }),
      isFrame: true,
    };
    doc.nodes.push(original);
    let selectedIds = [original.id];
    const nodeOperations = createEngineNodeOps({
      getDoc: () => doc,
      setDoc: (next) => { doc = next; },
    });
    const clipboard = createClipboard({
      getDoc: () => doc,
      setDoc: (next) => { doc = next; },
      selection: { getIds: () => selectedIds },
      selectMany: (ids) => { selectedIds = ids; },
      select: (id) => { selectedIds = id ? [id] : []; },
      removeIds: nodeOperations.removeIds,
      getPixelSelection: () => null,
      layerFromSelection: () => {},
      extractSelectionImageNode: () => null,
      deleteSelectionPixels: () => {},
      exportSelectionPng: () => null,
      maskTools: { api: { getMaskEdit: () => null } },
      getViewportCenter: () => ({ x: 400, y: 300 }),
    });

    clipboard.duplicateSelected();
    const duplicateId = selectedIds[0];
    expect(duplicateId).not.toBe(original.id);

    clipboard.deleteSelected();

    expect(doc.nodes.map((node) => node.id)).toEqual([original.id]);
    expect(doc.nodes[0]).toMatchObject({ isFrame: true, kind: "group" });
  });
});
