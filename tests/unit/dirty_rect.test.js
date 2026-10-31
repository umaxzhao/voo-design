import { describe, expect, it } from "vitest";
import {
  DIRTY_RECT_MAX_AREA_RATIO,
  DIRTY_UNIT,
  dirtyRectAreaRatio,
  dirtyRectsToDevice,
  intersectRects,
  shouldUseDirtyRect,
  unionRect,
  unionRects,
  worldToDeviceRect,
} from "../../src/canvas/editor/dirty_rect.js";

const VIEW = { zoom: 1, panX: 0, panY: 0 };

describe("unionRect / unionRects", () => {
  it("returns the other rect when only one side is given", () => {
    const a = { x: 1, y: 2, width: 3, height: 4 };
    expect(unionRect(null, a)).toEqual(a);
    expect(unionRect(a, null)).toEqual(a);
    expect(unionRect(null, null)).toBeNull();
  });

  it("covers both rects with the minimal bounding box", () => {
    const union = unionRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 5, width: 10, height: 30 },
    );
    expect(union).toEqual({ x: 0, y: 0, width: 30, height: 35 });
  });

  it("ignores empty, non-finite, and null entries in a list", () => {
    const union = unionRects([
      null,
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 5, y: 5, width: 0, height: 10 },
      { x: Number.NaN, y: 0, width: 10, height: 10 },
      { x: 10, y: 10, width: 10, height: 10 },
    ]);
    expect(union).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  });

  it("returns null for an empty or fully invalid list", () => {
    expect(unionRects([])).toBeNull();
    expect(unionRects(null)).toBeNull();
    expect(unionRects([{ x: 0, y: 0, width: 0, height: 0 }])).toBeNull();
  });
});

describe("intersectRects", () => {
  it("returns the overlapping region", () => {
    const overlap = intersectRects(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 5, y: 5, width: 10, height: 10 },
    );
    expect(overlap).toEqual({ x: 5, y: 5, width: 5, height: 5 });
  });

  it("returns null when the rects miss or either side is missing", () => {
    expect(
      intersectRects(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 20, width: 5, height: 5 },
      ),
    ).toBeNull();
    expect(
      intersectRects({ x: 0, y: 0, width: 10, height: 10 }, null),
    ).toBeNull();
  });
});

describe("worldToDeviceRect", () => {
  it("maps a world rect through pan/zoom into device pixels", () => {
    const device = worldToDeviceRect(
      { x: 10, y: 10, width: 20, height: 20 },
      { zoom: 2, panX: 100, panY: 50 },
      2,
      800,
      600,
    );
    // screen: x 120..160, y 70..110 → device *2: 240..320, 140..220
    expect(device).toEqual({ x: 240, y: 140, width: 80, height: 80 });
  });

  it("clips to the canvas backing store", () => {
    const device = worldToDeviceRect(
      { x: -50, y: -50, width: 100, height: 100 },
      VIEW,
      1,
      800,
      600,
    );
    expect(device).toEqual({ x: 0, y: 0, width: 50, height: 50 });
  });

  it("returns null for off-canvas or invalid input", () => {
    expect(
      worldToDeviceRect({ x: 5000, y: 5000, width: 10, height: 10 }, VIEW, 1, 800, 600),
    ).toBeNull();
    expect(worldToDeviceRect(null, VIEW, 1, 800, 600)).toBeNull();
    expect(worldToDeviceRect({ x: 0, y: 0, width: 10, height: 10 }, null, 1, 800, 600)).toBeNull();
    expect(
      worldToDeviceRect({ x: 0, y: 0, width: 10, height: 10 }, VIEW, 0, 800, 600),
    ).toBeNull();
  });
});

describe("dirtyRectsToDevice", () => {
  it("unions the list into one clipped device rect", () => {
    const device = dirtyRectsToDevice(
      [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 30, y: 30, width: 10, height: 10 },
      ],
      VIEW,
      1,
      800,
      600,
    );
    expect(device).toEqual({ x: 0, y: 0, width: 40, height: 40 });
  });

  it("returns null when nothing is dirty", () => {
    expect(dirtyRectsToDevice([], VIEW, 1, 800, 600)).toBeNull();
  });
});

describe("dirtyRectAreaRatio / shouldUseDirtyRect", () => {
  it("measures the dirty share of the full device canvas", () => {
    const deviceRect = { x: 0, y: 0, width: 400, height: 300 };
    expect(dirtyRectAreaRatio(deviceRect, 800, 600, 1)).toBeCloseTo(0.25);
    // dpr squares the full-canvas area, so the same device rect is a smaller share.
    expect(dirtyRectAreaRatio(deviceRect, 800, 600, 2)).toBeCloseTo(0.0625);
    expect(dirtyRectAreaRatio(null, 800, 600, 1)).toBe(1);
  });

  it("accepts a partial clear only below the area ratio", () => {
    const small = { x: 0, y: 0, width: 80, height: 60 };
    const large = { x: 0, y: 0, width: 800, height: 600 };
    expect(shouldUseDirtyRect(small, 800, 600, 1)).toBe(true);
    expect(shouldUseDirtyRect(large, 800, 600, 1)).toBe(false);
    expect(shouldUseDirtyRect(null, 800, 600, 1)).toBe(false);
    expect(shouldUseDirtyRect(large, 800, 600, 1, 1.5)).toBe(true);
    expect(DIRTY_RECT_MAX_AREA_RATIO).toBe(0.5);
    expect(DIRTY_UNIT).toEqual({ WORLD: "world", DEVICE: "device" });
  });
});

describe('stage dirty-rect clear', () => {
  it('clips repaint and clear to a small dirty region, with full-clear fallback', async () => {
    const { draw } = await import('../../src/canvas/editor/chrome_draw.js');
    const calls = [];
    const ctx = new Proxy({ canvas: { width: 2000, height: 2000 } }, {
      get(target, key) { return key in target ? target[key] : (...args) => calls.push([key, ...args]); },
    });
    const options = { doc: { nodes: [], width: 100, height: 100 }, viewport: VIEW, dpr: 2, stageWidth: 100, stageHeight: 80, includeRegions: false, pageBackground: false };
    draw(ctx, { ...options, dirtyRects: [{ x: 5, y: 6, width: 10, height: 12 }] });
    expect(calls.find(call => call[0] === 'clearRect')).toEqual(['clearRect', 5, 6, 10, 12]);
    expect(calls.findIndex(call => call[0] === 'clip')).toBeLessThan(calls.findIndex(call => call[0] === 'clearRect'));
    calls.length = 0;
    draw(ctx, { ...options, dirtyRects: [{ x: 0, y: 0, width: 100, height: 80 }] });
    expect(calls.find(call => call[0] === 'clearRect')).toEqual(['clearRect', 0, 0, 100, 80]);
    calls.length = 0;
    draw(ctx, options);
    expect(calls.find(call => call[0] === 'clearRect')).toEqual(['clearRect', 0, 0, 100, 80]);
  }, 15000);
});
