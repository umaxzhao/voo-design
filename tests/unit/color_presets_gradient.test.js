import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex } from "../../src/canvas/color_picker/color_math.js";
import { formatGradient, parseGradient } from "../../src/canvas/color_picker/gradient_fill.js";
import { applyGradientStopColor } from "../../src/canvas/color_picker/use_fill_picker.js";
import { DEFAULT_SWATCHES } from "../../src/canvas/color_picker/SwatchGrid.jsx";

const STOPS = [
  { color: "#FFFFFF", opacity: 100, position: 0 },
  { color: "#A651FF", opacity: 100, position: 100 },
];

describe("gradient colour presets", () => {
  it("round-trips every preset swatch through HSV without a colour cast", () => {
    for (const color of DEFAULT_SWATCHES) {
      const hsv = hexToHsv(color);
      expect(hsvToHex(hsv.h, hsv.s, hsv.v), color).toBe(color);
    }
  });

  it("normalises a full-circle hue instead of falling into the red branch", () => {
    expect(hsvToHex(360, 100, 100)).toBe(hsvToHex(0, 100, 100));
    expect(hsvToHex(720, 100, 100)).toBe("#FF0000");
  });

  it("writes the chosen preset into the highlighted stop unchanged", () => {
    for (const color of DEFAULT_SWATCHES) {
      const next = applyGradientStopColor(STOPS, 1, color);
      expect(next[1].color, color).toBe(color);
      expect(next[0]).toEqual(STOPS[0]);
      expect(applyGradientStopColor(STOPS, -3, color)[0].color).toBe(color);
      expect(applyGradientStopColor(STOPS, 99, color)[1].color).toBe(color);
    }
  });

  it("keeps preset stops exact and geometry finite through format/parse", () => {
    for (const color of DEFAULT_SWATCHES) {
      const stops = applyGradientStopColor(STOPS, 0, color);
      for (const type of ["linear", "radial", "angular"]) {
        const fill = formatGradient(type, "135deg", stops, {});
        expect(fill).not.toContain("NaN");
        const parsed = parseGradient(fill);
        expect(parsed.stops[0].color, `${type} ${color}`).toBe(color);
        expect(parsed.stops[1].color, `${type} ${color}`).toBe(STOPS[1].color);
      }
    }
  });
});
