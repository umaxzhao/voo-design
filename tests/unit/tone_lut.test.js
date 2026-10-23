import { describe, expect, it } from "vitest";
import {
  evaluateMonotoneCubicSpline,
  buildCurveLUT,
  hasCustomCurve,
} from "../../src/canvas/editor/tone_lut_curves.js";
import { buildToneLut } from "../../src/canvas/editor/tone_lut_build.js";
import { hueBandIndex } from "../../src/canvas/editor/tone_lut_vignette.js";

describe("evaluateMonotoneCubicSpline", () => {
  it("returns x for empty points", () => {
    expect(evaluateMonotoneCubicSpline([], 0.5)).toBe(0.5);
  });

  it("returns the single point's y for one point", () => {
    expect(evaluateMonotoneCubicSpline([{ x: 0.3, y: 0.7 }], 0.9)).toBe(0.7);
  });

  it("is identity for the identity ramp", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(evaluateMonotoneCubicSpline(pts, 0.25)).toBeCloseTo(0.25, 6);
    expect(evaluateMonotoneCubicSpline(pts, 0.75)).toBeCloseTo(0.75, 6);
  });

  it("clamps outside the point range", () => {
    const pts = [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.9 }];
    expect(evaluateMonotoneCubicSpline(pts, 0)).toBe(0.1);
    expect(evaluateMonotoneCubicSpline(pts, 1)).toBe(0.9);
  });
});

describe("buildCurveLUT", () => {
  it("produces the identity ramp for the identity curve", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const lut = buildCurveLUT(pts);
    expect(lut.length).toBe(256);
    for (let i = 0; i < 256; i += 1) expect(lut[i]).toBe(i);
  });

  it("darkens for a curve below the diagonal", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0.5 }];
    const lut = buildCurveLUT(pts);
    expect(lut[128]).toBeLessThan(128);
    expect(lut[255]).toBe(128);
  });
});

describe("hasCustomCurve", () => {
  it("is false for the identity ramp", () => {
    expect(hasCustomCurve([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });

  it("is true for a non-identity curve", () => {
    expect(hasCustomCurve([{ x: 0, y: 0 }, { x: 0.5, y: 0.55 }, { x: 1, y: 1 }])).toBe(true);
  });

  it("is false for null or non-array", () => {
    expect(hasCustomCurve(null)).toBe(false);
    expect(hasCustomCurve(undefined)).toBe(false);
  });
});

describe("buildToneLut", () => {
  it("is inactive for neutral adjustments", () => {
    const tone = buildToneLut({});
    expect(tone.active).toBe(false);
    expect(tone.lutIdentity).toBe(true);
  });

  it("is active for brightness", () => {
    const tone = buildToneLut({ brightness: { enabled: true, value: 20 } });
    expect(tone.active).toBe(true);
    expect(tone.hueActive).toBe(false);
  });

  it("is active for hue", () => {
    const tone = buildToneLut({ hue: { enabled: true, value: 30 } });
    expect(tone.active).toBe(true);
    expect(tone.hueActive).toBe(true);
  });

  it("marks pixel filters as cpuOnly", () => {
    const tone = buildToneLut({ noise: { enabled: true, value: 10 } });
    expect(tone.cpuOnly).toBe(true);
    expect(tone.active).toBe(true);
  });

  it("marks color balance as cpuOnly", () => {
    const tone = buildToneLut({
      colorBalance: { enabled: true, shadows: { cyanRed: 10 } },
    });
    expect(tone.cpuOnly).toBe(true);
    expect(tone.active).toBe(true);
  });

  it("is inactive for disabled invert", () => {
    const tone = buildToneLut({ invert: { enabled: false } });
    expect(tone.active).toBe(false);
  });

  it("is active for enabled invert", () => {
    const tone = buildToneLut({ invert: { enabled: true } });
    expect(tone.active).toBe(true);
    expect(tone.invertVal).toBeUndefined();
  });

  it("is active for gradientMap (always active when enabled)", () => {
    const tone = buildToneLut({ gradientMap: { enabled: true } });
    expect(tone.active).toBe(true);
    expect(tone.cpuOnly).toBe(true);
  });
});

describe("hueBandIndex", () => {
  it("tiles the 360 wheel into six bands", () => {
    expect(hueBandIndex(0)).toBe(0);
    expect(hueBandIndex(30)).toBe(1);
    expect(hueBandIndex(90)).toBe(2);
    expect(hueBandIndex(150)).toBe(3);
    expect(hueBandIndex(210)).toBe(4);
    expect(hueBandIndex(270)).toBe(5);
    expect(hueBandIndex(330)).toBe(0);
    expect(hueBandIndex(360)).toBe(0);
    expect(hueBandIndex(-10)).toBe(0);
  });
});
