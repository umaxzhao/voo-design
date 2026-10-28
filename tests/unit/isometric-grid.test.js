import { describe, expect, it } from "vitest";
import { nearestIsometricVertex } from "../../src/canvas/editor/isometric-grid.js";
import { snapNodeBounds } from "../../src/canvas/editor/scene_snapping.js";
import { createTestDoc } from "./snapping-doc.js";

// Independent lattice basis enumeration checks the constant-time lookup.
function bruteForceDistance(x, y, size) {
  let nearest = Infinity;
  for (let u = -25; u <= 25; u += 1) {
    for (let v = -25; v <= 25; v += 1) {
      const candidateX = (u + v) * size * Math.sqrt(3) / 2;
      const candidateY = (u - v) * size / 2;
      nearest = Math.min(nearest, Math.hypot(x - candidateX, y - candidateY));
    }
  }
  return nearest;
}

const options = { snapToObjects: false, snapToGuides: false, snapEqualSpacing: false,
  snapToGrid: true, grid: { type: "isometric", size: 30 } };
const snap = (rect, extra = {}) => snapNodeBounds({ doc: createTestDoc(), rect, options, ...extra });

describe("nearest isometric lattice vertex", () => {
  it.each([8, 16, 30, 64])("matches an independent lattice search at cell size %i", size => {
    for (const x of [-94.2, -25, -0.5, 0, 19, 51.7, 99]) {
      for (const y of [-71, -9, -0.4, 0, 9, 30.7, 88]) {
        const nearest = nearestIsometricVertex(x, y, size);
        expect(nearest.dist).toBeCloseTo(bruteForceDistance(x, y, size), 9);
        expect(Math.hypot(nearest.x - x, nearest.y - y)).toBeCloseTo(nearest.dist, 9);
      }
    }
  });

  it.each([9, -9])("finds the closer adjacent row when zoomed out at y=%i", y => {
    const result = snap({ x: 0, y, width: 20, height: 20 }, { zoom: 0.5 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.guides).toContainEqual({ type: "isometric", x: 0, y: 0, angle: 30 });
  });

  it("preserves the opposite corner when an isometric resize snaps to the adjacent row", () => {
    const result = snap({ x: -20, y: -20, width: 20, height: 29 }, { zoom: 0.5, handle: "se" });
    expect([result.x, result.y, result.width, result.height]).toEqual([-20, -20, 20, 20]);
  });

  it("keeps coordinates outside the screen-space acquisition tolerance untouched", () => {
    const result = snap({ x: 0, y: 9, width: 20, height: 20 }, { zoom: 1 });
    expect(result.y).toBe(9);
    expect(result.guides).toEqual([]);
  });
});
