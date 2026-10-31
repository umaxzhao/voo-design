import { describe, expect, it } from "vitest";
import { frameAtPoint, nodeAtPoint } from "../../src/canvas/editor/doc_ops_nodes.js";
import { clipBaseBelow, createClippingMasks } from "../../src/canvas/editor/doc_ops_clipping.js";

const frame = (id, patch = {}) => ({ id, kind: "group", isFrame: true, visible: true,
  x: 0, y: 0, width: 300, height: 200, clipContent: true, ...patch });
const shape = (id, patch = {}) => ({ id, kind: "rect", visible: true,
  x: 10, y: 10, width: 50, height: 50, fill: "#ff0000", ...patch });
const document = nodes => ({ width: 900, height: 600, isCanvasRoot: true, nodes });

describe("nested Frame creation targets", () => {
  it("uses visible stacking order rather than the smallest overlapping independent Frame", () => {
    const doc = document([frame("rear", { width: 100, height: 100 }), frame("front")]);
    expect(frameAtPoint(doc, { x: 50, y: 50 })?.id).toBe("front");
  });
  it("accepts Frames whose visible field uses its default", () => {
    const target = frame("default-visible");
    delete target.visible;
    expect(frameAtPoint(document([target]), { x: 50, y: 50 })?.id).toBe(target.id);
  });
  it("does not create inside a nested Frame through a clipped-out ancestor", () => {
    const outer = frame("outer", { width: 100, height: 100 });
    const inner = frame("inner", { parentId: "outer", x: 80, y: 20, width: 100, height: 60 });
    expect(frameAtPoint(document([outer, inner]), { x: 150, y: 50 })).toBeNull();
    expect(frameAtPoint(document([{ ...outer, clipContent: false }, inner]), { x: 150, y: 50 })?.id).toBe("inner");
  });
});

describe("clipping-mask ownership", () => {
  it("does not bind the first child of a Frame to content in another Frame", () => {
    const source = shape("source", { parentId: "second" });
    const doc = document([frame("first"), shape("foreign", { parentId: "first" }), frame("second"), source]);
    expect(clipBaseBelow(doc, source)).toBeNull();
    expect(createClippingMasks(doc, [source.id])).toBe(doc);
  });
  it("uses a sibling shape rather than a nested descendant from the preceding sibling Frame", () => {
    const source = shape("source", { parentId: "outer" });
    const doc = document([frame("outer"), shape("base", { parentId: "outer" }),
      frame("inner", { parentId: "outer" }), shape("inner-leaf", { parentId: "inner" }), source]);
    expect(clipBaseBelow(doc, source)?.id).toBe("base");
  });
  it("refuses changes to a locked layer or a layer beneath a locked ancestor", () => {
    for (const parentLocked of [false, true]) {
      const source = shape("source", { parentId: "outer", locked: !parentLocked });
      const doc = document([frame("outer", { locked: parentLocked }), shape("base", { parentId: "outer" }), source]);
      expect(createClippingMasks(doc, [source.id])).toBe(doc);
    }
  });
  it("preserves identity when clipping and release have nothing to change", () => {
    const source = shape("source", { clipTo: "base" });
    const doc = document([shape("base"), source]);
    expect(createClippingMasks(doc, [source.id])).toBe(doc);
  });
});

describe("visible nested selection", () => {
  it("keeps invisible mask-only bases out of canvas hit testing", () => {
    const outer = frame("outer");
    const base = shape("base", { parentId: "outer", maskBase: true });
    expect(nodeAtPoint(document([outer, base]), { x: 30, y: 30 })?.id).toBe("outer");
  });

  it("ignores children in the rectangular overflow clipped by their Frame", () => {
    const outer = frame("outer", { width: 100, height: 100 });
    const child = shape("child", { parentId: "outer", x: 80, width: 100 });
    expect(nodeAtPoint(document([outer, child]), { x: 150, y: 30 })).toBeNull();
  });
  it("matches rounded ancestor clips instead of selecting invisible corner content", () => {
    const outer = frame("outer", { width: 100, height: 100, cornerRadius: 40 });
    const child = shape("child", { parentId: "outer", x: 0, y: 0 });
    const doc = document([outer, child]);
    expect(nodeAtPoint(doc, { x: 2, y: 2 })).toBeNull();
    expect(frameAtPoint(doc, { x: 2, y: 2 })).toBeNull();
    expect(nodeAtPoint(doc, { x: 45, y: 30 })?.id).toBe("child");
  });
});
