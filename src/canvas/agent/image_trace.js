/**
 * 位图轮廓追踪 / Bitmap outline tracing — pure computation, zero dependency.
 *
 * The design agent's `vectorize_image` tool decodes a raster layer into RGBA in
 * the browser and calls `traceBitmapToPaths()`; everything here operates on the
 * pixel buffer only. No DOM, no Canvas, no `fs`, no project imports — which is
 * also why it can be unit-tested under `environment: "node"`.
 *
 * Pipeline / 流水线:
 *   1. alpha threshold  — alpha < alphaThreshold counts as background（透明背景）
 *   2. 4-bit color bins — 每通道 4bit 分桶，取出现最多的 maxColors 个桶，桶内 RGB 求均值当调色板
 *   3. binary masks     — 每个调色板颜色一张二值 mask
 *   4. edge tracing     — 把 mask 当成像素格，沿「实心像素与空格之间的边」走闭合环；
 *                         ring 的内边界自然走出相反方向（外轮廓顺时针、洞逆时针）
 *   5. RDP simplify     — 闭合多边形用 Ramer–Douglas–Peucker 简化（tolerance）
 *   6. area / count     — 外轮廓按 minArea 过滤，路径数按 maxPaths 截断
 *
 * Output coordinates are in the original bitmap pixel space and live on the
 * integer lattice (pixel edges), so a solid 100x100 block traces to M0,0 .. 100
 * with area 10000. `d` is absolute M/L/Z only, because the canvas tool rescales
 * it with `transformPathData()` in `canvas_tools_assets.js`. One path entry packs
 * its outer contour plus every hole as counter-clockwise subpaths, so the node's
 * fill rule can be evenodd; `holes` is the number of hole subpaths and `area` is
 * the NET filled area (outer area minus holes).
 *
 * Determinism: no randomness, no dates, no locale-dependent sorting. Same input
 * and options always produce byte-identical JSON.
 */

/* ------------------------------------------------------------------ constants */

const BUCKET_BITS = 4;
const BUCKET_LEVELS = 1 << BUCKET_BITS; // 16 levels per channel
const BUCKET_COUNT = BUCKET_LEVELS * BUCKET_LEVELS * BUCKET_LEVELS; // 4096 bins
const BUCKET_SHIFT = 8 - BUCKET_BITS;

// Grid-walk directions, in screen order (y grows downwards): E, S, W, N.
// 顺时针的顺序，right turn = +1，left turn = +3。
const DIR_E = 0;
const DIR_S = 1;
const DIR_W = 2;
const DIR_N = 3;
const DIR_DX = [1, 0, -1, 0];
const DIR_DY = [0, 1, 0, -1];
// From an incoming direction, try right turn, straight, left turn, then reverse.
const TURN_PRIORITY = [1, 0, 3, 2];

/**
 * 2048x2048 pixels are traced at full resolution (4.2M pixels, bounded work).
 * Anything bigger is sampled with an integer stride and reports a warning —
 * this keeps a 8K export from allocating hundreds of megabytes.
 */
const FULL_RES_PIXEL_LIMIT = 2048 * 2048;
/**
 * Total number of boundary edges traced across all layers. Pathological images
 * (photo noise, dithering) can have millions of boundary edges; the budget is a
 * hard stop so the call stays responsive instead of exploding. Whatever is
 * already traced is returned, plus a warning that the trace is partial.
 */
const TRACE_EDGE_BUDGET = 1_500_000;

const OPTION_DEFAULTS = Object.freeze({
  maxColors: 8,
  alphaThreshold: 32,
  minArea: 24,
  simplifyTolerance: 1.5,
  maxPaths: 200,
});

/* --------------------------------------------------------------- public API */

/**
 * Trace an RGBA bitmap into flat-color vector contours.
 *
 * @param {{ data: Uint8Array|Uint8ClampedArray, width: number, height: number }} input
 *   `data` is straight (un-premultiplied) RGBA, length `width * height * 4`.
 *   Non-integer dimensions are floored to whole pixels.
 * @param {{
 *   maxColors?: number,
 *   alphaThreshold?: number,
 *   minArea?: number,
 *   simplifyTolerance?: number,
 *   maxPaths?: number,
 *   maxPixels?: number,
 * }} [options]
 *   `maxPixels` is an optional extension: full-resolution pixel ceiling before
 *   integer sampling kicks in (default 2048 * 2048).
 * @returns {{
 *   width: number,
 *   height: number,
 *   palette: string[],
 *   layers: Array<{
 *     color: string,
 *     isTransparent: boolean,
 *     paths: Array<{ d: string, area: number, holes: number }>,
 *   }>,
 *   warnings: string[],
 * }}
 */
export function traceBitmapToPaths(input, options = {}) {
  const { data, width: rawWidth, height: rawHeight } = input ?? {};
  if (!data || typeof data.length !== "number") {
    throw new TypeError(
      "traceBitmapToPaths: data must be a Uint8Array/Uint8ClampedArray of RGBA pixels.",
    );
  }
  const width = normalizeDimension(rawWidth, "width");
  const height = normalizeDimension(rawHeight, "height");
  const expectedLength = width * height * 4;
  if (data.length !== expectedLength) {
    throw new Error(
      `traceBitmapToPaths: data length is ${data.length}, expected ${expectedLength} for ${width}x${height} RGBA.`,
    );
  }

  const settings = normalizeOptions(options);
  const result = { width, height, palette: [], layers: [], warnings: [] };
  if (width === 0 || height === 0) return result;

  const totalPixels = width * height;
  const stride = chooseSampleStride(totalPixels, settings.maxPixels);
  if (stride > 1) {
    result.warnings.push(
      `Bitmap ${width}x${height} was sampled every ${stride}px (maxPixels=${settings.maxPixels}) to bound tracing cost.`,
    );
  }
  const sampleWidth = Math.ceil(width / stride);
  const sampleHeight = Math.ceil(height / stride);

  // Pass 1: color histogram over the sampled grid.
  const histogram = buildColorHistogram(
    data,
    width,
    sampleWidth,
    sampleHeight,
    stride,
    settings.alphaThreshold,
  );
  if (histogram.opaquePixels === 0) return result;

  // Pass 2: palette (top buckets + mean colors), then map every other bucket to
  // its nearest palette color so per-pixel classification is a 4096-entry LUT.
  const { palette, bucketToPalette } = quantizeHistogram(histogram, settings.maxColors);

  // Pass 3: per-pixel palette index (-1 = transparent).
  const indexMap = buildIndexMap(
    data,
    width,
    sampleWidth,
    sampleHeight,
    stride,
    settings.alphaThreshold,
    bucketToPalette,
  );

  const pixelsPerSample = stride * stride;
  const mask = new Uint8Array(sampleWidth * sampleHeight);
  const usedNodes = new Uint8Array((sampleWidth + 1) * (sampleHeight + 1));
  const edgeBudget = { remaining: TRACE_EDGE_BUDGET, truncated: false };
  const layers = [];

  for (let layerIndex = 0; layerIndex < palette.length; layerIndex += 1) {
    // A layer whose total area is below minArea cannot produce a kept contour.
    if (palette[layerIndex].count * pixelsPerSample < settings.minArea) continue;
    const maskPixels = fillMask(mask, indexMap, layerIndex);
    if (maskPixels * pixelsPerSample < settings.minArea) continue;

    const traced = traceMaskContours(mask, sampleWidth, sampleHeight, usedNodes, edgeBudget);
    if (traced.unclosed > 0) {
      result.warnings.push(
        `Skipped ${traced.unclosed} contour(s) that could not be closed.`,
      );
    }
    if (!traced.contours.length) continue;

    const paths = buildLayerPaths(traced.contours, {
      stride,
      width,
      height,
      minArea: settings.minArea,
      tolerance: settings.simplifyTolerance,
    });
    if (!paths.length) continue;
    paths.sort(comparePaths);
    layers.push({ color: palette[layerIndex].color, isTransparent: false, paths });
    if (edgeBudget.truncated) break;
  }

  if (edgeBudget.truncated) {
    result.warnings.push(
      `Contour tracing reached the ${TRACE_EDGE_BUDGET}-edge budget; the vector trace is partial.`,
    );
  }

  capPathCount(layers, settings.maxPaths, result.warnings);

  result.palette = layers.map((layer) => layer.color);
  result.layers = layers;
  return result;
}

/* ------------------------------------------------------- option normalization */

function normalizeOptions(options) {
  const source = options && typeof options === "object" ? options : {};
  return {
    maxColors: clampInteger(source.maxColors, 1, 64, OPTION_DEFAULTS.maxColors),
    alphaThreshold: clampInteger(source.alphaThreshold, 0, 255, OPTION_DEFAULTS.alphaThreshold),
    minArea: clampNumber(source.minArea, 0, Number.MAX_SAFE_INTEGER, OPTION_DEFAULTS.minArea),
    simplifyTolerance: clampNumber(
      source.simplifyTolerance,
      0,
      Number.MAX_SAFE_INTEGER,
      OPTION_DEFAULTS.simplifyTolerance,
    ),
    maxPaths: clampInteger(source.maxPaths, 1, 100000, OPTION_DEFAULTS.maxPaths),
    maxPixels: clampNumber(source.maxPixels, 1, Number.MAX_SAFE_INTEGER, FULL_RES_PIXEL_LIMIT),
  };
}

function normalizeDimension(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`traceBitmapToPaths: ${label} must be a finite number.`);
  }
  if (value < 0) {
    throw new RangeError(`traceBitmapToPaths: ${label} must not be negative.`);
  }
  // Pixel grids are integral; a fractional source size is floored, never rounded
  // up, so a path can never reference a column/row outside the buffer.
  return Math.floor(value);
}

function clampInteger(value, min, max, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function clampNumber(value, min, max, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function chooseSampleStride(pixelCount, maxPixels) {
  if (pixelCount <= maxPixels) return 1;
  return Math.max(2, Math.ceil(Math.sqrt(pixelCount / maxPixels)));
}

/* ---------------------------------------------------------- color histogram */

function bucketKey(r, g, b) {
  return (
    ((r >> BUCKET_SHIFT) << (BUCKET_BITS * 2)) |
    ((g >> BUCKET_SHIFT) << BUCKET_BITS) |
    (b >> BUCKET_SHIFT)
  );
}

/**
 * Counts pixels per 4-bit RGB bucket on the sampled grid. Sums are kept so the
 * palette entry can be the bucket's *mean* color instead of the bucket center.
 */
function buildColorHistogram(data, width, sampleWidth, sampleHeight, stride, alphaThreshold) {
  const counts = new Int32Array(BUCKET_COUNT);
  const sumR = new Float64Array(BUCKET_COUNT);
  const sumG = new Float64Array(BUCKET_COUNT);
  const sumB = new Float64Array(BUCKET_COUNT);
  const rowStride = width * 4 * stride;
  const columnStride = 4 * stride;
  let opaquePixels = 0;

  for (let sy = 0; sy < sampleHeight; sy += 1) {
    const rowOffset = sy * rowStride;
    for (let sx = 0; sx < sampleWidth; sx += 1) {
      const offset = rowOffset + sx * columnStride;
      if (data[offset + 3] < alphaThreshold) continue;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const key = bucketKey(r, g, b);
      counts[key] += 1;
      sumR[key] += r;
      sumG[key] += g;
      sumB[key] += b;
      opaquePixels += 1;
    }
  }

  return { counts, sumR, sumG, sumB, opaquePixels };
}

/**
 * Picks the top `maxColors` color buckets (count desc, then bucket index asc for
 * determinism), turns each into the mean of its pixels, and maps every other
 * non-empty bucket to the nearest palette color.
 */
function quantizeHistogram(histogram, maxColors) {
  const { counts, sumR, sumG, sumB } = histogram;
  const candidates = [];
  for (let key = 0; key < BUCKET_COUNT; key += 1) {
    if (counts[key] > 0) candidates.push(key);
  }
  candidates.sort((a, b) => counts[b] - counts[a] || a - b);

  const palette = [];
  const bucketToPalette = new Int16Array(BUCKET_COUNT);
  bucketToPalette.fill(-1);

  for (const key of candidates) {
    if (palette.length >= maxColors) break;
    const count = counts[key];
    const r = Math.round(sumR[key] / count);
    const g = Math.round(sumG[key] / count);
    const b = Math.round(sumB[key] / count);
    const color = rgbToHex(r, g, b);
    let index = palette.findIndex((entry) => entry.color === color);
    if (index === -1) {
      index = palette.length;
      palette.push({ color, r, g, b, count });
    } else {
      // Two adjacent buckets can round to the same 8-bit color; merge them so a
      // palette never contains a duplicate swatch.
      palette[index].count += count;
    }
    bucketToPalette[key] = index;
  }

  for (const key of candidates) {
    if (bucketToPalette[key] !== -1) continue;
    const count = counts[key];
    const r = sumR[key] / count;
    const g = sumG[key] / count;
    const b = sumB[key] / count;
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < palette.length; i += 1) {
      const dr = r - palette[i].r;
      const dg = g - palette[i].g;
      const db = b - palette[i].b;
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    bucketToPalette[key] = best;
    palette[best].count += count;
  }

  return { palette, bucketToPalette };
}

function buildIndexMap(
  data,
  width,
  sampleWidth,
  sampleHeight,
  stride,
  alphaThreshold,
  bucketToPalette,
) {
  const map = new Int16Array(sampleWidth * sampleHeight);
  const rowStride = width * 4 * stride;
  const columnStride = 4 * stride;

  for (let sy = 0; sy < sampleHeight; sy += 1) {
    const rowOffset = sy * rowStride;
    const mapRow = sy * sampleWidth;
    for (let sx = 0; sx < sampleWidth; sx += 1) {
      const offset = rowOffset + sx * columnStride;
      if (data[offset + 3] < alphaThreshold) {
        map[mapRow + sx] = -1;
      } else {
        map[mapRow + sx] =
          bucketToPalette[bucketKey(data[offset], data[offset + 1], data[offset + 2])];
      }
    }
  }

  return map;
}

function fillMask(mask, indexMap, layerIndex) {
  let count = 0;
  for (let i = 0; i < indexMap.length; i += 1) {
    const solid = indexMap[i] === layerIndex ? 1 : 0;
    mask[i] = solid;
    count += solid;
  }
  return count;
}

/* ----------------------------------------------------------- contour tracing */

/**
 * Walks every closed boundary of a binary mask.
 *
 * The mask is treated as a grid of solid/empty pixel cells; a boundary edge is a
 * unit segment between a solid pixel and an empty cell (the image border counts
 * as empty). Each edge is directed so that the solid side is on the RIGHT of the
 * walk, which makes every outer contour clockwise on screen (positive shoelace
 * in y-down coordinates) and every hole counter-clockwise. At a node where two
 * contours touch diagonally, "turn right" picks the pairing that keeps the two
 * 4-connected components separate.
 *
 * Start discovery: every outer cycle has a top edge (solid below, empty above)
 * directed E; every hole cycle has a top edge (solid above, empty below)
 * directed W. Two ordered scans over the mask therefore cover every cycle, and
 * a used-edge bitmap prevents tracing a cycle twice.
 *
 * @returns {{ contours: number[][], unclosed: number }}
 *   Each contour is a flat `[x0, y0, x1, y1, ...]` lattice-point loop.
 */
function traceMaskContours(mask, width, height, usedNodes, budget) {
  usedNodes.fill(0);
  const columns = width + 1;
  const contours = [];
  let unclosed = 0;
  const maxSteps = 4 * (width + 1) * (height + 1) + 8;

  const isSolid = (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

  const canStep = (x, y, dir) => {
    switch (dir) {
      case DIR_E:
        return isSolid(x, y) && !isSolid(x, y - 1);
      case DIR_S:
        return isSolid(x - 1, y) && !isSolid(x, y);
      case DIR_W:
        return isSolid(x - 1, y - 1) && !isSolid(x - 1, y);
      case DIR_N:
        return isSolid(x, y - 1) && !isSolid(x - 1, y - 1);
      default:
        return false;
    }
  };

  const nextDirection = (x, y, incoming) => {
    for (const turn of TURN_PRIORITY) {
      const dir = (incoming + turn) % 4;
      if (canStep(x, y, dir)) return dir;
    }
    return -1;
  };

  const traceFrom = (startX, startY, startDir) => {
    let x = startX;
    let y = startY;
    let dir = startDir;
    let steps = 0;
    const points = [];
    let closed = false;

    while (steps < maxSteps) {
      const node = y * columns + x;
      const bit = 1 << dir;
      // Defensive: the directed boundary graph is a permutation, so an edge can
      // only be met again if something upstream is inconsistent.
      if (usedNodes[node] & bit) break;
      if (budget.remaining <= 0) {
        budget.truncated = true;
        break;
      }
      usedNodes[node] |= bit;
      budget.remaining -= 1;
      points.push(x, y);
      x += DIR_DX[dir];
      y += DIR_DY[dir];
      steps += 1;
      if (x === startX && y === startY) {
        closed = true;
        break;
      }
      dir = nextDirection(x, y, dir);
      if (dir < 0) break;
    }

    if (!closed) {
      // A partial trace is discarded; the budget warning covers the truncation
      // case, and an unclosed contour without truncation is a real anomaly.
      if (!budget.truncated) unclosed += 1;
      return;
    }
    if (points.length >= 6) contours.push(points);
  };

  // Pass A: outer cycles are identified by their topmost E edge.
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const above = row - width;
    for (let x = 0; x < width; x += 1) {
      if (mask[row + x] !== 1) continue;
      if (y > 0 && mask[above + x] === 1) continue;
      if (budget.truncated) return { contours, unclosed };
      if (usedNodes[y * columns + x] & (1 << DIR_E)) continue;
      traceFrom(x, y, DIR_E);
    }
  }

  // Pass B: hole cycles are identified by their topmost W edge (the bottom side
  // of a solid pixel that sits directly above the hole).
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (mask[row + x] !== 1) continue;
      if (y + 1 < height && mask[row + width + x] === 1) continue;
      if (budget.truncated) return { contours, unclosed };
      const nodeX = x + 1;
      const nodeY = y + 1;
      if (usedNodes[nodeY * columns + nodeX] & (1 << DIR_W)) continue;
      traceFrom(nodeX, nodeY, DIR_W);
    }
  }

  return { contours, unclosed };
}

/* ------------------------------------------------------- path construction */

function buildLayerPaths(contours, { stride, width, height, minArea, tolerance }) {
  const areaScale = stride * stride;
  const outers = [];
  const holes = [];

  for (const points of contours) {
    const signed = signedAreaFlat(points);
    if (signed === 0) continue;
    const bounds = polygonBoundsFlat(points);
    const entry = {
      points,
      absArea: Math.abs(signed) * areaScale,
      bounds,
    };
    if (signed > 0) outers.push(entry);
    else holes.push(entry);
  }

  outers.sort(compareContours);
  holes.sort(compareContours);

  // minArea drops small outer contours (noise specks). Holes are kept with
  // their parent instead of being filtered by their own area, so a small
  // counter in a letter stays a hole rather than disappearing.
  const keptOuters = outers.filter((outer) => outer.absArea >= minArea);
  if (!keptOuters.length) return [];

  const groups = keptOuters.map((outer) => ({ outer, holes: [] }));
  for (const hole of holes) {
    const probeX = hole.points[0];
    const probeY = hole.points[1];
    let best = -1;
    for (let i = 0; i < keptOuters.length; i += 1) {
      if (!pointInPolygonFlat(probeX, probeY, keptOuters[i].points)) continue;
      if (best === -1 || keptOuters[i].absArea < keptOuters[best].absArea) best = i;
    }
    if (best >= 0) groups[best].holes.push(hole);
    // An unattached "hole" can only come from a contour that was filtered out
    // as noise; it is dropped with its parent.
  }

  const paths = [];
  for (const group of groups) {
    const outerPoints = orientPolygon(
      removeCollinear(simplifyClosed(group.outer.points, tolerance)),
      true,
    );
    if (outerPoints.length < 6) continue;
    const outerD = serializePolygon(outerPoints, stride, width, height);
    if (!outerD) continue;
    const segments = [outerD];
    let holeCount = 0;
    let holeArea = 0;
    for (const hole of group.holes) {
      const holePoints = orientPolygon(
        removeCollinear(simplifyClosed(hole.points, tolerance)),
        false,
      );
      if (holePoints.length < 6) continue;
      const holeD = serializePolygon(holePoints, stride, width, height);
      if (!holeD) continue;
      segments.push(holeD);
      holeCount += 1;
      holeArea += hole.absArea;
    }

    paths.push({
      d: segments.join(""),
      area: roundArea(Math.max(0, group.outer.absArea - holeArea)),
      holes: holeCount,
    });
  }

  return paths;
}

function compareContours(a, b) {
  return (
    b.absArea - a.absArea ||
    a.bounds.minY - b.bounds.minY ||
    a.bounds.minX - b.bounds.minX ||
    a.bounds.maxY - b.bounds.maxY ||
    a.bounds.maxX - b.bounds.maxX
  );
}

function comparePaths(a, b) {
  if (b.area !== a.area) return b.area - a.area;
  return a.d < b.d ? -1 : a.d > b.d ? 1 : 0;
}

function capPathCount(layers, maxPaths, warnings) {
  let total = 0;
  for (const layer of layers) total += layer.paths.length;
  if (total <= maxPaths) return;

  const entries = [];
  layers.forEach((layer, layerIndex) => {
    layer.paths.forEach((path, pathIndex) => {
      entries.push({ layerIndex, pathIndex, path });
    });
  });
  entries.sort(
    (a, b) =>
      b.path.area - a.path.area ||
      a.layerIndex - b.layerIndex ||
      a.pathIndex - b.pathIndex,
  );
  const kept = new Set(entries.slice(0, maxPaths).map((entry) => entry.path));

  const keptLayers = [];
  for (const layer of layers) {
    const paths = layer.paths.filter((path) => kept.has(path));
    if (paths.length) keptLayers.push({ ...layer, paths });
  }
  layers.length = 0;
  layers.push(...keptLayers);
  warnings.push(
    `Path count capped at maxPaths=${maxPaths}; kept the ${maxPaths} largest contours.`,
  );
}

/* ---------------------------------------------------------------- geometry */

function signedAreaFlat(points) {
  const length = points.length;
  let sum = 0;
  let px = points[length - 2];
  let py = points[length - 1];
  for (let i = 0; i + 1 < length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    sum += px * y - x * py;
    px = x;
    py = y;
  }
  return sum / 2;
}

function polygonBoundsFlat(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Ray casting on a flat lattice polygon; used to attach each hole to its outer. */
function pointInPolygonFlat(px, py, points) {
  let inside = false;
  const count = points.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const xi = points[i * 2];
    const yi = points[i * 2 + 1];
    const xj = points[j * 2];
    const yj = points[j * 2 + 1];
    if (
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function reverseFlat(points) {
  const reversed = [];
  for (let i = points.length - 2; i >= 0; i -= 2) {
    reversed.push(points[i], points[i + 1]);
  }
  return reversed;
}

/** Guarantees the spec orientation: outer clockwise, holes counter-clockwise. */
function orientPolygon(points, clockwise) {
  const signed = signedAreaFlat(points);
  if (signed === 0) return points;
  return signed > 0 === clockwise ? points : reverseFlat(points);
}

/**
 * Closed-polygon RDP: split the loop at the point farthest from the first
 * vertex, simplify both chains, then stitch them back together.
 */
function simplifyClosed(points, tolerance) {
  const count = points.length / 2;
  if (count <= 3 || tolerance <= 0) return points.slice();

  const originX = points[0];
  const originY = points[1];
  let far = 0;
  let farDistance = -1;
  for (let i = 1; i < count; i += 1) {
    const dx = points[i * 2] - originX;
    const dy = points[i * 2 + 1] - originY;
    const distance = dx * dx + dy * dy;
    if (distance > farDistance) {
      farDistance = distance;
      far = i;
    }
  }
  if (far <= 0) return points.slice();

  const head = rdpFlat(points, 0, far, tolerance);
  const tailPoints = flatSlice(points, far, count);
  tailPoints.push(originX, originY);
  const tail = rdpFlat(tailPoints, 0, tailPoints.length / 2 - 1, tolerance);

  // head ends at `far`; tail starts at `far` (dropped) and ends at the origin
  // (also dropped, because the loop closes implicitly). `head` keeps the origin
  // as its first vertex, so every retained vertex appears exactly once.
  const merged = head.concat(tail.slice(2, tail.length - 2));
  return merged.length >= 6 ? merged : points.slice();
}

function rdpFlat(points, first, last, tolerance) {
  const count = last - first + 1;
  if (count <= 2) return flatSlice(points, first, last + 1);

  const toleranceSquared = tolerance * tolerance;
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack = [[first, last]];

  while (stack.length) {
    const [start, end] = stack.pop();
    const ax = points[start * 2];
    const ay = points[start * 2 + 1];
    const bx = points[end * 2];
    const by = points[end * 2 + 1];
    let maxDistance = -1;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i += 1) {
      const distance = pointSegmentDistanceSquared(
        points[i * 2],
        points[i * 2 + 1],
        ax,
        ay,
        bx,
        by,
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    if (maxIndex !== -1 && maxDistance > toleranceSquared) {
      keep[maxIndex - first] = 1;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }

  const simplified = [];
  for (let i = 0; i < count; i += 1) {
    if (!keep[i]) continue;
    simplified.push(points[(first + i) * 2], points[(first + i) * 2 + 1]);
  }
  return simplified;
}

function flatSlice(points, from, toExclusive) {
  const slice = [];
  for (let i = from; i < toExclusive; i += 1) {
    slice.push(points[i * 2], points[i * 2 + 1]);
  }
  return slice;
}

function pointSegmentDistanceSquared(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = ax + t * dx - px;
  const qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

/**
 * Removes vertices that are exactly collinear with their neighbours. RDP keeps
 * the loop's anchor vertex, which often sits on an edge — this pass drops those
 * redundant points so a rectangle really is four vertices.
 */
function removeCollinear(points) {
  const count = points.length / 2;
  if (count <= 3) return points;
  const kept = [];
  for (let i = 0; i < count; i += 1) {
    const prev = (i + count - 1) % count;
    const next = (i + 1) % count;
    const ax = points[prev * 2];
    const ay = points[prev * 2 + 1];
    const bx = points[i * 2];
    const by = points[i * 2 + 1];
    const cx = points[next * 2];
    const cy = points[next * 2 + 1];
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (cross !== 0) kept.push(bx, by);
  }
  return kept.length >= 6 ? kept : points;
}

/**
 * Serializes one loop as an absolute `M/L/Z` subpath.
 *
 * Coordinates are mapped back to the original pixel space and clamped to the
 * bitmap rectangle: with integer sampling the last sampled cell can overshoot
 * the source edge by up to `stride - 1` px, and a path must never reference a
 * coordinate outside the image. Clamping is a no-op for full-resolution traces
 * (coords are already 0..width / 0..height).
 */
function serializePolygon(points, stride, maxX, maxY) {
  const format = (value) => {
    if (Number.isInteger(value)) return value === 0 ? "0" : String(value);
    return String(Math.round(value * 100) / 100);
  };
  const clamp = (value, max) => {
    const scaled = value * stride;
    if (scaled < 0) return 0;
    if (scaled > max) return max;
    return scaled;
  };

  const coords = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = clamp(points[i], maxX);
    const y = clamp(points[i + 1], maxY);
    const lastX = coords.length >= 2 ? coords[coords.length - 2] : null;
    const lastY = coords.length >= 2 ? coords[coords.length - 1] : null;
    if (lastX === x && lastY === y) continue; // clamping can fold vertices together
    coords.push(x, y);
  }
  if (
    coords.length >= 4 &&
    coords[0] === coords[coords.length - 2] &&
    coords[1] === coords[coords.length - 1]
  ) {
    coords.length -= 2;
  }
  if (coords.length < 4) return ""; // fewer than two distinct vertices: nothing to draw

  let d = `M${format(coords[0])},${format(coords[1])}`;
  for (let i = 2; i + 1 < coords.length; i += 2) {
    d += `L${format(coords[i])},${format(coords[i + 1])}`;
  }
  return `${d}Z`;
}

/* ------------------------------------------------------------------ output */

function rgbToHex(r, g, b) {
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
}

function hexByte(value) {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped < 16 ? `0${clamped.toString(16)}` : clamped.toString(16);
}

function roundArea(area) {
  return Math.round(area * 100) / 100;
}
