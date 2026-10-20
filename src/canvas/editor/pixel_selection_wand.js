/**
 * Pixel selection operations: invert, boolean combinations, and magic-wand flood fill.
 */

import { contourBounds, traceMaskContours } from "./mask_contour.js";
import { contoursToMask, mapContoursToDoc } from "./pixel_selection_contour.js";
import { blurMask } from "./pixel_selection_morphology.js";

/**
 * Inverts a pixel selection: everything the outline excluded becomes selected
 * and vice versa. The contours are rasterised into a mask over the layer's
 * bitmap, flipped, and traced again, so the result is the same shape data
 * every other selection consumer holds.
 *
 * @param {ImageBitmap|HTMLCanvasElement|HTMLImageElement} source the layer bitmap.
 * @param {{nodeId: string, contours: Array}} selection the current selection.
 * @param {object} node the layer node with x, y, width, height.
 * @returns {{nodeId: string, contours: Array, bounds: object} | null}
 */
export function invertSelection(source, selection, node) {
  if (!source || !selection?.nodeId) return null;
  const width = source.width;
  const height = source.height;
  if (!(width > 0) || !(height > 0)) return null;

  const alpha = contoursToMask(selection.contours, node, width, height);
  if (!alpha) return null;
  for (let i = 0; i < alpha.length; i += 1) {
    alpha[i] = alpha[i] > 0.5 ? 0 : 1;
  }

  const rings = traceMaskContours(alpha, width, height);
  if (rings.length === 0) return null;
  const contours = mapContoursToDoc(rings, node, width, height);
  return {
    nodeId: selection.nodeId,
    contours,
    bounds: contourBounds(contours),
  };
}

/**
 * Combines two selections with a boolean operation, the way Shift/Alt marquee
 * drags and the selection-mode bar do. Both selections are rasterised over the
 * layer's bitmap, combined per pixel, and traced back into contours, so the
 * result is the same shape data every other consumer holds.
 *
 * @param {ImageBitmap|HTMLCanvasElement|HTMLImageElement} source the layer bitmap.
 * @param {{nodeId: string, contours: Array}} base the selection on the layer.
 * @param {{nodeId: string, contours: Array}} next the new shape to combine.
 * @param {object} node the layer node with x, y, width, height.
 * @param {"union"|"subtract"|"intersect"} mode the boolean operation.
 * @returns {{nodeId: string, contours: Array, bounds: object} | null}
 */
export function combineSelections(source, base, next, node, mode) {
  if (!source || !base?.nodeId || !next?.nodeId) return next;
  if (base.nodeId !== next.nodeId) return next;
  const width = source.width;
  const height = source.height;
  if (!(width > 0) || !(height > 0)) return next;

  const a = contoursToMask(base.contours, node, width, height);
  const b = contoursToMask(next.contours, node, width, height);
  if (!a || !b) return next;
  const out = new Float32Array(width * height);
  if (mode === "subtract") {
    for (let i = 0; i < out.length; i += 1) {
      out[i] = a[i] > 0.5 && b[i] <= 0.5 ? 1 : 0;
    }
  } else if (mode === "intersect") {
    for (let i = 0; i < out.length; i += 1) {
      out[i] = a[i] > 0.5 && b[i] > 0.5 ? 1 : 0;
    }
  } else {
    // Union (default): anything either selection covers.
    for (let i = 0; i < out.length; i += 1) {
      out[i] = a[i] > 0.5 || b[i] > 0.5 ? 1 : 0;
    }
  }

  const rings = traceMaskContours(out, width, height);
  if (rings.length === 0) return null;
  const contours = mapContoursToDoc(rings, node, width, height);
  return {
    nodeId: base.nodeId,
    contours,
    bounds: contourBounds(contours),
  };
}

/**
 * Magic-wand selection: flood-fill from a seed pixel, selecting all connected
 * pixels whose colour is within `tolerance` of the seed colour.
 *
 * @param {ImageBitmap|HTMLCanvasElement|HTMLImageElement} source the layer bitmap.
 * @param {{x: number, y: number}} localPoint click position in node-local coords (0..width, 0..height).
 * @param {object} node the layer node with x, y, width, height.
 * @param {number} [tolerance=32] colour distance (0–255 per channel, Manhattan).
 * @returns {{nodeId: string, contours: Array, bounds: object} | null}
 */
export function wandSelectFromBitmap(
  source,
  localPoint,
  node,
  tolerance = 32,
  { contiguous = true, antiAlias = true, sampleSize = 0 } = {},
) {
  if (!source) return null;

  // Determine source dimensions
  const srcW = source.width;
  const srcH = source.height;
  if (!(srcW > 0) || !(srcH > 0)) return null;

  // Map the click from node-local (0..node.width, 0..node.height) to pixel coords.
  const nodeW = node.width ?? srcW;
  const nodeH = node.height ?? srcH;
  const px = Math.floor((localPoint.x / nodeW) * srcW);
  const py = Math.floor((localPoint.y / nodeH) * srcH);
  if (px < 0 || py < 0 || px >= srcW || py >= srcH) return null;

  // Rasterise source into an offscreen canvas to read pixels.
  const canvas = new OffscreenCanvas(srcW, srcH);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, srcW, srcH);
  const data = imageData.data;

  // Seed colour. Photoshop's Sample Size option: Point Sample reads the
  // single pixel under the cursor; 3×3 / 5×5 Average read the mean of that
  // window, which stops a lone bright pixel from anchoring the whole flood
  // fill when the surrounding area is a different tone.
  let sr;
  let sg;
  let sb;
  let sa;
  if (sampleSize > 0) {
    const radius = sampleSize === 1 ? 1 : 2;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumA = 0;
    let count = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const xx = px + dx;
        const yy = py + dy;
        if (xx < 0 || yy < 0 || xx >= srcW || yy >= srcH) continue;
        const idx = (yy * srcW + xx) * 4;
        sumR += data[idx];
        sumG += data[idx + 1];
        sumB += data[idx + 2];
        sumA += data[idx + 3];
        count += 1;
      }
    }
    sr = count > 0 ? sumR / count : data[(py * srcW + px) * 4];
    sg = count > 0 ? sumG / count : data[(py * srcW + px) * 4 + 1];
    sb = count > 0 ? sumB / count : data[(py * srcW + px) * 4 + 2];
    sa = count > 0 ? sumA / count : data[(py * srcW + px) * 4 + 3];
  } else {
    const seedIdx = (py * srcW + px) * 4;
    sr = data[seedIdx];
    sg = data[seedIdx + 1];
    sb = data[seedIdx + 2];
    sa = data[seedIdx + 3];
  }

  // Visited mask (1 = selected)
  const visited = new Uint8Array(srcW * srcH);
  const mask = new Float32Array(srcW * srcH);

  const match = (idx) => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    return (
      Math.abs(r - sr) <= tolerance &&
      Math.abs(g - sg) <= tolerance &&
      Math.abs(b - sb) <= tolerance &&
      Math.abs(a - sa) <= tolerance
    );
  };

  if (!contiguous) {
    // Global color range selection across the entire image
    const totalPixels = srcW * srcH;
    for (let p = 0; p < totalPixels; p += 1) {
      if (match(p * 4)) {
        mask[p] = 1.0;
      }
    }
  } else {
    // Scanline flood fill — faster than pixel-by-pixel queue
    const stack = [[px, py]];

    while (stack.length > 0) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cx >= srcW || cy < 0 || cy >= srcH) continue;
      const ci = cy * srcW + cx;
      if (visited[ci]) continue;
      if (!match(ci * 4)) continue;

      // Scan left
      let left = cx;
      while (
        left > 0 &&
        !visited[cy * srcW + left - 1] &&
        match((cy * srcW + left - 1) * 4)
      ) {
        left -= 1;
      }
      // Scan right
      let right = cx;
      while (
        right < srcW - 1 &&
        !visited[cy * srcW + right + 1] &&
        match((cy * srcW + right + 1) * 4)
      ) {
        right += 1;
      }
      // Fill the span
      for (let x = left; x <= right; x += 1) {
        const i = cy * srcW + x;
        visited[i] = 1;
        mask[i] = 1.0;
      }
      // Push adjacent row spans (scanline flood fill: queue each contiguous unvisited run once)
      if (cy > 0) {
        let inSpan = false;
        for (let x = left; x <= right; x += 1) {
          const idx = (cy - 1) * srcW + x;
          if (!visited[idx] && match(idx * 4)) {
            if (!inSpan) {
              stack.push([x, cy - 1]);
              inSpan = true;
            }
          } else {
            inSpan = false;
          }
        }
      }
      if (cy < srcH - 1) {
        let inSpan = false;
        for (let x = left; x <= right; x += 1) {
          const idx = (cy + 1) * srcW + x;
          if (!visited[idx] && match(idx * 4)) {
            if (!inSpan) {
              stack.push([x, cy + 1]);
              inSpan = true;
            }
          } else {
            inSpan = false;
          }
        }
      }
    }
  }

  // Anti-aliasing (Photoshop's wand checkbox): soften the mask's edge with a
  // one-pixel blur before tracing, so the outline follows the smoothed edge
  // and the selection carries a hair of feather — deletes and copies then
  // fall off at the boundary instead of stepping pixel-hard.
  let tracedMask = mask;
  let feather = 0;
  if (antiAlias) {
    tracedMask = blurMask(mask, srcW, srcH, 1);
    feather = 1;
  }

  // Trace the mask into contours
  const rings = traceMaskContours(tracedMask, srcW, srcH);
  if (rings.length === 0) return null;
  const contours = mapContoursToDoc(rings, node, srcW, srcH);
  return {
    nodeId: node.id,
    contours,
    bounds: contourBounds(contours),
    feather,
  };
}
