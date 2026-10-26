import { describe, expect, it } from "vitest";
import {
  isResizePatch,
  patchForMultiResize,
} from "../../src/canvas/editor/multi_selection_patch.js";

describe("multi-selection resize patches", () => {
  it("detects resize patches", () => {
    expect(isResizePatch({ width: 10 })).toBe(true);
    expect(isResizePatch({ height: 10 })).toBe(true);
    expect(isResizePatch({ x: 10, y: 4 })).toBe(false);
    expect(isResizePatch(null)).toBe(false);
  });

  it("keeps x/y for the primary node", () => {
    const patch = { x: 10, y: 20, width: 100, height: 50 };
    expect(patchForMultiResize(patch, { primary: true })).toBe(patch);
  });

  it("drops absolute origin for secondary nodes but keeps the size", () => {
    const patch = { x: 10, y: 20, width: 100, height: 50 };
    expect(patchForMultiResize(patch, { primary: false })).toEqual({
      width: 100,
      height: 50,
    });
  });

  it("keeps an explicit move patch intact", () => {
    const patch = { x: 10, y: 20 };
    expect(patchForMultiResize(patch, { primary: false })).toBe(patch);
  });
});
