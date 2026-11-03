import { describe, expect, it } from "vitest";
import { containerOpacity, createContainerOpacityPlan, containerPaintNode } from "../../src/canvas/editor/container-opacity.js";
import { needsStyleIsolation, isolatedStyleNode } from "../../src/canvas/editor/render-isolated-style.js";
import { documentToSvg } from "../../src/canvas/editor/editor_svg.js";
import { requiresCanvas2dMediaFallback } from "../../src/canvas/editor/skia_scene_adapter.js";

const group = (id, extra = {}) => ({ id, kind: "group", visible: true,
  x: 0, y: 0, width: 100, height: 100, opacity: 0.5, ...extra });
const rect = (id, extra = {}) => ({ id, kind: "rect", visible: true,
  x: 10, y: 10, width: 30, height: 30, fill: "#ff0000", ...extra });

describe("isolated container opacity", () => {
  it("keeps opaque containers and ordinary node alpha on the flat path", () => {
    const nodes = [rect("child", { parentId: "g" }), group("g", { opacity: 1 }), rect("sibling", { opacity: 0.3 })];
    expect(createContainerOpacityPlan(nodes).entries(nodes)).toEqual(nodes.map(node => ({ node })));
    expect(containerOpacity(nodes[2])).toBe(1);
  });

  it("retains member order and puts an interleaved subtree at its first member", () => {
    const g = group("g"), first = rect("a", { parentId: "g" });
    const last = rect("b", { parentId: "g" }), sibling = rect("sibling");
    const nodes = [first, sibling, g, last];
    const plan = createContainerOpacityPlan(nodes);
    expect(plan.entries(nodes)).toEqual([{ container: g, nodes: [first, g, last] }, { node: sibling }]);
    expect(plan.positionOf(last)).toBe(3);
    expect(createContainerOpacityPlan(nodes)).toBe(plan);
  });

  it("isolates nested alpha independently without replacing stored node values", () => {
    const outer = group("outer"), inner = group("inner", { parentId: "outer" });
    const child = rect("child", { parentId: "inner" });
    const nodes = [outer, inner, child], plan = createContainerOpacityPlan(nodes);
    expect(plan.entries(nodes)).toEqual([{ container: outer, nodes }]);
    expect(plan.entries(nodes, new Set([outer.id]))).toEqual([{ node: outer }, { container: inner, nodes: [inner, child] }]);
    expect(containerPaintNode(outer, new Set([outer.id]))).toMatchObject({ opacity: 1 });
    expect(outer.opacity).toBe(0.5);
  });

  it("retains a container's paint identity across camera passes and invalidates on edits", () => {
    const original = group("frame", { clipTo: "mask" });
    const isolated = new Set([original.id]);
    const painted = containerPaintNode(original, isolated);
    expect(containerPaintNode(original, new Set(isolated))).toBe(painted);
    expect(painted).toMatchObject({ opacity: 1, clipTo: null, blendMode: "source-over" });
    const edited = { ...original, width: 240 };
    expect(containerPaintNode(edited, isolated)).not.toBe(painted);
    expect(containerPaintNode(edited, isolated).width).toBe(240);
    expect(containerPaintNode(original, new Set())).toBe(original);
    expect(original.clipTo).toBe("mask");
  });

  it("terminates malformed cycles and clamps finite alpha", () => {
    const a = group("a", { parentId: "b", opacity: -1 }), b = group("b", { parentId: "a", opacity: 2 });
    expect(containerOpacity(a)).toBe(0);
    expect(containerOpacity(b)).toBe(1);
    expect(createContainerOpacityPlan([a, b]).entries([a, b])).toHaveLength(1);
  });

  it("applies SVG group alpha once and sends unsupported flat scenes to Canvas2D", () => {
    const g = group("g", { isFrame: true, fill: "#0000ff" }), child = rect("child", { parentId: "g" });
    const doc = { isCanvasRoot: true, width: 100, height: 100, nodes: [g, child] };
    const svg = documentToSvg(doc);
    expect(svg.match(/opacity="0.5"/g)).toHaveLength(1);
    expect(svg).toContain('<g opacity="0.5">');
    expect(requiresCanvas2dMediaFallback(doc)).toBe(true);
    expect(g.opacity).toBe(0.5);
  });

  it("blends isolated native groups once while rejecting unrepresentable PSD SVG math", () => {
    const g = group("g", { isFrame: true, blendMode: "multiply" });
    const child = rect("child", { parentId: "g" });
    const doc = { isCanvasRoot: true, width: 100, height: 100, nodes: [g, child] };
    expect(documentToSvg(doc)).toContain('style="mix-blend-mode:multiply"');
    expect(containerPaintNode(g, new Set([g.id]))).toMatchObject({ opacity: 1, blendMode: "source-over" });
    expect(g.blendMode).toBe("multiply");
    expect(() => documentToSvg({ ...doc, nodes: [{ ...g, blendMode: "linear-burn" }, child] }))
      .toThrow("svg-unsupported-isolated-blend:linear-burn");
    expect(() => documentToSvg({ ...doc, nodes: [{ ...g, maskBase: true, blendMode: "subtract" }] }))
      .toThrow("svg-unsupported-isolated-blend:subtract");
  });
});


describe("LINUX-STYLE01 layer paint opacity", () => {
  it("isolates translucent paint stacks and applies layer opacity only at composition", () => {
    const node = rect("paint", { opacity: 0.5, fillOpacity: 1,
      stroke: "#0000ff", strokeWidth: 10, strokeOpacity: 1 });
    expect(needsStyleIsolation(node)).toBe(true);
    expect(needsStyleIsolation(node, { isolatedStyle: true })).toBe(false);
    expect(isolatedStyleNode(node)).toMatchObject({ opacity: 1, fillOpacity: 1, strokeOpacity: 1 });
    expect(node.opacity).toBe(0.5);
    expect(needsStyleIsolation({ ...node, opacity: 1 })).toBe(false);
  });

  it("exports one layer opacity around multiple fills and strokes", () => {
    const node = rect("paint", { opacity: 0.5, fillOpacity: 0.4,
      fills: [{ fill: "#ff0000", opacity: 0.5 }, { fill: "#00ff00", opacity: 1 }],
      stroke: "#0000ff", strokeWidth: 10,
      strokes: [{ stroke: "#ffff00", strokeWidth: 4 }] });
    const svg = documentToSvg({ width: 100, height: 100, nodes: [node] });
    expect(svg.match(/(?<!-)opacity="0.5"/g)).toHaveLength(1);
    expect(svg).toContain('<g opacity="0.5">');
    expect(svg).toContain('fill-opacity="0.5"');
    expect(node.fills[0].opacity).toBe(0.5);
  });
});
