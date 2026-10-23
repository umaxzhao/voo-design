import { describe, expect, it } from "vitest";
import {
  fitToModelInput,
  toNormalisedTensor,
  sigmoid,
  looksLikeProbabilities,
  normaliseMask,
  hardenMask,
  cropMask,
  resampleMask,
  padRegion,
  placeRegionMask,
  polygonBounds,
  pointInPolygon,
  clipMaskToPolygon,
  maskToRgba,
} from "../../src/canvas/editor/matting_transform.js";
import { softBrushAlpha } from "../../src/canvas/editor/soft_brush.js";

describe("fitToModelInput", () => {
  it("fits the long side to the square and centres the short side", () => {
    const box = fitToModelInput(2048, 1024, 1024);
    expect(box.scale).toBe(0.5);
    expect(box.width).toBe(1024);
    expect(box.height).toBe(512);
    expect(box.offsetX).toBe(0);
    expect(box.offsetY).toBe(256);
  });

  it("handles portrait images", () => {
    const box = fitToModelInput(1024, 2048, 1024);
    expect(box.width).toBe(512);
    expect(box.height).toBe(1024);
    expect(box.offsetX).toBe(256);
    expect(box.offsetY).toBe(0);
  });

  it("throws on non-positive sizes", () => {
    expect(() => fitToModelInput(0, 100)).toThrow("mattingInvalidSize");
    expect(() => fitToModelInput(100, 0)).toThrow("mattingInvalidSize");
  });
});

describe("toNormalisedTensor", () => {
  it("converts interleaved RGBA to planar normalised floats", () => {
    const size = 2;
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const out = toNormalisedTensor(rgba, size);
    expect(out.length).toBe(12);
    expect(out[0]).toBeCloseTo((1 - 0.485) / 0.229, 6);
    expect(out[4]).toBeCloseTo((0 - 0.456) / 0.224, 6);
  });

  it("throws on wrong length", () => {
    expect(() => toNormalisedTensor(new Uint8ClampedArray(8), 1)).toThrow("mattingTensorSizeMismatch");
  });
});

describe("sigmoid", () => {
  it("maps logits to (0,1)", () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(10)).toBeGreaterThan(0.99);
    expect(sigmoid(-10)).toBeLessThan(0.01);
  });
});

describe("looksLikeProbabilities", () => {
  it("accepts values in [0,1]", () => {
    expect(looksLikeProbabilities(new Float32Array([0, 0.5, 1]))).toBe(true);
  });

  it("rejects values outside [0,1]", () => {
    expect(looksLikeProbabilities(new Float32Array([-0.1, 0.5]))).toBe(false);
    expect(looksLikeProbabilities(new Float32Array([0.5, 1.1]))).toBe(false);
  });
});

describe("normaliseMask", () => {
  it("stretches to full range", () => {
    const out = normaliseMask(new Float32Array([0.2, 0.5, 0.8]));
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0.5);
    expect(out[2]).toBe(1);
  });

  it("returns flat masks untouched", () => {
    const v = new Float32Array([0.5, 0.5, 0.5]);
    expect(normaliseMask(v)).toBe(v);
  });
});

describe("hardenMask", () => {
  it("collapses mid values with smoothstep", () => {
    const out = hardenMask(new Float32Array([0, 0.35, 0.5, 0.65, 1]));
    expect(out[0]).toBe(0);
    expect(out[2]).toBeCloseTo(0.5, 6);
    expect(out[4]).toBe(1);
  });
});

describe("cropMask", () => {
  it("crops the padding back off a square mask", () => {
    const mask = new Float32Array(16);
    for (let i = 0; i < 16; i += 1) mask[i] = i;
    const out = cropMask(mask, { width: 2, height: 2, offsetX: 1, offsetY: 1 }, 4);
    expect(Array.from(out)).toEqual([5, 6, 9, 10]);
  });
});

describe("resampleMask", () => {
  it("bilinearly upscales a mask", () => {
    const mask = new Float32Array([0, 1, 1, 0]);
    const out = resampleMask(mask, { width: 2, height: 2 }, { width: 4, height: 4 });
    expect(out.length).toBe(16);
    expect(out[0]).toBe(0);
    expect(out[15]).toBe(0);
  });
});

describe("padRegion", () => {
  it("grows the box by 12% clamped to the picture", () => {
    const out = padRegion({ x: 100, y: 100, width: 100, height: 100 }, 500, 500);
    expect(out.x).toBe(88);
    expect(out.y).toBe(88);
    expect(out.width).toBe(124);
    expect(out.height).toBe(124);
  });

  it("clamps to picture bounds", () => {
    const out = padRegion({ x: 10, y: 10, width: 100, height: 100 }, 100, 100);
    expect(out.x).toBe(0);
    expect(out.width).toBe(100);
  });
});

describe("placeRegionMask", () => {
  it("places a region mask into a full-size transparent matte", () => {
    const regionMask = new Float32Array([1, 1, 1, 1]);
    const out = placeRegionMask(regionMask, { x: 1, y: 1, width: 2, height: 2 }, 4, 4);
    expect(out[1 * 4 + 1]).toBe(1);
    expect(out[0 * 4 + 0]).toBe(0);
    expect(out[3 * 4 + 3]).toBe(0);
  });
});

describe("polygonBounds", () => {
  it("returns the tight box around a polygon", () => {
    const out = polygonBounds([{ x: 10, y: 20 }, { x: 30, y: 5 }, { x: 25, y: 35 }]);
    expect(out.x).toBe(10);
    expect(out.y).toBe(5);
    expect(out.width).toBe(20);
    expect(out.height).toBe(30);
  });

  it("throws on too few points", () => {
    expect(() => polygonBounds([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow("mattingInvalidPolygon");
  });
});

describe("pointInPolygon", () => {
  it("reports inside/outside for a square", () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon(square, 5, 5)).toBe(true);
    expect(pointInPolygon(square, -1, 5)).toBe(false);
    expect(pointInPolygon(square, 5, 15)).toBe(false);
  });
});

describe("clipMaskToPolygon", () => {
  it("keeps mask values inside the polygon and zeros outside", () => {
    const mask = new Float32Array([1, 1, 1, 1]);
    const out = clipMaskToPolygon(
      mask,
      [{ x: 0.1, y: 0.1 }, { x: 1.1, y: 0.1 }, { x: 1.1, y: 1.1 }, { x: 0.1, y: 1.1 }],
      2, 2,
    );
    expect(out.length).toBe(4);
    expect(out[0]).toBe(1);
  });
});

describe("maskToRgba", () => {
  it("encodes alpha into white RGBA bytes", () => {
    const out = maskToRgba(new Float32Array([0, 0.5, 1]), 3, 1);
    expect(Array.from(out)).toEqual([255, 255, 255, 0, 255, 255, 255, 128, 255, 255, 255, 255]);
  });
});

describe("softBrushAlpha", () => {
  it("is 1 inside the core and fades outside", () => {
    expect(softBrushAlpha(0, 0.5)).toBe(1);
    expect(softBrushAlpha(0.5, 0.5)).toBe(1);
    expect(softBrushAlpha(1, 0.5)).toBe(0);
  });

  it("is fully hard at hardness 1", () => {
    expect(softBrushAlpha(0.9, 1)).toBe(1);
    expect(softBrushAlpha(1, 1)).toBe(0);
  });
});
