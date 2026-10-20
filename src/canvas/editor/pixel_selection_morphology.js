/**
 * Morphological and blur transformations for pixel selection masks:
 * feather, expand/contract, smooth, and border.
 */

import { contourBounds, traceMaskContours } from "./mask_contour.js";
import { contoursToMask, mapContoursToDoc } from "./pixel_selection_contour.js";

/**
 * Blurs a 0/1 mask with three separable box passes — a cheap Gaussian
 * approximation. The result is a 0..1 alpha map whose edges fall off over
 * `radius` pixels, which is what a feathered selection's delete/copy uses.
 *
 * @param {Float32Array|Uint8Array} mask 0/1 coverage per pixel.
 * @param {number} width
 * @param {number} height
 * @param {number} radius blur radius in pixels; <= 0 returns the mask as-is.
 * @returns {Float32Array} 0..1 alpha per pixel.
 */
export function blurMask(mask, width, height, radius) {
  if (!(radius > 0) || width <= 0 || height <= 0) {
    return Float32Array.from(mask);
  }
  const r = Math.max(1, Math.round(radius));
  let src = Float32Array.from(mask);
  // Three passes of a box blur converge on a Gaussian-looking falloff.
  for (let pass = 0; pass < 3; pass += 1) {
    const horizontal = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let count = 0;
        for (let k = -r; k <= r; k += 1) {
          const xx = x + k;
          if (xx >= 0 && xx < width) {
            sum += src[y * width + xx];
            count += 1;
          }
        }
        horizontal[y * width + x] = sum / count;
      }
    }
    const vertical = new Float32Array(width * height);
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        let sum = 0;
        let count = 0;
        for (let k = -r; k <= r; k += 1) {
          const yy = y + k;
          if (yy >= 0 && yy < height) {
            sum += horizontal[yy * width + x];
            count += 1;
          }
        }
        vertical[y * width + x] = sum / count;
      }
    }
    src = vertical;
  }
  return src;
}

/**
 * Feathers a pixel selection: the outline is smoothed by blurring its mask
 * and re-tracing at the midpoint, and the selection carries the feather
 * radius so later deletes and copies fall off at the edge instead of
 * clipping hard (Photoshop's Select → Modify → Feather).
 *
 * @param {object} node the layer node with x, y, width, height.
 * @param {number} radius feather radius in document pixels.
 */
export function featherSelection(source, selection, node, radius) {
  const r = Math.max(0, Math.round(radius));
  if (!selection) return null;
  const width = source?.width ?? node?.width ?? 0;
  const height = source?.height ?? node?.height ?? 0;
  if (!(width > 0) || !(height > 0) || !node || !selection.contours?.length) {
    return { ...selection, feather: r };
  }
  const base = contoursToMask(selection.contours, node, width, height);
  if (!base) return { ...selection, feather: r };
  // Re-trace the blurred mask at its midpoint so the new outline follows the
  // softened edge rather than the original hard one.
  const blurred = blurMask(base, width, height, r);
  const rings = traceMaskContours(blurred, width, height);
  if (rings.length === 0) {
    return {
      ...selection,
      feather: r,
    };
  }
  const contours = mapContoursToDoc(rings, node, width, height);
  return {
    nodeId: selection.nodeId,
    contours,
    bounds: contourBounds(contours),
    feather: r,
  };
}

/**
 * Expands or contracts a pixel selection by `amount` document pixels
 * (Photoshop's Select → Modify → Expand / Contract).
 *
 * A square morphological window of that radius runs over the selection's
 * mask: dilate (expand) keeps a pixel when any window texel is selected,
 * erode (contract) keeps it only when every window texel is selected. The
 * result is traced back into the same contour data every consumer holds.
 *
 * @returns {{nodeId: string, contours: Array, bounds: object, feather: number} | null}
 */
export function expandContractSelection(
  source,
  selection,
  node,
  amount,
  { expand = true } = {},
) {
  const width = source.width;
  const height = source.height;
  if (!(width > 0) || !(height > 0) || !(amount > 0)) return selection;
  const base = contoursToMask(selection.contours, node, width, height);
  if (!base) return selection;
  const r = Math.max(1, Math.round(amount));
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let selected = false;
      let unselected = false;
      for (let dy = -r; dy <= r && !(selected && unselected); dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          if (base[yy * width + xx] > 0.5) selected = true;
          else unselected = true;
        }
      }
      if (expand) out[y * width + x] = selected ? 1 : 0;
      else out[y * width + x] = unselected ? 0 : 1;
    }
  }
  const rings = traceMaskContours(out, width, height);
  if (rings.length === 0) return null;
  const contours = mapContoursToDoc(rings, node, width, height);
  return {
    nodeId: selection.nodeId,
    contours,
    bounds: contourBounds(contours),
    feather: selection.feather ?? 0,
  };
}

/**
 * Smooths a pixel selection's outline (Photoshop's Select → Modify → Smooth):
 * the mask is blurred and re-traced at its midpoint, knocking off the stray
 * single-pixel noise and stair-stepping a jagged freehand edge. Unlike
 * feather, the selection does not carry a soft falloff afterwards.
 */
export function smoothSelection(source, selection, node, radius) {
  const width = source.width;
  const height = source.height;
  if (!(width > 0) || !(height > 0) || !(radius > 0)) return selection;
  const base = contoursToMask(selection.contours, node, width, height);
  if (!base) return selection;
  const blurred = blurMask(base, width, height, radius);
  const rings = traceMaskContours(blurred, width, height);
  if (rings.length === 0) return selection;
  const contours = mapContoursToDoc(rings, node, width, height);
  return {
    nodeId: selection.nodeId,
    contours,
    bounds: contourBounds(contours),
    feather: selection.feather ?? 0,
  };
}

/**
 * Selects a band of pixels around the current selection's outline
 * (Photoshop's Select → Modify → Border): the ring between the dilated and
 * the eroded mask, so a border of width `amount` straddles the edge.
 */
export function borderSelection(source, selection, node, amount) {
  const width = source.width;
  const height = source.height;
  if (!(width > 0) || !(height > 0) || !(amount > 0)) return selection;
  const base = contoursToMask(selection.contours, node, width, height);
  if (!base) return selection;
  // The ring is ~2r thick; half the requested width keeps the band centered.
  const r = Math.max(1, Math.round(amount / 2));
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let selected = false;
      let unselected = false;
      for (let dy = -r; dy <= r && !(selected && unselected); dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          if (base[yy * width + xx] > 0.5) selected = true;
          else unselected = true;
        }
      }
      // In the dilated mask but not the eroded one: exactly the boundary band.
      out[y * width + x] = selected && unselected ? 1 : 0;
    }
  }
  const rings = traceMaskContours(out, width, height);
  if (rings.length === 0) return null;
  const contours = mapContoursToDoc(rings, node, width, height);
  return {
    nodeId: selection.nodeId,
    contours,
    bounds: contourBounds(contours),
    feather: selection.feather ?? 0,
  };
}
