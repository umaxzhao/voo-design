import { describe, expect, it } from "vitest";
import { formatTextureFill, parseTextureFill } from "../../src/canvas/color_picker/texture-fill.js";
import { fillPaintsOf, fillStackPatch, paintPatch, fillTypeOf, hasFillContent } from "../../src/canvas/components/editor_properties/fill-paints.js";
import { imagePaintLayout } from "../../src/canvas/editor/image-paint-layout.js";
import { gradientDefs, shapeAttributes } from "../../src/canvas/editor/editor_svg_shapes.js";
import { formatMeshGradient } from "../../src/canvas/color_picker/gradient_fill.js";
import { needsSvgRaster } from "../../src/canvas/editor/svg-raster-support.js";
describe("fill paint contracts", () => {
  it("keeps hidden and explicitly empty stacks without reviving a legacy fill", () => {
    expect(fillPaintsOf({
      id: "a",
      fill: "#ff0000",
      fills: []
    })).toEqual([]);
    const hidden = fillPaintsOf({
      id: "a",
      fills: [{
        fill: "#ff0000",
        visible: false
      }]
    });
    expect(hidden[0].visible).toBe(false);
    expect(fillStackPatch(hidden)).toMatchObject({
      fillHidden: true,
      fill: "#ff0000"
    });
    expect(hasFillContent({
      fill: "transparent",
      imageId: null
    }, 0, {
      kind: "image",
      imageId: "original-asset"
    })).toBe(true);
  });
  it("changes one paint while retaining independent opacity, blend and image placement", () => {
    const paints = fillPaintsOf({
      id: "a",
      fills: [{
        fill: "#ff0000",
        opacity: .4,
        blendMode: "multiply"
      }, {
        fill: "#0000ff",
        opacity: .8
      }]
    });
    const patch = paintPatch({
      fill: formatTextureFill(),
      imageScaleMode: "tile"
    });
    const next = [{
      ...paints[0],
      ...patch
    }, paints[1]];
    expect(fillStackPatch(next)).toMatchObject({
      fillOpacity: .4,
      fillBlendMode: "multiply"
    });
    expect(next[1]).toEqual(paints[1]);
    expect(next[0]).toMatchObject({
      imageScaleMode: "tile",
      opacity: .4
    });
  });
  it("round-trips deterministic texture settings in a portable, safe SVG tile", () => {
    for (const pattern of ["dots", "lines", "grid"]) {
      const settings = {
        pattern,
        color: "#123456",
        scale: 150
      };
      const fill = formatTextureFill(settings);
      expect(parseTextureFill(fill)).toEqual(settings);
      expect(fillTypeOf(fill)).toBe("texture");
      expect(fill).toBe(formatTextureFill(settings));
    }
    expect(parseTextureFill(formatTextureFill({
      scale: 0
    })).scale).toBe(25);
    expect(parseTextureFill("data:image/svg+xml,%ZZ")).toBeNull();
    expect(parseTextureFill("https://example.invalid/photo.png")).toBeNull();
    expect(decodeURIComponent(formatTextureFill({
      color: '\"><script>bad()</script>',
      scale: -30
    }))).not.toContain("script");
    expect(fillTypeOf(formatMeshGradient())).toBe("gradient");
  });
  it("centres cover and contain and uses the original tile size", () => {
    const node = {
      x: 100,
      y: 50,
      width: 100,
      height: 100
    };
    expect(imagePaintLayout(node, 200, 100, "fill")).toEqual({
      x: 50,
      y: 50,
      width: 200,
      height: 100,
      scale: 1
    });
    expect(imagePaintLayout(node, 200, 100, "fit")).toEqual({
      x: 100,
      y: 75,
      width: 100,
      height: 50,
      scale: .5
    });
    expect(imagePaintLayout(node, 16, 16, "tile")).toEqual({
      x: 100,
      y: 50,
      width: 16,
      height: 16,
      scale: 1
    });
  });
  it("exports a distinct tile origin for each shape using the same texture", () => {
    const fill = formatTextureFill({
      scale: 200
    });
    const nodes = [{
      id: "a",
      x: 10,
      y: 15,
      fill
    }, {
      id: "b",
      x: 80,
      y: 90,
      fill
    }];
    const {
      defs,
      idOf
    } = gradientDefs(nodes);
    expect(defs).toHaveLength(2);
    expect(defs[0]).toContain('x="10" y="15" width="32" height="32"');
    expect(shapeAttributes(nodes[0], idOf)).toContain('fill="url(#texture0)"');
    expect(shapeAttributes(nodes[1], idOf)).toContain('fill="url(#texture1)"');
    expect(needsSvgRaster({
      kind: "image",
      fills: [{
        fill
      }],
      adjustments: {}
    })).toBe(true);
  });
});
