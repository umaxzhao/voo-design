/**
 * Computes and caches the non-transparent (alpha > 0) bounding box of image bitmaps.
 */

const alphaBoundsCache = new WeakMap();

/**
 * Invalidate cached alpha bounds for a bitmap (e.g. after raster editing / erasing).
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} bitmap
 */
export function invalidateBitmapAlphaBounds(bitmap) {
  if (bitmap && typeof bitmap === "object") {
    alphaBoundsCache.delete(bitmap);
  }
}

/**
 * Scans the bitmap for non-transparent pixels (alpha >= alphaThreshold).
 * Returns { x, y, width, height, isOpaqueFull } in bitmap pixel coordinates (0..bw, 0..bh).
 * If the image is fully transparent or cannot be read, returns full bounds { x: 0, y: 0, width: bw, height: bh, isOpaqueFull: true }.
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} bitmap
 * @param {number} [alphaThreshold=1] Minimum alpha value (0..255) to be considered opaque
 * @returns {{ x: number, y: number, width: number, height: number, isOpaqueFull: boolean }|null}
 */
export function getBitmapOpaqueBounds(bitmap, alphaThreshold = 1) {
  if (!bitmap) return null;
  if (alphaBoundsCache.has(bitmap)) {
    return alphaBoundsCache.get(bitmap);
  }

  const bw = bitmap.naturalWidth ?? bitmap.width;
  const bh = bitmap.naturalHeight ?? bitmap.height;
  if (!(bw > 0) || !(bh > 0)) return null;

  try {
    let ctx = null;
    if (typeof bitmap.getContext === "function") {
      ctx = bitmap.getContext("2d", { willReadFrequently: true });
    } else if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(bw, bh);
      ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) ctx.drawImage(bitmap, 0, 0);
    } else if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = bw;
      canvas.height = bh;
      ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) ctx.drawImage(bitmap, 0, 0);
    }
    if (!ctx) return null;

    const imgData = ctx.getImageData(0, 0, bw, bh);
    const data = imgData.data;

    let minY = -1;
    let maxY = -1;
    let minX = -1;
    let maxX = -1;

    // 1. Scan minY (top to bottom)
    for (let y = 0; y < bh; y++) {
      const rowOffset = y * bw * 4;
      for (let x = 0; x < bw; x++) {
        if (data[rowOffset + x * 4 + 3] >= alphaThreshold) {
          minY = y;
          break;
        }
      }
      if (minY !== -1) break;
    }

    // If completely transparent, return full rect
    if (minY === -1) {
      const full = { x: 0, y: 0, width: bw, height: bh, isOpaqueFull: true };
      alphaBoundsCache.set(bitmap, full);
      return full;
    }

    // 2. Scan maxY (bottom to top)
    for (let y = bh - 1; y >= minY; y--) {
      const rowOffset = y * bw * 4;
      for (let x = 0; x < bw; x++) {
        if (data[rowOffset + x * 4 + 3] >= alphaThreshold) {
          maxY = y;
          break;
        }
      }
      if (maxY !== -1) break;
    }

    // 3. Scan minX (left to right) between minY and maxY
    for (let x = 0; x < bw; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (data[y * bw * 4 + x * 4 + 3] >= alphaThreshold) {
          minX = x;
          break;
        }
      }
      if (minX !== -1) break;
    }

    // 4. Scan maxX (right to left) between minY and maxY
    for (let x = bw - 1; x >= minX; x--) {
      for (let y = minY; y <= maxY; y++) {
        if (data[y * bw * 4 + x * 4 + 3] >= alphaThreshold) {
          maxX = x;
          break;
        }
      }
      if (maxX !== -1) break;
    }

    const bounds = {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX + 1),
      height: Math.max(1, maxY - minY + 1),
      isOpaqueFull:
        minX === 0 &&
        minY === 0 &&
        maxX - minX + 1 === bw &&
        maxY - minY + 1 === bh,
    };
    alphaBoundsCache.set(bitmap, bounds);
    return bounds;
  } catch {
    // If security / CORS error occurs, fallback to full bounds
    const fallback = { x: 0, y: 0, width: bw, height: bh, isOpaqueFull: true };
    alphaBoundsCache.set(bitmap, fallback);
    return fallback;
  }
}

/**
 * Returns the effective node representation with `effectiveLocal` populated for image nodes.
 * @param {object} node
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} bitmap
 * @returns {object}
 */
export function resolveEffectiveNode(node, bitmap) {
  if (!node || node.kind !== "image" || !bitmap) return node;
  const opaque = getBitmapOpaqueBounds(bitmap);
  const bw = bitmap.naturalWidth ?? bitmap.width;
  const bh = bitmap.naturalHeight ?? bitmap.height;
  if (!opaque || opaque.isOpaqueFull || !bw || !bh) return node;

  const scaleX = (node.width || bw) / bw;
  const scaleY = (node.height || bh) / bh;

  return {
    ...node,
    effectiveLocal: {
      x: opaque.x * scaleX,
      y: opaque.y * scaleY,
      width: opaque.width * scaleX,
      height: opaque.height * scaleY,
    },
  };
}
