import { describe, expect, it } from "vitest";
import { normalizeGradient } from "../../src/canvas/editor/gradient_model.js";

describe("gradient center parsing", () => {
  it.each(["radial", "conic"])("defaults invalid %s center percentages to 50", (type) => {
    const gradient = normalizeGradient(`${type}-gradient(at .% .%, red, blue)`);
    expect(gradient.geometry.centerX).toBe(50);
    expect(gradient.geometry.centerY).toBe(50);
  });

  it.each(["radial", "conic"])("preserves valid %s center percentages", (type) => {
    const gradient = normalizeGradient(`${type}-gradient(at 25% 75%, red, blue)`);
    expect(gradient.geometry.centerX).toBe(25);
    expect(gradient.geometry.centerY).toBe(75);
  });
});
