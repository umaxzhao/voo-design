import { describe, it, expect, vi } from "vitest";
import {
  cubicBezierPoint,
  cubicBezierDerivative,
  normalizePathPoints,
  buildPathCurveSegments,
  buildArcLengthLUT,
  sampleLUTAtDistance,
  layoutTextOnPath,
  paintTextOnPath,
  pointsToSvgPathD,
  textOnPathToSvg,
} from "../../src/canvas/editor/text_on_path.js";

describe("cubicBezier math", () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 0, y: 100 };
  const p2 = { x: 100, y: 100 };
  const p3 = { x: 100, y: 0 };

  it("evaluates endpoints accurately", () => {
    const start = cubicBezierPoint(p0, p1, p2, p3, 0);
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(0);

    const end = cubicBezierPoint(p0, p1, p2, p3, 1);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(0);
  });

  it("evaluates midpoint symmetry", () => {
    const mid = cubicBezierPoint(p0, p1, p2, p3, 0.5);
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(75);
  });

  it("evaluates tangents at endpoints", () => {
    const d0 = cubicBezierDerivative(p0, p1, p2, p3, 0);
    expect(d0.x).toBeCloseTo(0);
    expect(d0.y).toBeCloseTo(300);

    const d1 = cubicBezierDerivative(p0, p1, p2, p3, 1);
    expect(d1.x).toBeCloseTo(0);
    expect(d1.y).toBeCloseTo(-300);
  });
});

describe("normalizePathPoints", () => {
  it("converts pen relative handle offsets [dx, dy] to absolute handles", () => {
    const points = [
      { x: 10, y: 20, out: [5, 10] },
      { x: 50, y: 60, in: [-5, -10], close: true },
    ];
    const norm = normalizePathPoints(points);
    expect(norm[0].out).toEqual({ x: 15, y: 30 });
    expect(norm[1].in).toEqual({ x: 45, y: 50 });
    expect(norm[1].close).toBe(true);
  });

  it("handles null and empty arrays", () => {
    expect(normalizePathPoints([])).toEqual([]);
    expect(normalizePathPoints(null)).toEqual([]);
  });
});

describe("buildPathCurveSegments", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("builds N-1 segments for open path", () => {
    const segments = buildPathCurveSegments(points, false);
    expect(segments.length).toBe(2);
    expect(segments[0].p0.x).toBe(0);
    expect(segments[0].p3.x).toBe(100);
    expect(segments[1].p0.x).toBe(100);
    expect(segments[1].p3.y).toBe(100);
  });

  it("builds N segments for closed path connecting back to start", () => {
    const segments = buildPathCurveSegments(points, true);
    expect(segments.length).toBe(3);
    expect(segments[2].p0.x).toBe(100);
    expect(segments[2].p0.y).toBe(100);
    expect(segments[2].p3.x).toBe(0);
    expect(segments[2].p3.y).toBe(0);
  });
});

describe("buildArcLengthLUT & sampleLUTAtDistance", () => {
  it("computes accurate length for a horizontal straight line", () => {
    const points = [
      { x: 0, y: 50 },
      { x: 200, y: 50 },
    ];
    const segments = buildPathCurveSegments(points, false);
    const lut = buildArcLengthLUT(segments, 16);

    expect(lut.totalLength).toBeCloseTo(200, 1);

    const midSample = sampleLUTAtDistance(lut, 100, false);
    expect(midSample.x).toBeCloseTo(100, 1);
    expect(midSample.y).toBeCloseTo(50, 1);
    expect(midSample.angle).toBeCloseTo(0);
    expect(midSample.tangent.x).toBeCloseTo(1);
    expect(midSample.tangent.y).toBeCloseTo(0);
  });

  it("computes accurate length for a quarter circle", () => {
    // Standard cubic approximation of a 90 deg circular arc: R = 100, k = 0.5522847498 * 100
    const k = 55.228475;
    const points = [
      { x: 0, y: 100, out: [0, -k] },
      { x: 100, y: 0, in: [-k, 0] },
    ];
    const segments = buildPathCurveSegments(points, false);
    const lut = buildArcLengthLUT(segments, 32);

    const expectedLength = (Math.PI * 100) / 2; // ~157.08
    expect(Math.abs(lut.totalLength - expectedLength)).toBeLessThan(1.0);
  });

  it("wraps around closed loops when target distance exceeds total length", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100, close: true },
    ];
    const segments = buildPathCurveSegments(points, true);
    const lut = buildArcLengthLUT(segments, 16);
    expect(lut.totalLength).toBeCloseTo(400, 1);

    const wrapSample = sampleLUTAtDistance(lut, 450, true);
    // 450 % 400 = 50 -> halfway along first segment
    expect(wrapSample.x).toBeCloseTo(50, 1);
    expect(wrapSample.y).toBeCloseTo(0, 1);
  });
});

describe("layoutTextOnPath", () => {
  const linePath = {
    points: [
      { x: 0, y: 100 },
      { x: 300, y: 100 },
    ],
    closed: false,
    startOffset: 0,
    align: "left",
  };

  it("lays out characters along path with positive advancement", () => {
    const node = {
      text: "HELLO",
      fontSize: 20,
      textPath: linePath,
    };
    const layout = layoutTextOnPath(null, node);
    expect(layout).not.toBeNull();
    expect(layout.glyphs.length).toBe(5);

    // Characters advance in X along the line
    for (let i = 1; i < layout.glyphs.length; i += 1) {
      expect(layout.glyphs[i].x).toBeGreaterThan(layout.glyphs[i - 1].x);
      expect(layout.glyphs[i].y).toBeCloseTo(100);
      expect(layout.glyphs[i].angle).toBeCloseTo(0);
    }
  });

  it("handles center and right alignment", () => {
    const nodeLeft = {
      text: "ABC",
      fontSize: 20,
      textPath: { ...linePath, align: "left" },
    };
    const nodeCenter = {
      text: "ABC",
      fontSize: 20,
      textPath: { ...linePath, align: "center" },
    };
    const nodeRight = {
      text: "ABC",
      fontSize: 20,
      textPath: { ...linePath, align: "right" },
    };

    const layoutLeft = layoutTextOnPath(null, nodeLeft);
    const layoutCenter = layoutTextOnPath(null, nodeCenter);
    const layoutRight = layoutTextOnPath(null, nodeRight);

    expect(layoutCenter.glyphs[0].x).toBeGreaterThan(layoutLeft.glyphs[0].x);
    expect(layoutRight.glyphs[0].x).toBeGreaterThan(layoutCenter.glyphs[0].x);
  });

  it("flips display angle for bottom side", () => {
    const nodeTop = {
      text: "TOP",
      fontSize: 20,
      textPath: { ...linePath, side: "top" },
    };
    const nodeBottom = {
      text: "TOP",
      fontSize: 20,
      textPath: { ...linePath, side: "bottom" },
    };

    const layoutTop = layoutTextOnPath(null, nodeTop);
    const layoutBottom = layoutTextOnPath(null, nodeBottom);

    expect(layoutTop.glyphs[0].angle).toBeCloseTo(0);
    // Bottom side is flipped by PI radians
    expect(Math.abs(layoutBottom.glyphs[0].angle)).toBeCloseTo(Math.PI);
  });

  it("reverses layout direction when reverse is true", () => {
    const nodeNormal = {
      text: "FLOW",
      fontSize: 20,
      textPath: { ...linePath, reverse: false },
    };
    const nodeReversed = {
      text: "FLOW",
      fontSize: 20,
      textPath: { ...linePath, reverse: true },
    };

    const layoutNormal = layoutTextOnPath(null, nodeNormal);
    const layoutReversed = layoutTextOnPath(null, nodeReversed);

    // Normal starts at low x, reversed starts at high x
    expect(layoutNormal.glyphs[0].x).toBeLessThan(layoutReversed.glyphs[0].x);
  });
});

describe("paintTextOnPath", () => {
  it("executes context transformations for each glyph", () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 12 }),
    };

    const node = {
      text: "VOO",
      fontSize: 20,
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 2,
      textPath: {
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        closed: false,
      },
    };

    paintTextOnPath(mockCtx, node);

    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.translate).toHaveBeenCalledTimes(3); // 3 glyphs
    expect(mockCtx.rotate).toHaveBeenCalledTimes(3);
    expect(mockCtx.fillText).toHaveBeenCalledTimes(3);
    expect(mockCtx.strokeText).toHaveBeenCalledTimes(3);
    expect(mockCtx.restore).toHaveBeenCalled();
  });
});

describe("pointsToSvgPathD & textOnPathToSvg", () => {
  it("converts points to SVG cubic curve d string", () => {
    const points = [
      { x: 0, y: 0, out: [10, 20] },
      { x: 100, y: 50, in: [-10, -20], close: true },
    ];
    const d = pointsToSvgPathD(points, true);
    expect(d).toContain("M 0 0");
    expect(d).toContain("C 10 20");
    expect(d).toContain("Z");
  });

  it("generates valid SVG textPath element", () => {
    const node = {
      id: "demo-text-path",
      text: "Curve Text",
      fontSize: 18,
      fill: "#ff00aa",
      textPath: {
        points: [
          { x: 0, y: 50 },
          { x: 200, y: 50 },
        ],
        closed: false,
        align: "center",
      },
    };

    const svg = textOnPathToSvg(node);
    expect(svg).toContain("<textPath");
    expect(svg).toContain('startOffset="50%"');
    expect(svg).toContain("Curve Text");
    expect(svg).toContain('fill="#ff00aa"');
  });
});
