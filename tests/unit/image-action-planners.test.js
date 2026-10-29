import { describe, expect, it } from "vitest";
import { subjectBounds as sharedSubjectBounds } from "../../src/canvas/editor/subject-bounds.js";
import { resolveAutoCrop, subjectBounds } from "../../src/canvas/editor/auto_crop.js";
import { applySmartCrop } from "../../src/canvas/editor/auto_crop_page.js";
import { AUTO_ENHANCE_PRESETS, planAutoEnhance } from "../../src/canvas/editor/auto_enhance.js";
import { mergeEnhanceAdjustments, planOneTapEnhance } from "../../src/canvas/editor/auto_enhance_apply.js";

const solid = (value, alpha = 255) => new Uint8ClampedArray(
  Array.from({ length: 64 }, () => [value, value, value, alpha]).flat(),
);

describe("image action planner compatibility", () => {
  it("keeps the synchronous subject export and weighted geometry for off-centre subjects", () => {
    expect(subjectBounds).toBe(sharedSubjectBounds);
    const weights = new Uint8Array(100 * 60);
    for (let y = 20; y < 40; y += 1) weights.fill(255, y * 100 + 60, y * 100 + 80);
    expect(subjectBounds(weights, 100, 60)).toMatchObject({
      x: 60, y: 20, width: 20, height: 20, cx: 69.5, cy: 29.5,
    });
    const crop = resolveAutoCrop({ width: 100, height: 60, targetRatio: 1, mask: weights });
    expect(crop.width).toBe(crop.height);
    expect(crop.x).toBeLessThanOrEqual(60);
    expect(crop.x + crop.width).toBeGreaterThanOrEqual(80);
    expect(crop.x + crop.width).toBeLessThanOrEqual(100);
    expect(crop.reason).toBe("subject_detected");
    expect(crop).not.toBeInstanceOf(Promise);
  });

  it("does not manufacture a tonal correction from fully transparent pixels", () => {
    const plan = planOneTapEnhance(solid(0, 0));
    expect(plan.preset).toBe("neutral");
    expect(plan.values).toMatchObject({ exposure: 0, brightness: 0, contrast: 0 });
    expect(plan).not.toBeInstanceOf(Promise);
    expect(AUTO_ENHANCE_PRESETS.map(({ id }) => id)).toEqual(["neutral", "bright", "lowlight", "punch"]);
    expect(Object.isFrozen(AUTO_ENHANCE_PRESETS)).toBe(true);
  });

  it("corrects a dark neutral image more strongly and preserves unrelated adjustments", () => {
    const dark = planOneTapEnhance(solid(45));
    const light = planOneTapEnhance(solid(160));
    expect(dark.values.exposure).toBeGreaterThan(light.values.exposure);
    const curves = { enabled: true, points: [[0, 0], [255, 240]] };
    const existing = { curves, exposure: { enabled: false, value: -1 } };
    const before = JSON.stringify(existing);
    const merged = mergeEnhanceAdjustments(existing, dark);
    expect(merged.curves).toBe(curves);
    expect(JSON.stringify(existing)).toBe(before);
    expect(merged.exposure).toEqual(dark.adjustments.exposure);
    expect(merged.exposure).not.toBe(dark.adjustments.exposure);
  });

  it("keeps Smart Crop synchronous and writes its content-aware result only once", () => {
    const doc = { width: 100, height: 60, nodes: [
      { id: "subject", kind: "rect", visible: true, x: 60, y: 20, width: 20, height: 20 },
    ] };
    const calls = [];
    const engine = { getDocument: () => doc, getCropRatio: () => 1,
      setCropRect: (rect) => calls.push(rect) };
    const result = applySmartCrop(engine);
    expect(result).not.toBeInstanceOf(Promise);
    expect(calls).toEqual([result]);
    expect(result.width).toBe(result.height);
    expect(result.x).toBeLessThanOrEqual(60);
    expect(result.x + result.width).toBeGreaterThanOrEqual(80);
  });

  it("still rejects invalid public arguments instead of silently defaulting them", () => {
    expect(() => subjectBounds([1], 100, 60)).toThrow(/mismatch/);
    expect(() => resolveAutoCrop({ width: 0, height: 10, targetRatio: 1 })).toThrow(/dimensions/);
    expect(() => planAutoEnhance({}, { preset: "missing" })).toThrow(/unknown preset/);
    expect(() => applySmartCrop({ getDocument: () => ({}), getCropRatio: () => 0,
      setCropRect: () => {} })).toThrow(/ratio/);
  });
});
