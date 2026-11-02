import { describe, expect, it, vi } from "vitest";
import { documentToSvg, nodesToSvg } from "../../src/canvas/editor/editor_svg.js";
import { requiresSvgSceneRaster } from "../../src/canvas/editor/svg-raster-support.js";
import { svgSaveLosses } from "../../src/canvas/store/svg_document_io.js";
const shape = {
  id: "shape",
  kind: "rect",
  x: -20,
  y: 10,
  width: 80,
  height: 60,
  fill: "#ff0000"
};
describe("SVG effects that read preceding layers", () => {
  it("requires a scene resolver instead of silently exporting an empty backdrop", () => {
    const doc = {
      width: 200,
      height: 100,
      nodes: [{
        ...shape,
        backgroundBlur: 10
      }]
    };
    expect(() => documentToSvg(doc)).toThrow("SVG_SCENE_RENDERER_REQUIRED");
    expect(svgSaveLosses({
      pageCount: 1,
      sceneDoc: doc
    })).toContainEqual({
      key: "svg.save.rasterized"
    });
  });
  it("flattens only the selected scene and preserves its negative origin", () => {
    const nodes = [{
      ...shape,
      effects: {
        glass: {
          enabled: true
        }
      }
    }];
    const rasterSceneOf = vi.fn(() => '<image data-voo-raster="scene"/>');
    expect(nodesToSvg(nodes, {
      rasterSceneOf
    })).toContain('viewBox="-20 10 80 60"');
    expect(rasterSceneOf.mock.calls[0][0].nodes).toEqual(nodes);
    expect(rasterSceneOf.mock.calls[0][0].backgroundColor).toBe("transparent");
  });
  it("ignores hidden backdrop readers but includes visible adjustment layers", () => {
    const hidden = {
      id: "hidden",
      kind: "group",
      visible: false
    };
    expect(requiresSvgSceneRaster({
      nodes: [hidden, {
        ...shape,
        parentId: hidden.id,
        backgroundBlur: 10
      }]
    })).toBe(false);
    expect(requiresSvgSceneRaster({
      nodes: [{
        kind: "adjustment",
        visible: true
      }]
    })).toBe(true);
    expect(documentToSvg({
      width: 100,
      height: 100,
      nodes: [shape]
    })).toContain('fill="#ff0000"');
  });
});
