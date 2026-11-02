// Pending text-tool style: the panel writes it before a layer exists, and
// interactive text creation reads the same values.
import { beforeEach, describe, expect, it } from "vitest";
import {
  getTextToolDefault,
  getTextToolDefaults,
  resetTextToolDefaults,
  setTextToolDefault,
} from "../../src/canvas/editor/text_tool_defaults.js";
import { normalizeTextStyle } from "../../src/canvas/editor/scene_model_text_effects.js";

beforeEach(() => resetTextToolDefaults());

describe("text tool defaults", () => {
  it("starts from the factory text style", () => {
    expect(getTextToolDefaults()).toMatchObject({
      fontWeight: "normal",
      italic: false,
      underline: false,
      align: "left",
      lineHeight: 1.25,
      letterSpacing: 0,
    });
  });

  it("accepts valid writes and rejects invalid ones", () => {
    expect(setTextToolDefault("fontWeight", "600")).toBe(true);
    expect(getTextToolDefault("fontWeight")).toBe("600");
    expect(setTextToolDefault("fontWeight", "not-a-weight")).toBe(false);
    expect(getTextToolDefault("fontWeight")).toBe("600");

    expect(setTextToolDefault("lineHeight", 2)).toBe(true);
    expect(getTextToolDefault("lineHeight")).toBe(2);
    expect(setTextToolDefault("lineHeight", 99)).toBe(true);
    expect(getTextToolDefault("lineHeight")).toBe(3); // clamped to the model bound

    expect(setTextToolDefault("letterSpacing", -2.5)).toBe(true);
    expect(getTextToolDefault("letterSpacing")).toBe(-2.5);
    expect(setTextToolDefault("align", "justify")).toBe(false);
    expect(setTextToolDefault("unknown", 1)).toBe(false);
  });

  it("normalises legacy numeric weights instead of dropping them", () => {
    const style = normalizeTextStyle({ fontWeight: 400 });
    expect(style.fontWeight).toBe("400");
    const bold = normalizeTextStyle({ fontWeight: 700 });
    expect(bold.fontWeight).toBe("700");
    const legacy = normalizeTextStyle({ fontWeight: "bold" });
    expect(legacy.fontWeight).toBe("bold");
  });

  it("normalises text case, paragraph spacing and path text", () => {
    const style = normalizeTextStyle({
      textCase: "small-caps",
      paragraphSpacing: 999,
      textPath: { startOffset: 99999, side: "nope", reverse: 1, points: [] },
    });
    expect(style.textCase).toBe("original");
    expect(style.paragraphSpacing).toBe(200);
    expect(style.textPath).toMatchObject({ startOffset: 2000, side: "top", reverse: true });
  });
});
