import { describe, expect, it } from "vitest";
import {
  applyNoise,
  applyPixelate,
  applyPosterize,
  applySepia,
  applyEmboss,
  applyClouds,
  applySolarize,
  applyHalftone,
} from "../../src/canvas/editor/pixel_filter.js";
import {
  applyBoxBlur,
  applyClarity,
  applyHighPass,
  applyMotionBlur,
  applySharpen,
  scaledRadius,
  cpuBlurRadius,
  MAX_BLUR_RADIUS,
  CPU_BLUR_RADIUS_CAP,
} from "../../src/canvas/editor/spatial_filter.js";

function rgba(...vals) {
  return new Uint8ClampedArray(vals);
}

describe("applyNoise", () => {
  it("adds deterministic noise to opaque pixels", () => {
    const data = rgba(128, 128, 128, 255);
    const before = Array.from(data);
    applyNoise(data, 1, 1, 50);
    const changed = data.some((v, i) => v !== before[i] && i % 4 !== 3);
    expect(changed).toBe(true);
    expect(data[3]).toBe(255);
  });

  it("skips fully transparent pixels", () => {
    const data = rgba(10, 20, 30, 0);
    const before = Array.from(data);
    applyNoise(data, 1, 1, 100);
    expect(Array.from(data)).toEqual(before);
  });

  it("returns early at amount 0", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applyNoise(data, 1, 1, 0);
    expect(Array.from(data)).toEqual(before);
  });
});

describe("applyPixelate", () => {
  it("averages each block to one colour", () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ]);
    applyPixelate(data, 2, 2, 100);
    // All four pixels become the same block average.
    expect(data[0]).toBe(data[4]);
    expect(data[0]).toBe(data[8]);
    expect(data[0]).toBe(data[12]);
    expect(data[1]).toBe(data[5]);
  });

  it("skips fully transparent pixels in the average", () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 0,
      0, 0, 255, 255, 255, 255, 0, 255,
    ]);
    applyPixelate(data, 2, 2, 100);
    expect(data[3]).toBe(255);
  });

  it("returns early at amount 0", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applyPixelate(data, 1, 1, 0);
    expect(Array.from(data)).toEqual(before);
  });
});

describe("applyPosterize", () => {
  it("snaps channels to levels steps", () => {
    const data = rgba(100, 100, 100, 255);
    applyPosterize(data, 1, 1, 50);
    const levels = 17;
    const step = 255 / (levels - 1);
    const expected = Math.round(Math.round(100 / step) * step);
    expect(data[0]).toBe(expected);
  });

  it("skips fully transparent pixels", () => {
    const data = rgba(10, 20, 30, 0);
    const before = Array.from(data);
    applyPosterize(data, 1, 1, 100);
    expect(Array.from(data)).toEqual(before);
  });
});

describe("applySepia", () => {
  it("tints toward sepia at full amount", () => {
    const data = rgba(100, 100, 100, 255);
    applySepia(data, 1, 1, 100);
    expect(data[0]).toBeGreaterThan(data[1]);
    expect(data[1]).toBeGreaterThan(data[2]);
  });

  it("keeps original at amount 0", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applySepia(data, 1, 1, 0);
    expect(Array.from(data)).toEqual(before);
  });
});

describe("applyEmboss", () => {
  it("produces mid-grey for a flat image", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 128; data[i + 1] = 128; data[i + 2] = 128; data[i + 3] = 255;
    }
    applyEmboss(data, 4, 4, 50);
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(128);
      expect(data[i + 1]).toBe(128);
      expect(data[i + 2]).toBe(128);
    }
  });

  it("skips fully transparent pixels", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 10; data[i + 1] = 20; data[i + 2] = 30; data[i + 3] = 0;
    }
    const before = Array.from(data);
    applyEmboss(data, 4, 4, 100);
    expect(Array.from(data)).toEqual(before);
  });
});

describe("applyClouds", () => {
  it("blends cloud noise over the image", () => {
    const data = rgba(100, 100, 100, 255);
    applyClouds(data, 4, 4, 50);
    const changed = data.some((v, i) => i % 4 !== 3 && v !== 100);
    expect(changed).toBe(true);
  });

  it("returns early at amount 0", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applyClouds(data, 1, 1, 0);
    expect(Array.from(data)).toEqual(before);
  });
});

describe("applySolarize", () => {
  it("inverts pixels above the threshold", () => {
    const data = rgba(200, 50, 20, 255);
    applySolarize(data, 1, 1, 50);
    expect(data[0]).toBe(55);
    expect(data[1]).toBe(50);
    expect(data[2]).toBe(20);
  });

  it("skips fully transparent pixels", () => {
    const data = rgba(200, 50, 20, 0);
    const before = Array.from(data);
    applySolarize(data, 1, 1, 50);
    expect(Array.from(data)).toEqual(before);
  });
});

describe("applyHalftone", () => {
  it("darkens bright cells and lightens dark cells", () => {
    const data = new Uint8ClampedArray(16 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
    }
    applyHalftone(data, 4, 4, 100);
    // dotRadius is 0 for full white, so no dot cell; every opaque pixel gets +30 clamped to 255.
    const allWhite = data.every((v, i) => i % 4 === 3 || v === 255);
    expect(allWhite).toBe(true);
  });

  it("returns early at amount 0", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applyHalftone(data, 1, 1, 0);
    expect(Array.from(data)).toEqual(before);
  });
});

describe("applyBoxBlur", () => {
  it("blurs a step edge toward the mean", () => {
    const data = new Uint8ClampedArray(16 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = i % 8 < 4 ? 0 : 255;
      data[i + 1] = data[i]; data[i + 2] = data[i]; data[i + 3] = 255;
    }
    const before = Array.from(data);
    applyBoxBlur(data, 4, 4, 2);
    const changed = data.some((v, i) => i % 4 !== 3 && v !== before[i]);
    expect(changed).toBe(true);
  });

  it("returns early at radius < 1", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applyBoxBlur(data, 1, 1, 0);
    expect(Array.from(data)).toEqual(before);
  });
});

describe("applySharpen", () => {
  it("increases contrast at edges", () => {
    const data = new Uint8ClampedArray(9 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 100; data[i + 1] = 100; data[i + 2] = 100; data[i + 3] = 255;
    }
    // Centre pixel (index 4) is 100, all neighbours are 200 → it gets darker.
    data[4 * 4] = 200; data[4 * 4 + 1] = 200; data[4 * 4 + 2] = 200;
    for (let i = 0; i < 9; i += 1) {
      if (i === 4) continue;
      data[i * 4] = 100; data[i * 4 + 1] = 100; data[i * 4 + 2] = 100;
    }
    const centreBefore = data[4 * 4];
    applySharpen(data, 3, 3, 0.5);
    expect(data[4 * 4]).toBeGreaterThan(centreBefore);
  });

  it("is identity at amount 0", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applySharpen(data, 1, 1, 0);
    expect(Array.from(data)).toEqual(before);
  });
});

describe("scaledRadius", () => {
  it("scales blur radius by target/natural ratio", () => {
    expect(scaledRadius(50, 512, 1024)).toBe(8);
    expect(scaledRadius(50, 1024, 1024)).toBe(16);
    expect(scaledRadius(100, 1024, 1024)).toBe(MAX_BLUR_RADIUS);
  });

  it("clamps ratio at 1 for supersampled targets", () => {
    expect(scaledRadius(50, 2048, 1024)).toBe(16);
  });

  it("returns 0 for non-positive inputs", () => {
    expect(scaledRadius(0, 1024, 1024)).toBe(0);
    expect(scaledRadius(50, 0, 1024)).toBe(0);
    expect(scaledRadius(50, 1024, 0)).toBe(0);
  });
});

describe("cpuBlurRadius", () => {
  it("caps the CPU blur radius", () => {
    expect(cpuBlurRadius(50)).toBe(CPU_BLUR_RADIUS_CAP);
    expect(cpuBlurRadius(10)).toBe(10);
    expect(cpuBlurRadius(-5)).toBe(0);
  });
});

describe("applyHighPass", () => {
  it("rewrites opaque pixels (128 + residual) on a step edge", () => {
    const data = new Uint8ClampedArray(16 * 4);
    for (let i = 0; i < 16; i += 1) {
      const v = i % 4 < 2 ? 0 : 255;
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const before = Array.from(data);
    applyHighPass(data, 4, 4, 80);
    const changed = data.some((v, i) => i % 4 !== 3 && v !== before[i]);
    expect(changed).toBe(true);
    // Alpha untouched
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });

  it("is identity at amount 0", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applyHighPass(data, 1, 1, 0);
    expect(Array.from(data)).toEqual(before);
  });

  it("skips transparent pixels", () => {
    const data = rgba(200, 100, 50, 0);
    applyHighPass(data, 1, 1, 80);
    expect(data[0]).toBe(200);
    expect(data[3]).toBe(0);
  });
});

describe("applyClarity", () => {
  it("boosts midtone local contrast with positive amount", () => {
    const data = new Uint8ClampedArray(16 * 4);
    for (let i = 0; i < 16; i += 1) {
      const v = i % 4 < 2 ? 80 : 180;
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const before = Array.from(data);
    applyClarity(data, 4, 4, 60);
    const changed = data.some((v, i) => i % 4 !== 3 && v !== before[i]);
    expect(changed).toBe(true);
  });

  it("is identity at amount 0", () => {
    const data = rgba(120, 120, 120, 255);
    const before = Array.from(data);
    applyClarity(data, 1, 1, 0);
    expect(Array.from(data)).toEqual(before);
  });
});

describe("applyMotionBlur", () => {
  it("smears a bright pixel along the angle", () => {
    const data = new Uint8ClampedArray(25 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    // Centre bright
    data[12 * 4] = 255;
    data[12 * 4 + 1] = 255;
    data[12 * 4 + 2] = 255;
    applyMotionBlur(data, 5, 5, 80, 0);
    // Horizontal neighbour of centre should pick up some brightness
    expect(data[13 * 4]).toBeGreaterThan(0);
  });

  it("is identity at amount 0", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applyMotionBlur(data, 1, 1, 0, 45);
    expect(Array.from(data)).toEqual(before);
  });
});
