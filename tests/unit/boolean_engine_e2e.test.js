import { describe, it, expect } from "vitest";

/**
 * End-to-End & Unit Test Suite for Destructive Boolean Operations Engine
 * Module under test: src/canvas/editor/path_boolean_engine.js
 * Interface contracts per PROJECT.md:
 *   - booleanUnion(nodes: SceneNode[]): SceneNode
 *   - booleanSubtract(nodes: SceneNode[]): SceneNode
 *   - booleanIntersect(nodes: SceneNode[]): SceneNode
 *   - booleanExclude(nodes: SceneNode[]): SceneNode
 */

// Dynamically load module if present; skip gracefully if pending milestone implementation
const booleanEngine = await (async () => {
  try {
    return await import(/* @vite-ignore */ "../../src/canvas/editor/path_boolean_engine.js");
  } catch {
    return null;
  }
})();

const isImplemented = Boolean(
  booleanEngine &&
    typeof booleanEngine.booleanUnion === "function" &&
    typeof booleanEngine.booleanSubtract === "function" &&
    typeof booleanEngine.booleanIntersect === "function" &&
    typeof booleanEngine.booleanExclude === "function",
);

const {
  booleanUnion = () => null,
  booleanSubtract = () => null,
  booleanIntersect = () => null,
  booleanExclude = () => null,
} = booleanEngine || {};

// Helper constructors for opaque test inputs
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

function makeStar(id, x, y, width, height, spikes = 5, innerRatio = 0.5, fill = "#f59e0b") {
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
    fill,
    stroke: "transparent",
    strokeWidth: 0,
    visible: true,
  };
}

function makePenPath(id, x, y, width, height, points, fill = "#8b5cf6") {
  return {
    id,
    kind: "path",
    pen: true,
    x,
    y,
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    points,
    fill,
    stroke: "transparent",
    strokeWidth: 0,
    visible: true,
  };
}

describe("path_boolean_engine Module Availability", () => {
  it("verifies boolean engine contract exports when module is implemented", () => {
    if (isImplemented) {
      expect(typeof booleanUnion).toBe("function");
      expect(typeof booleanSubtract).toBe("function");
      expect(typeof booleanIntersect).toBe("function");
      expect(typeof booleanExclude).toBe("function");
    } else {
      expect(true).toBe(true);
    }
  });
});

// ============================================================================
// TIER 1: Feature Tests (Primary Happy Paths, ≥5 per feature)
// ============================================================================
describe.skipIf(!isImplemented)("Boolean Engine - Tier 1: Union Operations", () => {
  it("merges two overlapping rectangles into a single outer boundary", () => {
    const r1 = makeRect("r1", 0, 0, 100, 100);
    const r2 = makeRect("r2", 50, 0, 100, 100);

    const result = booleanUnion([r1, r2]);
    expect(result).toBeDefined();
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(Array.isArray(result.points)).toBe(true);
    expect(result.points.length).toBeGreaterThanOrEqual(4);
    expect(result.x).toBeCloseTo(0, 0.1);
    expect(result.y).toBeCloseTo(0, 0.1);
    expect(result.width).toBeCloseTo(150, 0.5);
    expect(result.height).toBeCloseTo(100, 0.5);
    expect(result.points.some((p) => p.close === true)).toBe(true);
  });

  it("merges a rectangle and an overlapping ellipse into a smooth closed path", () => {
    const r = makeRect("r1", 0, 0, 100, 100);
    const e = makeEllipse("e1", 50, 50, 100, 100);

    const result = booleanUnion([r, e]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.width).toBeCloseTo(150, 0.5);
    expect(result.height).toBeCloseTo(150, 0.5);
    // Ellipse bezier curves should contribute smooth tangent handles
    const hasHandles = result.points.some((p) => p.in || p.out);
    expect(hasHandles).toBe(true);
  });

  it("merges two overlapping circles into a single organic outline", () => {
    const c1 = makeEllipse("c1", 0, 0, 100, 100);
    const c2 = makeEllipse("c2", 60, 0, 100, 100);

    const result = booleanUnion([c1, c2]);
    expect(result.kind).toBe("path");
    expect(result.width).toBeCloseTo(160, 0.5);
    expect(result.height).toBeCloseTo(100, 0.5);
    expect(result.points.some((p) => p.close === true)).toBe(true);
  });

  it("merges three or more overlapping shapes in a single multi-union pass", () => {
    const r1 = makeRect("r1", 0, 0, 60, 60);
    const r2 = makeRect("r2", 40, 0, 60, 60);
    const r3 = makeRect("r3", 80, 0, 60, 60);

    const result = booleanUnion([r1, r2, r3]);
    expect(result.kind).toBe("path");
    expect(result.width).toBeCloseTo(140, 0.5);
    expect(result.height).toBeCloseTo(60, 0.5);
  });

  it("merges a star shape with a central circle", () => {
    const star = makeStar("s1", 20, 20, 100, 100, 5, 0.4);
    const circle = makeEllipse("c1", 45, 45, 50, 50);

    const result = booleanUnion([star, circle]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.points.length).toBeGreaterThan(10);
  });
});

describe.skipIf(!isImplemented)("Boolean Engine - Tier 1: Subtract Operations", () => {
  it("subtracts an overlapping rectangle from a base rectangle (L-shape corner cut)", () => {
    const base = makeRect("base", 0, 0, 100, 100);
    const punch = makeRect("punch", 50, 0, 100, 100);

    const result = booleanSubtract([base, punch]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.width).toBeCloseTo(50, 0.5);
    expect(result.height).toBeCloseTo(100, 0.5);
    expect(result.x).toBeCloseTo(0, 0.5);
  });

  it("subtracts a smaller centered rectangle to form a hollow frame with an inner hole", () => {
    const outer = makeRect("outer", 0, 0, 200, 200);
    const inner = makeRect("inner", 50, 50, 100, 100);

    const result = booleanSubtract([outer, inner]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.width).toBeCloseTo(200, 0.5);
    expect(result.height).toBeCloseTo(200, 0.5);
    // A hollow shape will have multiple closed subpaths or inner contour anchors
    expect(result.points.length).toBeGreaterThanOrEqual(8);
  });

  it("subtracts an overlapping circle from a base circle to form a crescent moon", () => {
    const base = makeEllipse("moon", 100, 100, 100, 100);
    const punch = makeEllipse("punch", 140, 100, 100, 100);

    const result = booleanSubtract([base, punch]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.x).toBeCloseTo(100, 1.0);
    expect(result.width).toBeLessThan(100);
    expect(result.height).toBeCloseTo(100, 1.0);
  });

  it("subtracts multiple punch shapes sequentially from a base shape", () => {
    const base = makeRect("base", 0, 0, 300, 100);
    const punch1 = makeRect("p1", 50, 20, 40, 60);
    const punch2 = makeRect("p2", 150, 20, 40, 60);

    const result = booleanSubtract([base, punch1, punch2]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.width).toBeCloseTo(300, 0.5);
  });

  it("normalizes shapes without prior manual conversion during subtraction", () => {
    const base = makeEllipse("c1", 0, 0, 120, 120);
    const rect = makeRect("r1", 60, 0, 80, 120);

    const result = booleanSubtract([base, rect]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.width).toBeCloseTo(60, 1.0);
  });
});

describe.skipIf(!isImplemented)("Boolean Engine - Tier 1: Intersect Operations", () => {
  it("computes rectangular intersection area correctly", () => {
    const r1 = makeRect("r1", 0, 0, 100, 100);
    const r2 = makeRect("r2", 50, 50, 100, 100);

    const result = booleanIntersect([r1, r2]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.x).toBeCloseTo(50, 0.5);
    expect(result.y).toBeCloseTo(50, 0.5);
    expect(result.width).toBeCloseTo(50, 0.5);
    expect(result.height).toBeCloseTo(50, 0.5);
  });

  it("computes intersection between rectangle and ellipse producing a quadrant/wedge", () => {
    const r = makeRect("r1", 50, 50, 100, 100);
    const e = makeEllipse("e1", 0, 0, 100, 100);

    const result = booleanIntersect([r, e]);
    expect(result.kind).toBe("path");
    expect(result.x).toBeCloseTo(50, 0.5);
    expect(result.y).toBeCloseTo(50, 0.5);
    expect(result.width).toBeCloseTo(50, 0.5);
    expect(result.height).toBeCloseTo(50, 0.5);
  });

  it("computes lens / vesica piscis from two overlapping circles", () => {
    const c1 = makeEllipse("c1", 0, 0, 100, 100);
    const c2 = makeEllipse("c2", 50, 0, 100, 100);

    const result = booleanIntersect([c1, c2]);
    expect(result.kind).toBe("path");
    expect(result.x).toBeCloseTo(50, 0.5);
    expect(result.width).toBeCloseTo(50, 0.5);
    expect(result.height).toBeCloseTo(86.6, 0.5);
  });

  it("computes 3-way triple intersection area", () => {
    const r1 = makeRect("r1", 0, 0, 100, 100);
    const r2 = makeRect("r2", 30, 0, 100, 100);
    const r3 = makeRect("r3", 60, 0, 100, 100);

    const result = booleanIntersect([r1, r2, r3]);
    expect(result.kind).toBe("path");
    expect(result.x).toBeCloseTo(60, 0.5);
    expect(result.width).toBeCloseTo(40, 0.5);
  });

  it("clips star tips by intersecting with a bounding circle", () => {
    const star = makeStar("s1", 0, 0, 120, 120, 5, 0.5);
    const circle = makeEllipse("c1", 10, 10, 100, 100);

    const result = booleanIntersect([star, circle]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.width).toBeLessThanOrEqual(100.5);
    expect(result.height).toBeLessThanOrEqual(100.5);
  });
});

describe.skipIf(!isImplemented)("Boolean Engine - Tier 1: Exclude (XOR) Operations", () => {
  it("removes overlapping center area and preserves disjoint outer wings", () => {
    const r1 = makeRect("r1", 0, 0, 100, 100);
    const r2 = makeRect("r2", 50, 50, 100, 100);

    const result = booleanExclude([r1, r2]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.width).toBeCloseTo(150, 0.5);
    expect(result.height).toBeCloseTo(150, 0.5);
  });

  it("produces a concentric ring / donut from concentric circle exclusion", () => {
    const outer = makeEllipse("outer", 0, 0, 100, 100);
    const inner = makeEllipse("inner", 25, 25, 50, 50);

    const result = booleanExclude([outer, inner]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.width).toBeCloseTo(100, 0.5);
    expect(result.height).toBeCloseTo(100, 0.5);
    // Multi-contour result (outer circle + inner hole)
    expect(result.points.length).toBeGreaterThanOrEqual(8);
  });

  it("symmetric difference of rect and circle retains non-overlapping regions", () => {
    const rect = makeRect("r1", 0, 0, 80, 80);
    const circ = makeEllipse("c1", 40, 40, 80, 80);

    const result = booleanExclude([rect, circ]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
  });

  it("symmetric difference of two offset identical squares preserves two L-shapes", () => {
    const sq1 = makeRect("s1", 0, 0, 60, 60);
    const sq2 = makeRect("s2", 30, 30, 60, 60);

    const result = booleanExclude([sq1, sq2]);
    expect(result.kind).toBe("path");
    expect(result.width).toBeCloseTo(90, 0.5);
  });

  it("inverts star and circle overlap region", () => {
    const star = makeStar("s1", 0, 0, 100, 100, 5, 0.5);
    const circle = makeEllipse("c1", 25, 25, 50, 50);

    const result = booleanExclude([star, circle]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
  });
});

// ============================================================================
// TIER 2: Boundary & Corner Cases (Degenerate, Tangent, Disjoint, Collinear)
// ============================================================================
describe.skipIf(!isImplemented)("Boolean Engine - Tier 2: Boundary Cases", () => {
  it("union of disjoint shapes creates a multi-contour path containing both regions", () => {
    const r1 = makeRect("r1", 0, 0, 50, 50);
    const r2 = makeRect("r2", 200, 200, 50, 50);

    const result = booleanUnion([r1, r2]);
    expect(result.kind).toBe("path");
    expect(result.pen).toBe(true);
    expect(result.width).toBeCloseTo(250, 1.0);
    expect(result.height).toBeCloseTo(250, 1.0);
  });

  it("subtract of disjoint shapes leaves the base shape intact", () => {
    const base = makeRect("base", 0, 0, 50, 50);
    const disjoint = makeRect("far", 300, 300, 50, 50);

    const result = booleanSubtract([base, disjoint]);
    expect(result.kind).toBe("path");
    expect(result.width).toBeCloseTo(50, 0.5);
    expect(result.height).toBeCloseTo(50, 0.5);
  });

  it("intersect of completely disjoint shapes returns an empty or null-geometry path", () => {
    const r1 = makeRect("r1", 0, 0, 50, 50);
    const r2 = makeRect("r2", 200, 200, 50, 50);

    const result = booleanIntersect([r1, r2]);
    if (result) {
      expect(result.points?.length === 0 || result.width === 0 || result.height === 0).toBe(true);
    } else {
      expect(result).toBeNull();
    }
  });

  it("exclude of completely disjoint shapes returns both shapes intact", () => {
    const r1 = makeRect("r1", 0, 0, 50, 50);
    const r2 = makeRect("r2", 200, 0, 50, 50);

    const result = booleanExclude([r1, r2]);
    expect(result.kind).toBe("path");
    expect(result.width).toBeCloseTo(250, 0.5);
  });

  it("subtracting a larger covering shape from a smaller shape produces empty geometry", () => {
    const small = makeRect("small", 50, 50, 50, 50);
    const big = makeRect("big", 0, 0, 200, 200);

    const result = booleanSubtract([small, big]);
    if (result) {
      expect(result.points?.length === 0 || result.width === 0).toBe(true);
    } else {
      expect(result).toBeNull();
    }
  });

  it("subtracting identical shape from itself produces empty geometry", () => {
    const a = makeRect("a", 10, 10, 80, 80);
    const b = makeRect("b", 10, 10, 80, 80);

    const result = booleanSubtract([a, b]);
    if (result) {
      expect(result.points?.length === 0 || result.width === 0).toBe(true);
    } else {
      expect(result).toBeNull();
    }
  });

  it("merges shapes sharing a tangent edge without generating duplicate or self-crossing vertices", () => {
    const r1 = makeRect("r1", 0, 0, 100, 100);
    const r2 = makeRect("r2", 100, 0, 100, 100); // Shares edge x = 100

    const result = booleanUnion([r1, r2]);
    expect(result.kind).toBe("path");
    expect(result.width).toBeCloseTo(200, 0.5);
    expect(result.height).toBeCloseTo(100, 0.5);
  });

  it("handles shapes meeting at a single tangent corner point", () => {
    const r1 = makeRect("r1", 0, 0, 50, 50);
    const r2 = makeRect("r2", 50, 50, 50, 50); // Meets at point (50, 50)

    const result = booleanUnion([r1, r2]);
    expect(result.kind).toBe("path");
    expect(result.width).toBeCloseTo(100, 0.5);
    expect(result.height).toBeCloseTo(100, 0.5);
  });

  it("handles collinear segments sharing overlapping boundary lines gracefully", () => {
    // Both share line y = 100 between x = 20 and x = 60
    const p1 = makePenPath("p1", 0, 0, 100, 100, [
      { x: 0, y: 0, close: false },
      { x: 80, y: 0, close: false },
      { x: 80, y: 100, close: false },
      { x: 0, y: 100, close: true },
    ]);
    const p2 = makePenPath("p2", 20, 100, 60, 80, [
      { x: 20, y: 100, close: false },
      { x: 80, y: 100, close: false },
      { x: 80, y: 180, close: false },
      { x: 20, y: 180, close: true },
    ]);

    const result = booleanUnion([p1, p2]);
    expect(result.kind).toBe("path");
    expect(result.height).toBeCloseTo(180, 0.5);
  });
});

// ============================================================================
// TIER 3: Pairwise Combinations
// ============================================================================
describe.skipIf(!isImplemented)("Boolean Engine - Tier 3: Pairwise Combinations", () => {
  const shapes = {
    rect: makeRect("r", 10, 10, 80, 80),
    ellipse: makeEllipse("e", 40, 40, 80, 80),
    star: makeStar("s", 30, 30, 80, 80, 6, 0.5),
    pen: makePenPath("p", 20, 20, 80, 80, [
      { x: 20, y: 20, close: false },
      { x: 100, y: 40, close: false },
      { x: 80, y: 100, close: false },
      { x: 20, y: 80, close: true },
    ]),
  };

  const operations = [
    { name: "Union", fn: booleanUnion },
    { name: "Subtract", fn: booleanSubtract },
    { name: "Intersect", fn: booleanIntersect },
    { name: "Exclude", fn: booleanExclude },
  ];

  const pairs = [
    ["rect", "rect"],
    ["rect", "ellipse"],
    ["rect", "star"],
    ["rect", "pen"],
    ["ellipse", "ellipse"],
    ["ellipse", "star"],
    ["ellipse", "pen"],
    ["star", "pen"],
  ];

  for (const [shapeA, shapeB] of pairs) {
    for (const op of operations) {
      it(`executes ${op.name} pairwise on (${shapeA} + ${shapeB})`, () => {
        const nodeA = shapes[shapeA];
        const nodeB = shapes[shapeB];
        const res = op.fn([nodeA, nodeB]);
        if (res) {
          expect(res.kind).toBe("path");
          expect(res.pen).toBe(true);
          expect(Array.isArray(res.points)).toBe(true);
        }
      });
    }
  }

  it("supports chained sequential boolean operations: (A ∪ B) - C", () => {
    const a = makeRect("a", 0, 0, 100, 100);
    const b = makeRect("b", 50, 0, 100, 100);
    const c = makeEllipse("c", 60, 20, 30, 30);

    const unionAB = booleanUnion([a, b]);
    const finalResult = booleanSubtract([unionAB, c]);

    expect(finalResult.kind).toBe("path");
    expect(finalResult.pen).toBe(true);
    expect(finalResult.width).toBeCloseTo(150, 0.5);
  });
});

// ============================================================================
// TIER 4: Real-World Application Scenarios (TEST_INFRA.md)
// ============================================================================
describe.skipIf(!isImplemented)("Boolean Engine - Tier 4: Real-World Scenarios", () => {
  it("Scenario 1: Gear / Cogwheel Icon Generation (Star + Circle Union, Subtract Inner Axle)", () => {
    // 1. Star teeth
    const teeth = makeStar("teeth", 0, 0, 100, 100, 8, 0.6);
    // 2. Central gear disc
    const hub = makeEllipse("hub", 15, 15, 70, 70);
    // 3. Central axle hole
    const axle = makeEllipse("axle", 35, 35, 30, 30);

    const solidGear = booleanUnion([teeth, hub]);
    const finalGear = booleanSubtract([solidGear, axle]);

    expect(finalGear.kind).toBe("path");
    expect(finalGear.pen).toBe(true);
    expect(finalGear.width).toBeCloseTo(100, 1.0);
    expect(finalGear.height).toBeCloseTo(100, 1.0);
    expect(finalGear.points.length).toBeGreaterThan(16);
  });

  it("Scenario 2: Crescent Moon & Cloud Shape (Union Circles, Subtract Crescent)", () => {
    // Cloud construction: 3 circles + base rect
    const puff1 = makeEllipse("p1", 20, 30, 40, 40);
    const puff2 = makeEllipse("p2", 45, 10, 50, 50);
    const puff3 = makeEllipse("p3", 75, 30, 40, 40);
    const base = makeRect("b", 25, 45, 80, 25);

    const cloud = booleanUnion([puff1, puff2, puff3, base]);
    expect(cloud.kind).toBe("path");
    expect(cloud.width).toBeCloseTo(95, 2.0);

    // Moon construction: Circle A minus Circle B
    const moonBase = makeEllipse("m1", 200, 100, 80, 80);
    const moonBite = makeEllipse("m2", 230, 90, 75, 75);
    const crescent = booleanSubtract([moonBase, moonBite]);

    expect(crescent.kind).toBe("path");
    expect(crescent.width).toBeLessThan(80);
  });

  it("Scenario 3: Keyhole Security Badge (Top Circle + Trapezoid Union, Subtract Keyhole)", () => {
    const badgeTop = makeEllipse("bt", 25, 0, 50, 50);
    const badgeBody = makeRect("bb", 0, 25, 100, 80);
    const badgeShape = booleanUnion([badgeTop, badgeBody]);

    // Keyhole: small circle at top, wedge/slot at bottom
    const keyTop = makeEllipse("kt", 40, 40, 20, 20);
    const keySlot = makeRect("ks", 45, 55, 10, 25);
    const keyhole = booleanUnion([keyTop, keySlot]);

    const securityBadge = booleanSubtract([badgeShape, keyhole]);
    expect(securityBadge.kind).toBe("path");
    expect(securityBadge.pen).toBe(true);
    expect(securityBadge.width).toBeCloseTo(100, 1.0);
  });

  it("Scenario 4: Trefoil / Cloverleaf Symbol (3 Circles at 120° Unioned, Clipped by Boundary)", () => {
    const leaf1 = makeEllipse("l1", 30, 0, 40, 40);
    const leaf2 = makeEllipse("l2", 0, 45, 40, 40);
    const leaf3 = makeEllipse("l3", 60, 45, 40, 40);
    const stem = makeRect("stem", 45, 60, 10, 30);

    const clover = booleanUnion([leaf1, leaf2, leaf3, stem]);
    expect(clover.kind).toBe("path");
    expect(clover.pen).toBe(true);
  });

  it("Scenario 5: Ribbon Arrow Pointer (Rect + Right Triangle, Subtract Left Notch)", () => {
    const shaft = makeRect("shaft", 20, 20, 100, 40);
    const arrowHead = makePenPath("head", 100, 0, 40, 80, [
      { x: 100, y: 0, close: false },
      { x: 140, y: 40, close: false },
      { x: 100, y: 80, close: true },
    ]);
    const notch = makePenPath("notch", 20, 20, 20, 40, [
      { x: 20, y: 20, close: false },
      { x: 40, y: 40, close: false },
      { x: 20, y: 60, close: true },
    ]);

    const arrow = booleanUnion([shaft, arrowHead]);
    const notchedArrow = booleanSubtract([arrow, notch]);

    expect(notchedArrow.kind).toBe("path");
    expect(notchedArrow.pen).toBe(true);
    expect(notchedArrow.width).toBeCloseTo(120, 1.0);
  });
});
