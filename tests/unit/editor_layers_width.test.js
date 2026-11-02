import { describe, expect, it } from "vitest";
import {
  LAYERS_WIDTH_DEFAULT, LAYERS_WIDTH_MIN, LAYERS_WIDTH_MAX,
  clampLayersWidth, layersWidthFromPointer,
} from "../../src/canvas/components/editor_layers_width.js";

describe("layers panel width policy", () => {
  it.each([null, undefined, "400", NaN, Infinity, {}, []])("defaults invalid saved width %j", value => {
    expect(clampLayersWidth(value)).toBe(LAYERS_WIDTH_DEFAULT);
  });
  it("clamps both user widths and narrower stage limits", () => {
    expect(clampLayersWidth(-1)).toBe(LAYERS_WIDTH_MIN);
    expect(clampLayersWidth(1000)).toBe(LAYERS_WIDTH_MAX);
    expect(clampLayersWidth(500, 340)).toBe(340);
    expect(clampLayersWidth(300, 120)).toBe(LAYERS_WIDTH_MIN);
    expect(clampLayersWidth(320.6)).toBe(321);
  });
  it("grows from the right edge and reverses direction when docked on the right", () => {
    expect(layersWidthFromPointer(256, 100, 240)).toBe(396);
    expect(layersWidthFromPointer(256, 100, 240, true)).toBe(LAYERS_WIDTH_MIN);
    expect(layersWidthFromPointer(256, 240, 100, true)).toBe(396);
    expect(layersWidthFromPointer(256, 100, 900, false, 420)).toBe(420);
  });
});
