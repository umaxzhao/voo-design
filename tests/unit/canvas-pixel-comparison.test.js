import { expect, it } from "vitest";
import { compareRasterPixels } from "../e2e/canvas-pixel-comparison.mjs";

const raster = (values) => Uint8ClampedArray.from(values.flatMap(value => [value, value, value, 255]));
it("accepts small antialias coverage differences at the same position", () => {
  const first = raster([255, 255, 100, 0, 0, 100, 255, 255]);
  const second = raster([255, 255, 110, 0, 0, 110, 255, 255]);
  expect(compareRasterPixels(first, second, 8).matches).toBe(true);
});

it("rejects missing objects, changed fills and movement beyond one pixel", () => {
  const first = raster([255, 255, 0, 0, 0, 255, 255, 255]);
  expect(compareRasterPixels(first, raster(Array(8).fill(255)), 8).matches).toBe(false);
  expect(compareRasterPixels(first, raster([255, 255, 128, 128, 128, 255, 255, 255]), 8).matches).toBe(false);
  expect(compareRasterPixels(first, raster([0, 0, 0, 255, 255, 255, 255, 255]), 8).matches).toBe(false);
});
