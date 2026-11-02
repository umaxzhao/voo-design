/** Bounded ROI geometry and buffer extraction for Magnetic Lasso. */

export const MAGNETIC_LASSO_LIMITS = Object.freeze({
  MAX_ROI_PIXELS: 65_536,
  DEFAULT_SEARCH_RADIUS: 64,
  DEFAULT_TARGET_RADIUS: 6,
  MAX_PATH_POINTS: 65_536,
});

export const MAGNETIC_LASSO_SETTINGS = Object.freeze({
  width: Object.freeze({ defaultValue: 64, min: 8, max: 512, step: 1 }),
  contrast: Object.freeze({ defaultValue: 50, min: 0, max: 100, step: 1 }),
  frequency: Object.freeze({ defaultValue: 57, min: 0, max: 100, step: 1 }),
  CLOSE_RADIUS_CSS_PX: 16,
  MIN_CONTOUR_AREA: 4,
});

export function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

export function finitePoint(point, name) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    throw new TypeError(`${name} must contain finite x and y coordinates`);
  }
  return point;
}

export function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Returns a square search window around an anchor with a hard pixel budget.
 * The radius is reduced before image-bound clipping, so a later anchor moving
 * away from an image edge can never expand the allocation above the budget.
 */
export function clampLiveWireRoi({
  anchor,
  imageWidth,
  imageHeight,
  requestedRadius = MAGNETIC_LASSO_LIMITS.DEFAULT_SEARCH_RADIUS,
  maxPixels = MAGNETIC_LASSO_LIMITS.MAX_ROI_PIXELS,
}) {
  positiveInteger(imageWidth, "imageWidth");
  positiveInteger(imageHeight, "imageHeight");
  positiveInteger(maxPixels, "maxPixels");
  finitePoint(anchor, "anchor");
  if (!Number.isFinite(requestedRadius) || requestedRadius < 0) {
    throw new RangeError("requestedRadius must be a non-negative number");
  }

  const requested = Math.floor(requestedRadius);
  const maxSide = Math.max(1, Math.floor(Math.sqrt(maxPixels)));
  const budgetRadius = Math.max(0, Math.floor((maxSide - 1) / 2));
  const radius = Math.min(requested, budgetRadius);
  const centerX = clampInteger(anchor.x, 0, imageWidth - 1);
  const centerY = clampInteger(anchor.y, 0, imageHeight - 1);
  const x = Math.max(0, centerX - radius);
  const y = Math.max(0, centerY - radius);
  const right = Math.min(imageWidth - 1, centerX + radius);
  const bottom = Math.min(imageHeight - 1, centerY + radius);
  const width = right - x + 1;
  const height = bottom - y + 1;
  const pixelCount = width * height;

  if (pixelCount > maxPixels) {
    throw new RangeError("Live Wire ROI exceeded its hard pixel budget");
  }

  return Object.freeze({
    x,
    y,
    width,
    height,
    pixelCount,
    radius,
    requestedRadius: requested,
    limitApplied: radius < requested,
    anchor: Object.freeze({ x: centerX - x, y: centerY - y }),
  });
}

/** Copies one bounded rectangle from a full RGBA buffer. */
export function extractRgbaRoi(rgba, imageWidth, imageHeight, roi) {
  positiveInteger(imageWidth, "imageWidth");
  positiveInteger(imageHeight, "imageHeight");
  if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray)) {
    throw new TypeError("rgba must be a Uint8Array or Uint8ClampedArray");
  }
  if (rgba.length !== imageWidth * imageHeight * 4) {
    throw new RangeError("rgba length does not match the image dimensions");
  }
  const x = positiveInteger(roi?.x + 1, "roi.x + 1") - 1;
  const y = positiveInteger(roi?.y + 1, "roi.y + 1") - 1;
  const width = positiveInteger(roi?.width, "roi.width");
  const height = positiveInteger(roi?.height, "roi.height");
  if (x + width > imageWidth || y + height > imageHeight) {
    throw new RangeError("ROI must stay inside the source image");
  }

  const output = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * imageWidth + x) * 4;
    const sourceEnd = sourceStart + width * 4;
    output.set(rgba.subarray(sourceStart, sourceEnd), row * width * 4);
  }
  return output;
}
