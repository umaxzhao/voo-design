import { describe, expect, it } from "vitest";
import { booleanContours, booleanOutlineNode } from "../../src/canvas/editor/boolean-outline.js";
import { isPointInMultiLoopShape } from "../../src/canvas/editor/path-boolean-clipping.js";
import { booleanNodeMarkup } from "../../src/canvas/editor/svg-boolean.js";
import { documentToSvg } from "../../src/canvas/editor/editor_svg.js";
import { elementFor } from "../../src/canvas/editor/skia_adapter_elements.js";
import { documentToScene, requiresCanvas2dMediaFallback } from "../../src/canvas/editor/skia_scene_adapter.js";

const source = (x, y, w = 100, h = 100) => ({ type: "rect", x, y, w, h });
const boolean = (operation) => ({ id: "combined", kind: "boolean", operation,
  x: 80000, y: 90000, width: 150, height: 140, visible: true,
  fill: "#ffffff", stroke: "#ff0000", strokeWidth: 10,
  sources: [source(0, 0), source(50, 40)] });

describe("merged Boolean outline", () => {
  it.each([
    ["union", [true, true, true]], ["subtract", [true, false, false]],
    ["intersect", [false, true, false]], ["exclude", [true, false, true]],
  ])("computes %s in local coordinates without changing operands", (operation, expected) => {
    const node = boolean(operation), before = JSON.stringify(node);
    const contours = booleanContours(node);
    expect([[20, 20], [80, 60], [130, 80]].map(([x, y]) =>
      isPointInMultiLoopShape({ x, y }, contours))).toEqual(expected);
    expect(JSON.stringify(node)).toBe(before);
    expect(booleanOutlineNode(node)).toMatchObject({ x: 80000, y: 90000,
      kind: "path", fillRule: "evenodd", strokeAlign: "inside" });
  });

  it("preserves nested subtraction holes rather than flattening operands into union", () => {
    const node = boolean("union");
    node.sources = [{ type: "boolean", x: 0, y: 0, w: 100, h: 100,
      booleanOperation: "subtract", booleanSources: [source(0, 0), source(25, 25, 50, 50)] },
    source(120, 0, 20, 20)];
    const contours = booleanContours(node);
    expect(isPointInMultiLoopShape({ x: 50, y: 50 }, contours)).toBe(false);
    expect(isPointInMultiLoopShape({ x: 10, y: 10 }, contours)).toBe(true);
    expect(isPointInMultiLoopShape({ x: 130, y: 10 }, contours)).toBe(true);
  });

  it("invalidates cached local geometry when an operand changes", () => {
    const node = boolean("union"), first = booleanContours(node);
    expect(booleanContours({ ...node, x: 1, rotation: 45 })).toBe(first);
    node.sources[1].x = 200;
    const changed = booleanContours(node);
    expect(changed).not.toBe(first);
    expect(isPointInMultiLoopShape({ x: 230, y: 80 }, changed)).toBe(true);
  });

  it("applies all three intersection operands and permits XOR after an empty intermediate result", () => {
    const node = boolean("intersect");
    node.sources.push(source(120, 0, 20, 20));
    expect(booleanContours(node)).toEqual([]);
    const xor = { ...node, operation: "exclude", sources: [source(0, 0), source(0, 0), source(120, 0, 20, 20)] };
    expect(isPointInMultiLoopShape({ x: 130, y: 10 }, booleanContours(xor))).toBe(true);
    expect(isPointInMultiLoopShape({ x: 20, y: 20 }, booleanContours(xor))).toBe(false);
  });

  it("emits a single merged outline with paint alpha and container transform", () => {
    const node = { ...boolean("union"), opacity: 0.4, fillOpacity: 0.3,
      strokeOpacity: 0.6, rotation: 30, shear: 12 };
    const markup = booleanNodeMarkup(node, () => null).join("");
    expect(markup.match(/<path /g)).toHaveLength(1);
    expect(markup).toContain('fill-rule="evenodd"');
    expect(markup).toContain('opacity="0.4"');
    expect(markup).toContain('fill-opacity="0.3"');
    expect(markup).toContain('stroke-opacity="0.6"');
    expect(markup).toContain("skewX(12)");
  });

  it("keeps CanvasKit Boolean border placement and paint opacity independent of node opacity", () => {
    const mapped = elementFor({ ...boolean("union"), opacity: 0.4 }, 0, 0, 0, () => null);
    expect(mapped.opacity).toBe(0.4);
    expect(mapped.stroke).toMatchObject({ align: "inside", opacity: 1, width: 10 });
    const explicit = elementFor({ ...boolean("union"), opacity: 0.4,
      strokeAlign: "outside", strokeOpacity: 0.3 }, 0, 0, 0, () => null);
    expect(explicit.stroke).toMatchObject({ align: "outside", opacity: 0.3 });
  });

  it.each([
    { type: "path", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100, close: true }] },
    { type: "rect", shear: 12 }, { type: "rect", flipH: true },
    { type: "rect", cornerRadius: { tl: 10, tr: 0, br: 0, bl: 0 } },
  ])("uses Canvas2D when a nested operand cannot be represented natively: %j", (patch) => {
    const child = { ...source(0, 0), ...patch };
    const node = { ...boolean("union"), sources: [{ type: "boolean", x: 0, y: 0,
      w: 100, h: 100, booleanOperation: "union", booleanSources: [child, source(20, 20)] }] };
    const doc = { width: 300, height: 300, nodes: [node] };
    expect(requiresCanvas2dMediaFallback(doc)).toBe(true);
    expect(() => documentToScene(doc, {})).toThrow("Canvas2D");
  });

  it("retains exact CanvasKit operands and ordinary non-Boolean shapes on the fast path", () => {
    const node = boolean("subtract");
    node.sources[0].rotation = 45;
    expect(requiresCanvas2dMediaFallback({ nodes: [node] })).toBe(false);
    expect(requiresCanvas2dMediaFallback({ nodes: [{ id: "path", kind: "path" }] })).toBe(false);
  });

  it("exports independent strokes at distant coordinates without fixed mask bounds", () => {
    const node = { ...boolean("subtract"), strokeHidden: true,
      strokes: [{ stroke: "#0000ff", strokeWidth: 8, strokeAlign: "outside" }] };
    const markup = documentToSvg({ width: 300, height: 300, nodes: [node] });
    expect(markup).toContain('stroke="#0000ff"');
    expect(markup).not.toContain('stroke="#ff0000"');
    expect(markup).not.toContain('-50000');
    expect(markup).toContain('mask-type="luminance"');
  });
});
