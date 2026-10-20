/**
 * Working-resolution cap for very large pictures.
 *
 * The editor decodes an image into a full-size bitmap and builds the document
 * at that size, so a 8000×8000 picture is ~256MB of pixels and every
 * per-frame operation touches that many — enough to stall open and editing.
 * Above a size budget the workspace is built at a reduced resolution (the
 * preview), while the node keeps its original `imageId` and bytes so an
 * export can still re-decode the full-resolution original. A normal picture
 * (up to the budget, e.g. a 4096×4096) is untouched and stays full resolution.
 */

/** Max pixels the working editor document may hold before it is downscaled. */
export const WORKSPACE_MAX_PIXELS = 32_000_000; // ~32MP (4096×4096 is ~16.7MP)
/** Max long edge the working editor document may hold before downscaling. */
export const WORKSPACE_MAX_EDGE = 8192;

/**
 * Decides the working size for an image of `width`×`height`.
 *
 * Returns the (possibly reduced) document size and the uniform scale factor
 * applied. `capped` is false and `scale` is 1 when the image fits within the
 * budget, so a normal picture keeps full resolution and the editor behaves
 * exactly as before.
 *
 * @returns {{ width: number, height: number, scale: number, capped: boolean }}
 */
export function workPreviewSize(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) return { width: w, height: h, scale: 1, capped: false };
  const pixels = w * h;
  const edge = Math.max(w, h);
  const scale = Math.min(
    1,
    Math.sqrt(WORKSPACE_MAX_PIXELS / pixels),
    WORKSPACE_MAX_EDGE / edge,
  );
  const capped = scale < 1;
  if (!capped) return { width: w, height: h, scale: 1, capped: false };
  let pw = Math.max(1, Math.round(w * scale));
  let ph = Math.max(1, Math.round(h * scale));
  // Integer rounding can push the product a hair over the budget; clamp the
  // shorter axis so the stored document never exceeds it.
  if (pw * ph > WORKSPACE_MAX_PIXELS) {
    ph = Math.max(1, Math.floor(WORKSPACE_MAX_PIXELS / pw));
  }
  return { width: pw, height: ph, scale, capped: true };
}
