/**
 * Runner functions for applying adjustments on CPU with resolution caching.
 */

import { buildToneLut } from "./tone_lut.js";
import { applyAdjustmentKernels } from "./cpu_adjustments_kernels.js";

const adjustmentCache = new WeakMap();

/**
 * How many resolutions one tone signature may keep canvases for. One per
 * preview zoom is the steady state; the cap stops a long zoom-through of a
 * big image from banking a canvas per step — the point of the cache is to
 * skip rework, not to eat the heap.
 */
const MAX_CACHED_RESOLUTIONS = 4;

export function invalidateAdjustmentCache(source) {
  if (source) adjustmentCache.delete(source);
}

/**
 * The CPU adjustment path.
 *
 * Kept as the fallback for machines (or moments) without a WebGL2 context —
 * see `gl_adjustments.js` for the path that normally runs. Both read the same
 * tone LUT, so they agree on colour to within float/integer rounding.
 *
 * `renderOptions.targetWidth/targetHeight` run the pixel work at a preview
 * resolution instead of the bitmap's natural one — the same scheduling the
 * GPU path already does via `targetPixelSize`. Callers on the GL-less path
 * can pass the camera-sized target too; anything omitted, over the natural
 * size, or non-numeric falls back to natural resolution. The cache keeps one
 * canvas per resolution under the current tone signature, so a zoom slider
 * reworking the same tone does not throw away the full-size result.
 */
export function applyAdjustments(source, adjustments, renderOptions) {
  if (!source || !adjustments) return source;

  const tone = buildToneLut(adjustments);
  if (!tone.active) return source;

  const naturalWidth = source.naturalWidth ?? source.width;
  const naturalHeight = source.naturalHeight ?? source.height;
  if (!naturalWidth || !naturalHeight || typeof document === "undefined")
    return source;

  const width =
    typeof renderOptions?.targetWidth === "number"
      ? Math.max(
          1,
          Math.min(naturalWidth, Math.round(renderOptions.targetWidth)),
        )
      : naturalWidth;
  const height =
    typeof renderOptions?.targetHeight === "number"
      ? Math.max(
          1,
          Math.min(naturalHeight, Math.round(renderOptions.targetHeight)),
        )
      : naturalHeight;

  const cachedEntry = adjustmentCache.get(source);
  if (cachedEntry?.signature === tone.signature) {
    const cachedCanvas = cachedEntry.canvases.get(`${width}x${height}`);
    if (cachedCanvas) return cachedCanvas;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  applyAdjustmentKernels(imageData.data, width, height, naturalWidth, tone);
  ctx.putImageData(imageData, 0, 0);

  // Same tone, new resolution: keep the resolutions already worked for this
  // signature. A different tone starts the map fresh — stale pixels must not
  // survive a slider move, and the oldest resolutions go first so a zoom
  // sweep cannot bank canvases without bound.
  const canvases =
    cachedEntry?.signature === tone.signature
      ? cachedEntry.canvases
      : new Map();
  canvases.set(`${width}x${height}`, canvas);
  while (canvases.size > MAX_CACHED_RESOLUTIONS) {
    canvases.delete(canvases.keys().next().value);
  }
  adjustmentCache.set(source, { signature: tone.signature, canvases });
  return canvas;
}

/**
 * Applies adjustments to an existing HTML5 2D canvas context in-place (or its underlying pixels).
 * Used by Adjustment Layer rendering to filter the composite beneath it.
 */
export function applyAdjustmentsToCanvas(canvas, adjustments) {
  if (!canvas || !adjustments) return;
  const tone = buildToneLut(adjustments);
  if (!tone.active) return;

  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  applyAdjustmentKernels(imageData.data, width, height, width, tone);
  ctx.putImageData(imageData, 0, 0);
}
