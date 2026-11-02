import { describe, expect, it } from "vitest";
import {
  defringeRgba,
  MATTE_DEFRINGE_DEFAULTS,
} from "../../src/canvas/editor/matte_defringe.js";
import {
  defringeRgba as reexportedDefringe,
  MATTE_DEFRINGE_DEFAULTS as reexportedDefaults,
} from "../../src/canvas/editor/matte_refine.js";

function whiteFringedRedRow() {
  return new Uint8ClampedArray([
    // Transparent white: the old background, still readable outside the edge.
    255, 255, 255, 0,
    // Low-alpha fringe, mostly white with a little red.
    255, 223, 223, 32,
    // Half subject red, half white background.
    255, 128, 128, 128,
    // Solid red subject.
    255, 0, 0, 255,
    255, 0, 0, 255,
  ]);
}

describe("defringeRgba", () => {
  it("leaves fully opaque and fully transparent pixels unchanged", () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,
      255, 255, 255, 0,
      12, 34, 56, 255,
      0, 0, 0, 0,
    ]);
    const before = data.slice();

    defringeRgba(data, 2, 2);

    expect(Array.from(data)).toEqual(Array.from(before));
  });

  it("pulls a white-fringed red edge toward pure red", () => {
    const data = whiteFringedRedRow();
    const beforeGreen = data[2 * 4 + 1];
    const beforeBlue = data[2 * 4 + 2];

    defringeRgba(data, 5, 1, { radius: 2 });

    const edge = 2 * 4;
    expect(data[edge]).toBeGreaterThanOrEqual(240);
    expect(data[edge + 1]).toBeLessThan(beforeGreen);
    expect(data[edge + 2]).toBeLessThan(beforeBlue);
    expect(data[edge + 1]).toBeLessThan(64);
    expect(data[edge + 2]).toBeLessThan(64);
    // Alpha is coverage, not colour: defringing must not change it.
    expect(data[edge + 3]).toBe(128);
  });

  it("uses low-alpha neighbours when no transparent pixel is in range", () => {
    const data = new Uint8ClampedArray([
      255, 240, 240, 16,
      255, 128, 128, 128,
      255, 0, 0, 255,
    ]);

    defringeRgba(data, 3, 1, { radius: 1 });

    expect(data[1 * 4 + 1]).toBeLessThan(128);
    expect(data[1 * 4 + 2]).toBeLessThan(128);
  });

  it("leaves the data unchanged when strength is 0", () => {
    const data = whiteFringedRedRow();
    const before = data.slice();

    defringeRgba(data, 5, 1, { strength: 0 });

    expect(Array.from(data)).toEqual(Array.from(before));
  });

  it("defaults to full strength and a two-pixel radius", () => {
    expect(MATTE_DEFRINGE_DEFAULTS.strength).toBe(1);
    expect(MATTE_DEFRINGE_DEFAULTS.radius).toBe(2);
    expect(reexportedDefaults).toBe(MATTE_DEFRINGE_DEFAULTS);
    expect(reexportedDefringe).toBe(defringeRgba);
  });
});
