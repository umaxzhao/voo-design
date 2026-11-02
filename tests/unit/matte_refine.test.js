import { describe, expect, it } from "vitest";
import {
  refineMatte,
  featherMatte,
  MATTE_REFINE_DEFAULTS,
  MATTE_FEATHER_DEFAULTS,
} from "../../src/canvas/editor/matte_refine.js";

function grey(count) {
  const g = new Float32Array(count);
  for (let i = 0; i < count; i += 1) g[i] = 128;
  return g;
}

function ramp(width) {
  const g = new Float32Array(width * width * 4);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      const v = (x / (width - 1)) * 255;
      g[p] = v; g[p + 1] = v; g[p + 2] = v;
    }
  }
  return g;
}

describe("refineMatte", () => {
  it("returns a copy when strength is 0", () => {
    const alpha = new Float32Array([0, 0.5, 1]);
    const out = refineMatte(alpha, 3, 1, { strength: 0, guide: grey(12) });
    expect(Array.from(out)).toEqual([0, 0.5, 1]);
    expect(out).not.toBe(alpha);
  });

  it("returns a copy when radius is 0", () => {
    const alpha = new Float32Array([0, 0.5, 1]);
    const out = refineMatte(alpha, 3, 1, { radius: 0, guide: grey(12) });
    expect(Array.from(out)).toEqual([0, 0.5, 1]);
  });

  it("leaves a matte with no transitions unchanged on a flat guide", () => {
    const alpha = new Float32Array([0, 0, 0, 0]);
    const out = refineMatte(alpha, 2, 2, { strength: 0.6, guide: grey(16) });
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });

  it("throws on invalid geometry", () => {
    expect(() => refineMatte(new Float32Array([0]), 0, 1, { guide: grey(0) })).toThrow("matteRefineInvalidSize");
  });

  it("throws on guide length mismatch", () => {
    expect(() => refineMatte(new Float32Array([0, 1]), 2, 1, { guide: grey(4) })).toThrow("matteRefineRgbaSizeMismatch");
  });

  it("pulls alpha toward the guide's luminance edge", () => {
    const width = 4;
    const alpha = new Float32Array(width * width);
    for (let i = 0; i < alpha.length; i += 1) alpha[i] = 0.5;
    const guide = ramp(width);
    const out = refineMatte(alpha, width, width, { strength: 1, guide, radius: 2 });
    expect(out.length).toBe(width * width);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(1);
    }
  });

  it("normalises byte input to 0..1 floats", () => {
    const alpha = new Uint8ClampedArray([0, 128, 255]);
    const out = refineMatte(alpha, 3, 1, { strength: 0, guide: grey(12) });
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(128 / 255, 6);
    expect(out[2]).toBe(1);
  });
});

describe("featherMatte", () => {
  it("returns a copy when radius is 0", () => {
    const alpha = new Float32Array([0, 0.5, 1]);
    const out = featherMatte(alpha, 3, 1, { radius: 0 });
    expect(Array.from(out)).toEqual([0, 0.5, 1]);
  });

  it("keeps solid interiors exactly 0 or 1", () => {
    const width = 4;
    const alpha = new Float32Array(width * width);
    for (let i = 0; i < alpha.length; i += 1) alpha[i] = i < width * width / 2 ? 0 : 1;
    const out = featherMatte(alpha, width, width, { radius: 1 });
    const half = width * width / 2;
    for (let i = 0; i < half - width; i += 1) expect(out[i]).toBe(0);
    for (let i = half + width; i < alpha.length; i += 1) expect(out[i]).toBe(1);
  });

  it("uses default radius of 2", () => {
    expect(MATTE_FEATHER_DEFAULTS.radius).toBe(2);
  });
});

describe("MATTE_REFINE_DEFAULTS", () => {
  it("has sensible defaults", () => {
    expect(MATTE_REFINE_DEFAULTS.radius).toBe(8);
    expect(MATTE_REFINE_DEFAULTS.epsilon).toBe(1e-4);
    expect(MATTE_REFINE_DEFAULTS.band).toBe(2);
    expect(MATTE_REFINE_DEFAULTS.strength).toBe(0.6);
  });
});
