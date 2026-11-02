import { describe, expect, it } from "vitest";
import { GOOGLE_FONT_INDEX, googleWeightSpecOf, isGoogleFamily } from "../../src/canvas/editor/google_fonts_index.js";
import { googleFontUrl } from "../../src/canvas/editor/font_loader.js";

describe("Google Fonts index", () => {
  it("covers the published families with their upright weights", () => {
    expect(GOOGLE_FONT_INDEX.length).toBeGreaterThan(1000);
    expect(isGoogleFamily("Roboto")).toBe(true);
    expect(googleWeightSpecOf("Roboto")).toBe(":wght@100;200;300;400;500;600;700;800;900");
  });

  it("does not claim families Google does not publish", () => {
    expect(isGoogleFamily("Microsoft YaHei")).toBe(false);
    expect(googleWeightSpecOf("Microsoft YaHei")).toBe("");
  });

  it("requests a family with every weight the index lists", () => {
    const url = googleFontUrl("Lora");
    expect(url).toBe(`https://fonts.googleapis.com/css2?family=Lora${googleWeightSpecOf("Lora")}&display=swap`);
    expect(googleWeightSpecOf("Lora")).not.toBe("");
  });
});
