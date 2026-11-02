import { describe, it, expect } from "vitest";
import { previewDirtyRect } from "../../src/canvas/editor/preview_dirty_rect.js";
import { createRectNode } from "../../src/canvas/editor/scene_model.js";
const node = createRectNode({ x: 0, y: 0, width: 20, height: 20 });
const doc = { width: 100, height: 100, nodes: [node] };
describe("preview damage", () => {
  it("covers old and new paint plus selection chrome at the current zoom", () => {
    expect(previewDirtyRect(doc, { ...doc, nodes: [{ ...node, x: 50 }] }, 2))
      .toEqual({ x: -16, y: -16, width: 102, height: 52 });
  });
  it("falls back for page changes, complex paint, insertion and reordering", () => {
    expect(previewDirtyRect(doc, { ...doc, width: 200 })).toBeNull();
    expect(previewDirtyRect(doc, { ...doc, nodes: [{ ...node, strokeWidth: 2 }] })).toBeNull();
    expect(previewDirtyRect(doc, { ...doc, nodes: [node, node] })).toBeNull();
    expect(previewDirtyRect(doc, { ...doc, nodes: [{ ...node, id: "replacement" }] })).toBeNull();
  });
  it("does not infer damage for unchanged nodes", () => {
    expect(previewDirtyRect(doc, doc)).toBeNull();
  });
});
