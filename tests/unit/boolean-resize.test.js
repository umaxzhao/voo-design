import { describe, expect, it } from "vitest";
import { createBooleanNode, createRectNode, booleanSourceOf } from "../../src/canvas/editor/scene_model.js";
import { updateNode, updateNodes } from "../../src/canvas/editor/doc_ops_nodes.js";
import { setDocumentSize } from "../../src/canvas/editor/doc_ops_canvas.js";
import { reflowFrameNodeResize, reflowDocumentResize } from "../../src/canvas/editor/document-resize-constraints.js";
import { reflowAutoLayout } from "../../src/canvas/editor/scene_auto_layout.js";
import { fromNodeLocal } from "../../src/canvas/editor/scene_geometry_transform.js";
import { transformBooleanChild } from "../../src/canvas/editor/boolean-box-transform.js";
import { serialiseDocument, deserialiseDocument } from "../../src/canvas/editor/scene_model_serialization.js";
import { moveWithFollowers } from "../../src/canvas/editor/doc_ops_move.js";

function fixture(children = false) {
  const a = { ...createRectNode({ x: 100, y: 100, width: 100, height: 80, fill: "#ff0000" }), id: "a" };
  const b = { ...createRectNode({ x: 150, y: 100, width: 100, height: 80, fill: "#ff0000" }), id: "b" };
  const node = { ...createBooleanNode([a, b], "subtract"), id: "boolean", lockRatio: false };
  return { width: 600, height: 400, nodes: children
    ? [node, { ...a, parentId: node.id }, { ...b, parentId: node.id }] : [node] };
}
const get = (doc, id = "boolean") => doc.nodes.find(node => node.id === id);

describe("Boolean box mutation contract", () => {
  it.each([false, true])("scales %s child-backed geometry and moves it without changing local source offsets", children => {
    const doc = fixture(children), before = structuredClone(doc);
    const resized = updateNode(doc, "boolean", { width: 300, height: 160 });
    expect(get(resized)).toMatchObject({ x: 100, y: 100, width: 300, height: 160 });
    expect(get(resized).sources.map(s => [s.x, s.y, s.w, s.h])).toEqual([[0, 0, 200, 160], [100, 0, 200, 160]]);
    const moved = updateNode(resized, "boolean", { x: 200, y: 150 });
    expect(get(moved).sources.map(s => [s.x, s.y, s.w, s.h])).toEqual(get(resized).sources.map(s => [s.x, s.y, s.w, s.h]));
    if (children) expect(get(moved, "a")).toMatchObject({ x: 200, y: 150, width: 200, height: 160 });
    expect(doc).toEqual(before);
  });

  it("keeps parent and child geometry explicit in a batch without double scaling", () => {
    const doc = fixture(true);
    const next = updateNodes(doc, [
      { id: "boolean", width: 300, height: 160 },
      { id: "a", x: 100, y: 100, width: 200, height: 160 },
      { id: "b", x: 200, y: 100, width: 200, height: 160 },
    ]);
    expect(get(next, "b")).toMatchObject({ x: 200, width: 200 });
    expect(get(next).sources.map(s => [s.x, s.w])).toEqual([[0, 200], [100, 200]]);
    expect(get(updateNode(next, "boolean", { fill: "#0000ff" }))).toMatchObject({ x: 100, width: 300, height: 160 });
    const moved = moveWithFollowers(next, ["boolean"], 25, 10);
    expect(get(moved, "a")).toMatchObject({ x: 125, y: 110, width: 200, height: 160 });
    expect(get(moved).sources).toEqual(get(next).sources);
  });

  it("refreshes nested sources bottom-up after both parent resize and an operand edit", () => {
    const doc = fixture(true);
    const outside = { ...createRectNode({ x: 300, y: 100, width: 20, height: 80, fill: "#ff0000" }), id: "c" };
    const root = { ...createBooleanNode([get(doc), outside], "union"), id: "root" };
    doc.nodes = [root, { ...get(doc), parentId: root.id }, ...doc.nodes.slice(1), { ...outside, parentId: root.id }];
    const next = updateNode(doc, root.id, { width: root.width * 2, height: root.height * 2 });
    const child = get(next);
    expect(child.width).toBe(300);
    expect(get(next, "a").width).toBe(200);
    expect(get(next, "root").sources[0].booleanSources[0].w).toBe(200);
    const edited = updateNode(next, "a", { width: 180 });
    expect(get(edited, "root").sources[0].booleanSources[0].w).toBe(180);
  });

  it("does not clamp inherited subpixel operands or lose ratios on a second resize", () => {
    const doc = fixture(true);
    const outside = { ...createRectNode({ x: 300, y: 100, width: 20, height: 80 }), id: "c" };
    const root = { ...createBooleanNode([get(doc), outside], "union"), id: "root" };
    doc.nodes = [root, { ...get(doc), parentId: root.id }, ...doc.nodes.slice(1), { ...outside, parentId: root.id }];
    const small = updateNode(doc, "root", { width: 1, height: 1 });
    expect(get(small).width).toBeCloseTo(150 / 220);
    expect(get(small, "a").width).toBeCloseTo(100 / 220);
    const enlarged = updateNode(small, "root", { width: 440, height: 160 });
    expect(get(enlarged).width).toBeCloseTo(300);
    expect(get(enlarged, "a").width).toBeCloseTo(200);
  });

  it("affinely maps rotated/sheared/flipped operand corners during nonuniform resizing", () => {
    const child = { id: "operand", kind: "rect", x: 140, y: 120, width: 100, height: 60,
      rotation: 35, shear: 18, flipH: true, flipV: true };
    const before = { x: 100, y: 100, width: 200, height: 100 };
    const after = { x: 80, y: 70, width: 500, height: 120 };
    const transformed = transformBooleanChild(child, before, after);
    for (const [rx, ry] of [[0, 0], [1, 0], [0.5, 0.5], [1, 1]]) {
      const original = fromNodeLocal(child, { x: rx * child.width, y: ry * child.height });
      const actual = fromNodeLocal(transformed, { x: rx * transformed.width, y: ry * transformed.height });
      expect(actual.x).toBeCloseTo(after.x + (original.x - before.x) * 2.5, 8);
      expect(actual.y).toBeCloseTo(after.y + (original.y - before.y) * 1.2, 8);
    }
    expect(booleanSourceOf(transformed, 0, 0)).toMatchObject({ shear: transformed.shear, flipH: true, flipV: true });
  });

  it.each([false, true])("handles page constraints and explicit page scaling for child-backed=%s", children => {
    const doc = fixture(children);
    doc.nodes[0].constraints = { horizontal: "scale", vertical: "scale" };
    const next = reflowDocumentResize(doc, { ...doc, width: 1200, height: 800 });
    expect(get(next).sources.map(s => [s.x, s.w])).toEqual([[0, 200], [100, 200]]);
    const scaled = setDocumentSize(doc, 1200, 800, { scaleMode: "width" });
    expect(get(scaled).sources.map(s => [s.x, s.w])).toEqual([[0, 200], [100, 200]]);
    if (children) expect(get(scaled, "a")).toMatchObject({ x: 200, y: 200, width: 200, height: 160 });
  });

  it("scales constrained Boolean operands once when a containing Frame resizes", () => {
    const doc = fixture(true);
    const frame = { id: "frame", kind: "group", isFrame: true, x: 50, y: 50, width: 300, height: 200 };
    doc.nodes = [frame, ...doc.nodes.map(node => node.id === "boolean"
      ? { ...node, parentId: frame.id, constraints: { horizontal: "scale", vertical: "scale" } } : node)];
    const next = reflowFrameNodeResize(doc, frame.id, { width: 600, height: 400 });
    expect(get(next)).toMatchObject({ x: 150, y: 150, width: 300, height: 160 });
    expect(get(next, "a")).toMatchObject({ x: 150, y: 150, width: 200, height: 160 });
    expect(get(next).sources[0]).toMatchObject({ x: 0, y: 0, w: 200, h: 160 });
  });

  it("fills Auto Layout dimensions and remains stable through repeated layout passes", () => {
    const doc = fixture(true);
    const frame = { id: "frame", kind: "group", x: 50, y: 50, width: 300, height: 160,
      autoLayout: { direction: "horizontal", widthMode: "fixed", heightMode: "fixed", padding: 0, gap: 0 } };
    doc.nodes = [frame, ...doc.nodes.map(node => node.id === "boolean"
      ? { ...node, parentId: frame.id, layoutWidth: "fill", layoutHeight: "fill" } : node)];
    const next = reflowAutoLayout(doc);
    expect(get(next)).toMatchObject({ x: 50, y: 50, width: 300, height: 160 });
    expect(get(next, "a")).toMatchObject({ x: 50, y: 50, width: 200, height: 160 });
    expect(reflowAutoLayout(next)).toEqual(next);
  });

  it("keeps rotation/shear as container transforms and serializes resized source geometry losslessly", () => {
    const doc = fixture(true);
    const next = updateNode(doc, "boolean", { width: 300, height: 120, rotation: 30, shear: 12, flipH: true });
    expect(get(next, "a")).toMatchObject({ x: 100, y: 100, width: 200, height: 120 });
    const reopened = deserialiseDocument(serialiseDocument(next));
    expect(get(reopened).sources).toEqual(get(next).sources);
    expect(get(reopened)).toMatchObject({ width: 300, height: 120, rotation: 30, shear: 12, flipH: true });
    expect(get(reopened, "a").parentId).toBe("boolean");
    expect(get(reopened, "b").parentId).toBe("boolean");
  });

  it("clamps invalid negative dimensions at one pixel without introducing implicit flips", () => {
    const doc = fixture(false), next = updateNode(doc, "boolean", { width: -300, height: 0 });
    expect(get(next)).toMatchObject({ width: 1, height: 1 });
    expect(get(next).flipH).not.toBe(true);
    expect(get(next).sources[0].w).toBeCloseTo(2 / 3);
  });

  it.each(["rect", "path"])("bakes only unrepresentable %s operands while preserving identities, controls and saved geometry", kind => {
    const doc = fixture(true);
    if (kind === "path") doc.nodes[1] = { ...doc.nodes[1], kind: "path", poly: true,
      baseWidth: 50, baseHeight: 40, points: [[0, 0], [50, 0], [50, 40], [0, 40]] };
    const initial = updateNode(doc, "a", { rotation: 45,
      constraints: { horizontal: "right", vertical: "bottom" }, strokeWidth: 3 });
    const original = get(initial, "a");
    const next = updateNode(initial, "boolean", { width: 7500, height: 40 });
    const a = get(next, "a");
    expect(a).toMatchObject({ id: "a", kind: "path", pen: true, rotation: 0, shear: 0,
      strokeWidth: 3, constraints: original.constraints, parentId: "boolean" });
    for (const [index, [x, y]] of [[0, [0, 0]], [1, [100, 0]], [2, [100, 80]], [3, [0, 80]]]) {
      const corner = fromNodeLocal(original, { x, y });
      const point = a.points[index];
      expect(a.x + point.x).toBeCloseTo(100 + (corner.x - 100) * 50, 8);
      expect(a.y + point.y).toBeCloseTo(100 + (corner.y - 100) * 0.5, 8);
    }
    const reopened = deserialiseDocument(serialiseDocument(next));
    expect(get(reopened, "a").points).toEqual(a.points);
    expect(get(reopened, "a").parentId).toBe("boolean");
    expect(get(reopened).sources).toEqual(get(next).sources);
  });

  it("flattens an unrepresentable nested operand without leaving its old children painting separately", () => {
    const doc = fixture(true);
    const outside = { ...createRectNode({ x: 300, y: 100, width: 20, height: 80 }), id: "c" };
    const root = { ...createBooleanNode([get(doc), outside], "union"), id: "root" };
    doc.nodes = [root, { ...get(doc), rotation: 45, parentId: "root" }, ...doc.nodes.slice(1), { ...outside, parentId: "root" }];
    const next = updateNode(doc, "root", { width: root.width * 100, height: root.height / 2 });
    expect(get(next).kind).toBe("path");
    expect(next.nodes.map(node => node.id)).toEqual(["root", "boolean", "c"]);
    expect(get(next, "root").sources[0].type).toBe("path");
  });
});
