import { describe, expect, it } from "vitest";
import { pasteLayerNodes } from "../../src/canvas/editor/layer-paste.js";
const frame = id => ({ id, kind: "group", isFrame: true, visible: true,
  x: 100, y: 100, width: 300, height: 200 });
const shape = (id, parentId, patch = {}) => ({ id, kind: "rect", parentId, visible: true,
  x: 120, y: 120, width: 40, height: 30, fill: "#ff0000", ...patch });
const doc = nodes => ({ canvasId: "same", width: 900, height: 600, nodes });

describe("pasted ownership and stacking", () => {
  it("inserts a pasted child into the destination block below unrelated foreground roots", () => {
    const source = shape("source", "old");
    const original = doc([frame("old"), source, frame("target"), shape("above", null)]);
    const result = pasteLayerNodes(original, { nodes: [source], sourceCanvasId: "same" }, ["target"], null);
    const copy = result.doc.nodes.find(n => result.selectedIds.includes(n.id));
    expect(copy.parentId).toBe("target");
    expect(result.doc.nodes.indexOf(copy)).toBeLessThan(result.doc.nodes.findIndex(n => n.id === "above"));
    expect(original.nodes).toHaveLength(4);
  });
  it("does not paste a copied root Frame into itself", () => {
    const root = frame("original"), source = shape("child", root.id);
    const result = pasteLayerNodes(doc([root, source]), { nodes: [root, source], sourceCanvasId: "same" }, [root.id], null);
    const copiedRoot = result.doc.nodes.find(n => result.selectedIds.includes(n.id));
    expect(copiedRoot.parentId).toBeNull();
    expect(result.doc.nodes.find(n => n.id !== source.id && n.kind === "rect").parentId).toBe(copiedRoot.id);
  });
  it("removes an external clipping link when pasting a follower into a different Frame", () => {
    const base = shape("base", "old"), source = shape("paint", "old", { clipTo: "base" });
    const result = pasteLayerNodes(doc([frame("old"), base, source, frame("target")]),
      { nodes: [source], sourceCanvasId: "same" }, ["target"], null);
    const pasted = result.doc.nodes.find(n => result.selectedIds.includes(n.id));
    expect(pasted.parentId).toBe("target"); expect(pasted.clipTo).toBeNull();
  });
  it("remaps an entire nested mask while retaining only the destination as its external owner", () => {
    const inner = { ...frame("inner"), parentId: "old" };
    const base = shape("base", "inner"), source = shape("paint", "inner", { clipTo: "base" });
    const result = pasteLayerNodes(doc([frame("old"), inner, base, source, frame("target")]),
      { nodes: [inner, base, source], sourceCanvasId: "same" }, ["target"], null);
    const added = result.doc.nodes.filter(n => !["old", "inner", "base", "paint", "target"].includes(n.id));
    const root = added.find(n => n.isFrame), paint = added.find(n => n.clipTo);
    expect(root.parentId).toBe("target"); expect(paint.parentId).toBe(root.id);
    expect(added.some(n => n.id === paint.clipTo && n.parentId === root.id)).toBe(true);
  });
});
