import { describe, expect, it } from "vitest";
import { normalizeAdjustments } from "../../src/canvas/editor/scene_model_adjustments.js";
import { createDefaultAdjustments } from "../../src/canvas/editor/scene_model.js";

describe("normalizeAdjustments", () => {
  it("returns fresh defaults for missing input", () => {
    const out = normalizeAdjustments(null);
    expect(out).not.toBe(createDefaultAdjustments());
    expect(out).toEqual(createDefaultAdjustments());
  });

  it("preserves explicit preserveLuminosity=false for colorBalance (regression)", () => {
    const out = normalizeAdjustments({
      colorBalance: { enabled: true, preserveLuminosity: false },
    });
    expect(out.colorBalance.preserveLuminosity).toBe(false);
    expect(out.colorBalance.enabled).toBe(true);
  });

  it("preserves explicit preserveLuminosity=true for colorBalance", () => {
    const out = normalizeAdjustments({
      colorBalance: { enabled: true, preserveLuminosity: true },
    });
    expect(out.colorBalance.preserveLuminosity).toBe(true);
  });

  it("falls back to default preserveLuminosity when colorBalance omits it", () => {
    const out = normalizeAdjustments({ colorBalance: { enabled: true } });
    expect(out.colorBalance.preserveLuminosity).toBe(true);
  });

  it("preserves explicit preserveLuminosity=false for photoFilter (regression)", () => {
    const out = normalizeAdjustments({
      photoFilter: { enabled: true, preserveLuminosity: false },
    });
    expect(out.photoFilter.preserveLuminosity).toBe(false);
  });

  it("preserves explicit preserveLuminosity=true for photoFilter", () => {
    const out = normalizeAdjustments({
      photoFilter: { enabled: true, preserveLuminosity: true },
    });
    expect(out.photoFilter.preserveLuminosity).toBe(true);
  });

  it("falls back to default preserveLuminosity when photoFilter omits it", () => {
    const out = normalizeAdjustments({ photoFilter: { enabled: true } });
    expect(out.photoFilter.preserveLuminosity).toBe(true);
  });

  it("clamps scalar adjustment values into range", () => {
    const out = normalizeAdjustments({
      brightness: { value: -200 },
      contrast: { value: 500 },
      exposure: { value: 9 },
    });
    expect(out.brightness.value).toBe(-100);
    expect(out.contrast.value).toBe(100);
    expect(out.exposure.value).toBe(2);
  });

  it("normalizes channel mixer rows", () => {
    const out = normalizeAdjustments({
      channelMixer: { red: { red: 300, green: -300 } },
    });
    expect(out.channelMixer.red.red).toBe(200);
    expect(out.channelMixer.red.green).toBe(-200);
    expect(out.channelMixer.red.blue).toBe(0);
    expect(out.channelMixer.red.constant).toBe(0);
  });

  it("normalizes selective color ink rows", () => {
    const out = normalizeAdjustments({
      selectiveColor: { reds: { c: -150, m: 150 } },
    });
    expect(out.selectiveColor.reds.c).toBe(-100);
    expect(out.selectiveColor.reds.m).toBe(100);
    expect(out.selectiveColor.reds.y).toBe(0);
    expect(out.selectiveColor.reds.k).toBe(0);
  });

  it("normalizes color balance zones", () => {
    const out = normalizeAdjustments({
      colorBalance: { shadows: { cyanRed: 500 } },
    });
    expect(out.colorBalance.shadows.cyanRed).toBe(100);
    expect(out.colorBalance.shadows.magentaGreen).toBe(0);
    expect(out.colorBalance.shadows.yellowBlue).toBe(0);
  });

  it("normalizes hue/sat bands, dropping neutral ones", () => {
    const out = normalizeAdjustments({
      hue: { bands: { reds: { h: 10, s: 0, l: 0 }, yellows: { h: 0, s: 0, l: 0 } } },
    });
    expect(out.hue.bands).toEqual({ reds: { h: 10, s: 0, l: 0 } });
  });

  it("returns null bands when all neutral", () => {
    const out = normalizeAdjustments({
      hue: { bands: { reds: { h: 0, s: 0, l: 0 } } },
    });
    expect(out.hue.bands).toBeNull();
  });

  it("keeps levels defaults when levels omitted", () => {
    const out = normalizeAdjustments({});
    expect(out.levels).toEqual({
      enabled: true,
      black: 0,
      white: 100,
      gamma: 1,
      outBlack: 0,
      outWhite: 100,
    });
  });

  it("clamps levels gamma into [0.1, 5]", () => {
    const out = normalizeAdjustments({ levels: { gamma: 0.01 } });
    expect(out.levels.gamma).toBe(0.1);
    const out2 = normalizeAdjustments({ levels: { gamma: 9 } });
    expect(out2.levels.gamma).toBe(5);
  });

  it("coerces non-numeric values to fallback", () => {
    const out = normalizeAdjustments({ brightness: { value: "not-a-number" } });
    expect(out.brightness.value).toBe(0);
  });
});
