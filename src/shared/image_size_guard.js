import { emitPersistenceAlert } from "../canvas/editor/editor_persist_events.js";

/**
 * Soft limits for decode/upload so a single huge bitmap cannot OOM the
 * renderer. Kept separate from the GL texture budget so CPU decode paths can
 * share the same numbers.
 */

/** ~64 megapixels — above this we refuse decode/place rather than thrash. */
export const MAX_DECODE_PIXELS = 64_000_000;

/** Per-side cap; matches common WebGL MAX_TEXTURE_SIZE floors. */
export const MAX_DECODE_DIMENSION = 8192;

/**
 * @param {number} width
 * @param {number} height
 * @param {{ maxPixels?: number, maxDimension?: number }} [limits]
 * @returns {{ ok: true } | { ok: false, code: string, message: string, width: number, height: number, pixels: number }}
 */
export function checkImageDimensions(
  width,
  height,
  { maxPixels = MAX_DECODE_PIXELS, maxDimension = MAX_DECODE_DIMENSION } = {},
) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return {
      ok: false,
      code: "image-invalid-size",
      message: `Invalid image dimensions: ${width}×${height}`,
      width: w,
      height: h,
      pixels: 0,
    };
  }
  if (w > maxDimension || h > maxDimension) {
    return {
      ok: false,
      code: "image-too-large",
      message: `Image ${Math.round(w)}×${Math.round(h)} exceeds max dimension ${maxDimension}`,
      width: w,
      height: h,
      pixels: w * h,
    };
  }
  const pixels = w * h;
  if (pixels > maxPixels) {
    return {
      ok: false,
      code: "image-too-large",
      message: `Image ${Math.round(w)}×${Math.round(h)} (${Math.round(pixels)} px) exceeds max ${maxPixels} px`,
      width: w,
      height: h,
      pixels,
    };
  }
  return { ok: true };
}

export function assertImageDimensions(width, height, limits) {
  const result = checkImageDimensions(width, height, limits);
  if (!result.ok) {
    if (result.code === "image-too-large") emitPersistenceAlert({ type: "image-too-large" });
    const error = new Error(result.message);
    error.code = result.code;
    error.width = result.width;
    error.height = result.height;
    error.pixels = result.pixels;
    throw error;
  }
  return result;
}
