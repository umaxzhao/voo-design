import { describe, expect, it } from "vitest";
import { reparentMovedRoots } from "../../src/canvas/editor/reparent-moved-roots.js";

const frame = (id, patch = {}) => ({ id, kind: "group", isFrame: true, visible: true,
  x: 300, y: 20, width: 200, height: 200, clipContent: true, ...patch });
const moving = { id: "moving", kind: "rect", x: 360, y: 60, width: 80, height: 60, visible: true };
const doc = nodes => ({ isCanvasRoot: true, width: 900, height: 600, nodes });
const drop = nodes => reparentMovedRoots(doc(nodes), [{ id: "moving" }]);
const parent = result => result.nodes.find(node => node.id === "moving").parentId ?? null;

describe("visible Frame drop contracts", () => {
  it("accepts a Frame whose default-visible flag is omitted", () => {
    const target = frame("target");
    delete target.visible;
    expect(parent(drop([target, moving]))).toBe("target");
  });

  it("keeps a root with kind:frame independent of overlapping Frames", () => {
    const rootFrame = { ...moving, kind: "frame" };
    const original = doc([frame("target"), rootFrame]);
    expect(reparentMovedRoots(original, [{ id: "moving" }])).toBe(original);
  });

  it("uses a front overlapping Frame even when the obscured Frame has a smaller area", () => {
    expect(parent(drop([frame("rear"), frame("front", { x: 350, width: 220 }), moving]))).toBe("front");
  });

  it("does not enter a nested Frame through a clipped-out part of its ancestor", () => {
    expect(parent(drop([frame("outer", { width: 120 }),
      frame("nested", { x: 390, width: 200, parentId: "outer" }), { ...moving, x: 480 }]))).toBeNull();
  });

  it("allows an overflowing nested Frame when its ancestor explicitly disables clipping", () => {
    expect(parent(drop([frame("outer", { width: 120, clipContent: false }),
      frame("nested", { x: 390, width: 200, parentId: "outer" }), { ...moving, x: 480 }]))).toBe("nested");
  });

  it.each([{ visible: false }, { locked: true }])("does not target a hidden or locked ancestor subtree: %j", patch => {
    expect(parent(drop([frame("outer", patch), frame("nested", { parentId: "outer" }), moving]))).toBeNull();
  });

  it("detaches above a locked root instead of disappearing underneath its fill", () => {
    const result = drop([frame("source", { x: 20 }),
      { ...moving, parentId: "source" }, frame("locked-target", { locked: true })]);
    expect(parent(result)).toBeNull();
    expect(result.nodes.map(node => node.id)).toEqual(["source", "locked-target", "moving"]);
  });

  it("tests rotated Frame geometry rather than its unrotated bounding box", () => {
    const rotated = frame("rotated", { rotation: 45 });
    expect(parent(drop([rotated, { ...moving, x: 285, y: 5, width: 20, height: 20 }]))).toBeNull();
    expect(parent(drop([rotated, moving]))).toBe("rotated");
  });

  it("appends a moved subtree after all target descendants but below the next foreground root", () => {
    const nodes = [frame("target"), frame("nested", { parentId: "target", x: 600 }),
      { id: "old-leaf", kind: "rect", parentId: "nested", visible: true, x: 700, y: 500, width: 40, height: 30 },
      { id: "foreground", kind: "rect", visible: true, x: 750, y: 500, width: 40, height: 30 },
      { ...moving, kind: "group" },
      { id: "moving-leaf", kind: "rect", parentId: "moving", visible: true, x: 370, y: 70, width: 20, height: 20 }];
    const result = reparentMovedRoots(doc(nodes), [{ id: "moving" }, { id: "moving-leaf" }]);
    expect(result.nodes.map(node => node.id)).toEqual(["target", "nested", "old-leaf", "moving", "moving-leaf", "foreground"]);
    expect(result.nodes.find(node => node.id === "moving").parentId).toBe("target");
    expect(result.nodes.find(node => node.id === "moving-leaf").parentId).toBe("moving");
  });
});
