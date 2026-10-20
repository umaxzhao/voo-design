/**
 * Image Pyramid (Mipmap / LOD) subsystem for the Image Editor.
 *
 * Provides discrete multi-resolution tiers for large images to eliminate
 * GPU texture bandwidth and rasterization bottlenecks during viewport pan
 * and zoom.
 *
 * Design contracts:
 * 1. Single source of truth: PYRAMID_TIERS defines the downsampling scales,
 *    tier levels, and display scale selection thresholds in one table. Both
 *    the pyramid builder and the runtime tier selector read from it.
 * 2. Invalidation on edit: Paint strokes and in-flight operations edit Level 0
 *    directly. Downsampled tiers are marked dirty and only rebuilt after
 *    the stroke commits or on idle, avoiding per-dab downsampling overhead.
 * 3. Memory & 32MP Cap coordination: Level 0 is the workBitmap (already bounded
 *    by workspace_cap.js to <= 32MP). Downsampled tiers add at most ~31.25%
 *    memory overhead (1/4 + 1/16) and are stored in a WeakMap keyed by the
 *    source bitmap so they garbage-collect automatically with the node.
 */

/**
 * Single source of truth for pyramid levels, scales, and selection thresholds.
 *
 * - scale: resolution multiplier relative to Level 0 (1.0 = native, 0.5 = half, 0.25 = quarter).
 * - minDisplayScale: on-screen ratio threshold (displayPixels / naturalPixels) above which this tier is selected.
 */
export const PYRAMID_TIERS = Object.freeze([
  {
    level: 0,
    scale: 1.0,
    // Level 0 (native resolution) is chosen when on-screen scale >= 0.70 (close to 1:1 or zoomed in)
    minDisplayScale: 0.7,
  },
  {
    level: 1,
    scale: 0.5,
    // Level 1 (50% scale, 25% pixels) is chosen when 0.35 <= on-screen scale < 0.70
    minDisplayScale: 0.35,
  },
  {
    level: 2,
    scale: 0.25,
    // Level 2 (25% scale, 6.25% pixels) is chosen when on-screen scale < 0.35
    minDisplayScale: 0.0,
  },
]);

export const PYRAMID_SETTINGS = Object.freeze({
  /** Minimum dimension (width or height) to activate multi-level pyramid.
   * Images under 1536px (e.g. 1024px) are already lightweight and skip tiers. */
  MIN_ACTIVATION_EDGE: 1536,
  /** Minimum pixel dimension for any generated tier to avoid over-shrinking. */
  MIN_TIER_DIMENSION: 384,
});

/**
 * WeakMap holding cached pyramid tiers.
 * Key: CanvasImageSource (HTMLCanvasElement | ImageBitmap | HTMLImageElement)
 * Value: { levels: Map<number, CanvasImageSource>, dirty: boolean, naturalWidth: number, naturalHeight: number }
 */
const pyramidCache = new WeakMap();

/**
 * Returns the pyramid tier matching the given on-screen display scale.
 *
 * @param {number} naturalWidth
 * @param {number} naturalHeight
 * @param {number} onScreenScale - display pixels / natural pixels
 * @returns {typeof PYRAMID_TIERS[number]}
 */
export function selectPyramidTier(naturalWidth, naturalHeight, onScreenScale) {
  const maxEdge = Math.max(naturalWidth, naturalHeight);
  if (maxEdge < PYRAMID_SETTINGS.MIN_ACTIVATION_EDGE) {
    return PYRAMID_TIERS[0];
  }
  for (let i = 0; i < PYRAMID_TIERS.length; i++) {
    const tier = PYRAMID_TIERS[i];
    if (onScreenScale >= tier.minDisplayScale) {
      if (
        tier.level > 0 &&
        maxEdge * tier.scale < PYRAMID_SETTINGS.MIN_TIER_DIMENSION
      ) {
        continue;
      }
      return tier;
    }
  }
  return PYRAMID_TIERS[PYRAMID_TIERS.length - 1];
}

/**
 * Builds a downsampled canvas from an existing source canvas or bitmap.
 */
function buildDownsampledCanvas(source, targetWidth, targetHeight) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetWidth));
  canvas.height = Math.max(1, Math.round(targetHeight));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Ensures downsampled pyramid tiers are constructed and cached for a source bitmap.
 * Can be called eagerly upon opening a large image or lazily during render.
 *
 * @param {CanvasImageSource} source - The base working resolution image
 * @returns {Map<number, CanvasImageSource>|null} map of level -> CanvasImageSource
 */
export function ensureImagePyramid(source) {
  if (!source) return null;
  const width = source.naturalWidth ?? source.width ?? 0;
  const height = source.naturalHeight ?? source.height ?? 0;
  if (width <= 0 || height <= 0) return null;

  let entry = pyramidCache.get(source);
  if (!entry) {
    entry = {
      levels: new Map([[0, source]]),
      naturalWidth: width,
      naturalHeight: height,
      dirty: false,
    };
    pyramidCache.set(source, entry);
  }

  // If already populated and not marked dirty, return cached levels
  if (!entry.dirty && entry.levels.size > 1) {
    return entry.levels;
  }

  const maxEdge = Math.max(width, height);
  if (maxEdge < PYRAMID_SETTINGS.MIN_ACTIVATION_EDGE) {
    return entry.levels;
  }

  // Build cascaded downsampling: Level 1 from Level 0, Level 2 from Level 1
  let prevSource = source;
  for (let i = 1; i < PYRAMID_TIERS.length; i++) {
    const tier = PYRAMID_TIERS[i];
    const targetW = Math.round(width * tier.scale);
    const targetH = Math.round(height * tier.scale);
    if (Math.max(targetW, targetH) < PYRAMID_SETTINGS.MIN_TIER_DIMENSION) {
      break;
    }
    const downsampled = buildDownsampledCanvas(prevSource, targetW, targetH);
    if (downsampled) {
      entry.levels.set(tier.level, downsampled);
      prevSource = downsampled;
    }
  }

  entry.dirty = false;
  return entry.levels;
}

/**
 * Invalidates cached downsampled tiers for a source (e.g. when paint strokes mutate the canvas).
 *
 * @param {CanvasImageSource} source
 */
export function invalidateImagePyramid(source) {
  if (!source) return;
  const entry = pyramidCache.get(source);
  if (entry) {
    for (const key of entry.levels.keys()) {
      if (key !== 0) entry.levels.delete(key);
    }
    entry.dirty = true;
  }
}

/**
 * Retrieves the optimal pyramid tier for the given display conditions.
 *
 * @param {CanvasImageSource} source - The base working bitmap
 * @param {Object} [options]
 * @param {number} [options.onScreenScale=1] - Ratio of on-screen display pixels to natural image pixels
 * @param {boolean} [options.fullResolution=false] - If true, always returns Level 0 (native resolution)
 * @returns {{ source: CanvasImageSource, level: number, scale: number }}
 */
export function getPyramidSource(
  source,
  { onScreenScale = 1, fullResolution = false } = {},
) {
  if (!source) return { source, level: 0, scale: 1.0 };
  const naturalWidth = source.naturalWidth ?? source.width ?? 0;
  const naturalHeight = source.naturalHeight ?? source.height ?? 0;

  if (
    fullResolution ||
    Math.max(naturalWidth, naturalHeight) < PYRAMID_SETTINGS.MIN_ACTIVATION_EDGE
  ) {
    return { source, level: 0, scale: 1.0 };
  }

  const tier = selectPyramidTier(naturalWidth, naturalHeight, onScreenScale);
  if (tier.level === 0) {
    return { source, level: 0, scale: 1.0 };
  }

  const levels = ensureImagePyramid(source);
  const tierSource = levels?.get(tier.level) ?? source;
  return {
    source: tierSource,
    level: tier.level,
    scale: tier.scale,
  };
}

/**
 * Drops all pyramid levels and frees associated GPU textures if a renderer is provided.
 *
 * @param {CanvasImageSource} source
 * @param {Object} [glRenderer] - Optional glAdjustments instance exposing .release()
 */
export function releaseImagePyramid(source, glRenderer = null) {
  if (!source) return;
  const entry = pyramidCache.get(source);
  if (entry) {
    if (glRenderer?.release) {
      for (const [lvl, tierCanvas] of entry.levels.entries()) {
        if (lvl !== 0 && tierCanvas) {
          glRenderer.release(tierCanvas);
        }
      }
    }
    entry.levels.clear();
    entry.dirty = true;
  }
}
