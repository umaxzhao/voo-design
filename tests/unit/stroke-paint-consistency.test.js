import { describe, expect, it } from "vitest";
import { createDocument, createRectNode, createTextNode, createGroupNode, serialiseDocument, deserialiseDocument } from "../../src/canvas/editor/scene_model.js";
import { drawNode } from "../../src/canvas/editor/render_node_dispatch.js";
import { documentToSvg } from "../../src/canvas/editor/editor_svg.js";
import { requiresCanvas2dMediaFallback } from "../../src/canvas/editor/skia_scene_adapter.js";
import { isPlainRect } from "../../src/canvas/editor/render_plain_rects.js";
import { promoteFixedPageToFrame } from "../../src/canvas/editor/page_to_canvas_root.js";
import { additionalStrokePaints, primaryStrokePaint } from "../../src/canvas/editor/stroke-paint-passes.js";
import { strokeMaskBounds } from "../../src/canvas/editor/svg-stroke-paints.js";
import { fromNodeLocal } from "../../src/canvas/editor/scene_geometry_transform.js";
import { strokeAlignmentState } from "../../src/canvas/components/editor_properties/stroke_alignment_control.jsx";

function context() {
  const strokes = [];
  const ctx = {
    globalAlpha: 1, globalCompositeOperation: "source-over",
    save() {}, restore() {}, beginPath() {}, rect() {}, roundRect() {},
    moveTo() {}, lineTo() {}, arcTo() {}, closePath() {}, translate() {},
    rotate() {}, scale() {}, transform() {}, setTransform() {}, setLineDash() {},
    fill() {}, fillRect() {}, stroke() { strokes.push(this.strokeStyle); },
    strokeRect() { strokes.push(this.strokeStyle); },
  };
  return { ctx, strokes };
}

const rect = (patch = {}) => ({
  ...createRectNode({ x: 20, y: 20, width: 80, height: 60, fill: "#ffffff", stroke: "#ff0000", strokeWidth: 8 }),
  id: "shape", strokeAlign: "center", ...patch,
});
const svg = (node) => documentToSvg({ ...createDocument(200, 160, "#ffffff"), nodes: [node] });

describe("independent stroke paint contract", () => {
  it("reports renderer defaults and only enables shape positions where they apply", () => {
    expect(strokeAlignmentState({ kind: "rect" })).toEqual({ closed: true, align: "inside" });
    expect(strokeAlignmentState({ kind: "path", poly: true, points: [[0, 0], [10, 10], [0, 10]] })).toEqual({ closed: true, align: "center" });
    expect(strokeAlignmentState({ kind: "path", points: [[0, 0], [10, 10]], strokeAlign: "outside" })).toEqual({ closed: false, align: "center" });
    expect(strokeAlignmentState({ kind: "text", strokeAlign: "outside" })).toEqual({ closed: false, align: "center" });
  });
  it("bounds SVG masks around the transformed stroke at distant world positions", () => {
    const node = rect({ x: 80000, y: 90000, rotation: 33, shear: 13, strokeAlign: "outside" });
    const bounds = strokeMaskBounds(node);
    const painted = fromNodeLocal(node, { x: -node.strokeWidth / 2, y: node.height / 2 });
    expect(bounds.x).toBeGreaterThan(79000);
    expect(bounds.y).toBeGreaterThan(89000);
    expect(painted.x).toBeGreaterThan(bounds.x);
    expect(painted.x).toBeLessThan(bounds.x + bounds.width);
    expect(painted.y).toBeGreaterThan(bounds.y);
    expect(painted.y).toBeLessThan(bounds.y + bounds.height);
    expect(svg(node)).not.toContain('x="-50000"');
  });
  it("paints additional strokes with a legacy fill and keeps them visible when the primary is hidden", () => {
    const node = rect({ strokeHidden: true, strokes: [{ stroke: "#0000ff", strokeWidth: 4, visible: true }] });
    const { ctx, strokes } = context();
    drawNode(ctx, node, () => null);
    expect(strokes).toEqual(["#0000ff"]);
    expect(node.stroke).toBe("#ff0000");
    expect(node.strokeWidth).toBe(8);
    expect(node.strokeHidden).toBe(true);
  });

  it("honors each additional paint visibility and excludes paint stacks from incompatible fast paths", () => {
    const node = rect({ strokeWidth: 0, strokes: [
      { stroke: "#0000ff", strokeWidth: 4, visible: false },
      { stroke: "#00ff00", strokeWidth: 2, visible: true },
    ] });
    expect(additionalStrokePaints(node).map((paint) => paint.stroke)).toEqual(["#00ff00"]);
    expect(isPlainRect(node)).toBe(false);
    expect(requiresCanvas2dMediaFallback({ nodes: [node] })).toBe(true);
    expect(requiresCanvas2dMediaFallback({ nodes: [rect({ strokeHidden: true })] })).toBe(true);
    expect(requiresCanvas2dMediaFallback({ nodes: [rect({ kind: "image" })] })).toBe(true);
    expect(requiresCanvas2dMediaFallback({ nodes: [rect({ kind: "text" })] })).toBe(true);
  });

  it("removes hidden arrowheads without mutating their source style", () => {
    const node = rect({ kind: "path", points: [[0, 0], [80, 60]], arrow: true, strokeHidden: true });
    const paint = primaryStrokePaint(node);
    expect(paint.strokeWidth).toBe(0);
    expect(paint.arrow).toBe(false);
    expect(node.arrow).toBe(true);
    expect(svg(node)).not.toContain('stroke="#ff0000"');
  });

  it("does not export hidden text or variable-width path strokes", () => {
    const text = { ...createTextNode({ x: 10, y: 10, text: "Outline", fontSize: 30 }), stroke: "#ff0000", strokeWidth: 8, strokeHidden: true };
    expect(svg(text)).not.toContain('stroke="#ff0000"');
    const path = rect({ kind: "path", pen: true, points: [{ x: 0, y: 0 }, { x: 80, y: 60 }], strokeWidthProfile: "taperBoth", strokeHidden: true, fill: "transparent" });
    expect(svg(path)).not.toContain('fill="#ff0000"');
  });

  it("exports visible additional strokes independently of a hidden primary", () => {
    const node = rect({ strokeHidden: true, strokes: [{ stroke: "#0000ff", strokeWidth: 4, visible: true }] });
    const markup = svg(node);
    expect(markup).not.toContain('stroke="#ff0000"');
    expect(markup).toContain('stroke="#0000ff"');
    expect(markup).toContain('stroke-width="4"');
  });

  it("exports Frame paint and image borders through the same shape contract", () => {
    const frame = { ...createGroupNode({ x: 20, y: 20, width: 80, height: 60 }), isFrame: true, fill: "#ffffff", stroke: "#ff0000", strokeWidth: 8, strokeAlign: "center" };
    expect(svg(frame)).toContain('stroke="#ff0000"');
    const image = rect({ kind: "image", imageId: "bitmap", src: "data:image/png;base64,AA==" });
    expect(svg(image)).toContain("<image");
    expect(svg(image)).toContain('stroke="#ff0000"');
    expect(svg({ ...image, strokeHidden: true })).not.toContain('stroke="#ff0000"');
  });

  it("persists primary visibility and extra paints through document readback and page promotion", () => {
    const extras = [{ stroke: "#0000ff", strokeWidth: 4, visible: true }];
    const doc = { ...createDocument(200, 160), stroke: "#ff0000", strokeWidth: 8, strokeHidden: true, strokes: extras, nodes: [rect({ strokeHidden: true, strokes: extras })] };
    const read = deserialiseDocument(serialiseDocument(doc));
    expect(read.nodes[0]).toMatchObject({ stroke: "#ff0000", strokeWidth: 8, strokeHidden: true, strokes: extras });
    expect(promoteFixedPageToFrame(read).nodes[0]).toMatchObject({ stroke: "#ff0000", strokeHidden: true, strokes: extras });
  });
});
