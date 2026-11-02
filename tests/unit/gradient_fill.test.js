import { describe, expect, it } from "vitest";
import {
  formatGradient,
  insertGradientStop,
  normalizeGradientAngle,
  parseGradient,
} from "../../src/canvas/color_picker/gradient_fill.js";
import { deleteGradientStop } from "../../src/canvas/color_picker/GradientStopsBar.jsx";

const BASE_STOPS = [
  { color: "#000000", opacity: 20, position: 0 },
  { color: "#FFFFFF", opacity: 80, position: 100 },
];

describe("multi-stop gradient editing", () => {
  it("inserts at the clicked percentage and interpolates color and opacity", () => {
    const result = insertGradientStop(BASE_STOPS, 25);
    expect(result.stops[result.insertedIndex]).toEqual({
      color: "#404040",
      opacity: 35,
      position: 25,
    });
  });

  it("deletes a stop only while more than two stops remain", () => {
    expect(deleteGradientStop(BASE_STOPS, 0)).toBe(BASE_STOPS);
    const stopsWithIntermediate = [
      ...BASE_STOPS,
      { color: "#FF0000", opacity: 100, position: 50 },
    ];
    expect(deleteGradientStop(stopsWithIntermediate, 1)).toHaveLength(2);
  });

  it("serializes per-stop alpha as CSS hex alpha", () => {
    const gradient = formatGradient("linear", "90deg", [
      { color: "#123456", opacity: 50, position: 0 },
      { color: "#ABCDEF", opacity: 100, position: 100 },
    ]);
    expect(gradient).toBe(
      "linear-gradient(90deg, #12345680 0%, #ABCDEF 100%)",
    );
    expect(parseGradient(gradient).stops).toEqual([
      { color: "#123456", opacity: 50, position: 0 },
      { color: "#ABCDEF", opacity: 100, position: 100 },
    ]);
  });

  it("round-trips gradient angles, including 360 degrees", () => {
    for (const angle of ["0deg", "45.5deg", "270deg", "360deg"]) {
      const css = formatGradient("linear", angle, BASE_STOPS);
      expect(parseGradient(css).angle).toBe(angle);
    }
    expect(normalizeGradientAngle("361")).toBe("360deg");
    expect(normalizeGradientAngle("not-a-number")).toBeNull();
  });
});
