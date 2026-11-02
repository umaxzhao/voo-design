import { describe, it, expect } from "vitest";
import {
  offsetClosedPenAnchors,
  OFFSET_FAILURE,
} from "../../src/canvas/editor/path_offset.js";

/** Closed axis-aligned square anchors, optionally wound the other way. */
function square(size = 100, reversed = false) {
  const corners = [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
  const ordered = reversed ? [...corners].reverse() : corners;
  return ordered.map((p, i) => ({
    x: p.x,
    y: p.y,
    in: null,
    out: null,
    close: i === ordered.length - 1,
  }));
}

/** Four-arc circle of radius r centred on the origin, handles at the kappa ratio. */
function circle(r) {
  const k = 0.5523 * r;
  return [
    { x: r, y: 0, in: [0, -k], out: [0, k] },
    { x: 0, y: r, in: [k, 0], out: [-k, 0] },
    { x: -r, y: 0, in: [0, k], out: [0, -k] },
    { x: 0, y: -r, in: [-k, 0], out: [k, 0], close: true },
  ];
}

function bounds(anchors) {
  const xs = anchors.map((a) => a.x);
  const ys = anchors.map((a) => a.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function hasPointNear(anchors, x, y, tolerance = 1e-3) {
  return anchors.some((a) => Math.hypot(a.x - x, a.y - y) < tolerance);
}

describe("offsetClosedPenAnchors", () => {
  it("outsets a square with mitred corners", () => {
    const result = offsetClosedPenAnchors(square(100), 10);
    expect(result.ok).toBe(true);
    const b = bounds(result.anchors);
    expect(b.minX).toBeCloseTo(-10, 3);
    expect(b.maxX).toBeCloseTo(110, 3);
    expect(b.minY).toBeCloseTo(-10, 3);
    expect(b.maxY).toBeCloseTo(110, 3);
    expect(hasPointNear(result.anchors, -10, -10)).toBe(true);
    expect(hasPointNear(result.anchors, 110, 110)).toBe(true);
  });

  it("insets a square by moving its edges inward", () => {
    const result = offsetClosedPenAnchors(square(100), -10);
    expect(result.ok).toBe(true);
    const b = bounds(result.anchors);
    expect(b.minX).toBeCloseTo(10, 3);
    expect(b.maxX).toBeCloseTo(90, 3);
    expect(hasPointNear(result.anchors, 10, 10)).toBe(true);
  });

  it("gives the same outline for either winding direction", () => {
    const forward = bounds(offsetClosedPenAnchors(square(100), 10).anchors);
    const backward = bounds(
      offsetClosedPenAnchors(square(100, true), 10).anchors,
    );
    expect(backward.minX).toBeCloseTo(forward.minX, 3);
    expect(backward.maxX).toBeCloseTo(forward.maxX, 3);
    expect(backward.minY).toBeCloseTo(forward.minY, 3);
    expect(backward.maxY).toBeCloseTo(forward.maxY, 3);
  });

  it("offsets a curved circle to the expected radius", () => {
    const result = offsetClosedPenAnchors(circle(50), 10);
    expect(result.ok).toBe(true);
    for (const anchor of result.anchors) {
      const radius = Math.hypot(anchor.x, anchor.y);
      expect(radius).toBeGreaterThan(59.5);
      expect(radius).toBeLessThan(60.5);
    }
  });

  it("insets a curved circle to the expected radius without folding", () => {
    const result = offsetClosedPenAnchors(circle(50), -10);
    expect(result.ok).toBe(true);
    for (const anchor of result.anchors) {
      const radius = Math.hypot(anchor.x, anchor.y);
      expect(radius).toBeGreaterThan(39.5);
      expect(radius).toBeLessThan(40.5);
    }
  });

  it("emits handle-less anchors with the close flag on the last one only", () => {
    const result = offsetClosedPenAnchors(circle(50), 5);
    expect(result.ok).toBe(true);
    result.anchors.forEach((anchor, index) => {
      expect(anchor.in).toBeNull();
      expect(anchor.out).toBeNull();
      expect(anchor.close).toBe(index === result.anchors.length - 1);
    });
  });

  it("bevels a sharp spike instead of shooting a miter far outside", () => {
    const spike = [
      { x: 0, y: -1, in: null, out: null },
      { x: 100, y: 0, in: null, out: null },
      { x: 0, y: 1, in: null, out: null, close: true },
    ];
    const result = offsetClosedPenAnchors(spike, 5);
    expect(result.ok).toBe(true);
    const b = bounds(result.anchors);
    // A mitre here would reach ~5 / sin(half-angle), i.e. hundreds of units.
    expect(b.maxX).toBeLessThan(106);
  });

  it("refuses an open path", () => {
    const open = square(100).map((p) => ({ ...p, close: false }));
    expect(offsetClosedPenAnchors(open, 10)).toEqual({
      ok: false,
      reason: OFFSET_FAILURE.OPEN_PATH,
    });
  });

  it("refuses a zero or non-finite distance", () => {
    for (const distance of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(offsetClosedPenAnchors(square(100), distance)).toEqual({
        ok: false,
        reason: OFFSET_FAILURE.INVALID_DISTANCE,
      });
    }
  });

  it("refuses too few anchors", () => {
    const two = [
      { x: 0, y: 0, in: null, out: null },
      { x: 10, y: 0, in: null, out: null, close: true },
    ];
    expect(offsetClosedPenAnchors(two, 2)).toEqual({
      ok: false,
      reason: OFFSET_FAILURE.TOO_FEW_ANCHORS,
    });
  });

  it("reports a fold when an inset runs past the shape's centre", () => {
    expect(offsetClosedPenAnchors(square(100), -60)).toEqual({
      ok: false,
      reason: OFFSET_FAILURE.FOLDED,
    });
  });

  it("does not mutate the input anchors", () => {
    const input = square(100);
    const snapshot = JSON.stringify(input);
    offsetClosedPenAnchors(input, 10);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
