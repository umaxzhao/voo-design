import { describe, expect, it } from "vitest";
import { createHitRegionCache, hitRegionPath } from "../../src/canvas/editor/hit-region-path.js";
function rectanglesOf(path) {
  return [...path.matchAll(/M([-\d.]+) ([-\d.]+)H([-\d.]+)V([-\d.]+)H[-\d.]+Z/g)].map(([, left, top, right, bottom]) => ({
    left: +left,
    top: +top,
    right: +right,
    bottom: +bottom
  }));
}
describe("exact artwork pointer region compression", () => {
  it("updates changed nodes only and invalidates ancestor or camera changes", () => {
    const cached = createHitRegionCache();
    let reads = 0;
    const box = node => {
      reads++;
      return {
        left: node.x,
        top: 0,
        right: node.x + 8,
        bottom: 8
      };
    };
    const a = {
        id: "a",
        x: 0
      },
      b = {
        id: "b",
        x: 20
      };
    cached([a, b], "camera", box);
    expect(reads).toBe(2);
    const moved = {
      ...a,
      x: 10
    };
    expect(rectanglesOf(cached([moved, b], "camera", box))).toEqual([{
      left: 10,
      right: 18,
      top: 0,
      bottom: 8
    }, {
      left: 20,
      right: 28,
      top: 0,
      bottom: 8
    }]);
    expect(reads).toBe(3);
    cached([moved, b], "camera-2", box);
    expect(reads).toBe(5);
    const group = {
      id: "group",
      kind: "group",
      x: 30
    };
    cached([moved, b, group], "camera-2", box);
    expect(reads).toBe(8);
    cached([b], "camera-2", box);
    expect(reads).toBe(9);
    expect(rectanglesOf(cached([b], "camera-2", box))).toHaveLength(1);
  });
  it("coalesces a dense overlapping grid without mutating node-derived bounds", () => {
    const rectangles = Array.from({
      length: 20000
    }, (_, index) => Object.freeze({
      left: index % 200 * 8 - 4,
      right: index % 200 * 8 + 12,
      top: Math.floor(index / 200) * 8 - 4,
      bottom: Math.floor(index / 200) * 8 + 12
    }));
    expect(rectanglesOf(hitRegionPath(rectangles))).toEqual([{
      left: -4,
      top: -4,
      right: 1604,
      bottom: 804
    }]);
  });
  it("preserves disjoint gaps and an irregular union in signed coordinates", () => {
    const input = [{
      left: -10,
      top: -5,
      right: -2,
      bottom: 5
    }, {
      left: 2,
      top: -5,
      right: 10,
      bottom: 5
    }, {
      left: 2,
      top: 5,
      right: 10,
      bottom: 12
    }, {
      left: 5,
      top: 3,
      right: 15,
      bottom: 8
    }];
    const merged = rectanglesOf(hitRegionPath(input));
    const contains = (boxes, x, y) => boxes.some(box => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
    for (let x = -11; x <= 16; x += 0.5) for (let y = -6; y <= 13; y += 0.5) expect(contains(merged, x, y)).toBe(contains(input, x, y));
    expect(hitRegionPath([])).toBe('path("M0 0Z")');
  });
});
