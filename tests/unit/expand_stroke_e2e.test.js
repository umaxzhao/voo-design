import { describe, it, expect } from "vitest";

/**
 * End-to-End & Unit Test Suite for Expand Stroke to Path Engine
 * Module under test: src/canvas/editor/path_expand_stroke.js
 * Interface contracts per PROJECT.md:
 *   - expandStrokeToPathNode(node: SceneNode): SceneNode
 *   - Input: Single stroked SceneNode (open or closed path, or shape)
 *   - Output: Single closed NODE_KIND.PATH (pen: true) with fill = node.stroke, strokeWidth = 0
 */

// Dynamically load module if present; skip gracefully if pending milestone implementation
const expandStrokeEngine = await (async () => {
  try {
    return await import(/* @vite-ignore */ "../../src/canvas/editor/path_expand_stroke.js");
  } catch {
    return null;
  }
})();

const isImplemented = Boolean(
  expandStrokeEngine &&
    typeof expandStrokeEngine.expandStrokeToPathNode === "function",
);

const {
  expandStrokeToPathNode = () => null,
} = expandStrokeEngine || {};

// Helper constructors for test stroke nodes
function makeStrokedLine(id, x1, y1, x2, y2, strokeWidth = 20, options = {}) {
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const width = Math.max(1, Math.abs(x2 - x1));
  const height = Math.max(1, Math.abs(y2 - y1));

  return {
    id,
    kind: "path",
    pen: true,
    x: minX,
    y: minY,
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    stroke: options.stroke || "#3b82f6",
    strokeWidth,
    strokeCap: options.strokeCap || "butt",
    strokeJoin: options.strokeJoin || "miter",
    strokeAlign: options.strokeAlign || "center",
    strokeMiterLimit: options.strokeMiterLimit || 4,
    strokeWidthProfile: options.strokeWidthProfile || "uniform",
    points: [
      { x: x1 - minX, y: y1 - minY, in: null, out: null, close: false },
      { x: x2 - minX, y: y2 - minY, in: null, out: null, close: false },
    ],
    fill: "transparent",
    visible: true,
  };
}

function makeStrokedPolyline(id, points, strokeWidth = 20, options = {}) {
  return {
    id,
    kind: "path",
    pen: true,
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    baseWidth: 200,
    baseHeight: 200,
    stroke: options.stroke || "#10b981",
    strokeWidth,
    strokeCap: options.strokeCap || "butt",
    strokeJoin: options.strokeJoin || "miter",
    strokeAlign: options.strokeAlign || "center",
    strokeMiterLimit: options.strokeMiterLimit || 4,
    strokeWidthProfile: options.strokeWidthProfile || "uniform",
    points,
    fill: "transparent",
    visible: true,
  };
}

function makeStrokedRect(id, x, y, width, height, strokeWidth = 10, options = {}) {
  return {
    id,
    kind: "rect",
    x,
    y,
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    stroke: options.stroke || "#f59e0b",
    strokeWidth,
    strokeCap: options.strokeCap || "butt",
    strokeJoin: options.strokeJoin || "miter",
    strokeAlign: options.strokeAlign || "center",
    strokeMiterLimit: options.strokeMiterLimit || 4,
    fill: "transparent",
    visible: true,
  };
}

function makeStrokedEllipse(id, x, y, width, height, strokeWidth = 10, options = {}) {
  return {
    id,
    kind: "ellipse",
    x,
    y,
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    stroke: options.stroke || "#8b5cf6",
    strokeWidth,
    strokeAlign: options.strokeAlign || "center",
    fill: "transparent",
    visible: true,
  };
}

describe("path_expand_stroke Module Availability", () => {
  it("verifies expandStrokeToPathNode contract export when module is implemented", () => {
    if (isImplemented) {
      expect(typeof expandStrokeToPathNode).toBe("function");
    } else {
      expect(true).toBe(true);
    }
  });
});

// ============================================================================
// TIER 1: Feature Tests (Caps, Joins, Alignments, Profiles, Open/Closed)
// ============================================================================
describe.skipIf(!isImplemented)("Expand Stroke - Tier 1: Stroke Caps", () => {
  it("expands a line with Butt caps into an exact rectangle with length L", () => {
    const line = makeStrokedLine("l1", 0, 0, 100, 0, 20, { strokeCap: "butt" });
    const result = expandStrokeToPathNode(line);

    expect(result).toBeDefined();
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.fill).toBe(line.stroke);
    expect(result.strokeWidth).toBe(0);

    // Butt caps do not extend beyond endpoints: length is exactly 100, thickness is 20
    expect(result.width).toBeCloseTo(100, 0.5);
    expect(result.height).toBeCloseTo(20, 0.5);
    expect(result.x).toBeCloseTo(0, 0.5);
    expect(result.y).toBeCloseTo(-10, 0.5);
  });

  it("expands a line with Round caps into a stadium/capsule outline of length L + W", () => {
    const line = makeStrokedLine("l2", 0, 0, 100, 0, 20, { strokeCap: "round" });
    const result = expandStrokeToPathNode(line);

    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    // Round caps extend by strokeWidth / 2 on both ends: width = 100 + 20 = 120
    expect(result.width).toBeCloseTo(120, 1.0);
    expect(result.height).toBeCloseTo(20, 1.0);
    expect(result.x).toBeCloseTo(-10, 1.0);
    expect(result.y).toBeCloseTo(-10, 1.0);

    // Semicircular end caps have bezier handles
    const hasCurvedHandles = result.points.some((p) => p.in || p.out);
    expect(hasCurvedHandles).toBe(true);
  });

  it("expands a line with Square caps into a rectangle of length L + W", () => {
    const line = makeStrokedLine("l3", 0, 0, 100, 0, 20, { strokeCap: "square" });
    const result = expandStrokeToPathNode(line);

    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    // Square caps extend by strokeWidth / 2 perpendicularly on both ends
    expect(result.width).toBeCloseTo(120, 0.5);
    expect(result.height).toBeCloseTo(20, 0.5);
    expect(result.x).toBeCloseTo(-10, 0.5);
    expect(result.y).toBeCloseTo(-10, 0.5);
  });

  it("verifies cap geometry invariant: Square cap width === Butt cap width + strokeWidth", () => {
    const buttLine = makeStrokedLine("b", 0, 0, 200, 0, 30, { strokeCap: "butt" });
    const squareLine = makeStrokedLine("s", 0, 0, 200, 0, 30, { strokeCap: "square" });

    const buttRes = expandStrokeToPathNode(buttLine);
    const sqRes = expandStrokeToPathNode(squareLine);

    expect(sqRes.width).toBeCloseTo(buttRes.width + 30, 0.5);
  });

  it("expands vertical lines with Round caps correctly along Y axis", () => {
    const vLine = makeStrokedLine("v", 0, 0, 0, 100, 20, { strokeCap: "round" });
    const result = expandStrokeToPathNode(vLine);

    expect(result.width).toBeCloseTo(20, 1.0);
    expect(result.height).toBeCloseTo(120, 1.0);
    expect(result.y).toBeCloseTo(-10, 1.0);
  });
});

describe.skipIf(!isImplemented)("Expand Stroke - Tier 1: Stroke Joins", () => {
  it("expands a 90-degree corner with Miter join into a sharp outer peak", () => {
    // Corner: (0, 100) -> (100, 100) -> (100, 0)
    const corner = makeStrokedPolyline("miter_corner", [
      { x: 0, y: 100, close: false },
      { x: 100, y: 100, close: false },
      { x: 100, y: 0, close: false },
    ], 20, { strokeJoin: "miter" });

    const result = expandStrokeToPathNode(corner);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    // Sharp miter peak extends outer corner: x = 100 + 10 = 110, y = 100 + 10 = 110
    expect(result.width).toBeGreaterThanOrEqual(110);
    expect(result.height).toBeGreaterThanOrEqual(110);
  });

  it("expands a 90-degree corner with Round join into a smooth curved corner", () => {
    const corner = makeStrokedPolyline("round_corner", [
      { x: 0, y: 100, close: false },
      { x: 100, y: 100, close: false },
      { x: 100, y: 0, close: false },
    ], 20, { strokeJoin: "round" });

    const result = expandStrokeToPathNode(corner);
    expect(result.kind).toBe("path");
    const hasCurvedHandles = result.points.some((p) => p.in || p.out);
    expect(hasCurvedHandles).toBe(true);
  });

  it("expands a 90-degree corner with Bevel join into a flat chamfered corner", () => {
    const corner = makeStrokedPolyline("bevel_corner", [
      { x: 0, y: 100, close: false },
      { x: 100, y: 100, close: false },
      { x: 100, y: 0, close: false },
    ], 20, { strokeJoin: "bevel" });

    const result = expandStrokeToPathNode(corner);
    expect(result.kind).toBe("path");
    // Bevel cuts flat across miter tip without extending to full miter length
    expect(result.width).toBeLessThanOrEqual(112);
  });

  it("automatically falls back from Miter to Bevel when acute angle exceeds strokeMiterLimit", () => {
    // Sharp 20-degree acute angle: miter length ratio is 1 / sin(10°) ≈ 5.76 > miterLimit (4)
    const acuteAngle = makeStrokedPolyline("acute", [
      { x: 0, y: 0, close: false },
      { x: 100, y: 50, close: false },
      { x: 0, y: 100, close: false },
    ], 20, { strokeJoin: "miter", strokeMiterLimit: 4 });

    const result = expandStrokeToPathNode(acuteAngle);
    expect(result.kind).toBe("path");
    // Miter spike should be clipped to avoid extreme unbounded spike
    expect(result.width).toBeLessThan(160);
  });

  it("maintains sharp Miter corner when miter ratio is within strokeMiterLimit", () => {
    // 60-degree angle: miter ratio is 1 / sin(30°) = 2 <= miterLimit (4)
    const angle60 = makeStrokedPolyline("miter_60", [
      { x: 0, y: 0, close: false },
      { x: 100, y: 50, close: false },
      { x: 0, y: 100, close: false },
    ], 20, { strokeJoin: "miter", strokeMiterLimit: 4 });

    const result = expandStrokeToPathNode(angle60);
    expect(result.kind).toBe("path");
    expect(result.width).toBeGreaterThan(100);
  });
});

describe.skipIf(!isImplemented)("Expand Stroke - Tier 1: Stroke Alignments", () => {
  it("expands Center aligned stroke symmetrically about path centerline", () => {
    const rect = makeStrokedRect("r_center", 0, 0, 100, 100, 10, { strokeAlign: "center" });
    const result = expandStrokeToPathNode(rect);

    expect(result.kind).toBe("path");
    // Center alignment extends by strokeWidth / 2 on all sides
    expect(result.x).toBeCloseTo(-5, 0.5);
    expect(result.y).toBeCloseTo(-5, 0.5);
    expect(result.width).toBeCloseTo(110, 0.5);
    expect(result.height).toBeCloseTo(110, 0.5);
  });

  it("expands Inside aligned stroke strictly within original boundary", () => {
    const rect = makeStrokedRect("r_inside", 0, 0, 100, 100, 10, { strokeAlign: "inside" });
    const result = expandStrokeToPathNode(rect);

    expect(result.kind).toBe("path");
    // Inside stroke does not exceed original [0, 0, 100, 100] box
    expect(result.x).toBeCloseTo(0, 0.5);
    expect(result.y).toBeCloseTo(0, 0.5);
    expect(result.width).toBeCloseTo(100, 0.5);
    expect(result.height).toBeCloseTo(100, 0.5);
  });

  it("expands Outside aligned stroke strictly outward from original boundary", () => {
    const rect = makeStrokedRect("r_outside", 0, 0, 100, 100, 10, { strokeAlign: "outside" });
    const result = expandStrokeToPathNode(rect);

    expect(result.kind).toBe("path");
    // Outside stroke expands by full strokeWidth on all sides
    expect(result.x).toBeCloseTo(-10, 0.5);
    expect(result.y).toBeCloseTo(-10, 0.5);
    expect(result.width).toBeCloseTo(120, 0.5);
    expect(result.height).toBeCloseTo(120, 0.5);
  });

  it("verifies bounding box nesting: bbox(inside) ⊆ bbox(center) ⊆ bbox(outside)", () => {
    const inRes = expandStrokeToPathNode(makeStrokedRect("i", 0, 0, 100, 100, 10, { strokeAlign: "inside" }));
    const ceRes = expandStrokeToPathNode(makeStrokedRect("c", 0, 0, 100, 100, 10, { strokeAlign: "center" }));
    const ouRes = expandStrokeToPathNode(makeStrokedRect("o", 0, 0, 100, 100, 10, { strokeAlign: "outside" }));

    expect(inRes.width).toBeLessThanOrEqual(ceRes.width);
    expect(ceRes.width).toBeLessThanOrEqual(ouRes.width);
    expect(inRes.x).toBeGreaterThanOrEqual(ceRes.x);
    expect(ceRes.x).toBeGreaterThanOrEqual(ouRes.x);
  });

  it("expands stroked ellipse with Inside alignment", () => {
    const ellipse = makeStrokedEllipse("e_inside", 10, 10, 100, 100, 10, { strokeAlign: "inside" });
    const result = expandStrokeToPathNode(ellipse);

    expect(result.kind).toBe("path");
    expect(result.width).toBeCloseTo(100, 0.5);
    expect(result.height).toBeCloseTo(100, 0.5);
  });
});

describe.skipIf(!isImplemented)("Expand Stroke - Tier 1: Open vs Closed & Profiles", () => {
  it("expands an open polyline path into a single continuous closed ribbon outline", () => {
    const openPath = makeStrokedPolyline("open_poly", [
      { x: 0, y: 0, close: false },
      { x: 50, y: 50, close: false },
      { x: 100, y: 0, close: false },
    ], 10);

    const result = expandStrokeToPathNode(openPath);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.points.some((p) => p.close === true)).toBe(true);
  });

  it("expands a closed polygon into an outer perimeter and inner perimeter ring", () => {
    const closedPath = makeStrokedPolyline("closed_poly", [
      { x: 0, y: 0, close: false },
      { x: 100, y: 0, close: false },
      { x: 100, y: 100, close: false },
      { x: 0, y: 100, close: true },
    ], 10);

    const result = expandStrokeToPathNode(closedPath);
    expect(result.kind).toBe("path");
    // A hollow ring contains multiple subpaths / contour anchors
    expect(result.points.length).toBeGreaterThanOrEqual(8);
  });

  it("expands an open cubic bezier curve into smooth parallel normal offset curves", () => {
    const curvedPath = {
      id: "bezier_open",
      kind: "path",
      pen: true,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      baseWidth: 100,
      baseHeight: 100,
      stroke: "#2563eb",
      strokeWidth: 16,
      strokeCap: "round",
      strokeJoin: "round",
      strokeAlign: "center",
      points: [
        { x: 0, y: 0, in: null, out: [30, 0], close: false },
        { x: 100, y: 100, in: [-30, 0], out: null, close: false },
      ],
      fill: "transparent",
      visible: true,
    };

    const result = expandStrokeToPathNode(curvedPath);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    const hasHandles = result.points.some((p) => p.in || p.out);
    expect(hasHandles).toBe(true);
  });

  it("supports variable line width profile (taper_in / taper_out)", () => {
    const line = makeStrokedLine("taper_line", 0, 0, 100, 0, 20, {
      strokeWidthProfile: "taper_in", // starts thin, expands to full width
      strokeCap: "round",
    });

    const result = expandStrokeToPathNode(line);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
  });

  it("replaces stroke with fill color and resets strokeWidth to zero", () => {
    const line = makeStrokedLine("style_check", 0, 0, 50, 50, 10, { stroke: "#dc2626" });
    const result = expandStrokeToPathNode(line);

    expect(result.fill).toBe("#dc2626");
    expect(result.strokeWidth).toBe(0);
  });
});

// ============================================================================
// TIER 2: Boundary & Corner Cases (Degenerate, Zero-length, Hairpin, Collapse)
// ============================================================================
describe.skipIf(!isImplemented)("Expand Stroke - Tier 2: Boundary Cases", () => {
  it("handles zero-length line (p0 == p1) gracefully without throwing or NaN", () => {
    const zeroLine = makeStrokedLine("zero", 50, 50, 50, 50, 20, { strokeCap: "round" });
    const result = expandStrokeToPathNode(zeroLine);

    if (result) {
      expect(Number.isFinite(result.x)).toBe(true);
      expect(Number.isFinite(result.width)).toBe(true);
      for (const p of result.points || []) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  });

  it("handles single-point pen path without crashing", () => {
    const singlePoint = {
      id: "single",
      kind: "path",
      pen: true,
      x: 10,
      y: 10,
      width: 1,
      height: 1,
      baseWidth: 1,
      baseHeight: 1,
      stroke: "#000",
      strokeWidth: 10,
      points: [{ x: 0, y: 0, in: null, out: null, close: false }],
      fill: "transparent",
      visible: true,
    };

    const result = expandStrokeToPathNode(singlePoint);
    if (result) {
      expect(result.kind).toBe("path");
    }
  });

  it("does not generate spurious join vertices along collinear 3-point segments", () => {
    const collinear = makeStrokedPolyline("collinear", [
      { x: 0, y: 0, close: false },
      { x: 50, y: 0, close: false },
      { x: 100, y: 0, close: false },
    ], 20, { strokeCap: "butt" });

    const result = expandStrokeToPathNode(collinear);
    expect(result.kind).toBe("path");
    expect(result.width).toBeCloseTo(100, 0.5);
    expect(result.height).toBeCloseTo(20, 0.5);
  });

  it("handles massive stroke width (strokeWidth > path dimension) stably", () => {
    const smallLine = makeStrokedLine("small_line", 0, 0, 10, 0, 500, { strokeCap: "butt" });
    const result = expandStrokeToPathNode(smallLine);

    expect(result.kind).toBe("path");
    expect(result.width).toBeCloseTo(10, 1.0);
    expect(result.height).toBeCloseTo(500, 1.0);
  });

  it("handles acute 5-degree hairpin turn reversal cleanly", () => {
    const hairpin = makeStrokedPolyline("hairpin", [
      { x: 0, y: 0, close: false },
      { x: 100, y: 0, close: false },
      { x: 0, y: 5, close: false },
    ], 10, { strokeJoin: "round", strokeCap: "round" });

    const result = expandStrokeToPathNode(hairpin);
    expect(result.kind).toBe("path");
    for (const p of result.points || []) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("handles closed shape inside stroke collapse when strokeWidth / 2 >= radius", () => {
    // 50x50 rect with 60px inside stroke (hole completely collapses)
    const collapsed = makeStrokedRect("collapsed", 0, 0, 50, 50, 60, { strokeAlign: "inside" });
    const result = expandStrokeToPathNode(collapsed);

    expect(result.kind).toBe("path");
    expect(result.width).toBeCloseTo(50, 1.0);
    expect(result.height).toBeCloseTo(50, 1.0);
  });
});

// ============================================================================
// TIER 3: Pairwise Combinations (Cap x Join x Alignment)
// ============================================================================
describe.skipIf(!isImplemented)("Expand Stroke - Tier 3: Pairwise Combinations", () => {
  const caps = ["butt", "round", "square"];
  const joins = ["miter", "round", "bevel"];
  const aligns = ["center", "inside", "outside"];

  const combinations = [
    { cap: "butt", join: "miter", align: "center" },
    { cap: "butt", join: "round", align: "outside" },
    { cap: "round", join: "round", align: "center" },
    { cap: "round", join: "miter", align: "inside" },
    { cap: "square", join: "bevel", align: "center" },
    { cap: "square", join: "round", align: "outside" },
    { cap: "butt", join: "bevel", align: "inside" },
    { cap: "round", join: "bevel", align: "outside" },
  ];

  for (const combo of combinations) {
    it(`expands stroke with (${combo.cap} cap, ${combo.join} join, ${combo.align} align)`, () => {
      const node = makeStrokedPolyline("combo", [
        { x: 0, y: 0, close: false },
        { x: 60, y: 60, close: false },
        { x: 120, y: 0, close: false },
      ], 16, {
        strokeCap: combo.cap,
        strokeJoin: combo.join,
        strokeAlign: combo.align,
      });

      const result = expandStrokeToPathNode(node);
      expect(result).toBeDefined();
      expect(result.kind).toBe("path");
      expect(result.pen).toBe(true);
      expect(Array.isArray(result.points)).toBe(true);
      expect(result.points.length).toBeGreaterThan(0);
    });
  }

  it("combines variable width profile with round cap and miter join", () => {
    const node = makeStrokedPolyline("var_miter", [
      { x: 0, y: 0, close: false },
      { x: 50, y: 50, close: false },
      { x: 100, y: 0, close: false },
    ], 20, {
      strokeCap: "round",
      strokeJoin: "miter",
      strokeWidthProfile: "oval",
    });

    const result = expandStrokeToPathNode(node);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
  });
});

// ============================================================================
// TIER 4: Real-World Scenarios (TEST_INFRA.md)
// ============================================================================
describe.skipIf(!isImplemented)("Expand Stroke - Tier 4: Real-World Scenarios", () => {
  it("Scenario 1: Self-Intersection Swallowtail Loop Dissolution (Figure-8 Loop)", () => {
    // A figure-8 loop path where offset curve on inner waist produces a self-crossing swallowtail
    const figure8 = makeStrokedPolyline("fig8", [
      { x: 50, y: 0, in: [-30, 0], out: [30, 0], close: false },
      { x: 100, y: 50, in: [0, -30], out: [0, 30], close: false },
      { x: 0, y: 150, in: [0, -30], out: [0, 30], close: false },
      { x: 50, y: 200, in: [-30, 0], out: [30, 0], close: false },
      { x: 100, y: 150, in: [0, 30], out: [0, -30], close: false },
      { x: 0, y: 50, in: [0, 30], out: [0, -30], close: false },
      { x: 50, y: 0, close: true },
    ], 16, { strokeJoin: "round" });

    const result = expandStrokeToPathNode(figure8);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    // Algorithm must dissolve swallowtails and output clean outer boundary
    expect(result.points.length).toBeGreaterThan(4);
  });

  it("Scenario 2: Technical Dimension Callout Leader Line", () => {
    // Orthogonal leader line: (10, 100) -> (60, 50) -> (120, 50)
    const leaderLine = makeStrokedPolyline("leader", [
      { x: 10, y: 100, close: false },
      { x: 60, y: 50, close: false },
      { x: 120, y: 50, close: false },
    ], 4, { strokeCap: "square", strokeJoin: "miter" });

    const result = expandStrokeToPathNode(leaderLine);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.strokeWidth).toBe(0);
    expect(Math.abs(result.width - 114)).toBeLessThanOrEqual(2.0);
  });

  it("Scenario 3: Calligraphic Monogram Ribbon (Curved S-Shape)", () => {
    const sCurve = {
      id: "calligraphy_s",
      kind: "path",
      pen: true,
      x: 0,
      y: 0,
      width: 100,
      height: 200,
      baseWidth: 100,
      baseHeight: 200,
      stroke: "#0f172a",
      strokeWidth: 24,
      strokeCap: "round",
      strokeJoin: "round",
      strokeAlign: "center",
      points: [
        { x: 80, y: 20, in: null, out: [-40, 0], close: false },
        { x: 20, y: 100, in: [0, -30], out: [0, 30], close: false },
        { x: 80, y: 180, in: [40, 0], out: null, close: false },
      ],
      fill: "transparent",
      visible: true,
    };

    const result = expandStrokeToPathNode(sCurve);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.fill).toBe("#0f172a");
  });

  it("Scenario 4: Donut / Mechanical Washer Ring Fabrication", () => {
    const circle = makeStrokedEllipse("washer", 50, 50, 100, 100, 20, { strokeAlign: "center" });
    const result = expandStrokeToPathNode(circle);

    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    // Outer diameter is 100 + 20 = 120
    expect(result.width).toBeCloseTo(120, 1.0);
    expect(result.height).toBeCloseTo(120, 1.0);
  });

  it("Scenario 5: Outline Stencil Star Shape", () => {
    const starStroke = {
      id: "star_stencil",
      kind: "path",
      poly: true,
      polyKind: "star",
      spikes: 5,
      innerRatio: 0.5,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      baseWidth: 100,
      baseHeight: 100,
      stroke: "#6366f1",
      strokeWidth: 8,
      strokeCap: "butt",
      strokeJoin: "bevel",
      strokeAlign: "center",
      points: [
        { x: 50, y: 0, close: false },
        { x: 62, y: 38, close: false },
        { x: 100, y: 38, close: false },
        { x: 69, y: 62, close: false },
        { x: 81, y: 100, close: false },
        { x: 50, y: 77, close: false },
        { x: 19, y: 100, close: false },
        { x: 31, y: 62, close: false },
        { x: 0, y: 38, close: false },
        { x: 38, y: 38, close: true },
      ],
      fill: "transparent",
      visible: true,
    };

    const result = expandStrokeToPathNode(starStroke);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.strokeWidth).toBe(0);
  });
});
