/**
 * Spline evaluation and curve lookup tables for tone mapping.
 *
 * Evaluates monotone cubic splines (Fritsch-Carlson) and bakes them into
 * 256-element LUTs. Pure maths: no canvas, no GL, no React.
 */

/**
 * Evaluates a monotone cubic spline (Fritsch-Carlson) for a given x in [0, 1].
 */
export function evaluateMonotoneCubicSpline(points, x) {
  if (!points || points.length === 0) return x;
  const valid = points.filter(
    (p) =>
      p &&
      typeof p === "object" &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y),
  );
  if (valid.length === 0) return x;
  if (valid.length === 1) return valid[0].y;

  const sorted = [...valid].sort((a, b) => a.x - b.x);
  const pts = [];
  for (const p of sorted) {
    if (pts.length === 0 || Math.abs(pts[pts.length - 1].x - p.x) > 1e-6) {
      pts.push(p);
    } else {
      pts[pts.length - 1] = p;
    }
  }
  if (pts.length === 1) return pts[0].y;
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;

  const n = pts.length;
  const dx = [];
  const dy = [];
  const slope = [];

  for (let i = 0; i < n - 1; i++) {
    const dxi = pts[i + 1].x - pts[i].x;
    const dyi = pts[i + 1].y - pts[i].y;
    dx.push(dxi);
    dy.push(dyi);
    slope.push(dxi === 0 ? 0 : dyi / dxi);
  }

  const m = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (slope[i - 1] + slope[i]) / 2;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const alpha = m[i] / slope[i];
      const beta = m[i + 1] / slope[i];
      const dist = alpha * alpha + beta * beta;
      if (dist > 9) {
        const tau = 3 / Math.sqrt(dist);
        m[i] = tau * alpha * slope[i];
        m[i + 1] = tau * beta * slope[i];
      }
    }
  }

  let k = 0;
  for (let i = 0; i < n - 1; i++) {
    if (x >= pts[i].x && x <= pts[i + 1].x) {
      k = i;
      break;
    }
  }

  const h = dx[k];
  if (h === 0) return pts[k].y;
  const t = (x - pts[k].x) / h;
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  const y =
    h00 * pts[k].y + h10 * h * m[k] + h01 * pts[k + 1].y + h11 * h * m[k + 1];

  return Math.max(0, Math.min(1, y));
}

/**
 * Pre-computes a 256-element LUT for a curve channel.
 */
export function buildCurveLUT(points) {
  const lut = new Uint8Array(256);
  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    (points.length === 2 &&
      points[0].x === 0 &&
      points[0].y === 0 &&
      points[1].x === 1 &&
      points[1].y === 1)
  ) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  const sorted = [...points].sort((a, b) => a.x - b.x);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const y = evaluateMonotoneCubicSpline(sorted, x);
    lut[i] = Math.max(0, Math.min(255, Math.round(y * 255)));
  }
  return lut;
}

/** True when a channel's points differ from the identity ramp. */
export function hasCustomCurve(points) {
  return (
    Array.isArray(points) &&
    (points.length !== 2 ||
      points[0].x !== 0 ||
      points[0].y !== 0 ||
      points[1].x !== 1 ||
      points[1].y !== 1)
  );
}

/** Compact structural key for one curve channel. */
export function curveSignature(points) {
  if (!Array.isArray(points)) return "-";
  let out = "";
  for (const point of points) out += `${point.x},${point.y};`;
  return out;
}
