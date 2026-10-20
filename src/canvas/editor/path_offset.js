/**
 * Outline offset (outset / inset) for closed pen paths.
 *
 * The curve is flattened into a dense polyline, each vertex is pushed along
 * the outward normal (miter joins, bevel past the miter limit), and the
 * offset ring is simplified back to anchors. The result carries no handles:
 * the offset curve is approximated by straight segments within the simplify
 * tolerance. Pure geometry: no DOM, no document state.
 */

import { simplifyPenPoints } from "./scene_model_paths.js";

/** Samples per cubic segment when flattening the source curve. */
export const OFFSET_SAMPLES_PER_SEGMENT = 16;
/** Max deviation (document units) allowed when simplifying the offset ring. */
export const OFFSET_SIMPLIFY_TOLERANCE = 0.2;
/** Miter ratio above which a corner falls back to a bevel (SVG default 4). */
export const OFFSET_MITER_LIMIT = 4;

const EPSILON = 1e-9;

/** Why an offset was refused. Callers must surface these, never swallow them. */
export const OFFSET_FAILURE = Object.freeze({
  OPEN_PATH: "OPEN_PATH",
  TOO_FEW_ANCHORS: "TOO_FEW_ANCHORS",
  INVALID_DISTANCE: "INVALID_DISTANCE",
  FOLDED: "FOLDED",
  NOT_PATH: "NOT_PATH",
  TRANSFORMED: "TRANSFORMED",
});

/** A bezier control point: the anchor offset by its handle, or the anchor itself. */
function handlePoint(anchor, handle) {
  if (!handle) return { x: anchor.x, y: anchor.y };
  return { x: anchor.x + handle[0], y: anchor.y + handle[1] };
}

/** Point on the cubic p0→p3 (handles p1, p2) at parameter t. */
function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Drops consecutive duplicates, including a last point equal to the first. */
function dedupeRing(points) {
  const ring = [];
  for (const point of points) {
    const last = ring[ring.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > EPSILON) {
      ring.push(point);
    }
  }
  while (
    ring.length > 1 &&
    Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) <=
      EPSILON
  ) {
    ring.pop();
  }
  return ring;
}

/**
 * Flattens every segment of a closed anchor list into one ring. Straight
 * segments (no handles on either end) contribute only their start anchor:
 * sampling them would add vertices whose offsets fold back past the corner.
 */
function flattenClosedAnchors(anchors) {
  const ring = [];
  const count = anchors.length;
  for (let i = 0; i < count; i += 1) {
    const from = anchors[i];
    const to = anchors[(i + 1) % count];
    if (!from.out && !to.in) {
      ring.push({ x: from.x, y: from.y });
      continue;
    }
    const p0 = handlePoint(from, null);
    const p1 = handlePoint(from, from.out);
    const p2 = handlePoint(to, to.in);
    const p3 = handlePoint(to, null);
    for (let s = 0; s < OFFSET_SAMPLES_PER_SEGMENT; s += 1) {
      ring.push(cubicAt(p0, p1, p2, p3, s / OFFSET_SAMPLES_PER_SEGMENT));
    }
  }
  return dedupeRing(ring);
}

/** Shoelace area: positive when the ring winds counter-clockwise in y-up maths. */
function signedArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

/**
 * Unit normal of every edge (ring[i] → ring[i+1]), pointing outward.
 * The left normal (−dy, dx) points into a positively wound shape, so it is
 * flipped when the area is positive.
 */
function outwardEdgeNormals(ring, area) {
  const side = area > 0 ? -1 : 1;
  return ring.map((p, i) => {
    const q = ring[(i + 1) % ring.length];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const length = Math.hypot(dx, dy);
    return [(side * -dy) / length, (side * dx) / length];
  });
}

/**
 * Moves every ring vertex by `distance` along its two adjacent edge normals.
 * Returns one group of points per source vertex: a single mitred point, or
 * two bevel points where the normals diverge past the miter limit.
 */
function offsetRingGroups(ring, distance, miterLimit) {
  const normals = outwardEdgeNormals(ring, signedArea(ring));
  const count = ring.length;
  const groups = [];
  for (let i = 0; i < count; i += 1) {
    const p = ring[i];
    const a = normals[(i - 1 + count) % count];
    const b = normals[i];
    const cosine = a[0] * b[0] + a[1] * b[1];
    const denominator = 1 + cosine;
    const miterRatio =
      denominator > EPSILON ? Math.sqrt(2 / denominator) : Infinity;
    if (miterRatio > miterLimit) {
      groups.push([
        { x: p.x + a[0] * distance, y: p.y + a[1] * distance },
        { x: p.x + b[0] * distance, y: p.y + b[1] * distance },
      ]);
    } else {
      groups.push([
        {
          x: p.x + ((a[0] + b[0]) / denominator) * distance,
          y: p.y + ((a[1] + b[1]) / denominator) * distance,
        },
      ]);
    }
  }
  return groups;
}

/**
 * True when some offset edge runs against its source edge. A naive vertex
 * offset folds back on itself once the distance exceeds a feature's size, and
 * the folded loop still has the same winding, so area alone misses it.
 */
function offsetFolds(ring, groups) {
  const count = ring.length;
  for (let i = 0; i < count; i += 1) {
    const from = groups[i][groups[i].length - 1];
    const to = groups[(i + 1) % count][0];
    const source = ring[(i + 1) % count];
    const sourceX = source.x - ring[i].x;
    const sourceY = source.y - ring[i].y;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx * dx + dy * dy < EPSILON) continue;
    if (dx * sourceX + dy * sourceY <= 0) return true;
  }
  return false;
}

/** Simplifies the offset ring and closes it back into handle-less anchors. */
function ringToAnchors(ring, tolerance) {
  const chain = [...ring, ring[0]].map((p) => ({ x: p.x, y: p.y, in: null, out: null }));
  const simplified = simplifyPenPoints(chain, tolerance);
  const open = simplified.slice(0, -1);
  return open.map((p, index) => ({
    x: p.x,
    y: p.y,
    in: null,
    out: null,
    close: index === open.length - 1,
  }));
}

/**
 * Offsets a closed anchor list by `distance` (positive outsets, negative insets).
 * Anchors are in one local coordinate space; the caller owns scaling.
 *
 * @param {Array<{x:number,y:number,in?:number[]|null,out?:number[]|null,close?:boolean}>} anchors
 * @param {number} distance
 * @param {{miterLimit?: number, tolerance?: number}} [options]
 * @returns {{ok: true, anchors: Array} | {ok: false, reason: string}}
 */
export function offsetClosedPenAnchors(anchors, distance, options = {}) {
  const miterLimit = options.miterLimit ?? OFFSET_MITER_LIMIT;
  const tolerance = options.tolerance ?? OFFSET_SIMPLIFY_TOLERANCE;
  if (!Number.isFinite(distance) || Math.abs(distance) < EPSILON) {
    return { ok: false, reason: OFFSET_FAILURE.INVALID_DISTANCE };
  }
  if (!Array.isArray(anchors) || anchors.length < 3) {
    return { ok: false, reason: OFFSET_FAILURE.TOO_FEW_ANCHORS };
  }
  if (anchors[anchors.length - 1].close !== true) {
    return { ok: false, reason: OFFSET_FAILURE.OPEN_PATH };
  }

  const ring = flattenClosedAnchors(anchors);
  if (ring.length < 3) {
    return { ok: false, reason: OFFSET_FAILURE.TOO_FEW_ANCHORS };
  }
  const groups = offsetRingGroups(ring, distance, miterLimit);
  if (offsetFolds(ring, groups)) {
    return { ok: false, reason: OFFSET_FAILURE.FOLDED };
  }

  const result = ringToAnchors(groups.flat(), tolerance);
  if (result.length < 3) {
    return { ok: false, reason: OFFSET_FAILURE.FOLDED };
  }
  return { ok: true, anchors: result };
}
