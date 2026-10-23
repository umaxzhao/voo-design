/**
 * Pure dirty-rect helpers for partial stage repaints.
 *
 * Callers that know which region of the document actually changed (a preview
 * stroke, a dragged handle) can pass that region to the render path so the
 * stage avoids repainting everything. The helpers here only do the math —
 * unioning change regions, clipping them to what the viewport can show, and
 * converting world-space changes into device-pixel clip rectangles.
 *
 * Coordinate model (same as the editor's viewport):
 *   screen = world * zoom + pan
 *   device = screen * dpr
 */

const NBSP = 1e-9;

/**
 * The area share a dirty region may cover before a partial repaint costs more
 * than simply repainting the whole stage.
 */
export const DIRTY_RECT_MAX_AREA_RATIO = 0.5;

/** Units a dirty rect is expressed in: world (document) or device pixels. */
export const DIRTY_UNIT = { WORLD: "world", DEVICE: "device" };

/**
 * Union of two rects, or the non-null one when exactly one is given,
 * or null when both are missing.
 */
export function unionRect(a, b) {
  if (!a) return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
  if (!b) return { x: a.x, y: a.y, width: a.width, height: a.height };
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Union of a list of rects (dynamic rectangles feed it), or null when the
 * list is empty — which means "nothing changed".
 */
export function unionRects(rects) {
  let out = null;
  const list = Array.isArray(rects) ? rects : rects ? [rects] : [];
  for (let i = 0; i < list.length; i += 1) {
    const rect = list[i];
    if (
      !rect ||
      !Number.isFinite(rect.x + rect.y + rect.width + rect.height) ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      continue;
    }
    out = unionRect(out, rect);
  }
  return out;
}

/** Intersection of two rects, or null when they do not overlap. */
export function intersectRects(a, b) {
  if (!a || !b) return null;
  const minX = Math.max(a.x, b.x);
  const minY = Math.max(a.y, b.y);
  const maxX = Math.min(a.x + a.width, b.x + b.width);
  const maxY = Math.min(a.y + a.height, b.y + b.height);
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= NBSP || height <= NBSP) return null;
  return { x: minX, y: minY, width, height };
}

/**
 * World-space rect in device pixels, clipped to the canvas backing store.
 * Returns null when the rect is entirely outside the canvas.
 *
 * `screenWidth`/`screenHeight` are CSS pixels; the device clip is bounded by
 * `screenWidth * dpr` × `screenHeight * dpr`.
 */
export function worldToDeviceRect(rect, viewport, dpr, screenWidth, screenHeight) {
  if (!rect || !viewport || !(dpr > 0) || !(screenWidth > 0) || !(screenHeight > 0)) {
    return null;
  }
  const zoom = viewport.zoom || 1;
  const panX = viewport.panX || 0;
  const panY = viewport.panY || 0;
  const minX = rect.x * zoom + panX;
  const minY = rect.y * zoom + panY;
  const maxX = (rect.x + rect.width) * zoom + panX;
  const maxY = (rect.y + rect.height) * zoom + panY;
  // device pixel bounds, rounded outwards so the clip covers every dirty pixel
  const devMinX = Math.floor(Math.max(0, minX * dpr));
  const devMinY = Math.floor(Math.max(0, minY * dpr));
  const devMaxX = Math.ceil(Math.min(screenWidth, maxX) * dpr);
  const devMaxY = Math.ceil(Math.min(screenHeight, maxY) * dpr);
  const width = devMaxX - devMinX;
  const height = devMaxY - devMinY;
  if (width <= 0 || height <= 0) return null;
  return { x: devMinX, y: devMinY, width, height };
}

/**
 * One device rect covering every dirty rect, clipped to the canvas.
 * Returns null when there is nothing to repaint.
 */
export function dirtyRectsToDevice(rects, viewport, dpr, screenWidth, screenHeight) {
  return worldToDeviceRect(unionRects(rects), viewport, dpr, screenWidth, screenHeight);
}

/** Dirty area as a share of the full device canvas area. */
export function dirtyRectAreaRatio(
  deviceRect,
  screenWidth,
  screenHeight,
  dpr,
) {
  if (!deviceRect) return 1;
  const full = screenWidth * screenHeight * dpr * dpr;
  if (!(full > 0)) return 1;
  return (deviceRect.width * deviceRect.height) / full;
}

/**
 * True when a partial repaint is worth it: the dirty region exists and stays
 * below `ratio` (default 0.5) of the full stage area.
 */
export function shouldUseDirtyRect(deviceRect, screenWidth, screenHeight, dpr, ratio = DIRTY_RECT_MAX_AREA_RATIO) {
  if (!deviceRect) return false;
  return dirtyRectAreaRatio(deviceRect, screenWidth, screenHeight, dpr) < ratio;
}
