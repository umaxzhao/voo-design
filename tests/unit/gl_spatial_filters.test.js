import { describe, expect, it } from "vitest";
import { buildToneLut } from "../../src/canvas/editor/tone_lut_build.js";
import { applyMotionBlur } from "../../src/canvas/editor/spatial_filter.js";
import {
  CLARITY_FRAGMENT_SHADER,
  HIGH_PASS_FRAGMENT_SHADER,
  MOTION_BLUR_FRAGMENT_SHADER,
} from "../../src/canvas/editor/gl_spatial_shaders.js";

describe("GL spatial filter twins", () => {
  // Real shader/readback parity runs in tests/e2e/gl-spatial-parity.e2e.mjs.

  it("uses the common float32 direction at half-pixel motion samples", () => {
    const source = new Uint8ClampedArray(5 * 3 * 4);
    for (let y = 0; y < 3; y += 1) for (let x = 0; x < 5; x += 1) {
      source.set([y * 90, x * y * 20, 0, 255], (y * 5 + x) * 4);
    }
    // sin(30 degrees) is below 0.5 in JS double precision but exactly 0.5
    // in a GL float uniform. Quantising once makes the top-edge tap shared.
    const positive = Uint8ClampedArray.from(source);
    applyMotionBlur(positive, 5, 3, 3.125, 30);
    expect(Array.from(positive.slice(8, 12))).toEqual([30, 20, 0, 255]);
    const negative = Uint8ClampedArray.from(source);
    applyMotionBlur(negative, 5, 3, 3.125, -30);
    expect(Array.from(negative.slice(8, 12))).toEqual([30, 7, 0, 255]);
  });

  it("exposes highPass / clarity / motionBlur fragment shaders", () => {
    expect(HIGH_PASS_FRAGMENT_SHADER).toMatch(/u_radius/);
    expect(HIGH_PASS_FRAGMENT_SHADER).toMatch(/0\.5/);
    expect(CLARITY_FRAGMENT_SHADER).toMatch(/u_strength/);
    expect(CLARITY_FRAGMENT_SHADER).toMatch(/0\.299/);
    expect(MOTION_BLUR_FRAGMENT_SHADER).toMatch(/u_direction/);
  });

  it("does not force cpuOnly for highPass / clarity / motionBlur alone", () => {
    expect(buildToneLut({ highPass: { enabled: true, value: 40 } }).cpuOnly).toBe(
      false,
    );
    expect(buildToneLut({ clarity: { enabled: true, value: 30 } }).cpuOnly).toBe(
      false,
    );
    expect(
      buildToneLut({
        motionBlur: { enabled: true, value: 25, angle: 45 },
      }).cpuOnly,
    ).toBe(false);
  });

  it("allows fully opaque spatial live filter stacks on the GPU", () => {
    expect(buildToneLut({ liveFilters: [
      { kind: "blur", enabled: true, opacity: 1, params: { value: 20 } },
      { kind: "motionBlur", enabled: true, opacity: 1, params: { value: 10, angle: 45 } },
    ] }).cpuOnly).toBe(false);
    expect(buildToneLut({ liveFilters: [
      { kind: "highPass", enabled: true, opacity: 0.5, params: { value: 10 } },
    ] }).cpuOnly).toBe(true);
    expect(buildToneLut({ liveFilters: [
      { kind: "sepia", enabled: true, opacity: 1, params: { value: 10 } },
    ] }).cpuOnly).toBe(true);
    expect(buildToneLut({ noise: { enabled: true, value: 10 } }).cpuOnly).toBe(
      true,
    );
  });

  it("keeps highPass values in the tone signature", () => {
    const a = buildToneLut({ highPass: { enabled: true, value: 10 } });
    const b = buildToneLut({ highPass: { enabled: true, value: 40 } });
    expect(a.highPass).toBe(10);
    expect(b.highPass).toBe(40);
    expect(a.signature).not.toBe(b.signature);
  });
});
