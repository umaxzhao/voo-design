import { describe, expect, it } from "vitest";

import { traceBitmapToPaths } from "../../src/canvas/agent/image_trace.js";

/* --------------------------------------------------------------- fixtures */

const TRANSPARENT = [0, 0, 0, 0];
const RED = [255, 0, 0, 255];
const GREEN = [0, 128, 0, 255];
const BLUE = [0, 0, 255, 255];
const BLACK = [0, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

function createBitmap(width, height, fill = TRANSPARENT) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    data[offset] = fill[0];
    data[offset + 1] = fill[1];
    data[offset + 2] = fill[2];
    data[offset + 3] = fill[3];
  }
  return { data, width, height };
}

function setPixel(bitmap, x, y, rgba) {
  if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) return;
  const offset = (y * bitmap.width + x) * 4;
  bitmap.data[offset] = rgba[0];
  bitmap.data[offset + 1] = rgba[1];
  bitmap.data[offset + 2] = rgba[2];
  bitmap.data[offset + 3] = rgba[3];
}

/** Paints the half-open rectangle [x0, x1) x [y0, y1). */
function paintRect(bitmap, x0, y0, x1, y1, rgba) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) setPixel(bitmap, x, y, rgba);
  }
}

function countOpaque(bitmap) {
  let count = 0;
  for (let i = 0; i < bitmap.width * bitmap.height; i += 1) {
    if (bitmap.data[i * 4 + 3] >= 32) count += 1;
  }
  return count;
}

/* ------------------------------------------------------------------ helpers */

/** Splits an absolute M/L/Z path into its subpath vertex lists. */
function subpathsOf(d) {
  return d
    .split("M")
    .filter(Boolean)
    .map((chunk) => {
      const numbers = (`M${chunk}`.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      const points = [];
      for (let i = 0; i + 1 < numbers.length; i += 2) {
        points.push([numbers[i], numbers[i + 1]]);
      }
      return points;
    });
}

/** Shoelace area in y-down coordinates: positive = clockwise on screen. */
function polygonArea(points) {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    sum += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return sum / 2;
}

function expectArea(actual, expected, tolerance = 0.05) {
  expect(expected).toBeGreaterThan(0);
  expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(tolerance);
}

function totalPaths(result) {
  return result.layers.reduce((sum, layer) => sum + layer.paths.length, 0);
}

function expectPathWithinBounds(result, d) {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  expect(numbers.length).toBeGreaterThanOrEqual(6);
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    expect(numbers[i]).toBeGreaterThanOrEqual(0);
    expect(numbers[i]).toBeLessThanOrEqual(result.width);
    expect(numbers[i + 1]).toBeGreaterThanOrEqual(0);
    expect(numbers[i + 1]).toBeLessThanOrEqual(result.height);
  }
  // The tracer only emits absolute M/L/Z; the canvas tool's transformPathData()
  // depends on that subset.
  expect(d.replace(/[MLZ0-9,.-]/g, "")).toBe("");
  expect(d.startsWith("M")).toBe(true);
  expect(d.endsWith("Z")).toBe(true);
}

/* -------------------------------------------------------------- input rules */

describe("traceBitmapToPaths input contract", () => {
  it("throws when the pixel buffer length does not match width*height*4", () => {
    expect(() =>
      traceBitmapToPaths({ data: new Uint8ClampedArray(12), width: 2, height: 2 }),
    ).toThrow(/length/);
    expect(() =>
      traceBitmapToPaths({ data: new Uint8ClampedArray(64), width: 2, height: 2 }),
    ).toThrow(/length/);
  });

  it("throws when data is missing or not a pixel buffer", () => {
    expect(() => traceBitmapToPaths({ width: 2, height: 2 })).toThrow(/data/);
    expect(() => traceBitmapToPaths({ data: null, width: 2, height: 2 })).toThrow(/data/);
    expect(() => traceBitmapToPaths({ data: {}, width: 2, height: 2 })).toThrow(/data/);
  });

  it("throws on negative or non-finite dimensions", () => {
    expect(() =>
      traceBitmapToPaths({ data: new Uint8ClampedArray(0), width: -1, height: 1 }),
    ).toThrow(/width/);
    expect(() =>
      traceBitmapToPaths({ data: new Uint8ClampedArray(0), width: 1, height: Infinity }),
    ).toThrow(/height/);
  });

  it("accepts Uint8Array as well as Uint8ClampedArray", () => {
    const rgba = new Uint8Array(8 * 8 * 4);
    for (let i = 0; i < 8 * 8; i += 1) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 3] = 255;
    }
    const result = traceBitmapToPaths({ data: rgba, width: 8, height: 8 });
    expect(result.layers).toHaveLength(1);
    expect(result.palette).toEqual(["#ff0000"]);
  });

  it("returns an empty result for a zero-sized bitmap", () => {
    const result = traceBitmapToPaths({
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
    });
    expect(result).toEqual({ width: 0, height: 0, palette: [], layers: [], warnings: [] });
  });

  it("floors fractional dimensions and never references pixels outside the buffer", () => {
    const bitmap = createBitmap(12, 9, [10, 20, 30, 255]);
    const result = traceBitmapToPaths({
      data: bitmap.data,
      width: 12.7,
      height: 9.4,
    });
    expect(result.width).toBe(12);
    expect(result.height).toBe(9);
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].paths).toHaveLength(1);
    expectArea(result.layers[0].paths[0].area, 12 * 9);
    expectPathWithinBounds(result, result.layers[0].paths[0].d);
  });

  it("keeps odd (non-square) dimensions inside the image bounds", () => {
    const bitmap = createBitmap(37, 23, TRANSPARENT);
    paintRect(bitmap, 0, 0, 37, 23, RED);
    paintRect(bitmap, 5, 3, 30, 19, TRANSPARENT);
    const result = traceBitmapToPaths(bitmap);
    expect(result.width).toBe(37);
    expect(result.height).toBe(23);
    for (const layer of result.layers) {
      for (const path of layer.paths) expectPathWithinBounds(result, path.d);
    }
  });
});

/* ------------------------------------------------------ transparent inputs */

describe("transparent and thresholded input", () => {
  it("returns no layers for a fully transparent bitmap", () => {
    const bitmap = createBitmap(20, 20, TRANSPARENT);
    const result = traceBitmapToPaths(bitmap);
    expect(result).toEqual({
      width: 20,
      height: 20,
      palette: [],
      layers: [],
      warnings: [],
    });
  });

  it("treats pixels below alphaThreshold as background", () => {
    const bitmap = createBitmap(10, 10, [255, 0, 0, 20]);
    expect(traceBitmapToPaths(bitmap).layers).toEqual([]);

    const custom = traceBitmapToPaths(bitmap, { alphaThreshold: 10 });
    expect(custom.layers).toHaveLength(1);
    expect(custom.layers[0].color).toBe("#ff0000");
    expect(custom.layers[0].paths[0].area).toBe(100);
  });

  it("includes pixels exactly at alphaThreshold", () => {
    const bitmap = createBitmap(8, 8, [0, 0, 255, 32]);
    expect(traceBitmapToPaths(bitmap).layers).toHaveLength(1);
  });
});

/* ------------------------------------------------------- solid silhouettes */

describe("solid color silhouettes", () => {
  it("traces a solid square to one layer, one clockwise contour with its area", () => {
    const bitmap = createBitmap(20, 20, TRANSPARENT);
    paintRect(bitmap, 0, 0, 20, 20, RED);
    const result = traceBitmapToPaths(bitmap);

    expect(result.palette).toEqual(["#ff0000"]);
    expect(result.layers).toHaveLength(1);
    const layer = result.layers[0];
    expect(layer).toEqual({
      color: "#ff0000",
      isTransparent: false,
      paths: [expect.any(Object)],
    });

    const path = layer.paths[0];
    expect(path.holes).toBe(0);
    expectArea(path.area, 20 * 20);
    expectPathWithinBounds(result, path.d);
    // A rectangle simplifies to exactly four corners.
    expect((path.d.match(/L/g) ?? []).length).toBe(3);
    const [outer] = subpathsOf(path.d);
    expect(polygonArea(outer)).toBeGreaterThan(0); // clockwise on screen
  });

  it("traces disconnected regions of one color as separate paths", () => {
    const bitmap = createBitmap(40, 20, TRANSPARENT);
    paintRect(bitmap, 2, 2, 12, 12, GREEN);
    paintRect(bitmap, 22, 2, 32, 12, GREEN);
    const result = traceBitmapToPaths(bitmap);
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].paths).toHaveLength(2);
    expect(totalPaths(result)).toBe(2);
    for (const path of result.layers[0].paths) expectArea(path.area, 100);
  });

  it("keeps a concave silhouette as a single contour whose area equals its pixel count", () => {
    const bitmap = createBitmap(30, 30, TRANSPARENT);
    paintRect(bitmap, 5, 5, 15, 25, GREEN); // vertical bar
    paintRect(bitmap, 15, 20, 25, 25, GREEN); // foot of an L
    const result = traceBitmapToPaths(bitmap);
    expect(result.layers[0].paths).toHaveLength(1);
    const path = result.layers[0].paths[0];
    expect(path.holes).toBe(0);
    expectArea(path.area, countOpaque(bitmap));
    // L-shape has six corners.
    expect((path.d.match(/L/g) ?? []).length + 1).toBe(6);
  });

  it("traces two flat colors as two layers", () => {
    const bitmap = createBitmap(40, 20, TRANSPARENT);
    paintRect(bitmap, 0, 0, 20, 20, RED);
    paintRect(bitmap, 20, 0, 40, 20, BLUE);
    const result = traceBitmapToPaths(bitmap);

    expect(result.layers).toHaveLength(2);
    expect(new Set(result.palette)).toEqual(new Set(["#ff0000", "#0000ff"]));
    expect(result.palette).toEqual(result.layers.map((layer) => layer.color));
    for (const layer of result.layers) {
      expect(layer.paths).toHaveLength(1);
      expectArea(layer.paths[0].area, 400);
    }
  });

  it("merges similar colors into one palette entry (4-bit quantization)", () => {
    const bitmap = createBitmap(20, 20, TRANSPARENT);
    paintRect(bitmap, 0, 0, 10, 20, RED);
    paintRect(bitmap, 10, 0, 20, 20, [250, 4, 4, 255]);
    const result = traceBitmapToPaths(bitmap);
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].paths).toHaveLength(1);
    expectArea(result.layers[0].paths[0].area, 400);
  });
});

/* ------------------------------------------------------------------- holes */

describe("holes", () => {
  it("emits a framed square as one path with a counter-clockwise hole", () => {
    const bitmap = createBitmap(40, 40, TRANSPARENT);
    paintRect(bitmap, 0, 0, 40, 40, BLACK);
    paintRect(bitmap, 12, 12, 28, 28, TRANSPARENT);

    const result = traceBitmapToPaths(bitmap);
    expect(result.layers).toHaveLength(1);
    const path = result.layers[0].paths[0];
    expect(path.holes).toBe(1);
    expectArea(path.area, 40 * 40 - 16 * 16);

    const subpaths = subpathsOf(path.d);
    expect(subpaths).toHaveLength(2);
    expect(polygonArea(subpaths[0])).toBeGreaterThan(0); // outer: clockwise
    expect(polygonArea(subpaths[1])).toBeLessThan(0); // hole: counter-clockwise
    expectPathWithinBounds(result, path.d);
  });

  it("keeps small holes even when they are below minArea", () => {
    // The outer contour is big enough to survive; its tiny hole must not be
    // dropped, otherwise a counter inside a letter would disappear.
    const bitmap = createBitmap(20, 20, TRANSPARENT);
    paintRect(bitmap, 0, 0, 20, 20, BLACK);
    paintRect(bitmap, 8, 8, 12, 12, TRANSPARENT); // 16 px hole < default minArea 24
    const result = traceBitmapToPaths(bitmap);
    expect(result.layers[0].paths).toHaveLength(1);
    expect(result.layers[0].paths[0].holes).toBe(1);
    expectArea(result.layers[0].paths[0].area, 400 - 16);
  });

  it("groups multiple holes under their containing outer contour", () => {
    const bitmap = createBitmap(100, 100, TRANSPARENT);
    paintRect(bitmap, 10, 10, 90, 90, BLACK);
    paintRect(bitmap, 20, 20, 40, 40, TRANSPARENT);
    paintRect(bitmap, 60, 60, 75, 75, TRANSPARENT);

    const result = traceBitmapToPaths(bitmap);
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].paths).toHaveLength(1);
    const path = result.layers[0].paths[0];
    expect(path.holes).toBe(2);
    expectArea(path.area, 80 * 80 - 20 * 20 - 15 * 15);
    expect(subpathsOf(path.d)).toHaveLength(3);
  });

  it("traces an opaque frame above an opaque background as two nested layers", () => {
    const bitmap = createBitmap(40, 40, WHITE);
    paintRect(bitmap, 10, 10, 30, 30, BLACK);
    paintRect(bitmap, 14, 14, 26, 26, WHITE);

    const result = traceBitmapToPaths(bitmap);
    expect(result.layers).toHaveLength(2);
    const blackLayer = result.layers.find((layer) => layer.color === "#000000");
    expect(blackLayer).toBeTruthy();
    expect(blackLayer.paths).toHaveLength(1);
    expect(blackLayer.paths[0].holes).toBe(1);
    expectArea(blackLayer.paths[0].area, 20 * 20 - 12 * 12);

    const whiteLayer = result.layers.find((layer) => layer.color === "#ffffff");
    expect(whiteLayer.paths).toHaveLength(2);
    // Outer white region: the whole image minus the frame's outer outline.
    const outside = whiteLayer.paths.find((path) => path.holes === 1);
    expect(outside).toBeTruthy();
    expectArea(outside.area, 40 * 40 - 20 * 20);
    // Inner white square: 12 * 12.
    expect(whiteLayer.paths.some((path) => Math.abs(path.area - 144) < 1)).toBe(true);
  });
});

/* ------------------------------------------------ filtering and truncation */

describe("area filtering and path caps", () => {
  it("drops specks smaller than minArea and keeps them when minArea is lowered", () => {
    const bitmap = createBitmap(60, 60, TRANSPARENT);
    paintRect(bitmap, 5, 5, 35, 35, BLACK); // 900 px area
    paintRect(bitmap, 50, 50, 53, 53, BLACK); // 9 px speck

    const filtered = traceBitmapToPaths(bitmap);
    expect(filtered.layers[0].paths).toHaveLength(1);
    expectArea(filtered.layers[0].paths[0].area, 900);

    const unfiltered = traceBitmapToPaths(bitmap, { minArea: 1 });
    expect(unfiltered.layers[0].paths).toHaveLength(2);
    expect(unfiltered.layers[0].paths.map((path) => path.area).sort((a, b) => a - b)).toEqual([
      9, 900,
    ]);
  });

  it("caps the total number of paths and reports a warning", () => {
    const bitmap = createBitmap(60, 60, TRANSPARENT);
    for (let y = 2; y < 60; y += 15) {
      for (let x = 2; x < 60; x += 15) {
        paintRect(bitmap, x, y, x + 4, y + 4, BLACK);
      }
    }
    const result = traceBitmapToPaths(bitmap, { minArea: 1, maxPaths: 3 });
    expect(totalPaths(result)).toBe(3);
    expect(result.warnings.some((warning) => /maxPaths/.test(warning))).toBe(true);
    // The kept contours are the largest ones; all dots are equal, so the cap is
    // purely size/order based and must still be deterministic.
    expect(JSON.stringify(traceBitmapToPaths(bitmap, { minArea: 1, maxPaths: 3 }))).toBe(
      JSON.stringify(result),
    );
  });
});

/* ------------------------------------------------------------ determinism */

describe("determinism and 200x200 scene", () => {
  function scene() {
    const bitmap = createBitmap(200, 200, TRANSPARENT);
    paintRect(bitmap, 10, 10, 90, 60, BLACK); // card
    paintRect(bitmap, 20, 20, 60, 40, TRANSPARENT); // hole in card
    paintRect(bitmap, 110, 15, 190, 65, RED); // red banner
    for (let y = 100; y < 190; y += 1) {
      for (let x = 20; x < 110; x += 1) {
        const dx = x - 65;
        const dy = y - 145;
        if (dx * dx + dy * dy <= 40 * 40) setPixel(bitmap, x, y, BLUE); // circle
      }
    }
    paintRect(bitmap, 130, 110, 190, 140, GREEN);
    paintRect(bitmap, 130, 160, 150, 180, GREEN);
    return bitmap;
  }

  it("returns byte-identical JSON for repeated calls", () => {
    const first = traceBitmapToPaths(scene());
    const second = traceBitmapToPaths(scene());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("traces a 200x200 mixed scene with the expected layers", () => {
    const bitmap = scene();
    const result = traceBitmapToPaths(bitmap);

    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
    expect(result.layers).toHaveLength(4);
    expect(new Set(result.palette)).toEqual(
      new Set(["#000000", "#ff0000", "#0000ff", "#008000"]),
    );
    for (const layer of result.layers) {
      expect(layer.isTransparent).toBe(false);
      expect(layer.paths.length).toBeGreaterThan(0);
      for (const path of layer.paths) {
        expect(path.area).toBeGreaterThan(0);
        expect(Number.isInteger(path.holes)).toBe(true);
        expectPathWithinBounds(result, path.d);
      }
    }

    // The card has a hole; the dot pair is two separate green paths.
    const black = result.layers.find((layer) => layer.color === "#000000");
    expect(black.paths[0].holes).toBe(1);
    expectArea(black.paths[0].area, 80 * 50 - 40 * 20);
    const green = result.layers.find((layer) => layer.color === "#008000");
    expect(green.paths).toHaveLength(2);

    // Total traced area must match the opaque pixels (net of holes) within 5%.
    expectArea(
      result.layers.reduce(
        (sum, layer) => sum + layer.paths.reduce((acc, path) => acc + path.area, 0),
        0,
      ),
      countOpaque(bitmap),
    );
  });

  it("honours simplifyTolerance while keeping the area", () => {
    // Staircase diagonal: many collinear-ish steps that RDP can collapse.
    const bitmap = createBitmap(200, 200, TRANSPARENT);
    for (let y = 0; y < 200; y += 1) {
      for (let x = 0; x < 200; x += 1) {
        if (x + y < 260) setPixel(bitmap, x, y, RED);
      }
    }
    const precise = traceBitmapToPaths(bitmap, { simplifyTolerance: 0 });
    const loose = traceBitmapToPaths(bitmap, { simplifyTolerance: 6 });
    const preciseVertices = (precise.layers[0].paths[0].d.match(/[ML]/g) ?? []).length;
    const looseVertices = (loose.layers[0].paths[0].d.match(/[ML]/g) ?? []).length;

    expect(looseVertices).toBeLessThan(preciseVertices);
    expectArea(loose.layers[0].paths[0].area, countOpaque(bitmap));
    expectArea(precise.layers[0].paths[0].area, countOpaque(bitmap));
  });
});

/* ------------------------------------------------- large bitmap guardrails */

describe("large bitmap guardrails", () => {
  it("traces a 2048x2048 solid bitmap at full resolution", { timeout: 30000 }, () => {
    const width = 2048;
    const height = 2048;
    const bitmap = createBitmap(width, height, [180, 40, 40, 255]);
    const result = traceBitmapToPaths(bitmap);
    expect(result.warnings).toEqual([]);
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].paths).toHaveLength(1);
    expectArea(result.layers[0].paths[0].area, width * height);
    expectPathWithinBounds(result, result.layers[0].paths[0].d);
  });

  it("samples bitmaps above maxPixels and warns instead of exploding", { timeout: 30000 }, () => {
    const width = 2048;
    const height = 2049; // one row above the 2048x2048 full-resolution ceiling
    const bitmap = createBitmap(width, height, [180, 40, 40, 255]);
    const result = traceBitmapToPaths(bitmap);
    expect(result.warnings.some((warning) => /sampled every 2px/.test(warning))).toBe(true);
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].paths).toHaveLength(1);
    expectArea(result.layers[0].paths[0].area, width * height, 0.01);
    expectPathWithinBounds(result, result.layers[0].paths[0].d);
  });

  it("reports the edge budget on pathological noise without hanging", { timeout: 30000 }, () => {
    const width = 256;
    const height = 256;
    const bitmap = createBitmap(width, height);
    let seed = 123456789;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const colors = [RED, GREEN, BLUE, BLACK];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        setPixel(bitmap, x, y, colors[Math.floor(random() * colors.length)]);
      }
    }
    const result = traceBitmapToPaths(bitmap, { minArea: 1, maxPaths: 8 });
    expect(totalPaths(result)).toBeLessThanOrEqual(8);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
