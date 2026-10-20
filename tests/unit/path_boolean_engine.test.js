import { describe, it, expect } from "vitest";
import {
  booleanUnion,
  booleanSubtract,
  booleanIntersect,
  booleanExclude,
  polygonSignedArea,
  ensurePositiveOrientation,
  adaptiveFlattenCubicSegment,
  normalizeNodeToDocPenAnchors,
  tessellateNodeToWorldPolygons,
  solveSegmentIntersection,
  clipPolygonPair,
  reconstructBezierPath,
  ptEq,
} from "../../src/canvas/editor/path_boolean_engine.js";

describe("path_boolean_engine Unit Tests: Geometric Utilities", () => {
  it("calculates Shoelace signed area with correct sign and magnitude", () => {
    // 100x100 square in CW y-down coordinates
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const area = polygonSignedArea(square);
    expect(area).toBe(10000);

    const reversed = square.slice().reverse();
    expect(polygonSignedArea(reversed)).toBe(-10000);

    const normalized = ensurePositiveOrientation(reversed);
    expect(polygonSignedArea(normalized)).toBe(10000);
  });

  it("evaluates ptEq with tolerance", () => {
    expect(ptEq({ x: 10, y: 20 }, { x: 10.00001, y: 19.99999 })).toBe(true);
    expect(ptEq({ x: 10, y: 20 }, { x: 10.1, y: 20 })).toBe(false);
  });
});

describe("path_boolean_engine Unit Tests: Adaptive de Casteljau Subdivision", () => {
  it("does not over-subdivide flat / straight cubic segments", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 33.33, y: 0 };
    const p2 = { x: 66.66, y: 0 };
    const p3 = { x: 100, y: 0 };

    const pts = adaptiveFlattenCubicSegment(p0, p1, p2, p3, 0.25);
    // Straight line should emit only endpoint
    expect(pts.length).toBe(1);
    expect(pts[0].x).toBe(100);
    expect(pts[0].y).toBe(0);
  });

  it("subdivides curved quadrant arc ensuring chord error <= 0.25px", () => {
    const KAPPA = (4 / 3) * (Math.SQRT2 - 1);
    const R = 50;
    const p0 = { x: R, y: 0 };
    const p1 = { x: R, y: R * KAPPA };
    const p2 = { x: R * KAPPA, y: R };
    const p3 = { x: 0, y: R };

    const pts = adaptiveFlattenCubicSegment(p0, p1, p2, p3, 0.25, 10);
    expect(pts.length).toBeGreaterThanOrEqual(4);
    expect(pts.length).toBeLessThanOrEqual(16);

    // Verify all points lie within 0.25px of the true circle radius
    for (const pt of pts) {
      const dist = Math.hypot(pt.x, pt.y);
      expect(Math.abs(dist - R)).toBeLessThanOrEqual(0.25);
    }
  });
});

describe("path_boolean_engine Unit Tests: Segment Intersection Solver", () => {
  it("solves standard transversal crossing", () => {
    const a = { x: 0, y: 50 };
    const b = { x: 100, y: 50 };
    const c = { x: 50, y: 0 };
    const d = { x: 50, y: 100 };

    const hits = solveSegmentIntersection(a, b, c, d);
    expect(hits.length).toBe(1);
    expect(hits[0].x).toBeCloseTo(50, 0.001);
    expect(hits[0].y).toBeCloseTo(50, 0.001);
    expect(hits[0].t).toBeCloseTo(0.5, 0.001);
  });

  it("detects collinear overlapping intervals", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    const c = { x: 40, y: 0 };
    const d = { x: 140, y: 0 };

    const hits = solveSegmentIntersection(a, b, c, d);
    expect(hits.length).toBe(1); // Endpoint t=0.4 is interior to a-b
    expect(hits[0].t).toBeCloseTo(0.4, 0.001);
    expect(hits[0].x).toBeCloseTo(40, 0.001);
  });

  it("returns empty array for parallel non-intersecting lines", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    const c = { x: 0, y: 20 };
    const d = { x: 100, y: 20 };

    const hits = solveSegmentIntersection(a, b, c, d);
    expect(hits.length).toBe(0);
  });
});

describe("path_boolean_engine Unit Tests: Polygon Clipping Kernel", () => {
  it("clips two overlapping rectangles for Union, Subtract, Intersect, and Exclude", () => {
    const r1 = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const r2 = [
      { x: 50, y: 0 },
      { x: 150, y: 0 },
      { x: 150, y: 100 },
      { x: 50, y: 100 },
    ];

    const unionLoops = clipPolygonPair(r1, r2, "union");
    expect(unionLoops.length).toBe(1);

    const subLoops = clipPolygonPair(r1, r2, "subtract");
    expect(subLoops.length).toBe(1);

    const intLoops = clipPolygonPair(r1, r2, "intersect");
    expect(intLoops.length).toBe(1);

    const xorLoops = clipPolygonPair(r1, r2, "exclude");
    expect(xorLoops.length).toBe(2);
  });

  it("handles tangent edge union by dissolving shared boundary", () => {
    const r1 = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const r2 = [
      { x: 100, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
    ];

    const unionLoops = clipPolygonPair(r1, r2, "union");
    expect(unionLoops.length).toBe(1);
    // Outer perimeter only
    const area = polygonSignedArea(unionLoops[0]);
    expect(area).toBeCloseTo(20000, 1);
  });
});

describe("path_boolean_engine Unit Tests: Node Transformation & Normalization", () => {
  it("normalizes rotated rect node to document coordinates", () => {
    const rotatedRect = {
      id: "rot1",
      kind: "rect",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      baseWidth: 100,
      baseHeight: 100,
      rotation: 45,
    };

    const norm = normalizeNodeToDocPenAnchors(rotatedRect);
    expect(norm).toBeDefined();
    expect(norm.docAnchors.length).toBe(4);
    // Center is (150, 150). Diagonal radius = 50 * sqrt(2) ≈ 70.71
    for (const a of norm.docAnchors) {
      const distFromCenter = Math.hypot(a.x - 150, a.y - 150);
      expect(distFromCenter).toBeCloseTo(50 * Math.SQRT2, 0.1);
    }
  });

  it("tessellates multi-contour donut shape into separate polygon rings", () => {
    const donutNode = {
      id: "donut",
      kind: "path",
      pen: true,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      baseWidth: 200,
      baseHeight: 200,
      points: [
        // Outer loop
        { x: 0, y: 0, close: false },
        { x: 200, y: 0, close: false },
        { x: 200, y: 200, close: false },
        { x: 0, y: 200, close: true },
        // Inner hole
        { x: 50, y: 50, close: false },
        { x: 150, y: 50, close: false },
        { x: 150, y: 150, close: false },
        { x: 50, y: 150, close: true },
      ],
    };

    const rings = tessellateNodeToWorldPolygons(donutNode);
    expect(rings.length).toBe(2);
    expect(rings[0].length).toBe(4);
    expect(rings[1].length).toBe(4);
  });
});

describe("path_boolean_engine Unit Tests: High-Level Public API", () => {
  it("booleanUnion returns a valid NODE_KIND.PATH node with correct styling", () => {
    const a = {
      id: "a",
      kind: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fill: "#ff0000",
      stroke: "#000000",
      strokeWidth: 2,
    };
    const b = {
      id: "b",
      kind: "rect",
      x: 50,
      y: 0,
      width: 100,
      height: 100,
      fill: "#00ff00",
    };

    const res = booleanUnion([a, b]);
    expect(res).toBeDefined();
    expect(res.kind).toBe("path");
    expect(res.pen).toBe(true);
    expect(res.fill).toBe("#ff0000");
    expect(res.stroke).toBe("#000000");
    // When strokeWidth is 2, penAnchorsBounds includes strokeWidth (150 + 2 = 152)
    expect(res.width).toBeCloseTo(152, 0.5);
    expect(res.height).toBeCloseTo(102, 0.5);
    expect(res.rotation).toBe(0);
    expect(res.shear).toBe(0);
  });

  it("booleanSubtract executes Subtract Top semantics across 4 nodes", () => {
    const base = {
      id: "base",
      kind: "rect",
      x: 0,
      y: 0,
      width: 400,
      height: 100,
    };
    const p1 = {
      id: "p1",
      kind: "rect",
      x: 50,
      y: 20,
      width: 30,
      height: 60,
    };
    const p2 = {
      id: "p2",
      kind: "rect",
      x: 150,
      y: 20,
      width: 30,
      height: 60,
    };
    const p3 = {
      id: "p3",
      kind: "rect",
      x: 250,
      y: 20,
      width: 30,
      height: 60,
    };

    const res = booleanSubtract([base, p1, p2, p3]);
    expect(res).toBeDefined();
    expect(res.kind).toBe("path");
    expect(res.pen).toBe(true);
    expect(res.width).toBeCloseTo(400, 0.5);
    // Should have 1 outer loop and 3 hole loops -> multiple close: true
    const closeCount = res.points.filter((p) => p.close === true).length;
    expect(closeCount).toBe(4);
  });

  it("handles null or single node input gracefully", () => {
    expect(booleanUnion(null)).toBeNull();
    expect(booleanUnion([])).toBeNull();
    expect(booleanUnion([{ kind: "rect", x: 0, y: 0, width: 50, height: 50 }])).toBeNull();
  });
});
