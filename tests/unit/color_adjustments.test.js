import { describe, expect, it } from "vitest";
import {
  applyColorBalance,
  applyBlackAndWhite,
  applyPhotoFilter,
} from "../../src/canvas/editor/color_adjust_balance.js";
import { applyVibrance, applyChannelMixer } from "../../src/canvas/editor/color_adjust_vibrance.js";
import { applySelectiveColor } from "../../src/canvas/editor/color_adjust_selective.js";
import { sampleGradient, applyGradientMap } from "../../src/canvas/editor/color_adjust_gradient.js";

function rgba(...vals) {
  return new Uint8ClampedArray(vals);
}

describe("applyColorBalance", () => {
  it("leaves a neutral pixel untouched with zero deltas", () => {
    const data = rgba(100, 100, 100, 255);
    applyColorBalance(data, 1, 1, {
      shadows: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
      midtones: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
      highlights: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
    });
    expect(Array.from(data)).toEqual([100, 100, 100, 255]);
  });

  it("shifts midtones toward red by reducing cyan", () => {
    const data = rgba(100, 100, 100, 255);
    applyColorBalance(data, 1, 1, {
      midtones: { cyanRed: 100, magentaGreen: 0, yellowBlue: 0 },
    });
    expect(data[0]).toBeGreaterThan(100);
    expect(data[1]).toBe(100);
    expect(data[2]).toBe(100);
  });

  it("skips fully transparent pixels", () => {
    const data = rgba(10, 20, 30, 0);
    applyColorBalance(data, 1, 1, {
      midtones: { cyanRed: 100, magentaGreen: 100, yellowBlue: 100 },
    });
    expect(Array.from(data)).toEqual([10, 20, 30, 0]);
  });

  it("returns early when nothing is active", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applyColorBalance(data, 1, 1, {});
    expect(Array.from(data)).toEqual(before);
  });
});

describe("applyBlackAndWhite", () => {
  it("converts a grey pixel to the same grey with default weights", () => {
    const data = rgba(100, 100, 100, 255);
    applyBlackAndWhite(data, 1, 1, {});
    expect(Array.from(data)).toEqual([100, 100, 100, 255]);
  });

  it("applies tint when requested", () => {
    const data = rgba(100, 100, 100, 255);
    applyBlackAndWhite(data, 1, 1, { useTint: true, tintColor: "#ff0000" });
    expect(data[0]).toBe(100);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(0);
  });

  it("skips fully transparent pixels", () => {
    const data = rgba(10, 20, 30, 0);
    applyBlackAndWhite(data, 1, 1, {});
    expect(Array.from(data)).toEqual([10, 20, 30, 0]);
  });
});

describe("applyPhotoFilter", () => {
  it("tints toward the filter color by density", () => {
    const data = rgba(100, 100, 100, 255);
    applyPhotoFilter(data, 1, 1, { color: "#ff0000", density: 100 });
    expect(data[0]).toBe(255);
    expect(data[1]).toBeLessThan(100);
    expect(data[2]).toBeLessThan(100);
  });

  it("returns early at density 0", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applyPhotoFilter(data, 1, 1, { color: "#ff0000", density: 0 });
    expect(Array.from(data)).toEqual(before);
  });

  it("skips fully transparent pixels", () => {
    const data = rgba(10, 20, 30, 0);
    applyPhotoFilter(data, 1, 1, { color: "#ff0000", density: 100 });
    expect(Array.from(data)).toEqual([10, 20, 30, 0]);
  });
});

describe("applyVibrance", () => {
  it("boosts saturation of a dull pixel", () => {
    const data = rgba(100, 100, 110, 255);
    applyVibrance(data, 1, 1, { value: 100 });
    const max = Math.max(data[0], data[1], data[2]);
    const min = Math.min(data[0], data[1], data[2]);
    expect(max - min).toBeGreaterThan(10);
  });

  it("reduces saturation with negative value", () => {
    const data = rgba(200, 50, 50, 255);
    applyVibrance(data, 1, 1, { value: -100 });
    expect(Math.abs(data[0] - data[1])).toBeLessThan(Math.abs(200 - 50));
  });

  it("returns early at value 0", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applyVibrance(data, 1, 1, { value: 0 });
    expect(Array.from(data)).toEqual(before);
  });
});

describe("applyChannelMixer", () => {
  it("identity rows leave the image unchanged", () => {
    const data = rgba(10, 20, 30, 255);
    applyChannelMixer(data, 1, 1, {
      red: { red: 100, green: 0, blue: 0, constant: 0 },
      green: { red: 0, green: 100, blue: 0, constant: 0 },
      blue: { red: 0, green: 0, blue: 100, constant: 0 },
    });
    expect(Array.from(data)).toEqual([10, 20, 30, 255]);
  });

  it("monochrome mode makes all channels equal", () => {
    const data = rgba(100, 50, 25, 255);
    applyChannelMixer(data, 1, 1, { monochrome: true });
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
  });

  it("swaps red and blue channels", () => {
    const data = rgba(10, 20, 30, 255);
    applyChannelMixer(data, 1, 1, {
      red: { red: 0, green: 0, blue: 100, constant: 0 },
      green: { red: 0, green: 100, blue: 0, constant: 0 },
      blue: { red: 100, green: 0, blue: 0, constant: 0 },
    });
    expect(Array.from(data)).toEqual([30, 20, 10, 255]);
  });
});

describe("applySelectiveColor", () => {
  it("shifts reds cyan in absolute mode", () => {
    const data = rgba(255, 0, 0, 255);
    applySelectiveColor(data, 1, 1, { mode: "absolute", reds: { c: 100 } });
    expect(data[0]).toBeLessThan(255);
  });

  it("is identity when all inks are zero", () => {
    const data = rgba(10, 20, 30, 255);
    const before = Array.from(data);
    applySelectiveColor(data, 1, 1, {});
    expect(Array.from(data)).toEqual(before);
  });

  it("skips fully transparent pixels", () => {
    const data = rgba(10, 20, 30, 0);
    applySelectiveColor(data, 1, 1, { reds: { c: 100 } });
    expect(Array.from(data)).toEqual([10, 20, 30, 0]);
  });
});

describe("sampleGradient", () => {
  it("interpolates between black and white stops", () => {
    expect(sampleGradient(
      [{ color: "#000000", location: 0 }, { color: "#ffffff", location: 1 }],
      0.5,
    )).toEqual([128, 128, 128]);
  });

  it("clamps to end stops outside [0,1]", () => {
    expect(sampleGradient(
      [{ color: "#ff0000", location: 0 }, { color: "#00ff00", location: 1 }],
      -1,
    )).toEqual([255, 0, 0]);
    expect(sampleGradient(
      [{ color: "#ff0000", location: 0 }, { color: "#00ff00", location: 1 }],
      2,
    )).toEqual([0, 255, 0]);
  });

  it("falls back to black-white for unusable stops", () => {
    expect(sampleGradient([], 0.5)).toEqual([128, 128, 128]);
    expect(sampleGradient(null, 0.5)).toEqual([128, 128, 128]);
  });
});

describe("applyGradientMap", () => {
  it("maps black to black and white to white for default gradient", () => {
    const data = rgba(0, 0, 0, 255);
    applyGradientMap(data, 1, 1, {});
    expect(Array.from(data.slice(0, 3))).toEqual([0, 0, 0]);

    const data2 = rgba(255, 255, 255, 255);
    applyGradientMap(data2, 1, 1, {});
    expect(Array.from(data2.slice(0, 3))).toEqual([255, 255, 255]);
  });

  it("reverses the gradient when reverse is true", () => {
    const data = rgba(0, 0, 0, 255);
    applyGradientMap(data, 1, 1, { stops: [{ color: "#000000", location: 0 }, { color: "#ffffff", location: 1 }], reverse: true });
    expect(Array.from(data.slice(0, 3))).toEqual([255, 255, 255]);
  });

  it("skips fully transparent pixels", () => {
    const data = rgba(10, 20, 30, 0);
    applyGradientMap(data, 1, 1, {});
    expect(Array.from(data)).toEqual([10, 20, 30, 0]);
  });
});
