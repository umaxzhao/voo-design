/**
 * Matte compositing and caching for the CPU adjustment path.
 */

const compositeCache = new WeakMap();
const bitmapVersions = new WeakMap();

function bitmapVersion(bitmap) {
  return bitmapVersions.get(bitmap) ?? 0;
}

/** Drops the cached composite of a matte whose pixels changed in place. */
export function invalidateMatteComposite(matte) {
  compositeCache.delete(matte);
}

/** Marks a bitmap canvas mutated in place so matte composites rebuild. */
export function invalidateBitmapComposite(bitmap) {
  if (!bitmap) return;
  bitmapVersions.set(bitmap, bitmapVersion(bitmap) + 1);
}

/**
 * The bitmap with its alpha matte applied, at natural resolution.
 *
 * `destination-in` keeps only the pixels the matte covers; the matte's own
 * alpha is the coverage, which is exactly what a background-removal cutout
 * encodes. Compositing at natural size (not node size) keeps the result sharp
 * when the node is drawn scaled. The composite is cached: panning and zooming
 * redraw every frame, and recompositing a full-resolution pair each time is
 * the hottest cost in the editor.
 */
export function applyMatte(bitmap, matte) {
  const cached = compositeCache.get(matte);
  const version = bitmapVersion(bitmap);
  if (cached?.bitmap === bitmap && cached.bitmapVersion === version)
    return cached.canvas;

  const width = bitmap.naturalWidth ?? bitmap.width;
  const height = bitmap.naturalHeight ?? bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const matteCtx = canvas.getContext("2d");
  matteCtx.drawImage(bitmap, 0, 0);
  matteCtx.globalCompositeOperation = "destination-in";
  matteCtx.drawImage(matte, 0, 0, width, height);
  compositeCache.set(matte, { bitmap, bitmapVersion: version, canvas });
  return canvas;
}
