import { describe, expect, it, vi } from "vitest";
import { createClipboard } from "../../src/canvas/editor/editor_clipboard.js";
import { createEngineNodeOps } from "../../src/canvas/editor/editor_engine_node_ops.js";
import {
  createDocument,
  createGroupNode,
} from "../../src/canvas/editor/scene_model.js";
import { createSelection } from "../../src/canvas/editor/editor_selection.js";

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

  it("clears selected descendants when a Frame is deleted directly", () => {
    let doc = createDocument(800, 600);
    const frame = {
      ...createGroupNode({ x: 40, y: 50, width: 320, height: 240 }),
      isFrame: true,
    };
    const child = {
      id: "frame-child",
      kind: "rect",
      parentId: frame.id,
      x: 80,
      y: 90,
      width: 40,
      height: 30,
    };
    doc.nodes.push(frame, child);
    const selection = createSelection();
    selection.selectNode(child.id);
    const requestRender = vi.fn();
    const nodeOperations = createEngineNodeOps({
      getDoc: () => doc,
      setDoc: (next) => { doc = next; },
      selection,
      requestRender,
      notify: vi.fn(),
    });

    nodeOperations.removeNode(frame.id);

    expect(doc.nodes).toEqual([]);
    expect(selection.getIds()).toEqual([]);
    expect(requestRender).toHaveBeenCalledOnce();
  });
});
