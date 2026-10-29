import { describe, it, expect } from "vitest";
import { createClipboard } from "../../src/canvas/editor/editor_clipboard.js";
import {
  createDocument,
  createGroupNode,
  NODE_KIND,
} from "../../src/canvas/editor/scene_model.js";

describe("Power Duplicate (Cmd+D) Geometric Progression", () => {
  it("repeats translation, rotation, and geometric scale deltas", () => {
    let doc = createDocument(800, 600);
    const rectNode = {
      id: "rect-1",
      kind: NODE_KIND.RECT,
      x: 100,
      y: 100,
      width: 50,
      height: 50,
      rotation: 0,
    };
    doc.nodes.push(rectNode);

    let selectedIds = ["rect-1"];
    const selection = {
      getIds: () => selectedIds,
      getId: () => selectedIds[0] ?? null,
    };

    const clipboard = createClipboard({
      getDoc: () => doc,
      setDoc: (next) => {
        doc = next;
      },
      selection,
      selectMany: (ids) => {
        selectedIds = ids;
      },
      select: (id) => {
        selectedIds = id ? [id] : [];
      },
      removeIds: () => true,
      getPixelSelection: () => null,
      layerFromSelection: () => {},
      extractSelectionImageNode: () => null,
      deleteSelectionPixels: () => {},
      exportSelectionPng: () => null,
      maskTools: {},
      getViewportCenter: () => ({ x: 400, y: 300 }),
    });

    // 1st duplicate: rect-1 duplicated to copy-1 at same position
    clipboard.duplicateSelected();
    expect(doc.nodes.length).toBe(2);
    const copy1 = doc.nodes[1];
    expect(selectedIds).toEqual([copy1.id]);
    expect(copy1.x).toBe(100);
    expect(copy1.y).toBe(100);

    // User transforms copy-1: move (+20, +20), rotate +10 deg, scale 1.2x (50 -> 60)
    copy1.x = 120;
    copy1.y = 120;
    copy1.rotation = 10;
    copy1.width = 60;
    copy1.height = 60;

    // 2nd duplicate: copy-2 should be placed at (140, 140), rotation 20, width 72
    clipboard.duplicateSelected();
    expect(doc.nodes.length).toBe(3);
    const copy2 = doc.nodes[2];
    expect(copy2.x).toBe(140);
    expect(copy2.y).toBe(140);
    expect(copy2.rotation).toBe(20);
    expect(copy2.width).toBe(72);
    expect(copy2.height).toBe(72);

    // 3rd duplicate: copy-3 should continue progression: x=160, y=160, rot=30, width=round(72*1.2)=86
    clipboard.duplicateSelected();
    expect(doc.nodes.length).toBe(4);
    const copy3 = doc.nodes[3];
    expect(copy3.x).toBe(160);
    expect(copy3.y).toBe(160);
    expect(copy3.rotation).toBe(30);
    expect(copy3.width).toBe(Math.round(72 * 1.2));
  });

  it("keeps a duplicated frame selected instead of dropping the selection", () => {
    let doc = createDocument(800, 600);
    const frame = {
      ...createGroupNode({ x: 50, y: 60, width: 300, height: 200 }),
      isFrame: true,
    };
    const child = {
      id: "frame-child",
      kind: NODE_KIND.RECT,
      parentId: frame.id,
      x: 70,
      y: 80,
      width: 40,
      height: 30,
    };
    doc.nodes.push(frame, child);
    let selectedIds = [frame.id];
    const clipboard = createClipboard({
      getDoc: () => doc,
      setDoc: (next) => { doc = next; },
      selection: { getIds: () => selectedIds },
      selectMany: (ids) => { selectedIds = ids; },
      select: (id) => { selectedIds = id ? [id] : []; },
      removeIds: () => true,
      getPixelSelection: () => null,
      layerFromSelection: () => {},
      extractSelectionImageNode: () => null,
      deleteSelectionPixels: () => {},
      exportSelectionPng: () => null,
      maskTools: {},
      getViewportCenter: () => ({ x: 400, y: 300 }),
    });

    clipboard.duplicateSelected();

    expect(selectedIds).toHaveLength(1);
    expect(doc.nodes.find((node) => node.id === selectedIds[0])).toMatchObject({
      kind: NODE_KIND.GROUP,
      isFrame: true,
    });
  });
});
