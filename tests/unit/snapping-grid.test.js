import { describe, it, expect } from "vitest";
import { snapNodeBounds } from "../../src/canvas/editor/scene_snapping.js";
import { createTestDoc } from "./snapping-doc.js";

describe("Scene Snapping - Tier 1: 2D Rectangular Grid Snapping", () => {
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

describe("Scene Snapping - Tier 1: 2D Isometric Grid Snapping", () => {
  const doc = createTestDoc();

  it("snaps candidate point to nearest 30-degree isometric lattice vertex in O(1)", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 28, y: 16, width: 30, height: 30 },
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 30 } },
    });
    expect(res).toBeDefined();
    expect(res.x).toBeCloseTo(15 * Math.sqrt(3), 9);
    expect(res.y).toBe(15);
  });

  it("reports the snapped vertex and isometric guide orientation", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 51, y: 31, width: 30, height: 30 },
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 30 } },
    });
    expect(res.guides).toContainEqual({ type: "isometric", x: 30 * Math.sqrt(3), y: 30, angle: 30 });
  });

  it("preserves isometric alignment when moving along isometric axes", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 100, y: 58, width: 40, height: 40 },
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 40 } },
    });
    expect(res.x).toBeCloseTo(60 * Math.sqrt(3), 9);
    expect(res.y).toBe(60);
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
    expect(res20.x).toBeCloseTo(10 * Math.sqrt(3), 9);
    expect(res20.y).toBe(10);
    expect([res40.x, res40.y]).toEqual([19, 11]);
  });

  it("snaps isometric resize handles to isometric grid lines", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 0, y: 0, width: 53, height: 31 },
      zoom: 1,
      handle: "se",
      options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 30 } },
    });
    expect(res.width).toBeCloseTo(30 * Math.sqrt(3), 9);
    expect(res.height).toBe(30);
  });
});

describe("Scene Snapping - Tier 1: Pixel-Perfect Coordinate Rounding", () => {
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
describe("Scene Snapping - Tier 3: Pairwise Combinations", () => {
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
