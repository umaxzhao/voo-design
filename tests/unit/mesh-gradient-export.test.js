import { describe, expect, it } from "vitest";
import { formatGradient, parseGradient } from "../../src/canvas/color_picker/gradient_fill.js";
import { toSceneGradient } from "../../src/canvas/editor/skia_adapter_paint.js";
import { requiresCanvas2dMediaFallback } from "../../src/canvas/editor/skia_scene_adapter.js";
import { buildFigContainer, figSaveLosses } from "../../src/canvas/figma/voo-to-fig.js";
import { documentToSvg } from "../../src/canvas/editor/editor_svg.js";

const fill = formatGradient("mesh");
const node = { id: "mesh", name: "Mesh", kind: "rect", x: 0, y: 0, width: 100, height: 80, fill };
const template = { version: 106, schema: { definitions: [] }, message: { type: "NODE_CHANGES", sessionID: 1, nodeChanges: [] } };

describe("mesh paint export contracts", () => {
  it("retains the mesh's control points instead of inventing empty ramp stops", () => {
    const parsed = parseGradient(fill);
    expect(toSceneGradient(parsed)).toEqual({ type: "mesh", points: parsed.points, blur: parsed.blur });
    expect(toSceneGradient(parsed).stops).toBeUndefined();
  });

  it("reports unsupported native Figma mesh paints without crashing or losing other fills", () => {
    const doc = { width: 200, height: 200, nodes: [
      node,
      { ...node, id: "multi", name: "Multi", fills: [{ fill: "#ff0000", opacity: 1 }, { fill, opacity: 0.5 }] },
      { ...node, id: "hidden", name: "Hidden", fills: [{ fill, visible: false }, { fill: "#00ff00", opacity: 1 }] },
    ] };
    expect(figSaveLosses(doc)).toContainEqual({ key: "fig.save.lossFills", params: { count: 2 } });
    const layers = buildFigContainer(doc, template).message.nodeChanges;
    expect(layers.find(layer => layer.name === "Mesh").fillPaints).toEqual([]);
    expect(layers.find(layer => layer.name === "Multi").fillPaints).toHaveLength(1);
    expect(layers.find(layer => layer.name === "Hidden").fillPaints).toHaveLength(1);
  });

  it("uses native Skia image fills for shapes and explicit 2D fallback for unsupported glyph/stroke paints", () => {
    expect(requiresCanvas2dMediaFallback({ nodes: [node] })).toBe(false);
    expect(requiresCanvas2dMediaFallback({ nodes: [{ ...node, kind: "text" }] })).toBe(true);
    expect(requiresCanvas2dMediaFallback({ nodes: [{ ...node, fill: "transparent", stroke: fill, strokeWidth: 4 }] })).toBe(true);
  });

  it("reports visible mesh strokes omitted by native Figma without warning for hidden paints", () => {
    const doc = { nodes: [
      { ...node, fill: "#ffffff", stroke: fill, strokeWidth: 4 },
      { ...node, id: "extra", fill: "#ffffff", strokes: [{ stroke: fill, strokeWidth: 4 }] },
      { ...node, id: "hidden", fill: "#ffffff", stroke: fill, strokeWidth: 4, strokeHidden: true },
      { ...node, id: "hidden-extra", fill: "#ffffff", strokes: [{ stroke: fill, strokeWidth: 4, visible: false }] },
      { ...node, id: "zero", fill: "#ffffff", stroke: fill, strokeWidth: 4, strokeOpacity: 0 },
    ] };
    expect(figSaveLosses(doc)).toEqual([{ key: "fig.save.lossFills", params: { count: 2 } }]);
    expect(buildFigContainer(doc, template).message.nodeChanges[2].strokePaints).toEqual([]);
  });

  it("references local SVG paint servers for text, primary and additional strokes", () => {
    const nodes = [
      { ...node, kind: "text", text: "Mesh", fontSize: 32, fillOpacity: 0.4 },
      { ...node, id: "stroke", fill: "transparent", stroke: fill, strokeWidth: 6 },
      { ...node, id: "extra", fill: "transparent", strokes: [{ stroke: fill, strokeWidth: 4 }] },
    ];
    const svg = documentToSvg({ width: 200, height: 200, nodes });
    expect(svg).toMatch(/<text[^>]+fill="url\(#mesh\d+\)"[^>]+fill-opacity="0.4"/);
    expect(svg).toMatch(/stroke="url\(#mesh\d+\)"/);
    expect(svg).not.toMatch(/(?:fill|stroke)="url\(&quot;data:/);
  });
});
