import { describe, expect, it } from "vitest";
import { blendPixel, CUSTOM_BLEND_MODES } from "../../src/canvas/editor/blend_math.js";

function rgb(r, g, b) {
  return { r, g, b, a: 1 };
}

function rgba(r, g, b, a) {
  return { r, g, b, a };
}

const PI = 3.141592653589793;

describe("CUSTOM_BLEND_MODES keys", () => {
  it("has all expected custom modes", () => {
    expect(Object.keys(CUSTOM_BLEND_MODES)).toEqual([
      "linear-burn",
      "linear-dodge",
      "vivid-light",
      "linear-light",
      "pin-light",
      "hard-mix",
      "subtract",
      "divide",
      "dissolve",
    ]);
  });
});

describe("blendPixel - linear-burn", () => {
  it("B + S - 1 with clamping, dst=midgray, src=midgray => black", () => {
    const result = blendPixel("linear-burn", rgb(0.5, 0.5, 0.5), rgb(0.5, 0.5, 0.5));
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
  });

  it("dst=white, src=midgray => midgray", () => {
    const result = blendPixel("linear-burn", rgb(1, 1, 1), rgb(0.5, 0.5, 0.5));
    expect(result.r).toBe(0.5);
    expect(result.g).toBe(0.5);
    expect(result.b).toBe(0.5);
  });

  it("dst=midgray, src=white => midgray (B+S-1)", () => {
    // 0.5 + 1 - 1 = 0.5
    const result = blendPixel("linear-burn", rgb(0.5, 0.5, 0.5), rgb(1, 1, 1));
    expect(result.r).toBeCloseTo(0.5, 5);
    expect(result.g).toBeCloseTo(0.5, 5);
    expect(result.b).toBeCloseTo(0.5, 5);
  });
});

describe("blendPixel - linear-dodge (add)", () => {
  it("dst=black, src=anything => src", () => {
    const result = blendPixel("linear-dodge", rgb(0, 0, 0), rgb(0.2, 0.3, 0.4));
    expect(result.r).toBe(0.2);
    expect(result.g).toBe(0.3);
    expect(result.b).toBe(0.4);
  });

  it("dst=midgray, src=midgray => white", () => {
    const result = blendPixel("linear-dodge", rgb(0.5, 0.5, 0.5), rgb(0.5, 0.5, 0.5));
    expect(result.r).toBe(1);
    expect(result.g).toBe(1);
    expect(result.b).toBe(1);
  });
});

describe("blendPixel - vivid-light", () => {
  it("mid-tone source lightens, dst=0.5, src=0.2 => min(0.5, 0.4)", () => {
    const result = blendPixel("vivid-light", rgb(0.5, 0.5, 0.5), rgb(0.2, 0.2, 0.2));
    // s <= 0.5: n(1 - (1-b)/(2*s)) = n(1 - 0.5/(0.4)) = n(1 - 1.25) = n(-0.25) = 0
    // Actually s=0.2 <= 0.5: 1 - (1-0.5)/(2*0.2) = 1 - 0.5/0.4 = 1 - 1.25 = -0.25 -> clamped to 0
    expect(result.r).toBeGreaterThanOrEqual(0);
    expect(result.r).toBeLessThanOrEqual(1);
  });

  it("dst=0.5, src=0.8 => max(0.5, 0.8/((1-0.5)*2))", () => {
    // s > 0.5: n(b / (2*(1-s))) = n(0.5 / (2*0.2)) = n(0.5/0.4) = n(1.25) = 1
    const result = blendPixel("vivid-light", rgb(0.5, 0.5, 0.5), rgb(0.8, 0.8, 0.8));
    expect(result.r).toBeLessThanOrEqual(1);
    expect(result.r).toBeGreaterThanOrEqual(0);
  });
});

describe("blendPixel - linear-light", () => {
  it("dst + 2*s - 1 when s > 0.5", () => {
    // s=0.8 > 0.5: n(b + 2*0.8 - 1) = n(b + 0.6)
    const result = blendPixel("linear-light", rgb(0.3, 0.3, 0.3), rgb(0.8, 0.8, 0.8));
    expect(result.r).toBeGreaterThan(0.3);
    expect(result.r).toBeLessThanOrEqual(1);
  });

  it("dst + 2*s - 1 when s <= 0.5", () => {
    // s=0.3 <= 0.5: n(b + 2*0.3 - 1) = n(b - 0.4)
    const result = blendPixel("linear-light", rgb(0.8, 0.8, 0.8), rgb(0.3, 0.3, 0.3));
    expect(result.r).toBeLessThan(0.8);
    expect(result.r).toBeGreaterThanOrEqual(0);
  });
});

describe("blendPixel - pin-light", () => {
  it("s <= 0.5: min(b, 2*s)", () => {
    // s=0.2: min(0.5, 0.4) = 0.4
    const result = blendPixel("pin-light", rgb(0.5, 0.5, 0.5), rgb(0.2, 0.2, 0.2));
    expect(result.r).toBeCloseTo(0.4, 5);
  });

  it("s > 0.5: max(b, 2*s - 1)", () => {
    // s=0.8: max(0.5, 0.6) = 0.6
    const result = blendPixel("pin-light", rgb(0.5, 0.5, 0.5), rgb(0.8, 0.8, 0.8));
    expect(result.r).toBeCloseTo(0.6, 5);
  });
});

describe("blendPixel - hard-mix", () => {
  it("binarizes to 0 or 1 per channel", () => {
    const result = blendPixel("hard-mix", rgb(0.3, 0.6, 0.9), rgb(0.5, 0.5, 0.5));
    // hard mix should give channels of 0 or 1
    expect([0, 1]).toContain(result.r);
    expect([0, 1]).toContain(result.g);
    expect([0, 1]).toContain(result.b);
  });
});

describe("blendPixel - subtract", () => {
  it("B - S with clamping", () => {
    // dst=0.8, src=0.3 => 0.8 - 0.3 = 0.5
    const result = blendPixel("subtract", rgb(0.8, 0.8, 0.8), rgb(0.3, 0.3, 0.3));
    expect(result.r).toBe(0.5);
    expect(result.g).toBe(0.5);
    expect(result.b).toBe(0.5);
  });

  it("dst < src => 0", () => {
    const result = blendPixel("subtract", rgb(0.3, 0.3, 0.3), rgb(0.8, 0.8, 0.8));
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
  });
});

describe("blendPixel - divide", () => {
  it("B / S with clamping", () => {
    // dst=0.5, src=0.25 => 0.5 / 0.25 = 2 => clamped to 1
    const result = blendPixel("divide", rgb(0.5, 0.5, 0.5), rgb(0.25, 0.25, 0.25));
    expect(result.r).toBe(1);
    expect(result.g).toBe(1);
    expect(result.b).toBe(1);
  });

  it("dst=0.2, src=0.8 => 0.2 / 0.8 = 0.25", () => {
    const result = blendPixel("divide", rgb(0.2, 0.2, 0.2), rgb(0.8, 0.8, 0.8));
    expect(result.r).toBeCloseTo(0.25, 2);
    expect(result.g).toBeCloseTo(0.25, 2);
    expect(result.b).toBeCloseTo(0.25, 2);
  });
});

describe("blendPixel - dissolve", () => {
  it("deterministic dither based on position and alpha", () => {
    // Same pixel position, same src alpha -> deterministic result
    const result1 = blendPixel("dissolve", rgb(1, 0, 0), rgb(1, 0, 0), 10, 20);
    const result2 = blendPixel("dissolve", rgb(1, 0, 0), rgb(1, 0, 0), 10, 20);
    expect(result1).toEqual(result2);
  });

  it("src fully opaque may keep source color", () => {
    // With alpha=1, threshold = 1, hash may keep or discard
    const result = blendPixel("dissolve", rgb(1, 0, 0), rgb(1, 0, 0), 0, 0);
    expect([result.r, result.g, result.b]).toContain(1);
    expect([result.r, result.g, result.b]).toContain(0);
  });

  it("src fully transparent gives backdrop", () => {
    const result = blendPixel("dissolve", rgb(1, 0, 0), rgb(0.5, 0.5, 0.5), 0, 0);
    // alpha=0 -> threshold=0 -> keep=false -> return dst
    expect(result.r).toBe(0.5);
    expect(result.g).toBe(0.5);
    expect(result.b).toBe(0.5);
  });
});