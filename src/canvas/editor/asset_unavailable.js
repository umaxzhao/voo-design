/**
 * Unavailable-asset layer of the bitmap cache: the standard placeholder glyph
 * and the cross-document registry of failed asset keys.
 *
 * A picture whose blob is gone (404 / deleted / quota) must stay visible and
 * recoverable instead of vanishing: the cache draws this placeholder in the
 * node's box, while `isAssetFailed`/`retryAssetLoad` let the layer panel offer
 * a reload without threading the engine's cache instance through components.
 *
 * Pure logic — zero React dependencies.
 *
 * @module editor/asset_unavailable
 */

/** A placeholder never needs more pixels than this; it is vector-simple. */
const PLACEHOLDER_MAX = 1024;

/** Live cache records able to answer `hasFailed`/`retry` for one asset key. */
const liveCaches = new Set();

export function registerUnavailableCache(record) {
  liveCaches.add(record);
  return () => liveCaches.delete(record);
}

/** True while any open document still has this asset marked failed. */
export function isAssetFailed(assetKey) {
  if (!assetKey) return false;
  for (const cache of liveCaches) {
    if (cache.hasFailed(assetKey)) return true;
  }
  return false;
}

/**
 * Re-tries a failed asset load in every open document holding it.
 * Resolves true when at least one instance recovered the real bitmap.
 */
export function retryAssetLoad(assetKey) {
  if (!assetKey) return Promise.resolve(false);
  const jobs = [];
  for (const cache of liveCaches) {
    if (cache.hasFailed(assetKey)) jobs.push(cache.retry(assetKey));
  }
  if (jobs.length === 0) return Promise.resolve(false);
  return Promise.all(jobs).then((results) => results.some(Boolean));
}

export function isAssetPlaceholder(bitmap) {
  return Boolean(bitmap?.__assetPlaceholder);
}

/**
 * Draws the standard missing-asset glyph — frame, sun and ridge, centred and
 * scaled to the surface — into a 2d context.
 */
export function drawAssetPlaceholder(ctx, width, height) {
  const size = Math.max(16, Math.min(width, height) * 0.6);
  const x = (width - size) / 2;
  const y = (height - size) / 2;
  const radius = size * 0.12;
  ctx.save();
  ctx.fillStyle = "rgba(100, 116, 139, 0.18)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.9)";
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, size, size, radius);
  else ctx.rect(x, y, size, size);
  ctx.fill();
  ctx.stroke();
  // Sun.
  ctx.beginPath();
  ctx.arc(x + size * 0.31, y + size * 0.32, size * 0.11, 0, Math.PI * 2);
  ctx.stroke();
  // Ridge, ending at the lower-right corner of the frame.
  ctx.beginPath();
  ctx.moveTo(x + size * 0.16, y + size * 0.78);
  ctx.lineTo(x + size * 0.42, y + size * 0.5);
  ctx.lineTo(x + size * 0.62, y + size * 0.7);
  ctx.lineTo(x + size * 0.84, y + size * 0.42);
  ctx.stroke();
  ctx.restore();
}

/**
 * A placeholder bitmap sized to the node's document box (a placeholder built
 * at the box aspect stays undistorted through the renderer's stretch). In a
 * headless environment this is a plain `{ __assetPlaceholder }` stand-in with
 * the same reported dimensions.
 */
export function createAssetPlaceholder(node) {
  const width = Math.max(
    16,
    Math.min(PLACEHOLDER_MAX, Math.round(node?.width ?? 256)),
  );
  const height = Math.max(
    16,
    Math.min(PLACEHOLDER_MAX, Math.round(node?.height ?? 256)),
  );
  if (
    typeof document !== "undefined" &&
    typeof document.createElement === "function"
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx =
      typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    if (ctx) {
      drawAssetPlaceholder(ctx, width, height);
      canvas.__assetPlaceholder = true;
      canvas.naturalWidth = width;
      canvas.naturalHeight = height;
      return canvas;
    }
  }
  return {
    __assetPlaceholder: true,
    width,
    height,
    naturalWidth: width,
    naturalHeight: height,
  };
}
