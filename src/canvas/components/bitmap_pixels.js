/**
 * Canvas pixel access shared by the editor's image analysers and pixel edits.
 *
 * Reading a decoded bitmap's bytes means going through a 2D canvas — the only
 * pixel access all three hosts (extension, desktop, hosted web) share. Kept in
 * one module so the auto-enhance sampling, the histogram strip and the AI
 * raster hook all walk the same path, and a change to how a bitmap is measured
 * cannot land in only one of them.
 */

/** The decoded size of a bitmap, or a refusal when it has none yet. */
export function readBitmapSize(bitmap) {
  if (!bitmap) throw new Error("bitmapMissing");
  const width = bitmap.naturalWidth ?? bitmap.width ?? 0;
  const height = bitmap.naturalHeight ?? bitmap.height ?? 0;
  if (!(width > 0) || !(height > 0)) throw new Error("bitmapMissing");
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * The bitmap's pixels as RGBA bytes.
 *
 * `options.maxEdge` caps the longest edge of the sampled copy: a measurement
 * (a histogram, an exposure reading) is the same reading from a 256px preview
 * as from a 6000px original, and the scale is what keeps it cheap. Leave it
 * out when the pixels themselves are the result — a retouch that writes the
 * buffer back needs the layer's real resolution, or the write is a downscale.
 *
 * @param {CanvasImageSource & {naturalWidth?: number, width?: number, height?: number}} bitmap
 * @param {{maxEdge?: number}} [options]
 * @returns {{rgba: Uint8ClampedArray, width: number, height: number, scale: number}}
 */
export function readImageRgba(bitmap, { maxEdge } = {}) {
  const source = readBitmapSize(bitmap);
  if (maxEdge !== undefined) {
    if (typeof maxEdge !== "number" || !Number.isFinite(maxEdge) || maxEdge <= 0) {
      throw new RangeError("readImageRgba: maxEdge must be a positive number");
    }
  }
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(source.width, source.height)) : 1;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);
  return {
    rgba: context.getImageData(0, 0, width, height).data,
    width,
    height,
    scale,
  };
}

/**
 * Decodes a stored source — an object URL, a data URL, or a Blob — into a
 * bitmap, then reads its capped RGBA bytes. `readImageRgba` needs a live
 * `CanvasImageSource`; this is the loader that turns a URL back into one, so
 * callers outside this module never touch `Image`/`createImageBitmap`.
 *
 * @param {string|Blob} source
 * @param {{maxEdge?: number}} [options]
 * @returns {Promise<{rgba: Uint8ClampedArray, width: number, height: number, scale: number}>}
 */
export async function readSourceRgba(source, { maxEdge } = {}) {
  const bitmap = await decodeImageSource(source);
  try {
    return readImageRgba(bitmap, { maxEdge });
  } finally {
    // ImageBitmap owns memory that is not GC'd promptly; HTMLImageElement has
    // no `close`. Optional-call so both decode paths share one branch.
    bitmap.close?.();
  }
}

/** Blob -> ImageBitmap when available; a URL string -> decoded Image element. */
async function decodeImageSource(source) {
  if (typeof source !== "string" && typeof createImageBitmap === "function") {
    return createImageBitmap(source);
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("imageReadFailed"));
    image.src = source;
  });
}

/** Turns an RGBA buffer into the PNG data URL a generated-output call takes. */
export function rgbaToPngDataUrl(rgba, width, height) {
  // `!(x > 0)` rather than `x <= 0`: NaN passes the latter and would encode a
  // zero-sized canvas, which is the one thing this guard exists to prevent.
  if (!(width > 0) || !(height > 0)) {
    throw new RangeError("rgbaToPngDataUrl: width and height must be positive");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas.toDataURL("image/png");
}
