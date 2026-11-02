/** Pure geometric and bezier calculations for pen paths and anchor points. */

/** How close a click must land to the first anchor to close the path. */
export const CLOSE_THRESHOLD = 8;
/** Drags shorter than this leave the anchor straight. */
export const HANDLE_THRESHOLD = 4;
/** How finely a segment is sampled when hit-testing an add-anchor click. */
export const SEGMENT_SAMPLES = 16;

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** The close snap radius in doc units: a constant 8 screen px at any zoom. */
export function closeRadius(getZoom) {
  return CLOSE_THRESHOLD / (getZoom?.() || 1);
}

/**
 * The segment hit radius for insert/bend/cut, doc units: a constant 10
 * screen px at any zoom, never tighter than the doc-space default — a 1px
 * hairline is otherwise near-impossible to grab when zoomed out.
 */
export function segmentHitRadius(getZoom) {
  return Math.max(CLOSE_THRESHOLD, 10 / (getZoom?.() || 1));
}

/**
 * Snaps `point` onto the nearest 45° ray from `origin`, keeping its distance —
 * Figma's Shift constraint, the same math for placing an anchor (relative to
 * the previous one) and for pulling a handle (relative to its anchor).
 */
export function constrainAngle45(origin, point) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: point.x, y: point.y };
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: origin.x + Math.cos(angle) * length,
    y: origin.y + Math.sin(angle) * length,
  };
}

/** A cubic bezier point at parameter t (control points in order). */
export function cubicPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [
    w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0],
    w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1],
  ];
}

/**
 * The closest point on a path's outline to a local-space point: the segment
 * index, the parameter along it, the distance and the projection itself.
 * Straight segments are projected analytically; curved ones are sampled,
 * because on a strongly curved segment the bezier can sit tens of pixels off
 * the chord between its anchors.
 */
export function projectOntoPath(points, local) {
  let best = null;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a.out && !b.in) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      let t =
        lengthSq > 0
          ? ((local.x - a.x) * dx + (local.y - a.y) * dy) / lengthSq
          : 0;
      t = Math.min(1, Math.max(0, t));
      const x = a.x + t * dx;
      const y = a.y + t * dy;
      const d = Math.hypot(local.x - x, local.y - y);
      if (!best || d < best.dist) best = { index: i, t, dist: d, x, y };
      continue;
    }
    const p1 = a.out ? [a.x + a.out[0], a.y + a.out[1]] : [a.x, a.y];
    const p2 = b.in ? [b.x + b.in[0], b.y + b.in[1]] : [b.x, b.y];
    for (let s = 0; s < SEGMENT_SAMPLES; s += 1) {
      const t = (s + 0.5) / SEGMENT_SAMPLES;
      const [x, y] = cubicPoint([a.x, a.y], p1, p2, [b.x, b.y], t);
      const d = Math.hypot(local.x - x, local.y - y);
      if (!best || d < best.dist) best = { index: i, t, dist: d, x, y };
    }
  }
  return best;
}

/**
 * de Casteljau-split of segment i at parameter t: the left anchor's new out
 * handle, the mid anchor (both handles) and the right anchor's new in handle,
 * so the two halves trace the original curve exactly. Missing handles
 * collapse to their anchor, so straight segments split the same way.
 */
export function splitSegment(points, i, t) {
  const p0 = points[i];
  const p3 = points[i + 1];
  const p1 = p0.out ? [p0.x + p0.out[0], p0.y + p0.out[1]] : [p0.x, p0.y];
  const p2 = p3.in ? [p3.x + p3.in[0], p3.y + p3.in[1]] : [p3.x, p3.y];
  const lerp = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const a1 = lerp([p0.x, p0.y], p1);
  const b1 = lerp(p1, p2);
  const c1 = lerp(p2, [p3.x, p3.y]);
  const a2 = lerp(a1, b1);
  const b2 = lerp(b1, c1);
  const q = lerp(a2, b2);
  return {
    left: { ...p0, out: [a1[0] - p0.x, a1[1] - p0.y] },
    mid: {
      x: q[0],
      y: q[1],
      in: [a2[0] - q[0], a2[1] - q[1]],
      out: [b2[0] - q[0], b2[1] - q[1]],
    },
    right: { ...p3, in: [c1[0] - p3.x, c1[1] - p3.y] },
  };
}

/**
 * The handle pair that makes segment a→b pass through P at parameter t —
 * the bend tool's math. Solves the *quadratic* through-point problem first
 * (one control point, exact), then degree-elevates to a cubic, which traces
 * the identical curve. All coordinates node-local; handles come back as
 * offsets relative to their anchor. Returns null at the degenerate t ≈ 0/1.
 */
export function bendHandlesThrough(a, b, t, P) {
  const u = 1 - t;
  const denom = 2 * t * u;
  if (denom < 1e-9) return null;
  const qx = (P.x - u * u * a.x - t * t * b.x) / denom;
  const qy = (P.y - u * u * a.y - t * t * b.y) / denom;
  return {
    out: [(2 / 3) * (qx - a.x), (2 / 3) * (qy - a.y)],
    in: [(2 / 3) * (qx - b.x), (2 / 3) * (qy - b.y)],
  };
}

/**
 * The indices of a pen node's anchors whose doc-space position falls inside
 * the (axis-aligned, doc-space) rect — the lasso's hit test.
 */
export function anchorsInRect(node, rect) {
  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const picked = [];
  node.points.forEach((anchor, index) => {
    const x = node.x + anchor.x * scaleX;
    const y = node.y + anchor.y * scaleY;
    if (x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1) {
      picked.push(index);
    }
  });
  return picked;
}

/**
 * The point lists a cut at segment `index`, parameter t produces.
 * An open path becomes two open chains ([firstHalf, secondHalf]); a closed
 * path becomes a single open chain whose ends both sit at the cut. Handles
 * are split with de Casteljau, so each side keeps the original curve's shape.
 */
export function cutPathPoints(points, index, t, closed) {
  const { left, mid, right } = splitSegment(points, index, t);
  const cutStart = {
    x: mid.x,
    y: mid.y,
    in: null,
    out: mid.out,
    close: false,
  };
  const cutEnd = {
    x: mid.x,
    y: mid.y,
    in: mid.in,
    out: null,
    close: false,
  };
  const open = (anchor) => ({ ...anchor, close: false });
  if (!closed) {
    return [
      [...points.slice(0, index).map(open), open(left), cutEnd],
      [cutStart, open(right), ...points.slice(index + 2).map(open)],
    ];
  }
  // Closed: unwrap the ring into one open chain starting at the cut. The
  // former closing segment (last → first) becomes an ordinary internal one,
  // keeping its handles.
  return [
    [
      cutStart,
      open(right),
      ...points.slice(index + 2).map(open),
      ...points.slice(0, index).map(open),
      open(left),
      cutEnd,
    ],
  ];
}

/**
 * Samples a pen node's outline into a document-space contour ring, the same
 * geometry the renderer strokes: straight segments between anchors, cubic
 * segments sampled through their control handles. A closed path comes back as
 * one ring; an open one is closed with a straight edge so it can become a
 * selection or a filled shape without a seam.
 *
 * @param {object} node a pen path node (kind PATH, pen true).
 * @param {number} [samples=16] samples per cubic segment.
 * @returns {Array<[number, number]>} doc-space ring of [x, y] pairs.
 */
export function penContourRing(node, samples = SEGMENT_SAMPLES) {
  const points = node.points;
  if (!points?.length) return [];
  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const P = (anchor) => ({
    x: node.x + anchor.x * scaleX,
    y: node.y + anchor.y * scaleY,
  });
  const ring = [];
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    if (index === points.length - 1 && !points[points.length - 1]?.close) {
      // Open path: the closing edge is a straight line back to the start.
      ring.push([P(from).x, P(from).y], [P(points[0]).x, P(points[0]).y]);
      break;
    }
    if (from.out || to.in) {
      // Control points are offsets in node-local units, scaled like anchors.
      const a = P(from);
      const c1x = node.x + (from.x + (from.out?.[0] ?? 0)) * scaleX;
      const c1y = node.y + (from.y + (from.out?.[1] ?? 0)) * scaleY;
      const c2x = node.x + (to.x + (to.in?.[0] ?? 0)) * scaleX;
      const c2y = node.y + (to.y + (to.in?.[1] ?? 0)) * scaleY;
      const b = P(to);
      for (let s = 0; s < samples; s += 1) {
        const t = s / samples;
        const [x, y] = cubicPoint(
          [a.x, a.y],
          [c1x, c1y],
          [c2x, c2y],
          [b.x, b.y],
          t,
        );
        ring.push([x, y]);
      }
    } else {
      const a = P(from);
      ring.push([a.x, a.y]);
    }
  }
  return ring;
}
