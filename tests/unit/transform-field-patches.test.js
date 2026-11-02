import { describe, expect, it } from "vitest";
import { anchorDocPoint } from "../../src/canvas/editor/scene_geometry.js";
import { dimensionFieldPatch, positionFieldPatch } from "../../src/canvas/components/editor_properties/transform-field-patches.js";
const box = {
  kind: "rect",
  x: 100,
  y: 80,
  width: 120,
  height: 60
};
describe("inspector geometry field boundaries", () => {
  it("positions the chosen anchor without including unrelated fields", () => {
    expect(positionFieldPatch(box, "x", 300, "center")).toEqual({
      x: 240
    });
    expect(positionFieldPatch(box, "y", 200, "center")).toEqual({
      y: 170
    });
  });
  it("resizes one unlocked dimension and keeps the center anchor fixed", () => {
    const patch = dimensionFieldPatch(box, "width", 240, {
      anchor: "center",
      lockRatio: false
    });
    expect(patch).not.toHaveProperty("height");
    const resized = {
      ...box,
      ...patch
    };
    expect(resized.height).toBe(60);
    expect(resized.width).toBe(240);
    expect(anchorDocPoint(resized, "center")).toEqual(anchorDocPoint(box, "center"));
  });
  it("uses the latest ratio for sequential changes and pins a rotated anchor", () => {
    const original = {
      ...box,
      rotation: 30
    };
    const first = {
      ...original,
      ...dimensionFieldPatch(original, "width", 240, {
        anchor: "se",
        lockRatio: true
      })
    };
    const second = {
      ...first,
      ...dimensionFieldPatch(first, "height", 180, {
        anchor: "se",
        lockRatio: true
      })
    };
    expect([second.width, second.height]).toEqual([360, 180]);
    const expected = anchorDocPoint(original, "se"),
      actual = anchorDocPoint(second, "se");
    expect(actual.x).toBeCloseTo(expected.x);
    expect(actual.y).toBeCloseTo(expected.y);
  });
  it("changes a fixed text box width without forcing its measured height", () => {
    const text = {
      ...box,
      kind: "text",
      boxWidth: 120,
      fontSize: 20
    };
    expect(dimensionFieldPatch(text, "width", 240, {
      anchor: "nw",
      lockRatio: false
    })).toEqual({
      x: 100,
      boxWidth: 240
    });
    expect(dimensionFieldPatch(text, "height", 100, {
      anchor: "nw",
      lockRatio: false
    })).toBeNull();
  });
  it("scales point text through font size while preserving its anchor", () => {
    const text = {
      ...box,
      kind: "text",
      fontSize: 20
    };
    expect(dimensionFieldPatch(text, "width", 240, {
      anchor: "center",
      lockRatio: false
    })).toEqual({
      x: 40,
      y: 50,
      fontSize: 40
    });
  });
  it("does not calculate a scale from a zero-sized node", () => {
    expect(dimensionFieldPatch({
      ...box,
      width: 0
    }, "width", 200, {
      anchor: "nw",
      lockRatio: true
    })).toBeNull();
  });
});
