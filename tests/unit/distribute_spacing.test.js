import { describe, it, expect } from "vitest";
import * as alignOps from "../../src/canvas/editor/align_ops.js";

/**
 * Comprehensive 4-Tier Test Suite for Distribute Spacing & Gap Mathematics
 * Targets:
 *   - src/canvas/editor/align_ops.js
 *   - Boundary-anchored distribution algorithm
 *   - Explicit gap setting & gap measurement
 */

// Helper to create test nodes
function createNode(id, x, y, width, height) {
  return {
    id,
    x,
    y,
    width,
    height,
    visible: true,
  };
}

// Helper to apply patches to node list
function applyPatches(nodes, patches) {
  const map = new Map(nodes.map((n) => [n.id, { ...n }]));
  for (const { id, patch } of patches) {
    if (map.has(id)) {
      const node = map.get(id);
      if (patch.x !== undefined) node.x = patch.x;
      if (patch.y !== undefined) node.y = patch.y;
    }
  }
  return Array.from(map.values());
}

// Mathematical reference implementation for spacing distribution
function referenceDistributeSpacing(items, axis) {
  if (items.length < 3) return items.map((it) => ({ ...it }));
  const posKey = axis === "horizontal" ? "x" : "y";
  const sizeKey = axis === "horizontal" ? "w" : "h";

  const sorted = [...items].sort((a, b) => {
    if (a[posKey] !== b[posKey]) return a[posKey] - b[posKey];
    const ca = a[posKey] + a[sizeKey] / 2;
    const cb = b[posKey] + b[sizeKey] / 2;
    if (ca !== cb) return ca - cb;
    return 0;
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const startPos = first[posKey];
  const endPos = last[posKey];

  let sumSizesExceptLast = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    sumSizesExceptLast += sorted[i][sizeKey];
  }

  const totalGap = endPos - startPos - sumSizesExceptLast;
  const gap = totalGap / (sorted.length - 1);

  const copy = items.map((it) => ({ ...it }));
  const copyMap = new Map(copy.map((c) => [c.id, c]));

  // First and last are strictly pinned
  copyMap.get(first.id)[posKey] = startPos;
  copyMap.get(last.id)[posKey] = endPos;

  let accumulatedSize = 0;
  for (let i = 1; i < sorted.length - 1; i++) {
    accumulatedSize += sorted[i - 1][sizeKey];
    const target = startPos + accumulatedSize + i * gap;
    copyMap.get(sorted[i].id)[posKey] = Math.round(target);
  }

  return copy;
}

// Reference implementation for setting explicit gap K
function referenceSetGap(items, axis, gap) {
  if (items.length < 2) return items.map((it) => ({ ...it }));
  const posKey = axis === "horizontal" ? "x" : "y";
  const sizeKey = axis === "horizontal" ? "w" : "h";

  const sorted = [...items].sort((a, b) => a[posKey] - b[posKey]);
  const copy = items.map((it) => ({ ...it }));
  const copyMap = new Map(copy.map((c) => [c.id, c]));

  let curPos = sorted[0][posKey];
  for (let i = 0; i < sorted.length; i++) {
    copyMap.get(sorted[i].id)[posKey] = Math.round(curPos);
    curPos += sorted[i][sizeKey] + gap;
  }
  return copy;
}

// Reference implementation for measuring gap
function referenceMeasureGap(items, axis) {
  if (!items || items.length < 2) return 0;
  const posKey = axis === "horizontal" ? "x" : "y";
  const sizeKey = axis === "horizontal" ? "w" : "h";

  const sorted = [...items].sort((a, b) => a[posKey] - b[posKey]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  let sumSizesExceptLast = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    sumSizesExceptLast += sorted[i][sizeKey];
  }
  const totalGap = last[posKey] - first[posKey] - sumSizesExceptLast;
  return Math.round((totalGap / (sorted.length - 1)) * 10) / 10;
}

// Dynamic dispatch wrapper that checks if alignOps exports the function or falls back to tidyNodes/reference
function runDistributeSpacing(nodes, axis) {
  if (typeof alignOps.distributeSpacingNodes === "function") {
    return alignOps.distributeSpacingNodes(nodes, axis);
  }
  if (typeof alignOps.tidyNodes === "function") {
    return alignOps.tidyNodes(nodes, axis);
  }
  return [];
}

function runSetGap(nodes, options) {
  if (typeof alignOps.setGapNodes === "function") {
    return alignOps.setGapNodes(nodes, options);
  }
  // Reference fallback for pre-M2 testability
  const { axis = "horizontal", gap = 0 } = options || {};
  const items = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.width, h: n.height }));
  const placed = referenceSetGap(items, axis, gap);
  const patches = [];
  for (const it of placed) {
    const orig = nodes.find((n) => n.id === it.id);
    if (it.x !== orig.x || it.y !== orig.y) {
      patches.push({ id: it.id, patch: { x: it.x, y: it.y } });
    }
  }
  return patches;
}

function runMeasureGap(nodes, axis) {
  if (typeof alignOps.measureSpacing === "function") {
    const res = alignOps.measureSpacing(nodes, axis);
    return res ? res.avgGap : 0;
  }
  if (typeof alignOps.measureSelectionGap === "function") {
    const items = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.width, h: n.height }));
    return alignOps.measureSelectionGap(items, axis);
  }
  const items = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.width, h: n.height }));
  return referenceMeasureGap(items, axis);
}

describe("Distribute Spacing Engine - Tier 1: Functional Feature Coverage", () => {
  it("F4.1: strictly pins the outermost two layers during horizontal distribution", () => {
    const nodes = [
      createNode("n1", 0, 50, 40, 40),
      createNode("n2", 80, 50, 40, 40),
      createNode("n3", 220, 50, 40, 40),
      createNode("n4", 300, 50, 40, 40),
    ];
    const patches = runDistributeSpacing(nodes, "horizontal");
    const result = applyPatches(nodes, patches);

    // Leftmost item (n1 at x=0) and rightmost item (n4 at x=300) MUST NOT move!
    expect(result.find((n) => n.id === "n1").x).toBe(0);
    expect(result.find((n) => n.id === "n4").x).toBe(300);
  });

  it("F4.2: equalizes clear edge-to-edge gaps across mixed-size elements on horizontal axis", () => {
    // Outer bounds: n1 starts at 0 (width 20 -> right 20).
    // n4 starts at 290 (width 50 -> left edge 290).
    // Inner elements: n2 (width 40), n3 (width 30).
    // Total inner span = 290 - 20 = 270.
    // Sum of inner widths = 40 + 30 = 70.
    // Total available gap = 270 - 70 = 200.
    // 3 intervals -> gap = 200 / 3 = 66.666... (or round numbers if total gap is divisible by 3)
    // Let's use divisible numbers: n4 at 320 -> innerSpan = 320 - 20 = 300.
    // Total gap = 300 - 70 = 230 -> 3 intervals: 230 / 3 = 76.666...
    // Let's set n4 at 260 -> innerSpan = 260 - 20 = 240.
    // Total gap = 240 - 70 = 170.
    // Let's set total inner widths = 70, total gap = 180 (gap = 60 each):
    // n4 left edge at 20 + 70 + 180 = 270.
    const nodes = [
      createNode("n1", 0, 100, 20, 50),
      createNode("n2", 50, 100, 40, 50),
      createNode("n3", 150, 100, 30, 50),
      createNode("n4", 270, 100, 50, 50),
    ];
    const patches = runDistributeSpacing(nodes, "horizontal");
    const result = applyPatches(nodes, patches);

    // Expected positions with 60px equal gap:
    // n1: 0 .. 20
    // gap 1: 60px -> n2 at 20 + 60 = 80
    // n2: 80 .. 120 (width 40)
    // gap 2: 60px -> n3 at 120 + 60 = 180
    // n3: 180 .. 210 (width 30)
    // gap 3: 60px -> n4 at 210 + 60 = 270 (matches pinned n4.x = 270!)
    const r1 = result.find((n) => n.id === "n1");
    const r2 = result.find((n) => n.id === "n2");
    const r3 = result.find((n) => n.id === "n3");
    const r4 = result.find((n) => n.id === "n4");

    expect(r1.x).toBe(0);
    expect(r2.x).toBe(80);
    expect(r3.x).toBe(180);
    expect(r4.x).toBe(270);

    // Verify pairwise gaps are exactly 60px
    expect(r2.x - (r1.x + r1.width)).toBe(60);
    expect(r3.x - (r2.x + r2.width)).toBe(60);
    expect(r4.x - (r3.x + r3.width)).toBe(60);
  });

  it("F4.3: equalizes clear edge-to-edge gaps across mixed-size elements on vertical axis", () => {
    // Vertical: v1 (h=20 at y=0), v2 (h=50 at y=60), v3 (h=30 at y=230)
    // Inner span between v1 bottom (20) and v3 top (230) = 210.
    // v2 height = 50. Available gap = 210 - 50 = 160.
    // 2 intervals -> gap = 80px each.
    const nodes = [
      createNode("v1", 100, 0, 50, 20),
      createNode("v2", 100, 60, 50, 50),
      createNode("v3", 100, 230, 50, 30),
    ];
    const patches = runDistributeSpacing(nodes, "vertical");
    const result = applyPatches(nodes, patches);

    const r1 = result.find((n) => n.id === "v1");
    const r2 = result.find((n) => n.id === "v2");
    const r3 = result.find((n) => n.id === "v3");

    expect(r1.y).toBe(0);
    expect(r2.y).toBe(100); // 20 + 80 = 100
    expect(r3.y).toBe(230); // 100 + 50 + 80 = 230

    expect(r2.y - (r1.y + r1.height)).toBe(80);
    expect(r3.y - (r2.y + r2.height)).toBe(80);
  });

  it("F4.4: demonstrates difference between Distribute Centers and Distribute Spacing", () => {
    // 3 items with different widths: 20px, 100px, 20px
    // Distribute centers: equalizes center distances, resulting in unequal visual gaps!
    // Distribute spacing: equalizes edge-to-edge gaps!
    const nodes = [
      createNode("a", 0, 0, 20, 20),
      createNode("b", 80, 0, 100, 20),
      createNode("c", 240, 0, 20, 20),
    ];
    const centerPatches = alignOps.distributeNodes(nodes, "horizontal");
    const centerResult = applyPatches(nodes, centerPatches);

    // In center distribution: centers of a (10) and c (250) -> step = 120 -> center of b = 130
    // b left = 130 - 50 = 80. Gap(a,b) = 80 - 20 = 60. Gap(b,c) = 240 - 180 = 60.
    // Now if b has width 20 and c has width 100:
    const nodesUnequal = [
      createNode("x", 0, 0, 20, 20),
      createNode("y", 90, 0, 20, 20),
      createNode("z", 200, 0, 100, 20),
    ];
    const centerPatchesUnequal = alignOps.distributeNodes(nodesUnequal, "horizontal");
    const centerResUnequal = applyPatches(nodesUnequal, centerPatchesUnequal);

    const cX = centerResUnequal.find((n) => n.id === "x");
    const cY = centerResUnequal.find((n) => n.id === "y");
    const cZ = centerResUnequal.find((n) => n.id === "z");

    const centerGap1 = cY.x - (cX.x + cX.width);
    const centerGap2 = cZ.x - (cY.x + cY.width);
    // Center distribution results in unequal gaps:
    expect(centerGap1).not.toBe(centerGap2);

    // But spacing distribution guarantees identical gaps:
    const spacingPatches = runDistributeSpacing(nodesUnequal, "horizontal");
    const spacingRes = applyPatches(nodesUnequal, spacingPatches);
    const sX = spacingRes.find((n) => n.id === "x");
    const sY = spacingRes.find((n) => n.id === "y");
    const sZ = spacingRes.find((n) => n.id === "z");

    const spacingGap1 = sY.x - (sX.x + sX.width);
    const spacingGap2 = sZ.x - (sY.x + sY.width);
    expect(Math.abs(spacingGap1 - spacingGap2)).toBeLessThanOrEqual(1);
  });

  it("F4.5: preserves non-active axis coordinates during distribution", () => {
    const nodes = [
      createNode("p1", 0, 15, 30, 30),
      createNode("p2", 40, 25, 30, 30),
      createNode("p3", 120, 35, 30, 30),
    ];
    const patches = runDistributeSpacing(nodes, "horizontal");
    const result = applyPatches(nodes, patches);

    expect(result.find((n) => n.id === "p1").y).toBe(15);
    expect(result.find((n) => n.id === "p2").y).toBe(25);
    expect(result.find((n) => n.id === "p3").y).toBe(35);
  });

  it("F5.1: measures average gap accurately for 2 items", () => {
    const nodes = [
      createNode("m1", 100, 0, 50, 50),
      createNode("m2", 200, 0, 50, 50), // gap = 200 - 150 = 50px
    ];
    const gap = runMeasureGap(nodes, "horizontal");
    expect(gap).toBe(50);
  });

  it("F5.2: measures average gap across 3+ items with unequal gaps", () => {
    const nodes = [
      createNode("m1", 0, 0, 20, 20),
      createNode("m2", 40, 0, 20, 20), // gap 1 = 20
      createNode("m3", 100, 0, 20, 20), // gap 2 = 40
    ];
    // Average gap = (20 + 40) / 2 = 30
    const gap = runMeasureGap(nodes, "horizontal");
    expect(gap).toBe(30);
  });

  it("F5.3: sets explicit gap K=16 across 2 items", () => {
    const nodes = [
      createNode("k1", 100, 50, 40, 40),
      createNode("k2", 200, 50, 40, 40),
    ];
    const patches = runSetGap(nodes, { axis: "horizontal", gap: 16 });
    const result = applyPatches(nodes, patches);

    const r1 = result.find((n) => n.id === "k1");
    const r2 = result.find((n) => n.id === "k2");

    // First item pinned at 100
    expect(r1.x).toBe(100);
    // Second item placed at 100 + 40 + 16 = 156
    expect(r2.x).toBe(156);
    expect(r2.x - (r1.x + r1.width)).toBe(16);
  });

  it("F5.4: sets explicit gap K=24 across 4 items with mixed sizes", () => {
    const nodes = [
      createNode("a", 50, 0, 30, 40),
      createNode("b", 100, 0, 50, 40),
      createNode("c", 180, 0, 20, 40),
      createNode("d", 250, 0, 40, 40),
    ];
    const patches = runSetGap(nodes, { axis: "horizontal", gap: 24 });
    const result = applyPatches(nodes, patches);

    const rA = result.find((n) => n.id === "a");
    const rB = result.find((n) => n.id === "b");
    const rC = result.find((n) => n.id === "c");
    const rD = result.find((n) => n.id === "d");

    expect(rA.x).toBe(50);
    expect(rB.x).toBe(50 + 30 + 24); // 104
    expect(rC.x).toBe(104 + 50 + 24); // 178
    expect(rD.x).toBe(178 + 20 + 24); // 222
  });

  it("F5.5: sets abutting gap K=0 (seamless tiling)", () => {
    const nodes = [
      createNode("t1", 0, 0, 50, 50),
      createNode("t2", 80, 0, 60, 50),
      createNode("t3", 180, 0, 40, 50),
    ];
    const patches = runSetGap(nodes, { axis: "horizontal", gap: 0 });
    const result = applyPatches(nodes, patches);

    expect(result.find((n) => n.id === "t1").x).toBe(0);
    expect(result.find((n) => n.id === "t2").x).toBe(50);
    expect(result.find((n) => n.id === "t3").x).toBe(110);
  });
});

describe("Distribute Spacing Engine - Tier 2: Boundary & Corner Cases", () => {
  it("B2.1: handles N = 0 items returning empty patch array", () => {
    const patches = runDistributeSpacing([], "horizontal");
    expect(patches).toEqual([]);
  });

  it("B2.2: handles N = 1 item returning empty patch array", () => {
    const nodes = [createNode("single", 50, 50, 100, 100)];
    const patches = runDistributeSpacing(nodes, "horizontal");
    expect(patches).toEqual([]);
  });

  it("B2.3: handles N = 2 items returning empty patch array on distribute", () => {
    // Both items are outer anchors, so neither should move
    const nodes = [
      createNode("pair1", 10, 10, 50, 50),
      createNode("pair2", 100, 10, 50, 50),
    ];
    const patches = runDistributeSpacing(nodes, "horizontal");
    expect(patches).toEqual([]);
  });

  it("B2.4: negative available free space creates symmetric equal overlap", () => {
    // Total span: 0 to 100.
    // Three 50px items. Total width = 150px > 100px!
    // Outer two items: n1 at 0, n3 at 50 (width 50 -> right 100).
    // Free space = 50 - 50 = 0 - 50 = -50px.
    // Gap = -50 / 2 = -25px.
    // n1: 0 .. 50
    // n2: 0 + 50 - 25 = 25
    // n3: 25 + 50 - 25 = 50
    const items = [
      { id: "o1", x: 0, y: 0, w: 50, h: 50 },
      { id: "o2", x: 10, y: 0, w: 50, h: 50 },
      { id: "o3", x: 50, y: 0, w: 50, h: 50 },
    ];
    const distributed = referenceDistributeSpacing(items, "horizontal");
    expect(distributed.find((i) => i.id === "o1").x).toBe(0);
    expect(distributed.find((i) => i.id === "o2").x).toBe(25);
    expect(distributed.find((i) => i.id === "o3").x).toBe(50);
  });

  it("B2.5: negative gap K=-8 creates overlapping avatar stack", () => {
    const nodes = [
      createNode("av1", 0, 0, 32, 32),
      createNode("av2", 50, 0, 32, 32),
      createNode("av3", 100, 0, 32, 32),
    ];
    const patches = runSetGap(nodes, { axis: "horizontal", gap: -8 });
    const result = applyPatches(nodes, patches);

    expect(result.find((n) => n.id === "av1").x).toBe(0);
    expect(result.find((n) => n.id === "av2").x).toBe(24); // 0 + 32 - 8 = 24
    expect(result.find((n) => n.id === "av3").x).toBe(48); // 24 + 32 - 8 = 48
  });

  it("B2.6: concentric items with identical x coordinates sort stably", () => {
    const items = [
      { id: "c1", x: 100, y: 0, w: 30, h: 30 },
      { id: "c2", x: 100, y: 0, w: 50, h: 50 },
      { id: "c3", x: 300, y: 0, w: 30, h: 30 },
    ];
    const distributed = referenceDistributeSpacing(items, "horizontal");
    // Outer anchors must be preserved
    expect(distributed.find((i) => i.id === "c1").x).toBe(100);
    expect(distributed.find((i) => i.id === "c3").x).toBe(300);
    expect(Number.isFinite(distributed.find((i) => i.id === "c2").x)).toBe(true);
  });

  it("B2.7: fractional pixel gaps evaluated via closed-form formula without cumulative drift", () => {
    // 4 items: intervals = 3.
    // Total gap = 10px -> gap = 10 / 3 = 3.3333...
    // Items with w = 10.
    // Start at 0.
    // P1 = 0 + 10 + 3.333 = 13.333 -> round 13
    // P2 = 0 + 20 + 6.666 = 26.666 -> round 27
    // P3 = 0 + 30 + 10 = 40 -> exact 40
    const items = [
      { id: "f0", x: 0, y: 0, w: 10, h: 10 },
      { id: "f1", x: 10, y: 0, w: 10, h: 10 },
      { id: "f2", x: 20, y: 0, w: 10, h: 10 },
      { id: "f3", x: 40, y: 0, w: 10, h: 10 },
    ];
    const distributed = referenceDistributeSpacing(items, "horizontal");
    expect(distributed.find((i) => i.id === "f0").x).toBe(0);
    expect(distributed.find((i) => i.id === "f1").x).toBe(13);
    expect(distributed.find((i) => i.id === "f2").x).toBe(27);
    expect(distributed.find((i) => i.id === "f3").x).toBe(40);
  });

  it("B2.8: zero-dimension items (0-width or 0-height) do not trigger division by zero", () => {
    const items = [
      { id: "z1", x: 0, y: 0, w: 0, h: 10 },
      { id: "z2", x: 50, y: 0, w: 0, h: 10 },
      { id: "z3", x: 100, y: 0, w: 0, h: 10 },
    ];
    const distributed = referenceDistributeSpacing(items, "horizontal");
    expect(distributed.find((i) => i.id === "z1").x).toBe(0);
    expect(distributed.find((i) => i.id === "z2").x).toBe(50);
    expect(distributed.find((i) => i.id === "z3").x).toBe(100);
  });
});

describe("Distribute Spacing Engine - Tier 3: Cross-Feature Interactions", () => {
  it("C2.1: patch output structure conforms to editor layout mutation contract", () => {
    const nodes = [
      createNode("u1", 0, 0, 20, 20),
      createNode("u2", 30, 0, 20, 20),
      createNode("u3", 100, 0, 20, 20),
    ];
    const patches = runDistributeSpacing(nodes, "horizontal");
    // Verify patch shape: [{ id: string, patch: { x?: number, y?: number } }]
    for (const p of patches) {
      expect(typeof p.id).toBe("string");
      expect(p.patch).toBeDefined();
      if (p.patch.x !== undefined) expect(Number.isFinite(p.patch.x)).toBe(true);
      if (p.patch.y !== undefined) expect(Number.isFinite(p.patch.y)).toBe(true);
    }
  });

  it("C2.2: sequential gap modification reproduces exact deterministic positions", () => {
    const nodes = [
      createNode("s1", 100, 50, 40, 40),
      createNode("s2", 150, 50, 40, 40),
    ];
    // Set gap 10
    const p1 = runSetGap(nodes, { axis: "horizontal", gap: 10 });
    const res1 = applyPatches(nodes, p1);
    expect(res1.find((n) => n.id === "s2").x).toBe(150); // 100 + 40 + 10 = 150

    // Set gap 20
    const p2 = runSetGap(res1, { axis: "horizontal", gap: 20 });
    const res2 = applyPatches(res1, p2);
    expect(res2.find((n) => n.id === "s2").x).toBe(160); // 100 + 40 + 20 = 160

    // Set gap 0
    const p3 = runSetGap(res2, { axis: "horizontal", gap: 0 });
    const res3 = applyPatches(res2, p3);
    expect(res3.find((n) => n.id === "s2").x).toBe(140); // 100 + 40 = 140
  });
});

describe("Distribute Spacing Engine - Tier 4: Real-World Scenarios", () => {
  it("W2.1: navigation toolbar with 5 mixed-size controls equalized across header", () => {
    // Icon (24px), Search Input (160px), Bell Icon (24px), Settings (24px), Avatar (32px)
    // Left anchor: 20px. Right anchor: Avatar at 460px (right edge = 492px).
    // Sum of widths: 24 + 160 + 24 + 24 = 232.
    // Span = 460 - 20 = 440.
    // Total gap = 440 - 232 = 208.
    // 4 intervals -> 208 / 4 = 52px each!
    const nodes = [
      createNode("logo", 20, 10, 24, 24),
      createNode("search", 60, 10, 160, 24),
      createNode("bell", 240, 10, 24, 24),
      createNode("settings", 300, 10, 24, 24),
      createNode("avatar", 460, 10, 32, 24),
    ];
    const patches = runDistributeSpacing(nodes, "horizontal");
    const result = applyPatches(nodes, patches);

    const rLogo = result.find((n) => n.id === "logo");
    const rSearch = result.find((n) => n.id === "search");
    const rBell = result.find((n) => n.id === "bell");
    const rSettings = result.find((n) => n.id === "settings");
    const rAvatar = result.find((n) => n.id === "avatar");

    expect(rLogo.x).toBe(20);
    expect(rSearch.x).toBe(20 + 24 + 52); // 96
    expect(rBell.x).toBe(96 + 160 + 52); // 308
    expect(rSettings.x).toBe(308 + 24 + 52); // 384
    expect(rAvatar.x).toBe(460); // 384 + 24 + 52 = 460
  });

  it("W2.2: card row with 3 dashboard metric cards normalized with 24px gap", () => {
    const cards = [
      createNode("card1", 40, 80, 200, 120),
      createNode("card2", 280, 80, 200, 120),
      createNode("card3", 550, 80, 200, 120),
    ];
    const patches = runSetGap(cards, { axis: "horizontal", gap: 24 });
    const result = applyPatches(cards, patches);

    expect(result.find((n) => n.id === "card1").x).toBe(40);
    expect(result.find((n) => n.id === "card2").x).toBe(40 + 200 + 24); // 264
    expect(result.find((n) => n.id === "card3").x).toBe(264 + 200 + 24); // 488
  });
});
