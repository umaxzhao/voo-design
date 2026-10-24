import { describe, expect, it } from "vitest";
import { buildToneLut } from "../../src/canvas/editor/tone_lut_build.js";
import {
  CLARITY_FRAGMENT_SHADER,
  HIGH_PASS_FRAGMENT_SHADER,
  MOTION_BLUR_FRAGMENT_SHADER,
} from "../../src/canvas/editor/gl_spatial_shaders.js";

describe("GL spatial filter twins", () => {
  describe("GPU and CPU pixel consistency", () => {
    const skipReason = "no GL context in Node/jsdom";

    it.skip(`highPass maximum per-channel difference <= 3 (${skipReason})`);

    it.skip(`clarity maximum per-channel difference <= 3 (${skipReason})`);

    it.skip(`motionBlur maximum per-channel difference <= 3 (${skipReason})`);
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
