/**
 * The outline of a pixel mask, as polygons.
 *
 * A pixel selection is stored as alpha, but marching ants are a *stroke* — so
 * the boundary has to become geometry once, when the selection is made, rather
 * than being re-derived from pixels on every frame. What comes back is a list
 * of closed rings in mask coordinates, ready for the renderer to transform and
 * dash.
 *
 * The boundary is followed along pixel edges rather than interpolated
 * (marching squares), which is what Photoshop's ants do too: the outline sits
 * exactly on the pixel grid, so at high zoom it reads as stair-steps and never
 * drifts half a pixel off the thing it is describing.
 */

/** Beyond this many pixels on the long edge, trace a scaled-down copy. */
const TRACE_MAX_EDGE = 1024;

/**
 * Nearest-neighbour downscale of an alpha plane.
 *
 * The ants only have to be right on screen, and tracing a 4000px mask produces
 * tens of thousands of segments to stitch. Sampling the source keeps both the
 * work and the resulting polygon small; the caller scales the points back.
 */
function downsample(alpha, width, height, scale) {
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));
  const out = new Float32Array(outWidth * outHeight);
  for (let y = 0; y < outHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < outWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(x / scale));
      out[y * outWidth + x] = alpha[sourceY * width + sourceX];
    }
  }
  return { alpha: out, width: outWidth, height: outHeight };
}

/** `x,y` as one integer, so segment endpoints can key a Map. */
const keyOf = (x, y, stride) => y * stride + x;

/**
 * Every boundary edge of the thresholded mask, as lattice segments.
 *
 * A pixel that is inside contributes the edge it shares with each neighbour
 * that is outside — including the four edges of the image itself, so a
 * selection running off the side still closes. Each edge is emitted wound so
 * that the inside stays on its left, which is what lets the stitcher below
 * follow a ring without ever having to guess a direction.
 */
function boundaryEdges(alpha, width, height, threshold) {
  const inside = (x, y) =>
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height &&
    alpha[y * width + x] >= threshold;

  const edges = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!inside(x, y)) continue;
      // Top edge: left-to-right leaves the pixel below, on the left.
      if (!inside(x, y - 1)) edges.push([x, y, x + 1, y]);
      // Right edge, downwards.
      if (!inside(x + 1, y)) edges.push([x + 1, y, x + 1, y + 1]);
      // Bottom edge, right-to-left.
      if (!inside(x, y + 1)) edges.push([x + 1, y + 1, x, y + 1]);
      // Left edge, upwards.
      if (!inside(x - 1, y)) edges.push([x, y + 1, x, y]);
    }
  }
  return edges;
}

/**
 * Drops points that only continue a straight run.
 *
 * Pixel boundaries are overwhelmingly long horizontal and vertical runs, so
 * this is where nearly all of the point count goes — a plain rectangle comes
 * out of the stitcher as hundreds of unit steps and leaves here as four
 * corners.
 */
function dropCollinear(ring) {
  if (ring.length < 3) return ring;
  const out = [];
  for (let i = 0; i < ring.length; i += 1) {
    const previous = ring[(i - 1 + ring.length) % ring.length];
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    const cross =
      (current[0] - previous[0]) * (next[1] - current[1]) -
      (current[1] - previous[1]) * (next[0] - current[0]);
    if (cross !== 0) out.push(current);
  }
  return out.length >= 3 ? out : ring;
}

/**
 * Smooths a polygon ring with iterative Laplacian corner smoothing.
 * Eliminates staircase pixel grid artefacts on curved/diagonal boundaries.
 */
export function smoothRing(ring, iterations = 2) {
  if (!ring || ring.length <= 4) return ring;
  let current = ring;
  for (let iter = 0; iter < iterations; iter += 1) {
    const next = [];
    const len = current.length;
    for (let i = 0; i < len; i += 1) {
      const prev = current[(i - 1 + len) % len];
      const curr = current[i];
      const nxt = current[(i + 1) % len];
      // 3-point weighted Laplacian smoothing for closed loop
      const x = 0.25 * prev[0] + 0.5 * curr[0] + 0.25 * nxt[0];
      const y = 0.25 * prev[1] + 0.5 * curr[1] + 0.25 * nxt[1];
      next.push([x, y]);
    }
    current = next;
  }
  return current;
}

/**
 * Closed outlines of everything the mask selects.
 *
 * @param {Float32Array|Uint8ClampedArray} alpha one value per pixel, row-major.
 *   Values are compared against `threshold` as-is, so pass 0..1 floats with a
 *   0..1 threshold, or 0..255 bytes with a 0..255 one.
 * @param {number} width mask width in pixels.
 * @param {number} height mask height in pixels.
 * @param {{threshold?: number, maxEdge?: number, smooth?: number}} [options]
 * @returns {Array<Array<[number, number]>>} rings in mask pixel coordinates,
 *   each closed implicitly (the last point joins the first).
 */
export function traceMaskContours(alpha, width, height, options = {}) {
  const { threshold = 0.5, maxEdge = TRACE_MAX_EDGE, smooth = 0 } = options;
  if (!(width > 0) || !(height > 0) || !alpha?.length) return [];

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const source =
    scale < 1
      ? downsample(alpha, width, height, scale)
      : { alpha, width, height };

  const edges = boundaryEdges(
    source.alpha,
    source.width,
    source.height,
    threshold,
  );
  if (edges.length === 0) return [];

  // Lattice coordinates run one past the pixel grid on each axis.
  const stride = source.width + 1;
  /** Start point -> the edges leaving it, consumed as rings are walked. */
  const leaving = new Map();
  for (const edge of edges) {
    const key = keyOf(edge[0], edge[1], stride);
    const list = leaving.get(key);
    if (list) list.push(edge);
    else leaving.set(key, [edge]);
  }

  const rings = [];
  for (const edge of edges) {
    // Each edge belongs to exactly one ring; skip the ones already walked.
    const startList = leaving.get(keyOf(edge[0], edge[1], stride));
    if (!startList || !startList.includes(edge)) continue;

    const ring = [];
    let current = edge;
    // A ring cannot be longer than the edge set that produced it; the bound
    // stops a malformed mask from spinning here forever.
    for (let step = 0; step <= edges.length; step += 1) {
      ring.push([current[0], current[1]]);
      const fromKey = keyOf(current[0], current[1], stride);
      const fromList = leaving.get(fromKey);
      if (fromList) {
        const index = fromList.indexOf(current);
        if (index !== -1) fromList.splice(index, 1);
        if (fromList.length === 0) leaving.delete(fromKey);
      }
      const nextList = leaving.get(keyOf(current[2], current[3], stride));
      if (!nextList || nextList.length === 0) break;
      // Several edges can leave one lattice point where corners touch; taking
      // the first keeps the walk deterministic and still closes every ring.
      current = nextList[0];
      if (current[0] === edge[0] && current[1] === edge[1]) break;
    }
    if (ring.length >= 3) {
      const simplified = dropCollinear(ring);
      rings.push(smooth > 0 ? smoothRing(simplified, smooth) : simplified);
    }
  }

  if (scale < 1) {
    const inverse = 1 / scale;
    return rings.map((ring) =>
      ring.map(([x, y]) => [x * inverse, y * inverse]),
    );
  }
  return rings;
}

/**
 * The alpha plane of an RGBA buffer, as 0..1 floats.
 *
 * Both the matting output and a mask canvas arrive as RGBA; the outline only
 * ever cares about the fourth channel.
 */
export function alphaFromRgba(rgba, width, height) {
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = rgba[i * 4 + 3] / 255;
  return alpha;
}

/** Axis-aligned bounds of traced rings, or null when there are none. */
export function contourBounds(rings) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
