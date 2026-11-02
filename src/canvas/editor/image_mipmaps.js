/**
 * Power-of-two mip levels for bitmaps drawn far below their natural size.
 *
 * At zoom < 0.5 the stage paints a 4000px bitmap into a few hundred device
 * pixels, and the browser still walks and filters every source pixel each
 * frame. A ready-made downscaled canvas cuts that per-frame cost, and a
 * stepwise halve keeps the downscale free of aliasing.
 *
 * The cache here is an LRU `image → mip` map with its own byte budget; it is
 * wired into the bitmap cache so mips die with the bitmap they derive from.
 */

/** Below this display scale a mip pays for itself. */
export const MIP_SCALE_THRESHOLD = 0.5;

/** Do not downscale any side below this; tiny bitmaps are cheap as they are. */
export const MIP_MIN_SIDE = 16;

/** Mip cache default budget. */
export const MIP_CACHE_BYTE_BUDGET = 64 * 1024 * 1024;
export const MIP_CACHE_MAX_ENTRIES = 64;

export function bitmapWidth(image) {
  return image?.naturalWidth || image?.width || 0;
}

export function bitmapHeight(image) {
  return image?.naturalHeight || image?.height || 0;
}

export function mipBytes(image, factor) {
  return (
    Math.max(1, Math.round(bitmapWidth(image) / factor)) *
    Math.max(1, Math.round(bitmapHeight(image) / factor)) *
    4
  );
}

/**
 * The power-of-two downscale factor for `image` painted at display `scale`
 * (device pixels per source pixel), or 1 when no mip is worth building.
 * The factor never overshoots 1/scale and keeps every side >= MIP_MIN_SIDE.
 */
export function getMipLevel(image, scale) {
  const width = bitmapWidth(image);
  const height = bitmapHeight(image);
  const s = Number(scale);
  if (!(width > 0) || !(height > 0) || !(s > 0) || s >= MIP_SCALE_THRESHOLD) {
    return 1;
  }
  let factor = 1;
  while (
    factor * 2 <= 1 / s + 1e-9 &&
    width / (factor * 2) >= MIP_MIN_SIDE &&
    height / (factor * 2) >= MIP_MIN_SIDE
  ) {
    factor *= 2;
  }
  return factor;
}

function defaultCreateCanvas(width, height) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function downscaleBy(image, factor, createCanvas) {
  const width = Math.max(1, Math.round(bitmapWidth(image) / factor));
  const height = Math.max(1, Math.round(bitmapHeight(image) / factor));
  const canvas = createCanvas(width, height);
  if (!canvas) return null;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
}

/**
 * A canvas holding `image` downscaled by `factor` (a power of two). Big
 * factors halve step by step; each step filters from an already-smooth
 * source, so a 16× downscale looks like a mip chain rather than a decimated
 * nearest-neighbour sample.
 *
 * `createCanvas` is injectable so tests can run without a DOM; it must
 * return a canvas-like object with a 2d context.
 */
export function buildMip(image, factor, createCanvas = defaultCreateCanvas) {
  if (!image || !(factor > 1)) return null;
  if (bitmapWidth(image) <= 0 || bitmapHeight(image) <= 0) return null;
  let current = image;
  let remaining = factor;
  while (remaining > 2) {
    const half = downscaleBy(current, 2, createCanvas);
    if (!half) return null;
    current = half;
    remaining /= 2;
  }
  return downscaleBy(current, remaining, createCanvas);
}

/**
 * LRU cache of mips keyed by the source bitmap object, bounded by bytes and
 * entry count. Keying by bitmap (not id) means bitmaps reused across keys
 * share their mip and invalidated bitmaps cannot serve stale mips.
 */
export function createMipCache({
  maxBytes = MIP_CACHE_BYTE_BUDGET,
  maxEntries = MIP_CACHE_MAX_ENTRIES,
} = {}) {
  /** image object → { factor, canvas, bytes }; Map order is the LRU order. */
  const entries = new Map();
  let bytes = 0;
  let builds = 0;
  let evictions = 0;

  function dropOldest() {
    const image = entries.keys().next().value;
    const entry = entries.get(image);
    entries.delete(image);
    bytes -= entry.bytes;
    evictions += 1;
  }

  function get(image, factor) {
    const entry = entries.get(image);
    if (!entry || entry.factor !== factor) return null;
    // touch: reuse order
    entries.delete(image);
    entries.set(image, entry);
    return entry.canvas;
  }

  function put(image, factor, canvas) {
    if (!image || !canvas) return null;
    const prev = entries.get(image);
    if (prev) {
      bytes -= prev.bytes;
      entries.delete(image);
    }
    const entry = { factor, canvas, bytes: mipBytes(image, factor) };
    entries.set(image, entry);
    bytes += entry.bytes;
    while (entries.size > maxEntries || bytes > maxBytes) {
      dropOldest();
    }
    return canvas;
  }

  function invalidate(image) {
    const entry = entries.get(image);
    if (!entry) return false;
    entries.delete(image);
    bytes -= entry.bytes;
    return true;
  }

  function clear() {
    entries.clear();
    bytes = 0;
  }

  return {
    get,
    put,
    invalidate,
    clear,
    stats: () => ({ entries: entries.size, bytes, builds, evictions }),
    countBuild: () => {
      builds += 1;
    },
  };
}

/**
 * Returns a mip for `image` at display `scale`, building and caching it on
 * the first miss. Null when no mip is needed or the bitmap cannot be
 * downscaled (no canvas support) — callers draw the full bitmap instead.
 */
export function getMip(mipCache, image, scale, createCanvas = defaultCreateCanvas) {
  if (!mipCache || !image) return null;
  const factor = getMipLevel(image, scale);
  if (!(factor > 1)) return null;
  const cached = mipCache.get(image, factor);
  if (cached) return cached;
  const mip = buildMip(image, factor, createCanvas);
  if (!mip) return null;
  mipCache.put(image, factor, mip);
  mipCache.countBuild();
  return mip;
}
