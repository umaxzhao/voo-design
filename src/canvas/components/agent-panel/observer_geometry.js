/**
 * Geometry and coordinate mapping helpers for canvas observation.
 *
 * @module agent-panel/observer_geometry
 */

/**
 * Normalizes a region specification into a safe rectangular bounding box.
 *
 * @param {Object} [r]
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function normalizeRegion(r) {
  if (!r || typeof r !== "object") {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: Number(r.x ?? 0),
    y: Number(r.y ?? 0),
    width: Math.max(0, Number(r.width ?? r.w ?? 0)),
    height: Math.max(0, Number(r.height ?? r.h ?? 0)),
  };
}

/**
 * Checks whether two axis-aligned bounding boxes intersect.
 *
 * @param {{ x: number, y: number, width: number, height: number }} a
 * @param {{ x: number, y: number, width: number, height: number }} b
 * @returns {boolean}
 */
export function isBoxIntersecting(a, b) {
  if (!a || !b) return false;
  const aLeft = a.x;
  const aTop = a.y;
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;

  const bLeft = b.x;
  const bTop = b.y;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;

  return !(aRight <= bLeft || aLeft >= bRight || aBottom <= bTop || aTop >= bBottom);
}

/**
 * Calculates union bounding box across multiple object summaries.
 *
 * @param {Array<Object>} summaries
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function unionBox(summaries) {
  if (!Array.isArray(summaries) || summaries.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const obj of summaries) {
    const b = obj?.box || obj;
    if (!b || typeof b !== "object") continue;
    minX = Math.min(minX, Number(b.x ?? 0));
    minY = Math.min(minY, Number(b.y ?? 0));
    maxX = Math.max(maxX, Number(b.x ?? 0) + Math.max(0, Number(b.width ?? b.w ?? 0)));
    maxY = Math.max(maxY, Number(b.y ?? 0) + Math.max(0, Number(b.height ?? b.h ?? 0)));
  }
  return {
    x: Number.isFinite(minX) ? minX : 0,
    y: Number.isFinite(minY) ? minY : 0,
    width: Number.isFinite(maxX - minX) ? Math.max(0, maxX - minX) : 0,
    height: Number.isFinite(maxY - minY) ? Math.max(0, maxY - minY) : 0,
  };
}

/**
 * Maps a pixel in the observed crop screenshot back to canvas coordinates.
 *
 * @param {{ x: number, y: number, u?: number, v?: number }} pixel - Pixel in crop image (u, v)
 * @param {{ x: number, y: number }} crop - Crop origin in canvas coordinates
 * @param {number} [scale=1] - Render scale (pixels per canvas unit)
 * @returns {{ x: number, y: number }} Canvas coordinate
 */
export function cropPixelToCanvas(pixel, crop, scale = 1) {
  if (!crop || !pixel) return { x: 0, y: 0 };
  const s = scale > 0 ? scale : 1;
  const px = Number(pixel.x ?? pixel.u ?? 0);
  const py = Number(pixel.y ?? pixel.v ?? 0);
  return {
    x: crop.x + px / s,
    y: crop.y + py / s,
  };
}

/**
 * Maps a canvas coordinate to pixel coordinates in the observed crop screenshot.
 *
 * @param {{ x: number, y: number }} canvasCoord - Canvas coordinate (x, y)
 * @param {{ x: number, y: number }} crop - Crop origin in canvas coordinates
 * @param {number} [scale=1] - Render scale (pixels per canvas unit)
 * @returns {{ x: number, y: number }} Pixel coordinate in the crop image
 */
export function canvasToCropPixel(canvasCoord, crop, scale = 1) {
  if (!crop || !canvasCoord) return { x: 0, y: 0 };
  const s = scale > 0 ? scale : 1;
  const cx = Number(canvasCoord.x ?? 0);
  const cy = Number(canvasCoord.y ?? 0);
  return {
    x: (cx - crop.x) * s,
    y: (cy - crop.y) * s,
  };
}
