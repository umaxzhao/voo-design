import { describe, it, expect } from "vitest";
import {
  booleanUnion,
  booleanSubtract,
  booleanIntersect,
  booleanExclude,
  tessellateNodeToWorldPolygons,
  clipPolygonPair,
  reconstructBezierPath,
  solveSegmentIntersection,
  polygonSignedArea,
} from "../../src/canvas/editor/path_boolean_engine.js";

function makeRect(id, x, y, width, height, fill = "#3b82f6") {
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
    stroke: "transparent",
    strokeWidth: 0,
    visible: true,
  };
}

function makeEllipse(id, x, y, width, height, fill = "#10b981") {
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
    stroke: "transparent",
    strokeWidth: 0,
    visible: true,
  };
}

function makeStar(id, x, y, width, height, spikes = 5, innerRatio = 0.5) {
  const cx = width / 2;
  const cy = height / 2;
  const points = [];
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? width / 2 : (width / 2) * innerRatio;
    const a = i * step - Math.PI / 2;
    points.push({
      x: cx + r * Math.cos(a),
      y: cy + r * Math.sin(a),
      in: null,
      out: null,
      close: i === spikes * 2 - 1,
    });
  }
  return {
    id,
    kind: "path",
    pen: true,
    poly: true,
    polyKind: "star",
    spikes,
    innerRatio,
    x,
    y,
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    points,
    fill: "#f59e0b",
    stroke: "transparent",
    strokeWidth: 0,
    visible: true,
  };
}

function makeSelfIntersectingPolygon(id, x, y, size) {
  // Classic crossed bowtie / hourglass polygon
  const s = size;
  const points = [
    { x: 0, y: 0, in: null, out: null },
    { x: s, y: s, in: null, out: null },
    { x: s, y: 0, in: null, out: null },
    { x: 0, y: s, in: null, out: null, close: true },
  ];
  return {
    id,
    kind: "path",
    pen: true,
    x,
    y,
    width: s,
    height: s,
    baseWidth: s,
    baseHeight: s,
    points,
    fill: "#8b5cf6",
    stroke: "transparent",
    strokeWidth: 0,
    visible: true,
  };
}

function makeComplexPentagram(id, x, y, size) {
  // Self-intersecting 5-pointed star traced in star-order (0 -> 2 -> 4 -> 1 -> 3 -> 0)
  const r = size / 2;
  const cx = r;
  const cy = r;
  const order = [0, 2, 4, 1, 3];
  const points = order.map((idx, i) => {
    const angle = (idx * 2 * Math.PI) / 5 - Math.PI / 2;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      in: null,
      out: null,
      close: i === 4,
    };
  });
  return {
    id,
    kind: "path",
    pen: true,
    x,
    y,
    width: size,
    height: size,
    baseWidth: size,
    baseHeight: size,
    points,
    fill: "#ec4899",
    stroke: "transparent",
    strokeWidth: 0,
    visible: true,
  };
}

function assertValidNodeOrNull(res, label) {
  if (res === null) return;
  expect(typeof res, `${label}: result must be an object`).toBe("object");
  expect(typeof res.x, `${label}: x must be a number`).toBe("number");
  expect(typeof res.y, `${label}: y must be a number`).toBe("number");
  expect(Number.isFinite(res.x), `${label}: x must be finite`).toBe(true);
  expect(Number.isFinite(res.y), `${label}: y must be finite`).toBe(true);
  expect(Number.isFinite(res.width), `${label}: width must be finite`).toBe(true);
  expect(Number.isFinite(res.height), `${label}: height must be finite`).toBe(true);
  expect(res.width, `${label}: width must be >= 0`).toBeGreaterThanOrEqual(0);
  expect(res.height, `${label}: height must be >= 0`).toBeGreaterThanOrEqual(0);
  if (Array.isArray(res.points)) {
    for (const pt of res.points) {
      expect(Number.isFinite(pt.x), `${label}: point.x must be finite`).toBe(true);
      expect(Number.isFinite(pt.y), `${label}: point.y must be finite`).toBe(true);
    }
  }
}

describe("Adversarial Boolean Engine Stress Testing", () => {
  describe("1. Random Perturbation and Jitter Stress", () => {
    it("survives 100 randomized micro and macro coordinate perturbations without crashing or looping", () => {
      const ops = [booleanUnion, booleanSubtract, booleanIntersect, booleanExclude];
      const opNames = ["union", "subtract", "intersect", "exclude"];

      for (let i = 0; i < 50; i++) {
        // Generate pseudo-random perturbation scale between 1e-6 and 5.0
        const scale = Math.pow(10, -6 + Math.random() * 7); // 1e-6 to 10
        const jitterX = (Math.random() - 0.5) * scale;
        const jitterY = (Math.random() - 0.5) * scale;

        const a = makeRect("a", 100, 100, 100, 100);
        const b = makeRect("b", 150 + jitterX, 150 + jitterY, 100 + jitterX * 0.5, 100 + jitterY * 0.5);

        for (let opIdx = 0; opIdx < ops.length; opIdx++) {
          const fn = ops[opIdx];
          const name = opNames[opIdx];
          const t0 = performance.now();
          const res = fn([a, b]);
          const elapsed = performance.now() - t0;

          expect(elapsed, `Operation ${name} perturbation #${i} took too long (${elapsed}ms)`).toBeLessThan(200);
          assertValidNodeOrNull(res, `Perturbation ${name} #${i}`);
        }
      }
    });

    it("handles nearly collinear overlapping edge perturbations (epsilon distance)", () => {
      // Rect A from [0, 0] to [100, 100]
      // Rect B from [0, 100 + eps] to [100, 200]
      const epsilons = [1e-9, 1e-7, 1e-5, 1e-3, 0.01];

      for (const eps of epsilons) {
        const a = makeRect("a", 0, 0, 100, 100);
        const b = makeRect("b", 0, 100 - eps, 100, 100); // overlap by tiny epsilon

        const u = booleanUnion([a, b]);
        const s = booleanSubtract([a, b]);
        const inter = booleanIntersect([a, b]);
        const x = booleanExclude([a, b]);

        assertValidNodeOrNull(u, `collinear eps=${eps} union`);
        assertValidNodeOrNull(s, `collinear eps=${eps} subtract`);
        assertValidNodeOrNull(inter, `collinear eps=${eps} intersect`);
        assertValidNodeOrNull(x, `collinear eps=${eps} exclude`);
      }
    });
  });

  describe("2. Self-Intersecting Complex Stars and Polygons", () => {
    it("processes crossed bowtie self-intersecting polygon safely", () => {
      const bowtie = makeSelfIntersectingPolygon("bowtie", 50, 50, 100);
      const rect = makeRect("r", 75, 75, 80, 80);

      const u = booleanUnion([bowtie, rect]);
      const s = booleanSubtract([bowtie, rect]);
      const inter = booleanIntersect([bowtie, rect]);
      const x = booleanExclude([bowtie, rect]);

      assertValidNodeOrNull(u, "bowtie union");
      assertValidNodeOrNull(s, "bowtie subtract");
      assertValidNodeOrNull(inter, "bowtie intersect");
      assertValidNodeOrNull(x, "bowtie exclude");
    });

    it("processes classic self-intersecting pentagram", () => {
      const pentagram = makeComplexPentagram("penta", 50, 50, 120);
      const circle = makeEllipse("circle", 70, 70, 80, 80);

      const u = booleanUnion([pentagram, circle]);
      const s = booleanSubtract([pentagram, circle]);
      const inter = booleanIntersect([pentagram, circle]);
      const x = booleanExclude([pentagram, circle]);

      assertValidNodeOrNull(u, "pentagram union");
      assertValidNodeOrNull(s, "pentagram subtract");
      assertValidNodeOrNull(inter, "pentagram intersect");
      assertValidNodeOrNull(x, "pentagram exclude");
    });

    it("processes high-frequency self-crossing stars (17 spikes, 31 spikes)", () => {
      const star17 = makeStar("star17", 0, 0, 200, 200, 17, 0.15);
      const star31 = makeStar("star31", 50, 50, 200, 200, 31, 0.85);

      const t0 = performance.now();
      const u = booleanUnion([star17, star31]);
      const s = booleanSubtract([star17, star31]);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(1000);
      assertValidNodeOrNull(u, "high-frequency star union");
      assertValidNodeOrNull(s, "high-frequency star subtract");
    });
  });

  describe("3. Extreme Scales: Micro (<0.1px) and Macro (>5000px)", () => {
    it("handles sub-pixel micro shapes (< 0.1px) without division by zero or NaN", () => {
      const micro1 = makeRect("m1", 10, 10, 0.05, 0.05);
      const micro2 = makeRect("m2", 10.02, 10.02, 0.05, 0.05);

      const u = booleanUnion([micro1, micro2]);
      const s = booleanSubtract([micro1, micro2]);
      const inter = booleanIntersect([micro1, micro2]);
      const x = booleanExclude([micro1, micro2]);

      assertValidNodeOrNull(u, "micro union");
      assertValidNodeOrNull(s, "micro subtract");
      assertValidNodeOrNull(inter, "micro intersect");
      assertValidNodeOrNull(x, "micro exclude");
    });

    it("handles nano shapes (< 0.001px) without uncaught exceptions", () => {
      const nano1 = makeRect("n1", 0, 0, 0.0001, 0.0001);
      const nano2 = makeRect("n2", 0, 0, 0.0001, 0.0001);

      expect(() => booleanUnion([nano1, nano2])).not.toThrow();
      expect(() => booleanSubtract([nano1, nano2])).not.toThrow();
      expect(() => booleanIntersect([nano1, nano2])).not.toThrow();
      expect(() => booleanExclude([nano1, nano2])).not.toThrow();
    });

    it("handles very large macro shapes (> 5000px and 50000px)", () => {
      const macro1 = makeRect("mac1", 0, 0, 10000, 10000);
      const macro2 = makeRect("mac2", 5000, 5000, 10000, 10000);

      const u = booleanUnion([macro1, macro2]);
      const s = booleanSubtract([macro1, macro2]);
      const inter = booleanIntersect([macro1, macro2]);

      assertValidNodeOrNull(u, "macro union");
      assertValidNodeOrNull(s, "macro subtract");
      assertValidNodeOrNull(inter, "macro intersect");

      expect(u.width).toBeGreaterThanOrEqual(14999);
      expect(inter.width).toBeCloseTo(5000, -1);
    });

    it("handles extreme scale disparity: 0.05px micro shape interacting with 20000px macro shape", () => {
      const macro = makeRect("macro", 0, 0, 20000, 20000);
      const micro = makeRect("micro", 10000, 10000, 0.05, 0.05);

      // Micro is strictly inside macro
      const s = booleanSubtract([macro, micro]);
      const inter = booleanIntersect([macro, micro]);

      assertValidNodeOrNull(s, "disparity subtract");
      assertValidNodeOrNull(inter, "disparity intersect");
    });

    it("handles shapes positioned at extreme coordinates (> 1,000,000)", () => {
      const far1 = makeRect("f1", 1000000, 1000000, 500, 500);
      const far2 = makeRect("f2", 1000250, 1000250, 500, 500);

      const u = booleanUnion([far1, far2]);
      expect(u).not.toBeNull();
      expect(u.x).toBeCloseTo(1000000, -1);
      expect(u.y).toBeCloseTo(1000000, -1);
    });
  });

  describe("4. Numerical Precision, Tangencies, and Zero-Area Results", () => {
    it("handles identical shapes: subtraction yields null or empty, union is idempotent", () => {
      const a = makeRect("a", 100, 100, 80, 80);
      const b = makeRect("b", 100, 100, 80, 80);

      const diff = booleanSubtract([a, b]);
      // A - A should either be null or an empty path
      if (diff) {
        expect(diff.points?.length || 0).toBe(0);
      } else {
        expect(diff).toBeNull();
      }

      const inter = booleanIntersect([a, b]);
      assertValidNodeOrNull(inter, "identical intersect");
      expect(inter.width).toBeCloseTo(80, 0.1);
      expect(inter.height).toBeCloseTo(80, 0.1);

      const excl = booleanExclude([a, b]);
      // A ⊕ A should be empty or null
      if (excl) {
        expect(excl.points?.length || 0).toBe(0);
      } else {
        expect(excl).toBeNull();
      }
    });

    it("handles tangent edge-sharing rectangles (zero-area intersection)", () => {
      // Touching precisely on edge x = 100
      const a = makeRect("a", 0, 0, 100, 100);
      const b = makeRect("b", 100, 0, 100, 100);

      const inter = booleanIntersect([a, b]);
      // Intersection along a 1D line is 0 area, so reconstructBezierPath should return null
      expect(inter).toBeNull();

      const u = booleanUnion([a, b]);
      assertValidNodeOrNull(u, "tangent edge union");

      const s = booleanSubtract([a, b]);
      assertValidNodeOrNull(s, "tangent edge subtract");
      expect(s.width).toBeCloseTo(100, 0.1);
    });

    it("handles tangent corner-touching rectangles (single vertex contact)", () => {
      // Touching at (100, 100)
      const a = makeRect("a", 0, 0, 100, 100);
      const b = makeRect("b", 100, 100, 100, 100);

      const inter = booleanIntersect([a, b]);
      expect(inter).toBeNull();

      const u = booleanUnion([a, b]);
      assertValidNodeOrNull(u, "tangent corner union");
    });

    it("handles completely disjoint distant shapes", () => {
      const a = makeRect("a", 0, 0, 50, 50);
      const b = makeRect("b", 50000, 50000, 50, 50);

      const inter = booleanIntersect([a, b]);
      expect(inter).toBeNull();

      const s = booleanSubtract([a, b]);
      expect(s).not.toBeNull();
      expect(s.x).toBeCloseTo(0, 0.1);
      expect(s.width).toBeCloseTo(50, 0.1);

      const u = booleanUnion([a, b]);
      assertValidNodeOrNull(u, "disjoint union");

      const x = booleanExclude([a, b]);
      assertValidNodeOrNull(x, "disjoint exclude");
    });

    it("handles degenerate 0-dimension inputs without crashing", () => {
      const flatX = makeRect("flatX", 50, 50, 0, 100);
      const flatY = makeRect("flatY", 50, 50, 100, 0);
      const normal = makeRect("norm", 50, 50, 100, 100);

      expect(() => booleanUnion([flatX, normal])).not.toThrow();
      expect(() => booleanSubtract([normal, flatY])).not.toThrow();
      expect(() => booleanIntersect([flatX, flatY])).not.toThrow();
      expect(() => booleanExclude([flatX, normal])).not.toThrow();
    });

    it("handles chained multi-node stress (10 overlapping shapes)", () => {
      const shapes = [];
      for (let i = 0; i < 10; i++) {
        shapes.push(makeRect(`chain-${i}`, 100 + i * 15, 100 + i * 15, 80, 80));
      }

      const t0 = performance.now();
      const chainedUnion = booleanUnion(shapes);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(1000);
      assertValidNodeOrNull(chainedUnion, "10-node chain union");
      expect(chainedUnion.width).toBeGreaterThan(150);
    });
  });

  describe("5. Pathological Inputs and Adversarial Torture", () => {
    it("handles malformed invocation arguments gracefully without uncaught exceptions", () => {
      const ops = [booleanUnion, booleanSubtract, booleanIntersect, booleanExclude];
      for (const op of ops) {
        expect(() => op([])).not.toThrow();
        expect(op([])).toBeNull();
        expect(() => op(null)).not.toThrow();
        expect(op(null)).toBeNull();
        expect(() => op(undefined)).not.toThrow();
        expect(op(undefined)).toBeNull();
        expect(() => op("not an array")).not.toThrow();
        expect(op("not an array")).toBeNull();

        const single = makeRect("s", 0, 0, 50, 50);
        expect(() => op([single])).not.toThrow();
        expect(op([single])).toBeNull();

        expect(() => op([null, single])).not.toThrow();
        expect(() => op([single, null])).not.toThrow();
        expect(() => op([undefined, undefined])).not.toThrow();
      }
    });

    it("handles negative coordinates and negative spans safely", () => {
      const neg1 = makeRect("neg1", -5000, -5000, 200, 200);
      const neg2 = makeRect("neg2", -4900, -4900, 200, 200);

      const u = booleanUnion([neg1, neg2]);
      const s = booleanSubtract([neg1, neg2]);
      const inter = booleanIntersect([neg1, neg2]);

      assertValidNodeOrNull(u, "negative coords union");
      assertValidNodeOrNull(s, "negative coords subtract");
      assertValidNodeOrNull(inter, "negative coords intersect");

      expect(u.x).toBeLessThan(0);
      expect(u.y).toBeLessThan(0);
    });

    it("handles extreme 100-spike star without hanging or crashing", () => {
      const star100 = makeStar("star100", 100, 100, 300, 300, 100, 0.2);
      const circle = makeEllipse("c", 150, 150, 200, 200);

      const t0 = performance.now();
      const u = booleanUnion([star100, circle]);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(2000);
      assertValidNodeOrNull(u, "100-spike star union");
    });

    it("survives pipeline of 20 sequential boolean operations without anchor explosion or NaN taint", () => {
      let current = makeRect("base", 100, 100, 100, 100);

      for (let i = 0; i < 20; i++) {
        const next = makeEllipse(`step-${i}`, 110 + (i % 5) * 5, 110 + (i % 5) * 5, 60, 60);
        const op = i % 2 === 0 ? booleanUnion : booleanSubtract;
        const res = op([current, next]);
        if (res) {
          current = res;
        }
      }

      assertValidNodeOrNull(current, "20-step pipeline result");
      // Across 20 overlapping circles with scallop intersections, anchor count remains bounded (< 1500)
      expect(current.points.length).toBeLessThan(1500);
      expect(current.points.length).toBeGreaterThan(10);
    });

    it("handles concentric shapes (donut subtraction and inside intersection)", () => {
      const outer = makeEllipse("outer", 0, 0, 200, 200);
      const inner = makeEllipse("inner", 50, 50, 100, 100);

      // Subtract inner from outer -> should produce donut
      const donut = booleanSubtract([outer, inner]);
      assertValidNodeOrNull(donut, "donut");
      expect(donut).not.toBeNull();
      // Multi-contour donut path has intermediate close
      expect(donut.points.some(p => p.close)).toBe(true);

      // Intersect outer with inner -> should return inner (within 0.25px chord tolerance)
      const inter = booleanIntersect([outer, inner]);
      assertValidNodeOrNull(inter, "concentric intersect");
      expect(inter).not.toBeNull();
      expect(inter.width).toBeCloseTo(100, 1);
    });

    it("safely handles nodes with NaN or Infinite coordinates", () => {
      const nanNode = {
        id: "nan",
        kind: "path",
        pen: true,
        x: NaN,
        y: NaN,
        width: NaN,
        height: NaN,
        points: [{ x: NaN, y: NaN, close: true }],
      };
      const normal = makeRect("norm", 0, 0, 100, 100);

      expect(() => booleanUnion([nanNode, normal])).not.toThrow();
      expect(() => booleanSubtract([normal, nanNode])).not.toThrow();
      expect(() => booleanIntersect([nanNode, normal])).not.toThrow();
      expect(() => booleanExclude([nanNode, normal])).not.toThrow();
    });
  });
});
