import { expect, it } from "vitest";
import { assertFpsThreshold, fpsThreshold } from "../e2e/canvas-fps-gate.mjs";

it("rejects regressions and missing results instead of warning and passing", () => {
  const sample = { avgFps: 29, frames: 30, scenario: "drag", nodeCount: 5000 };
  expect(() => assertFpsThreshold([sample])).toThrow("drag/5000=29");
  expect(() => assertFpsThreshold([])).toThrow("No canvas FPS samples");
  expect(() => assertFpsThreshold([{ ...sample, avgFps: NaN }])).toThrow("Invalid canvas FPS sample");
  expect(() => assertFpsThreshold([{ ...sample, avgFps: 60, frames: 0 }])).toThrow("Invalid canvas FPS sample");
  expect(() => assertFpsThreshold([{ ...sample, avgFps: 60 }])).not.toThrow();
  expect(() => assertFpsThreshold([sample], 0)).not.toThrow();
});

it("defaults to a 30 FPS gate and validates explicit thresholds", () => {
  expect(fpsThreshold()).toBe(30);
  expect(fpsThreshold("0")).toBe(0);
  expect(() => fpsThreshold("bad")).toThrow();
  expect(() => fpsThreshold("-1")).toThrow();
});
