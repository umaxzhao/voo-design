import { describe, expect, it } from "vitest";
import { compositeCustomBlend } from "../../src/canvas/editor/render_custom_blend.js";
import { CUSTOM_BLEND_MODES, blendPixel } from "../../src/canvas/editor/blend_math.js";

describe("viewport-limited custom blend pixels", () => {
  it("preserves a backdrop under fully transparent vivid-light pixels", () => {
    const backdrop = { r: 0, g: 0, b: 1, a: 0.5 };
    expect(blendPixel("vivid-light", backdrop, { r: 0, g: 0, b: 0, a: 0 })).toEqual(backdrop);
  });

  it("keeps vivid-light endpoint channels finite", () => {
    expect(blendPixel("vivid-light", { r: 1, g: 1, b: 1, a: 1 }, { r: 0, g: 0, b: 0, a: 1 }))
      .toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(blendPixel("vivid-light", { r: 0, g: 0, b: 0, a: 1 }, { r: 1, g: 1, b: 1, a: 1 }))
      .toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it("keeps transparent-source arithmetic identical for every custom mode", () => {
    for (const mode of Object.keys(CUSTOM_BLEND_MODES)) {
      const backdrop = { data: Uint8ClampedArray.from([31, 82, 177, 255, 21, 56, 99, 0]) };
      const source = { data: Uint8ClampedArray.from([199, 27, 88, 0, 130, 240, 15, 0]) };
      const expected = Uint8ClampedArray.from([0, 1].flatMap(index => {
        const at = index * 4, c = data => ({ r: data[at] / 255, g: data[at + 1] / 255, b: data[at + 2] / 255, a: data[at + 3] / 255 });
        const out = blendPixel(mode, c(backdrop.data), c(source.data), index, 0);
        return [out.r * 255, out.g * 255, out.b * 255, out.a * 255];
      }));
      compositeCustomBlend(backdrop, source, mode, 2);
      expect(backdrop.data).toEqual(expected);
    }
  });

  it("retains the original dissolve phase when processing a clipped region", () => {
    const backdrop = { data: Uint8ClampedArray.from([15, 35, 55, 255, 20, 40, 60, 255]) };
    const source = { data: Uint8ClampedArray.from([200, 90, 10, 128, 200, 90, 10, 128]) };
    const expected = Uint8ClampedArray.from([0, 1].flatMap(index => {
      const at = index * 4, c = data => ({ r: data[at] / 255, g: data[at + 1] / 255, b: data[at + 2] / 255, a: data[at + 3] / 255 });
      const out = blendPixel("dissolve", c(backdrop.data), c(source.data), index, 1);
      return [out.r * 255, out.g * 255, out.b * 255, out.a * 255];
    }));
    compositeCustomBlend(backdrop, source, "dissolve", 2, 0, 1);
    expect(backdrop.data).toEqual(expected);
  });
});
