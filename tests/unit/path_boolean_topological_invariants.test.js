import { describe, it, expect } from "vitest";
import {
  booleanUnion,
  booleanSubtract,
  booleanIntersect,
  booleanExclude,
  polygonSignedArea,
  isPointInPolygon,
  tessellateNodeToWorldPolygons,
  clipPolygonPair,
  ptEq,
} from "../../src/canvas/editor/path_boolean_engine.js";

/**
 * Computes net 2D area of a node respecting Even-Odd winding rule for multi-contour / holes.
 */
function computeNetArea(node) {
  if (!node) return 0;
  const rings = tessellateNodeToWorldPolygons(node);
  if (!rings || rings.length === 0) return 0;

  let netArea = 0;
  for (let i = 0; i < rings.length; i += 1) {
    const ring = rings[i];
    const ringArea = Math.abs(polygonSignedArea(ring));
    const sample = {
      x: (ring[0].x + ring[1].x) / 2,
      y: (ring[0].y + ring[1].y) / 2,
    };
    let nestingDepth = 0;
    for (let j = 0; j < rings.length; j += 1) {
      if (i === j) continue;
      if (isPointInPolygon(sample, rings[j])) {
        nestingDepth += 1;
      }
    }
    if (nestingDepth % 2 === 0) {
      netArea += ringArea;
    } else {
      netArea -= ringArea;
    }
  }
  return netArea;
}

function makeRectNode(id, x, y, width, height, fill = "#3b82f6") {
  return {
    id,
    kind: "rect",
    x,
    y,
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    fill,
  };
}

function makeEllipseNode(id, x, y, width, height, fill = "#10b981") {
  return {
    id,
    kind: "ellipse",
    x,
    y,
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    fill,
  };
}

describe("Empirical Challenge Suite: Topological Invariants & Stress Harness", () => {
  // =========================================================================
  // 1. Multi-Shape Chaining (N = 5 .. 10) Overlapping and Disjoint
  // =========================================================================
  describe("1. Multi-Shape Chaining (N = 5 .. 10)", () => {
    it("chains N = 5 linearly overlapping rectangles under Union", () => {
      // 5 overlapping rectangles along diagonal
      const nodes = [];
      for (let i = 0; i < 5; i += 1) {
        nodes.push(makeRectNode(`chain-${i}`, i * 40, i * 40, 100, 100));
      }
      const unionResult = booleanUnion(nodes);
      expect(unionResult).toBeDefined();
      expect(unionResult.kind).toBe("path");
      expect(unionResult.pen).toBe(true);
      expect(unionResult.x).toBeCloseTo(0, 0.5);
      expect(unionResult.y).toBeCloseTo(0, 0.5);
      expect(unionResult.width).toBeCloseTo(260, 1);
      expect(unionResult.height).toBeCloseTo(260, 1);

      const area = computeNetArea(unionResult);
      expect(area).toBeGreaterThan(10000);
      expect(area).toBeLessThan(50000);
    });

    it("chains N = 6 disjoint rectangles under Union (multi-contour preservation)", () => {
      // 6 disjoint squares spaced 150px apart
      const nodes = [];
      for (let i = 0; i < 6; i += 1) {
        nodes.push(makeRectNode(`disjoint-${i}`, i * 150, 0, 100, 100));
      }
      const unionResult = booleanUnion(nodes);
      expect(unionResult).toBeDefined();
      expect(unionResult.pen).toBe(true);

      const rings = tessellateNodeToWorldPolygons(unionResult);
      expect(rings.length).toBe(6);

      const totalArea = computeNetArea(unionResult);
      expect(totalArea).toBeCloseTo(6 * 10000, 1);
    });

    it("chains N = 5 disjoint rectangles under Intersect (returns null without crashing)", () => {
      const nodes = [];
      for (let i = 0; i < 5; i += 1) {
        nodes.push(makeRectNode(`disjoint-${i}`, i * 150, 0, 100, 100));
      }
      const intersectResult = booleanIntersect(nodes);
      expect(intersectResult).toBeNull();
    });

    it("chains N = 5 rectangles under Subtract (S0 \\ S1 \\ S2 \\ S3 \\ S4)", () => {
      // Base square [0, 0, 200, 200], area = 40,000
      const base = makeRectNode("base", 0, 0, 200, 200);
      // 4 sub-squares cutting out the 4 corners: 50x50 each (total 10,000)
      const c1 = makeRectNode("c1", 0, 0, 50, 50);
      const c2 = makeRectNode("c2", 150, 0, 50, 50);
      const c3 = makeRectNode("c3", 0, 150, 50, 50);
      const c4 = makeRectNode("c4", 150, 150, 50, 50);

      const subResult = booleanSubtract([base, c1, c2, c3, c4]);
      expect(subResult).toBeDefined();
      const area = computeNetArea(subResult);
      expect(area).toBeCloseTo(30000, 10);
    });

    it("chains N = 8 starburst overlapping circles under Union", () => {
      // 8 circles arranged symmetrically around origin
      const nodes = [];
      const R = 60;
      const r = 40;
      for (let i = 0; i < 8; i += 1) {
        const theta = (i * 2 * Math.PI) / 8;
        const cx = 200 + R * Math.cos(theta);
        const cy = 200 + R * Math.sin(theta);
        nodes.push(
          makeEllipseNode(`petal-${i}`, cx - r, cy - r, r * 2, r * 2),
        );
      }
      const unionResult = booleanUnion(nodes);
      expect(unionResult).toBeDefined();
      expect(unionResult.pen).toBe(true);

      const area = computeNetArea(unionResult);
      const singleCircleArea = Math.PI * r * r;
      expect(area).toBeGreaterThan(singleCircleArea);
      expect(area).toBeLessThan(8 * singleCircleArea);
    });

    it("chains N = 10 overlapping staircase rectangles", () => {
      const nodes = [];
      for (let i = 0; i < 10; i += 1) {
        nodes.push(makeRectNode(`step-${i}`, i * 20, i * 20, 60, 60));
      }
      const unionResult = booleanUnion(nodes);
      expect(unionResult).toBeDefined();
      expect(unionResult.pen).toBe(true);
      expect(unionResult.width).toBeCloseTo(9 * 20 + 60, 1);
      expect(unionResult.height).toBeCloseTo(9 * 20 + 60, 1);

      const area = computeNetArea(unionResult);
      expect(area).toBeGreaterThan(3600);
      expect(area).toBeLessThan(36000);
    });

    it("chains N = 7 mixed overlapping clusters and disjoint islands", () => {
      // Cluster A: 3 overlapping rects
      const a1 = makeRectNode("a1", 0, 0, 50, 50);
      const a2 = makeRectNode("a2", 25, 0, 50, 50);
      const a3 = makeRectNode("a3", 10, 25, 50, 50);

      // Cluster B: 2 overlapping rects
      const b1 = makeRectNode("b1", 200, 0, 40, 40);
      const b2 = makeRectNode("b2", 220, 0, 40, 40);

      // Disjoint islands: 2 isolated rects
      const c1 = makeRectNode("c1", 400, 0, 30, 30);
      const c2 = makeRectNode("c2", 500, 0, 30, 30);

      const unionResult = booleanUnion([a1, a2, a3, b1, b2, c1, c2]);
      expect(unionResult).toBeDefined();
      const rings = tessellateNodeToWorldPolygons(unionResult);
      expect(rings.length).toBe(4);
    });

    it("unions a bridge shape connecting 2 previously disjoint components into 1 boundary", () => {
      // When s3 bridges s1 and s2, ideal topological union forms 1 single outer polygon.
      const s1 = makeRectNode("s1", 0, 0, 100, 100);
      const s2 = makeRectNode("s2", 200, 0, 100, 100);
      const s3 = makeRectNode("s3", 50, 0, 200, 100);

      const unionResult = booleanUnion([s1, s2, s3]);
      const rings = tessellateNodeToWorldPolygons(unionResult);
      expect(rings.length).toBe(1);
    });

    it("confirms bridge union merges disjoint components into a single unified loop", () => {
      const s1 = makeRectNode("s1", 0, 0, 100, 100);
      const s2 = makeRectNode("s2", 200, 0, 100, 100);
      const s3 = makeRectNode("s3", 50, 0, 200, 100);

      const unionResult = booleanUnion([s1, s2, s3]);
      const rings = tessellateNodeToWorldPolygons(unionResult);
      expect(rings.length).toBe(1);
      expect(Math.abs(polygonSignedArea(rings[0]))).toBeCloseTo(30000, 1);
    });
  });

  // =========================================================================
  // 2. Concentric Nested Shapes (3-Layer Russian Doll Donut Rings)
  // =========================================================================
  describe("2. Concentric Nested Shapes (3-Layer Russian Doll Donut Rings)", () => {
    it("correctly creates concentric 3-layer Russian doll donut rings via alternating subtraction", () => {
      // 6 concentric circles centered at (200, 200)
      // Layer 1: R=150 .. R=120 (Donut 1, area = pi*(150^2 - 120^2) = pi*8100 ≈ 25446.9)
      // Layer 2: R=90 .. R=60   (Donut 2, area = pi*(90^2 - 60^2) = pi*4500 ≈ 14137.2)
      // Layer 3: R=30           (Center disk, area = pi*30^2 = pi*900 ≈ 2827.4)
      const c150 = makeEllipseNode("c150", 50, 50, 300, 300);
      const c120 = makeEllipseNode("c120", 80, 80, 240, 240);
      const c90 = makeEllipseNode("c90", 110, 110, 180, 180);
      const c60 = makeEllipseNode("c60", 140, 140, 120, 120);
      const c30 = makeEllipseNode("c30", 170, 170, 60, 60);

      const donut1 = booleanSubtract([c150, c120]);
      expect(donut1).toBeDefined();
      const donut1Rings = tessellateNodeToWorldPolygons(donut1);
      expect(donut1Rings.length).toBe(2);

      const donut2 = booleanSubtract([c90, c60]);
      expect(donut2).toBeDefined();
      const donut2Rings = tessellateNodeToWorldPolygons(donut2);
      expect(donut2Rings.length).toBe(2);

      // Ideal topological invariant: 3 concentric regions = 5 closed rings
      const russianDoll = booleanUnion([donut1, donut2, c30]);
      expect(russianDoll).toBeDefined();

      const dollRings = tessellateNodeToWorldPolygons(russianDoll);
      expect(dollRings.length).toBe(5);
    });

    it("verifies Russian doll preserves all 5 concentric rings under multi-ring classification", () => {
      const c150 = makeEllipseNode("c150", 50, 50, 300, 300);
      const c120 = makeEllipseNode("c120", 80, 80, 240, 240);
      const c90 = makeEllipseNode("c90", 110, 110, 180, 180);
      const c60 = makeEllipseNode("c60", 140, 140, 120, 120);
      const c30 = makeEllipseNode("c30", 170, 170, 60, 60);

      const donut1 = booleanSubtract([c150, c120]);
      const donut2 = booleanSubtract([c90, c60]);
      const russianDoll = booleanUnion([donut1, donut2, c30]);

      const dollRings = tessellateNodeToWorldPolygons(russianDoll);
      expect(dollRings.length).toBe(5);
    });

    it("subtracts an inner concentric circle from an existing donut with no impact on donut ring", () => {
      // Donut: outer R=100, hole R=70
      const outer = makeEllipseNode("outer", 0, 0, 200, 200);
      const hole = makeEllipseNode("hole", 30, 30, 140, 140);
      const donut = booleanSubtract([outer, hole]);

      // Inner circle R=30 located inside the hole (concentric at center 100, 100)
      const innerInsideHole = makeEllipseNode("inner", 70, 70, 60, 60);

      // Subtracting a shape lying entirely in the donut hole should leave donut unmodified
      const subResult = booleanSubtract([donut, innerInsideHole]);
      expect(subResult).toBeDefined();

      const initialArea = computeNetArea(donut);
      const finalArea = computeNetArea(subResult);
      expect(finalArea).toBeCloseTo(initialArea, 1);
    });

    it("confirms subtracting inner circle inside hole preserves 2 rings without duplicate cutouts", () => {
      const outer = makeEllipseNode("outer", 0, 0, 200, 200);
      const hole = makeEllipseNode("hole", 30, 30, 140, 140);
      const donut = booleanSubtract([outer, hole]);

      const innerInsideHole = makeEllipseNode("inner", 70, 70, 60, 60);
      const subResult = booleanSubtract([donut, innerInsideHole]);

      const subRings = tessellateNodeToWorldPolygons(subResult);
      expect(subRings.length).toBe(2);
    });

    it("Russian doll rectangular nested frames preserve topological genus (holes)", () => {
      // Frame 1: [0, 0, 300, 300] minus [30, 30, 240, 240] -> thickness 30
      const f1Outer = makeRectNode("f1o", 0, 0, 300, 300);
      const f1Inner = makeRectNode("f1i", 30, 30, 240, 240);
      const frame1 = booleanSubtract([f1Outer, f1Inner]);

      // Frame 2: [60, 60, 180, 180] minus [90, 90, 120, 120] -> thickness 30
      const f2Outer = makeRectNode("f2o", 60, 60, 180, 180);
      const f2Inner = makeRectNode("f2i", 90, 90, 120, 120);
      const frame2 = booleanSubtract([f2Outer, f2Inner]);

      // Center core: [120, 120, 60, 60]
      const core = makeRectNode("core", 120, 120, 60, 60);

      const unionFrames = booleanUnion([frame1, frame2, core]);
      expect(unionFrames).toBeDefined();
      const rings = tessellateNodeToWorldPolygons(unionFrames);
      expect(rings.length).toBe(5);
    });

    it("confirms nested rectangular frames preserve all 5 topological rings", () => {
      const f1Outer = makeRectNode("f1o", 0, 0, 300, 300);
      const f1Inner = makeRectNode("f1i", 30, 30, 240, 240);
      const frame1 = booleanSubtract([f1Outer, f1Inner]);

      const f2Outer = makeRectNode("f2o", 60, 60, 180, 180);
      const f2Inner = makeRectNode("f2i", 90, 90, 120, 120);
      const frame2 = booleanSubtract([f2Outer, f2Inner]);

      const core = makeRectNode("core", 120, 120, 60, 60);
      const unionFrames = booleanUnion([frame1, frame2, core]);

      const rings = tessellateNodeToWorldPolygons(unionFrames);
      expect(rings.length).toBe(5);
    });
  });

  // =========================================================================
  // 3. Collinear Tangent Edge Alignment (Identical Coordinate Seams)
  // =========================================================================
  describe("3. Collinear Tangent Edge Alignment (Identical Coordinate Seams)", () => {
    it("merges two side-by-side rectangles sharing an identical vertical seam without leaving internal seams", () => {
      // Box A: [0, 0, 100, 100]
      // Box B: [100, 0, 100, 100]
      // Shared boundary: x = 100, y from 0 to 100
      const boxA = makeRectNode("boxA", 0, 0, 100, 100);
      const boxB = makeRectNode("boxB", 100, 0, 100, 100);

      const unionResult = booleanUnion([boxA, boxB]);
      expect(unionResult).toBeDefined();
      expect(unionResult.width).toBeCloseTo(200, 0.5);
      expect(unionResult.height).toBeCloseTo(100, 0.5);

      const rings = tessellateNodeToWorldPolygons(unionResult);
      expect(rings.length).toBe(1);
      const area = computeNetArea(unionResult);
      expect(area).toBeCloseTo(20000, 1);
    });

    it("returns null for intersection of tangent side-by-side rectangles", () => {
      const boxA = makeRectNode("boxA", 0, 0, 100, 100);
      const boxB = makeRectNode("boxB", 100, 0, 100, 100);

      const intResult = booleanIntersect([boxA, boxB]);
      expect(intResult).toBeNull();
    });

    it("leaves base rectangle intact when subtracting a tangent side-by-side rectangle", () => {
      const boxA = makeRectNode("boxA", 0, 0, 100, 100);
      const boxB = makeRectNode("boxB", 100, 0, 100, 100);

      const subResult = booleanSubtract([boxA, boxB]);
      expect(subResult).toBeDefined();
      const area = computeNetArea(subResult);
      expect(area).toBeCloseTo(10000, 1);
    });

    it("merges partial collinear edge overlaps cleanly (T-junction seam)", () => {
      // Box A: [0, 0, 100, 100]
      // Box B: [100, 25, 100, 50] (shared seam x=100 from y=25 to y=75)
      const boxA = makeRectNode("boxA", 0, 0, 100, 100);
      const boxB = makeRectNode("boxB", 100, 25, 100, 50);

      const unionResult = booleanUnion([boxA, boxB]);
      expect(unionResult).toBeDefined();

      const rings = tessellateNodeToWorldPolygons(unionResult);
      expect(rings.length).toBe(1);

      const area = computeNetArea(unionResult);
      expect(area).toBeCloseTo(15000, 1);
    });

    it("merges 3 rectangles sharing contiguous collinear seams into a single outer boundary", () => {
      // Box 1: [0, 0, 100, 100]
      // Box 2: [100, 0, 100, 50] (top half)
      // Box 3: [100, 50, 100, 50] (bottom half)
      const b1 = makeRectNode("b1", 0, 0, 100, 100);
      const b2 = makeRectNode("b2", 100, 0, 100, 50);
      const b3 = makeRectNode("b3", 100, 50, 100, 50);

      const unionResult = booleanUnion([b1, b2, b3]);
      expect(unionResult).toBeDefined();
      const rings = tessellateNodeToWorldPolygons(unionResult);
      expect(rings.length).toBe(1);

      const area = computeNetArea(unionResult);
      expect(area).toBeCloseTo(20000, 1);
    });

    it("handles tangent corner contact (vertex-only touching) gracefully", () => {
      // Box 1: [0, 0, 100, 100]
      // Box 2: [100, 100, 100, 100] (touching only at vertex (100, 100))
      const b1 = makeRectNode("b1", 0, 0, 100, 100);
      const b2 = makeRectNode("b2", 100, 100, 100, 100);

      const unionResult = booleanUnion([b1, b2]);
      expect(unionResult).toBeDefined();

      const area = computeNetArea(unionResult);
      expect(area).toBeCloseTo(20000, 1);

      const intResult = booleanIntersect([b1, b2]);
      expect(intResult).toBeNull();
    });
  });

  // =========================================================================
  // 4. Area Conservation Invariants
  // =========================================================================
  describe("4. Area Conservation Invariants", () => {
    it("strictly satisfies Area(A ∪ B) + Area(A ∩ B) ≈ Area(A) + Area(B) for partially overlapping rectangles", () => {
      // Test across multiple overlap percentages: 10%, 30%, 50%, 70%, 90%
      const offsets = [90, 70, 50, 30, 10];
      for (const dx of offsets) {
        const a = makeRectNode("a", 0, 0, 100, 100);
        const b = makeRectNode("b", dx, 0, 100, 100);

        const areaA = computeNetArea(a);
        const areaB = computeNetArea(b);

        const unionNode = booleanUnion([a, b]);
        const intNode = booleanIntersect([a, b]);

        const areaUnion = computeNetArea(unionNode);
        const areaInt = computeNetArea(intNode);

        const lhs = areaUnion + areaInt;
        const rhs = areaA + areaB;

        const relError = Math.abs(lhs - rhs) / rhs;
        expect(relError).toBeLessThan(0.001); // < 0.1% error for polygons
      }
    });

    it("strictly satisfies Area(A \\ B) + Area(A ∩ B) ≈ Area(A)", () => {
      const a = makeRectNode("a", 0, 0, 120, 100);
      const b = makeRectNode("b", 40, 20, 120, 100);

      const areaA = computeNetArea(a);
      const subNode = booleanSubtract([a, b]);
      const intNode = booleanIntersect([a, b]);

      const areaSub = computeNetArea(subNode);
      const areaInt = computeNetArea(intNode);

      const relError = Math.abs(areaSub + areaInt - areaA) / areaA;
      expect(relError).toBeLessThan(0.001);
    });

    it("satisfies Area(A ⊕ B) ≈ Area(A \\ B) + Area(B \\ A) (Symmetric Difference Invariant)", () => {
      const a = makeRectNode("a", 0, 0, 100, 100);
      const b = makeRectNode("b", 50, 0, 100, 100);

      const xorNode = booleanExclude([a, b]);
      const subAB = booleanSubtract([a, b]);
      const subBA = booleanSubtract([b, a]);

      const areaXor = computeNetArea(xorNode);
      const areaSubAB = computeNetArea(subAB);
      const areaSubBA = computeNetArea(subBA);

      const relError = Math.abs(areaXor - (areaSubAB + areaSubBA)) / areaXor;
      expect(relError).toBeLessThan(0.001);
    });

    it("satisfies Area(A ⊕ B) + 2 * Area(A ∩ B) ≈ Area(A) + Area(B)", () => {
      const a = makeRectNode("a", 0, 0, 100, 100);
      const b = makeRectNode("b", 30, 30, 100, 100);

      const areaA = computeNetArea(a);
      const areaB = computeNetArea(b);

      const xorNode = booleanExclude([a, b]);
      const intNode = booleanIntersect([a, b]);

      const areaXor = computeNetArea(xorNode);
      const areaInt = computeNetArea(intNode);

      const lhs = areaXor + 2 * areaInt;
      const rhs = areaA + areaB;

      const relError = Math.abs(lhs - rhs) / rhs;
      expect(relError).toBeLessThan(0.001);
    });

    it("satisfies area conservation for curved ellipse shapes (adaptive chord error bounded)", () => {
      const a = makeEllipseNode("a", 0, 0, 100, 100);
      const b = makeEllipseNode("b", 40, 0, 100, 100);

      const areaA = computeNetArea(a);
      const areaB = computeNetArea(b);

      const unionNode = booleanUnion([a, b]);
      const intNode = booleanIntersect([a, b]);

      const areaUnion = computeNetArea(unionNode);
      const areaInt = computeNetArea(intNode);

      const lhs = areaUnion + areaInt;
      const rhs = areaA + areaB;

      const relError = Math.abs(lhs - rhs) / rhs;
      expect(relError).toBeLessThan(0.015);
    });

    it("satisfies 3-shape Inclusion-Exclusion: Area(A ∪ B ∪ C) = Area(A)+Area(B)+Area(C) - Area(A∩B)-Area(B∩C)-Area(A∩C) + Area(A∩B∩C)", () => {
      const a = makeRectNode("a", 0, 0, 100, 100);
      const b = makeRectNode("b", 50, 0, 100, 100);
      const c = makeRectNode("c", 25, 50, 100, 100);

      const unionABC = booleanUnion([a, b, c]);
      const areaUnion = computeNetArea(unionABC);

      const areaA = computeNetArea(a);
      const areaB = computeNetArea(b);
      const areaC = computeNetArea(c);

      const areaAB = computeNetArea(booleanIntersect([a, b]));
      const areaBC = computeNetArea(booleanIntersect([b, c]));
      const areaAC = computeNetArea(booleanIntersect([a, c]));

      const intABC = booleanIntersect([a, b, c]);
      const areaABC = computeNetArea(intABC);

      const inclusionExclusion =
        areaA + areaB + areaC - areaAB - areaBC - areaAC + areaABC;

      const relError = Math.abs(areaUnion - inclusionExclusion) / areaUnion;
      expect(relError).toBeLessThan(0.005);
    });
  });
});
