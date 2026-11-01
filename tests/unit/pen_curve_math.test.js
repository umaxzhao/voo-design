import { describe, it, expect } from "vitest";
import {
  smartSmoothPenAnchor,
  reversePenPoints,
  toggleClosePenPoints,
  joinPenNodes,
  breakPenPointsAtAnchor,
  simplifyPenPoints,
} from "../../src/canvas/editor/scene_model_paths.js";
import { constrainAngle45 } from "../../src/canvas/editor/editor_pen_math.js";

describe("Pen & Vector Curve Topology Mathematics", () => {
  it("smartSmoothPenAnchor computes Catmull-Rom C1 tangents for interior anchors", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      { x: 200, y: 0 },
    ];
    const smoothed = smartSmoothPenAnchor(points, 1);
    expect(smoothed.x).toBe(100);
    expect(smoothed.y).toBe(50);
    expect(Array.isArray(smoothed.in)).toBe(true);
    expect(Array.isArray(smoothed.out)).toBe(true);
    // Symmetric horizontal tangents: y delta should be near 0
    expect(Math.abs(smoothed.in[1])).toBeLessThan(1e-3);
    expect(Math.abs(smoothed.out[1])).toBeLessThan(1e-3);
    // In handle points left, out handle points right
    expect(smoothed.in[0]).toBeLessThan(0);
    expect(smoothed.out[0]).toBeGreaterThan(0);
  });

  it("reversePenPoints inverts sequence and swaps in/out handle directions", () => {
    const points = [
      { x: 0, y: 0, in: null, out: [10, 5] },
      { x: 100, y: 100, in: [-10, -5], out: [20, 10] },
      { x: 200, y: 200, in: [-20, -10], out: null, close: false },
    ];
    const rev = reversePenPoints(points);
    expect(rev.length).toBe(3);
    expect(rev[0].x).toBe(200);
    expect(rev[0].out).toEqual([-20, -10]);
    expect(rev[0].in).toBeNull();

    expect(rev[1].x).toBe(100);
    expect(rev[1].in).toEqual([20, 10]);
    expect(rev[1].out).toEqual([-10, -5]);

    expect(rev[2].x).toBe(0);
    expect(rev[2].in).toEqual([10, 5]);
    expect(rev[2].out).toBeNull();
  });

  it("toggleClosePenPoints correctly toggles closed path contour", () => {
    const openPoints = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const closed = toggleClosePenPoints(openPoints);
    expect(closed[closed.length - 1].close).toBe(true);

    const reOpened = toggleClosePenPoints(closed);
    expect(reOpened[reOpened.length - 1].close).toBe(false);
  });

  it("breakPenPointsAtAnchor breaks open curve into two subpaths and clears endpoint handles", () => {
    const points = [
      { x: 0, y: 0, out: [10, 0] },
      { x: 50, y: 50, in: [-10, 0], out: [10, 0] },
      { x: 100, y: 0, in: [-10, 0], out: [10, 0] },
      { x: 150, y: 50, in: [-10, 0] },
    ];
    const split = breakPenPointsAtAnchor(points, 2);
    expect(split).toBeDefined();
    expect(split.kind).toBe("split");
    const [subA, subB] = split.paths;
    expect(subA.length).toBe(3);
    expect(subB.length).toBe(2);
    expect(subA[subA.length - 1].x).toBe(100);
    expect(subA[subA.length - 1].out).toBeNull();
    expect(subB[0].x).toBe(100);
    expect(subB[0].in).toBeNull();
  });

  it("breakPenPointsAtAnchor opens closed curve and clears open start/end handles", () => {
    const closed = [
      { x: 0, y: 0, in: [0, -10], out: [10, 0] },
      { x: 50, y: 50, in: [-10, 0], out: [10, 0] },
      { x: 100, y: 0, in: [-10, 0], out: [0, -10], close: true },
    ];
    const opened = breakPenPointsAtAnchor(closed, 1);
    expect(opened).toBeDefined();
    expect(opened.kind).toBe("open");
    expect(opened.points.length).toBe(4);
    // New start point must have in: null
    expect(opened.points[0].in).toBeNull();
    expect(opened.points[0].out).toEqual([10, 0]);
    // New end point must have out: null
    expect(opened.points[opened.points.length - 1].out).toBeNull();
    expect(opened.points[opened.points.length - 1].close).toBe(false);
  });

  it("joinPenNodes joins open endpoints within tolerance", () => {
    const nodeA = {
      id: "node-a",
      kind: "path",
      pen: true,
      x: 0,
      y: 0,
      width: 100,
      height: 10,
      strokeWidth: 2,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    };
    const nodeB = {
      id: "node-b",
      kind: "path",
      pen: true,
      x: 100,
      y: 0,
      width: 100,
      height: 10,
      strokeWidth: 2,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    };

    const joined = joinPenNodes(nodeA, nodeB);
    expect(joined).toBeDefined();
    // 2 segments welded at seam -> 3 points total
    expect(joined.points.length).toBe(3);
    expect(joined.kind).toBe("path");
  });

  it("simplifyPenPoints applies Ramer-Douglas-Peucker algorithm preserving corners", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 25, y: 0.1 },
      { x: 50, y: -0.1 },
      { x: 75, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
    ];
    const simplified = simplifyPenPoints(points, 1.0);
    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified[0]).toEqual({ x: 0, y: 0 });
    expect(simplified[simplified.length - 1].x).toBe(100);
    expect(simplified[simplified.length - 1].y).toBe(100);
  });

  it("constrainAngle45 snaps to 45° increments with zero-length safety guard", () => {
    const origin = { x: 100, y: 100 };

    // Point exactly at origin (zero length) -> must not throw or return NaN
    const zero = constrainAngle45(origin, { x: 100, y: 100 });
    expect(Number.isFinite(zero.x)).toBe(true);
    expect(Number.isFinite(zero.y)).toBe(true);

    // Point near 45° line
    const snapped45 = constrainAngle45(origin, { x: 150, y: 145 });
    const dx = snapped45.x - origin.x;
    const dy = snapped45.y - origin.y;
    expect(Math.abs(Math.abs(dx) - Math.abs(dy))).toBeLessThan(1e-3);
  });
});
