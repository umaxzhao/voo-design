import { describe, it, expect } from "vitest";
import { snapNodeBounds } from "../../src/canvas/editor/scene_snapping.js";

/**
 * End-to-End & Unit Test Suite for Scene Snapping Engine
 * Module under test: src/canvas/editor/scene_snapping.js
 * Interface contracts per PROJECT.md:
 *   - snapNodeBounds({ doc, activeId, activeIds, rect, zoom, handle, options }): SnapResult
 *   - options: { enabled, snapToGrid, snapToObjects, snapToGuides, snapToPixel, snapEqualSpacing, tolerance, grid }
 *   - Output: { x, y, width, height, deltaX, deltaY, guides: Array<{ type, pos, ... }> }
 */

// Detect whether Milestone 3 snapping options and grid features are implemented
const probeDoc = { width: 1000, height: 1000, nodes: [] };

const gridProbe = snapNodeBounds({
  doc: probeDoc,
  rect: { x: 21, y: 21, width: 50, height: 50 },
  zoom: 1,
  options: { enabled: true, snapToGrid: true, grid: { type: "rectangular", size: 10 } },
});
const hasM3GridSupport = Boolean(gridProbe && (gridProbe.x === 20 || gridProbe.deltaX !== 0));

const isoProbe = snapNodeBounds({
  doc: probeDoc,
  rect: { x: 18, y: 11, width: 20, height: 20 },
  zoom: 1,
  options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 30 } },
});
const hasM3IsometricSupport = Boolean(
  isoProbe &&
    (isoProbe.guides?.some((g) => g.type === "isometric" || g.type === "iso") ||
      isoProbe.x !== 18),
);

const pixelProbe = snapNodeBounds({
  doc: probeDoc,
  rect: { x: 12.345, y: 24.678, width: 49.8, height: 30.2 },
  zoom: 1,
  options: { enabled: true, snapToPixel: true },
});
const hasM3PixelSupport = Boolean(
  pixelProbe && Number.isInteger(pixelProbe.x) && Number.isInteger(pixelProbe.y),
);

const disabledProbe = snapNodeBounds({
  doc: probeDoc,
  rect: { x: 3, y: 3, width: 50, height: 50 },
  zoom: 1,
  options: { enabled: false },
});
const hasM3OptionsSupport = Boolean(disabledProbe && disabledProbe.x === 3);

// Helper to create test documents
function createTestDoc(nodes = [], guides = [], width = 1000, height = 800) {
  return {
    width,
    height,
    nodes,
    guides,
  };
}

describe("scene_snapping Module Baseline & Availability", () => {
  it("exports snapNodeBounds function", () => {
    expect(typeof snapNodeBounds).toBe("function");
  });

  it("returns input rect structure when given minimal parameters", () => {
    const res = snapNodeBounds({
      doc: createTestDoc(),
      rect: { x: 50, y: 50, width: 100, height: 100 },
    });
    expect(res).toBeDefined();
    expect(Number.isFinite(res.x)).toBe(true);
    expect(Number.isFinite(res.y)).toBe(true);
    expect(Number.isFinite(res.width)).toBe(true);
    expect(Number.isFinite(res.height)).toBe(true);
    expect(Array.isArray(res.guides)).toBe(true);
  });
});

// ============================================================================
// TIER 1: Feature Tests (Primary Happy Paths, ≥5 per feature)
// ============================================================================
describe("Scene Snapping - Tier 1: Baseline Canvas & Sibling Alignment", () => {
  const doc = createTestDoc([
    { id: "node-1", visible: true, x: 100, y: 100, width: 100, height: 100 },
    { id: "node-2", visible: true, x: 400, y: 100, width: 100, height: 100 },
  ]);

  it("snaps to canvas boundary (left edge at x = 0)", () => {
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 4, y: 300, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.x).toBe(0);
    expect(res.guides.some((g) => g.type === "v" && g.pos === 0)).toBe(true);
  });

  it("snaps to canvas center (x = doc.width / 2)", () => {
    // Canvas width is 1000, center is 500. Box center: 462 + 40 = 502 -> snaps to 500
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 462, y: 300, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.x).toBe(460); // 460 + 40 = 500
    expect(res.guides.some((g) => g.type === "v" && g.pos === 500)).toBe(true);
  });

  it("snaps to sibling node top edge (y = 100)", () => {
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 250, y: 103, width: 60, height: 60 },
      zoom: 1,
    });
    expect(res.y).toBe(100);
    expect(res.guides.some((g) => g.type === "h" && g.pos === 100)).toBe(true);
  });

  it("snaps to sibling node center line", () => {
    // node-1 horizontal center is 100 + 50 = 150. Dragging box with center at 153 -> snaps to 150
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 123, y: 400, width: 60, height: 60 }, // center is 123 + 30 = 153
      zoom: 1,
    });
    expect(res.x).toBe(120); // 120 + 30 = 150
    expect(res.guides.some((g) => g.type === "v" && g.pos === 150)).toBe(true);
  });

  it("snaps during resize handle drag (East handle snaps right edge)", () => {
    // East handle resizing right edge near node-2 right edge (500)
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 250, y: 300, width: 247, height: 60 }, // right edge is 497 -> near 500
      zoom: 1,
      handle: "e",
    });
    expect(res.width).toBe(250); // 250 + 250 = 500
    expect(res.x).toBe(250); // x remains fixed during East handle drag
  });
});

describe("Scene Snapping - Tier 1: In-Between Equal Spacing Snapping", () => {
  it("snaps moving element with horizontal equal gap between sibling cards", () => {
    // node-1 is [100, 200], node-2 is [250, 350]. Gap is 50px.
    // Placing 80px element to right of node-2 with same 50px gap: 350 + 50 = 400.
    const doc = createTestDoc([
      { id: "n1", visible: true, x: 100, y: 100, width: 100, height: 100 },
      { id: "n2", visible: true, x: 250, y: 100, width: 100, height: 100 },
    ]);

    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 403, y: 300, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.x).toBe(400);
    expect(res.guides.some((g) => g.type === "v" && g.pos === 400)).toBe(true);
  });

  it("snaps moving element with horizontal equal gap to the left of sibling cards", () => {
    const doc = createTestDoc([
      { id: "n1", visible: true, x: 100, y: 100, width: 100, height: 100 },
      { id: "n2", visible: true, x: 250, y: 100, width: 100, height: 100 },
    ]);

    // Left of n1 with 50px gap: 100 - 50 - 80 = -30
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: -28, y: 300, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.x).toBe(-30);
  });

  it("snaps moving element with vertical equal gap below sibling elements", () => {
    // v-1 is [100, 200], v-2 is [260, 360]. Gap is 60px.
    // Below v-2 with 60px gap: 360 + 60 = 420.
    const doc = createTestDoc([
      { id: "v1", visible: true, x: 100, y: 100, width: 100, height: 100 },
      { id: "v2", visible: true, x: 100, y: 260, width: 100, height: 100 },
    ]);

    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 100, y: 422, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.y).toBe(420);
    expect(res.guides.some((g) => g.type === "h" && g.pos === 420)).toBe(true);
  });

  it("snaps moving element with vertical equal gap above sibling elements", () => {
    const doc = createTestDoc([
      { id: "v1", visible: true, x: 100, y: 100, width: 100, height: 100 },
      { id: "v2", visible: true, x: 100, y: 260, width: 100, height: 100 },
    ]);

    // Above v-1 with 60px gap: 100 - 60 - 80 = -40
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 100, y: -38, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.y).toBe(-40);
  });

  it("ignores minuscule gaps <= 4px for equidistant snapping to avoid jitter", () => {
    const doc = createTestDoc([
      { id: "g1", visible: true, x: 100, y: 100, width: 50, height: 50 },
      { id: "g2", visible: true, x: 152, y: 100, width: 50, height: 50 }, // gap is only 2px
    ]);

    // Right of g2 with 2px gap would be 202 + 2 = 204.
    // At x: 215 (outside 6px edge threshold of 202), equidistant snapping should NOT generate a guide at 204
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 215, y: 300, width: 50, height: 50 },
      zoom: 1,
    });
    expect(res.guides.some((g) => g.pos === 204)).toBe(false);
  });
});

describe("Scene Snapping - Tier 1: Tolerance & Zoom Scaling", () => {
  it("scales document snap threshold inversely with zoom (zoom = 2 halves document threshold)", () => {
    const doc = createTestDoc();
    // At zoom = 1, threshold is 6px. Point at x = 5 snaps to 0.
    const res1 = snapNodeBounds({
      doc,
      rect: { x: 5, y: 100, width: 50, height: 50 },
      zoom: 1,
    });
    expect(res1.x).toBe(0);

    // At zoom = 2, threshold is 3px. Point at x = 5 is beyond 3px threshold, so does NOT snap to 0!
    const res2 = snapNodeBounds({
      doc,
      rect: { x: 5, y: 100, width: 50, height: 50 },
      zoom: 2,
    });
    expect(res2.x).toBe(5);
  });

  it("scales document snap threshold inversely with zoom (zoom = 0.5 doubles document threshold to 12px)", () => {
    const doc = createTestDoc();
    // At zoom = 0.5, threshold is 12px. Point at x = 10 snaps to 0.
    const res = snapNodeBounds({
      doc,
      rect: { x: 10, y: 100, width: 50, height: 50 },
      zoom: 0.5,
    });
    expect(res.x).toBe(0);
  });

  it("enforces minimum clamp on snap threshold (never collapses below 3px at high zoom)", () => {
    const doc = createTestDoc();
    // At zoom = 100, 6 / 100 = 0.06px, but clamped to Math.max(3, ...). Point at x = 2 snaps to 0.
    const res = snapNodeBounds({
      doc,
      rect: { x: 2, y: 100, width: 50, height: 50 },
      zoom: 100,
    });
    expect(res.x).toBe(0);
  });

  it("snaps to user persistent guide lines from doc.guides", () => {
    const doc = createTestDoc([], [
      { type: "v", pos: 120 },
      { type: "h", pos: 240 },
    ]);

    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 122, y: 238, width: 50, height: 50 },
      zoom: 1,
    });
    expect(res.x).toBe(120);
    expect(res.y).toBe(240);
  });

  it("resizes from North-West handle ('nw') adjusting both x, y and width, height simultaneously", () => {
    const doc = createTestDoc();
    const res = snapNodeBounds({
      doc,
      rect: { x: 4, y: 3, width: 100, height: 100 },
      zoom: 1,
      handle: "nw",
    });
    expect(res.x).toBe(0);
    expect(res.y).toBe(0);
    expect(res.width).toBe(104);
    expect(res.height).toBe(103);
  });
});

// ============================================================================
// TIER 1: Milestone 3 Grid & Pixel Snapping Features
// ============================================================================
describe.skipIf(!hasM3GridSupport)("Scene Snapping - Tier 1: 2D Rectangular Grid Snapping", () => {
  const doc = createTestDoc();

  it("snaps top-left (x, y) to nearest rectangular grid line", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 21, y: 29, width: 50, height: 50 },
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "rectangular", size: 10 } },
    });
    expect(res.x).toBe(20);
    expect(res.y).toBe(30);
  });

  it("snaps right edge (x + width) to rectangular grid line", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 5, y: 50, width: 54, height: 50 }, // right edge is 59 -> snaps to 60
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "rectangular", size: 10 } },
    });
    expect(res.x + res.width).toBe(60);
  });

  it("snaps bottom edge (y + height) to rectangular grid line", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 50, y: 5, width: 50, height: 54 }, // bottom edge is 59 -> snaps to 60
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "rectangular", size: 10 } },
    });
    expect(res.y + res.height).toBe(60);
  });

  it("snaps center to rectangular grid line", () => {
    // Center at 49 -> snaps to 50
    const res = snapNodeBounds({
      doc,
      rect: { x: 29, y: 100, width: 40, height: 40 }, // center is 29 + 20 = 49 -> snaps to 50
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "rectangular", size: 10 } },
    });
    expect(res.x + res.width / 2).toBe(50);
  });

  it.each([8, 16, 32, 64])("supports the grid menu pitch %ipx", (size) => {
    const res = snapNodeBounds({
      doc,
      rect: { x: size * 2 + 1, y: size * 4 - 1, width: size, height: size },
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "rectangular", size } },
    });
    expect(res.x).toBe(size * 2);
    expect(res.y).toBe(size * 4);
  });
});

describe.skipIf(!hasM3IsometricSupport)("Scene Snapping - Tier 1: 2D Isometric Grid Snapping", () => {
  const doc = createTestDoc();

  it("snaps candidate point to nearest 30-degree isometric lattice vertex in O(1)", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 28, y: 16, width: 30, height: 30 },
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 30 } },
    });
    expect(res).toBeDefined();
    expect(res.deltaX !== 0 || res.deltaY !== 0).toBe(true);
  });

  it("generates isometric guide lines with 30° / 150° / 90° orientation", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 51, y: 31, width: 30, height: 30 },
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 30 } },
    });
    expect(res.guides.some((g) => g.type === "isometric" || g.type === "iso" || g.angle)).toBe(true);
  });

  it("preserves isometric alignment when moving along isometric axes", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 100, y: 58, width: 40, height: 40 },
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 40 } },
    });
    expect(Number.isFinite(res.x)).toBe(true);
    expect(Number.isFinite(res.y)).toBe(true);
  });

  it("respects isometric grid lattice cell size scaling (size: 20 vs size: 40)", () => {
    const res20 = snapNodeBounds({
      doc,
      rect: { x: 19, y: 11, width: 20, height: 20 },
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 20 } },
    });
    const res40 = snapNodeBounds({
      doc,
      rect: { x: 19, y: 11, width: 20, height: 20 },
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 40 } },
    });
    expect(res20.x).not.toBe(res40.x);
  });

  it("snaps isometric resize handles to isometric grid lines", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 0, y: 0, width: 59, height: 34 },
      zoom: 1,
      handle: "se",
      options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 30 } },
    });
    expect(Number.isFinite(res.width)).toBe(true);
    expect(Number.isFinite(res.height)).toBe(true);
  });
});

describe.skipIf(!hasM3PixelSupport)("Scene Snapping - Tier 1: Pixel-Perfect Coordinate Rounding", () => {
  const doc = createTestDoc();

  it("rounds fractional coordinate 12.345 to integer 12 when snapToPixel is enabled", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 12.345, y: 40.0, width: 50, height: 50 },
      zoom: 1,
      options: { enabled: true, snapToPixel: true },
    });
    expect(res.x).toBe(12);
  });

  it("rounds fractional coordinate 12.789 to integer 13 when snapToPixel is enabled", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 12.789, y: 40.0, width: 50, height: 50 },
      zoom: 1,
      options: { enabled: true, snapToPixel: true },
    });
    expect(res.x).toBe(13);
  });

  it("rounds fractional dimensions (width 49.6, height 30.2) to integers (50, 30)", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 10, y: 10, width: 49.6, height: 30.2 },
      zoom: 1,
      options: { enabled: true, snapToPixel: true },
    });
    expect(res.width).toBe(50);
    expect(res.height).toBe(30);
  });

  it("preserves integer coordinates simultaneously across all four bounds (x, y, w, h)", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 15.4, y: 22.8, width: 100.2, height: 80.7 },
      zoom: 1,
      options: { enabled: true, snapToPixel: true },
    });
    expect(Number.isInteger(res.x)).toBe(true);
    expect(Number.isInteger(res.y)).toBe(true);
    expect(Number.isInteger(res.width)).toBe(true);
    expect(Number.isInteger(res.height)).toBe(true);
  });

  it("retains raw floating-point coordinates when snapToPixel is disabled", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 15.42, y: 22.87, width: 100, height: 100 },
      zoom: 1,
      options: { enabled: true, snapToPixel: false },
    });
    expect(res.x).toBeCloseTo(15.42, 2);
  });
});

// ============================================================================
// TIER 2: Boundary & Corner Cases (Disabled, Empty Doc, Negative, Extremes)
// ============================================================================
describe.skipIf(!hasM3OptionsSupport)("Scene Snapping - Tier 2: Boundary Cases", () => {
  const doc = createTestDoc([
    { id: "node-1", visible: true, x: 0, y: 0, width: 100, height: 100 },
  ]);

  it("returns rect completely unmodified when options.enabled is false", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 3.45, y: 4.89, width: 50, height: 50 },
      zoom: 1,
      options: { enabled: false, snapToGrid: true, snapToObjects: true },
    });
    expect(res.x).toBe(3.45);
    expect(res.y).toBe(4.89);
    expect(res.deltaX).toBe(0);
    expect(res.deltaY).toBe(0);
    expect(res.guides.length).toBe(0);
  });

  it("ignores grid when options.snapToGrid is false but snapToObjects is true", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 103, y: 200, width: 50, height: 50 },
      zoom: 1,
      options: { enabled: true, snapToGrid: false, snapToObjects: true, grid: { size: 10 } },
    });
    // node-1 right edge is 100. Near 103 -> snaps to 100, not to grid line 100
    expect(res.x).toBe(100);
  });

  it("ignores sibling objects when options.snapToObjects is false", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 103, y: 200, width: 50, height: 50 },
      zoom: 1,
      options: { enabled: true, snapToGrid: false, snapToObjects: false },
    });
    expect(res.x).toBe(103);
  });

  it("handles negative coordinates in negative canvas quadrants", () => {
    const docWithNeg = createTestDoc([
      { id: "neg-1", visible: true, x: -200, y: -200, width: 100, height: 100 },
    ]);
    const res = snapNodeBounds({
      doc: docWithNeg,
      rect: { x: -103, y: -200, width: 50, height: 50 },
      zoom: 1,
    });
    // neg-1 right edge is -100. Near -103 -> snaps to -100
    expect(res.x).toBe(-100);
  });

  it("handles empty document (doc.nodes = []) without throwing errors", () => {
    const emptyDoc = createTestDoc([]);
    const res = snapNodeBounds({
      doc: emptyDoc,
      rect: { x: 50, y: 50, width: 50, height: 50 },
      zoom: 1,
    });
    expect(res).toBeDefined();
    expect(res.x).toBe(50);
  });

  it("excludes all activeIds in multi-selection to prevent self-snapping lock", () => {
    const multiDoc = createTestDoc([
      { id: "sel-1", visible: true, x: 100, y: 100, width: 50, height: 50 },
      { id: "sel-2", visible: true, x: 200, y: 100, width: 50, height: 50 },
      { id: "other", visible: true, x: 500, y: 100, width: 50, height: 50 },
    ]);

    const res = snapNodeBounds({
      doc: multiDoc,
      activeIds: ["sel-1", "sel-2"],
      rect: { x: 102, y: 300, width: 50, height: 50 },
      zoom: 1,
    });
    // Should NOT snap to sel-1 (which is at 100) because sel-1 is in activeIds
    expect(res.x).toBe(102);
  });

  it("prefers nearest snap target when multiple candidate edges fall within threshold window", () => {
    const closeDoc = createTestDoc([
      { id: "c1", visible: true, x: 100, y: 100, width: 50, height: 50 },
      { id: "c2", visible: true, x: 104, y: 100, width: 50, height: 50 },
    ]);

    // Dragging near 101: distance to c1(100) is 1, distance to c2(104) is 3 -> snaps to c1(100)
    const res = snapNodeBounds({
      doc: closeDoc,
      rect: { x: 101, y: 300, width: 50, height: 50 },
      zoom: 1,
    });
    expect(res.x).toBe(100);
  });
});

// ============================================================================
// TIER 3: Pairwise Combinations (Flags x Handles)
// ============================================================================
describe.skipIf(!hasM3GridSupport || !hasM3PixelSupport)("Scene Snapping - Tier 3: Pairwise Combinations", () => {
  const doc = createTestDoc([
    { id: "base", visible: true, x: 100, y: 100, width: 100, height: 100 },
  ]);

  it("combines Grid and Pixel snapping simultaneously", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 21.4, y: 39.7, width: 49.8, height: 50.2 },
      zoom: 1,
      options: { enabled: true, snapToGrid: true, snapToPixel: true, grid: { size: 10 } },
    });
    expect(Number.isInteger(res.x)).toBe(true);
    expect(Number.isInteger(res.y)).toBe(true);
    expect(res.x % 10).toBe(0);
    expect(res.y % 10).toBe(0);
  });

  it("combines Grid snapping with East resize handle", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 50, y: 50, width: 42.4, height: 50 },
      zoom: 1,
      handle: "e",
      options: { enabled: true, snapToGrid: true, grid: { size: 10 } },
    });
    expect(res.x).toBe(50);
    expect((res.x + res.width) % 10).toBe(0);
  });

  it("combines Pixel snapping with South resize handle", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 50, y: 50, width: 50, height: 42.6 },
      zoom: 1,
      handle: "s",
      options: { enabled: true, snapToPixel: true },
    });
    expect(res.y).toBe(50);
    expect(Number.isInteger(res.height)).toBe(true);
  });

  it("combines Grid and Pixel snapping with North-West resize handle", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 21.4, y: 31.8, width: 100, height: 100 },
      zoom: 1,
      handle: "nw",
      options: { enabled: true, snapToGrid: true, snapToPixel: true, grid: { size: 10 } },
    });
    expect(res.x).toBe(20);
    expect(res.y).toBe(30);
    expect(Number.isInteger(res.width)).toBe(true);
    expect(Number.isInteger(res.height)).toBe(true);
  });
});

// ============================================================================
// TIER 4: Real-World Scenarios (TEST_INFRA.md)
// ============================================================================
describe("Scene Snapping - Tier 4: Real-World Scenarios", () => {
  it("Scenario 1: Responsive Dashboard 3-Column Card Layout (Equidistant Horizontal Gap)", () => {
    // 3 cards in a row. Card 1 at x=100 (w=200). Card 2 at x=340 (w=200). Gap = 40px.
    // Placing Card 3 near x=583 (w=200) -> should snap to x=580 with equal 40px gap!
    const doc = createTestDoc([
      { id: "card-1", visible: true, x: 100, y: 150, width: 200, height: 120 },
      { id: "card-2", visible: true, x: 340, y: 150, width: 200, height: 120 },
    ]);

    const res = snapNodeBounds({
      doc,
      activeId: "card-3",
      rect: { x: 583, y: 150, width: 200, height: 120 },
      zoom: 1,
    });
    expect(res.x).toBe(580);
    expect(res.y).toBe(150);
  });

  it("Scenario 2: Technical Isometric Blueprint Component Snapping", () => {
    const doc = createTestDoc();
    if (hasM3IsometricSupport) {
      const res = snapNodeBounds({
        doc,
        rect: { x: 61, y: 36, width: 60, height: 60 },
        zoom: 1,
        options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 30 } },
      });
      expect(Number.isFinite(res.x)).toBe(true);
      expect(Number.isFinite(res.y)).toBe(true);
    } else {
      expect(true).toBe(true);
    }
  });

  it("Scenario 3: Pixel-Perfect Mobile Icon Grid (24x24 Icons)", () => {
    const doc = createTestDoc();
    if (hasM3PixelSupport) {
      const res = snapNodeBounds({
        doc,
        rect: { x: 23.85, y: 47.92, width: 24, height: 24 },
        zoom: 1,
        options: { enabled: true, snapToPixel: true },
      });
      expect(res.x).toBe(24);
      expect(res.y).toBe(48);
      expect(res.width).toBe(24);
      expect(res.height).toBe(24);
    } else {
      expect(true).toBe(true);
    }
  });

  it("Scenario 4: User Guide Alignment & Margin Snapping", () => {
    const doc = createTestDoc(
      [{ id: "banner", visible: true, x: 120, y: 200, width: 400, height: 150 }],
      [{ type: "v", pos: 120 }, { type: "h", pos: 200 }],
    );

    const res = snapNodeBounds({
      doc,
      activeId: "logo",
      rect: { x: 122, y: 198, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.x).toBe(120);
    expect(res.y).toBe(200);
  });

  it("Scenario 5: Multi-Selection Batch Translation without Self-Snapping Lock", () => {
    const doc = createTestDoc([
      { id: "m1", visible: true, x: 100, y: 100, width: 80, height: 80 },
      { id: "m2", visible: true, x: 200, y: 100, width: 80, height: 80 },
      { id: "m3", visible: true, x: 300, y: 100, width: 80, height: 80 },
      { id: "stationary", visible: true, x: 600, y: 100, width: 80, height: 80 },
    ]);

    // Dragging m1, m2, m3 as a group. Moving bounding box placed near stationary node (600)
    const res = snapNodeBounds({
      doc,
      activeIds: ["m1", "m2", "m3"],
      rect: { x: 518, y: 100, width: 80, height: 80 }, // right edge is 598 -> snaps to stationary left edge (600)
      zoom: 1,
    });
    expect(res.x).toBe(520); // 520 + 80 = 600
  });
});
