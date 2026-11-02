/**
 * Pure crop geometry solvers — the crop tool's three modes, numeric size
 * entry, and the "straighten" mapping, all as pure functions node:test can
 * drive directly (no DOM/React).
 *
 * Everything here stays NON-DESTRUCTIVE: it only computes a crop rectangle
 * ({x,y,width,height} in document space). The crop tool records that rect as
 * `doc.crop`, a viewport; no pixel is ever deleted (see editor_crop.js).
 */

export const CROP_MIN_SIZE = 1;

/** Clamps a rect to a page and enforces the minimum size, mirroring editor_crop. */
export function clampCropRect(rect, page, { minSize = CROP_MIN_SIZE } = {}) {
  const pageRight = page.x + page.width;
  const pageBottom = page.y + page.height;
  const x = Math.max(page.x, Math.min(rect.x, pageRight - minSize));
  const y = Math.max(page.y, Math.min(rect.y, pageBottom - minSize));
  const width = Math.max(minSize, Math.min(rect.width, pageRight - x));
  const height = Math.max(minSize, Math.min(rect.height, pageBottom - y));
  return { x, y, width, height };
}

/** Normalizes a numeric size entry into a crop rect (top-left anchored). */
export function cropRectFromSize(
  width,
  height,
  { page, minSize = CROP_MIN_SIZE } = {},
) {
  return clampCropRect(
    { x: page.x, y: page.y, width: Number(width), height: Number(height) },
    page,
    { minSize },
  );
}

/** The largest axis-aligned rectangle inscribed in a rotated rectangle. */
function largestInscribedRect(width, height, th) {
  const cosT = Math.cos(th);
  const sinT = Math.sin(th);
  const c = width / 2;
  const d = height / 2;
  // Constraints: u·cosT + v·sinT ≤ c  and  u·sinT + v·cosT ≤ d  (u,v ≥ 0).
  const lines = [
    [cosT, sinT, c],
    [sinT, cosT, d],
  ];
  const candidates = [];
  const intersect = (l1, l2) => {
    const det = l1[0] * l2[1] - l1[1] * l2[0];
    if (Math.abs(det) < 1e-12) return null; // parallel
    const u = (l1[2] * l2[1] - l1[1] * l2[2]) / det;
    const v = (l1[0] * l2[2] - l1[2] * l2[0]) / det;
    return [u, v];
  };
  const feasible = (u, v) =>
    u >= -1e-9 &&
    v >= -1e-9 &&
    lines.every(([a, b, mm]) => a * u + b * v <= mm + 1e-9);
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const pt = intersect(lines[i], lines[j]);
      if (pt && feasible(pt[0], pt[1])) candidates.push(pt);
    }
  }
  // Axis intercepts (u=0 or v=0) are also vertices; the AM-GM midpoint on each
  // active constraint beats a bare axis intercept for area, so add those too.
  for (const [a, b, mm] of lines) {
    const u = mm / (2 * a);
    const v = mm / (2 * b);
    if (feasible(u, v)) candidates.push([u, v]);
  }
  let best = null;
  let bestArea = -1;
  for (const [u, v] of candidates) {
    const area = u * v;
    if (area > bestArea) {
      bestArea = area;
      best = [u, v];
    }
  }
  if (!best) return { width: 0, height: 0 };
  return { width: best[0] * 2, height: best[1] * 2 };
}

/**
 * Maps a "straighten" angle to the crop rect: the largest axis-aligned
 * rectangle still fully inside the page after it is rotated by `angleDeg`.
 * Centered on the page; at 0° it is the page itself.
 */
export function straightenCropRect(
  page,
  angleDeg,
  { minSize = CROP_MIN_SIZE } = {},
) {
  let a = ((Math.abs(Number(angleDeg) || 0) % 90) + 90) % 90;
  if (a > 45) a = 90 - a;
  const th = (a * Math.PI) / 180;
  const inner = largestInscribedRect(page.width, page.height, th);
  const width = Math.max(minSize, inner.width);
  const height = Math.max(minSize, inner.height);
  const x = page.x + (page.width - width) / 2;
  const y = page.y + (page.height - height) / 2;
  return { x, y, width, height };
}
