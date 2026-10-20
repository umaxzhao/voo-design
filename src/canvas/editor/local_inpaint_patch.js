/**
 * Poisson / Laplacian Membrane Seamless Patch Blending.
 *
 * Extracted from local_inpaint.js to keep both modules under 400 lines.
 */

/**
 * Mask alpha at or below this marks nothing: patchBlendImage writes only where
 * the mask is stronger, so anything that asks "does this mask select anything"
 * has to read the same number.
 */
export const PATCH_MASK_THRESHOLD = 40;

/** Whether a patch mask marks any pixel at all, by that same threshold. */
export function anyMaskedPixel(data, threshold = PATCH_MASK_THRESHOLD) {
  if (!data) return false;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] || data[i]) > threshold) return true;
  }
  return false;
}

/**
 * PhotoPea & Photoshop standard Poisson / Laplacian Membrane Seamless Patch Blending:
 * 1. Clones texture detail (gradients, lighting, micro-texture) from source (x + dx, y + dy).
 * 2. Solves Laplace's equation \Delta O = 0 inside the patch domain with Dirichlet boundary
 *    conditions matching the destination border (O(boundary) = Dst(x, y) - Src(x+dx, y+dy)).
 * 3. Adds the interpolated membrane to the source texture, resulting in 100% seamless color,
 *    lighting, and gradient transition without any visible boundaries or discoloration.
 */
export function patchBlendImage(sourceCanvas, maskCanvas, dx, dy) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const srcCtx = sourceCanvas.getContext("2d");
  const maskCtx = maskCanvas.getContext("2d");

  const srcData = srcCtx.getImageData(0, 0, width, height);
  const maskData = maskCtx.getImageData(0, 0, width, height);

  const src = srcData.data;
  const mask = maskData.data;

  // 1. Find bounding box of the patch mask to keep Poisson solver fast
  let minX = width,
    maxX = 0,
    minY = height,
    maxY = 0;
  let hasMask = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const alpha = mask[idx * 4 + 3] || mask[idx * 4];
      if (alpha > 20) {
        hasMask = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasMask) return sourceCanvas.toDataURL("image/png");

  // Expand bounding box with 4px margin
  minX = Math.max(0, minX - 4);
  maxX = Math.min(width - 1, maxX + 4);
  minY = Math.max(0, minY - 4);
  maxY = Math.min(height - 1, maxY + 4);

  const roiW = maxX - minX + 1;
  const roiH = maxY - minY + 1;
  const roiSize = roiW * roiH;

  // Membrane color difference buffers: R, G, B
  const diffR = new Float32Array(roiSize);
  const diffG = new Float32Array(roiSize);
  const diffB = new Float32Array(roiSize);

  // Pixel classification: 0 = outside/unconstrained, 1 = inside patch, 2 = fixed boundary
  const type = new Uint8Array(roiSize);

  // 2. Identify inner patch and boundary pixels
  let avgR = 0,
    avgG = 0,
    avgB = 0,
    bCount = 0;

  for (let ry = 0; ry < roiH; ry++) {
    const y = minY + ry;
    for (let rx = 0; rx < roiW; rx++) {
      const x = minX + rx;
      const rIdx = ry * roiW + rx;
      const gIdx = y * width + x;
      const alpha = mask[gIdx * 4 + 3] || mask[gIdx * 4];

      if (alpha > PATCH_MASK_THRESHOLD) {
        // Check if any 4-neighbor is outside mask
        let isBoundary = false;
        const neighbors = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
          [x - 2, y],
          [x + 2, y],
          [x, y - 2],
          [x, y + 2],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            isBoundary = true;
            break;
          }
          const nAlpha =
            mask[(ny * width + nx) * 4 + 3] || mask[(ny * width + nx) * 4];
          if (nAlpha <= PATCH_MASK_THRESHOLD) {
            isBoundary = true;
            break;
          }
        }

        if (isBoundary) {
          type[rIdx] = 2; // Fixed boundary condition
          const sx = Math.min(width - 1, Math.max(0, Math.round(x + dx)));
          const sy = Math.min(height - 1, Math.max(0, Math.round(y + dy)));
          const sIdx = sy * width + sx;

          const dr = src[gIdx * 4] - src[sIdx * 4];
          const dg = src[gIdx * 4 + 1] - src[sIdx * 4 + 1];
          const db = src[gIdx * 4 + 2] - src[sIdx * 4 + 2];

          diffR[rIdx] = dr;
          diffG[rIdx] = dg;
          diffB[rIdx] = db;

          avgR += dr;
          avgG += dg;
          avgB += db;
          bCount++;
        } else {
          type[rIdx] = 1; // Inside patch
        }
      }
    }
  }

  // Initialize interior with boundary average for rapid convergence
  if (bCount > 0) {
    avgR /= bCount;
    avgG /= bCount;
    avgB /= bCount;
    for (let i = 0; i < roiSize; i++) {
      if (type[i] === 1) {
        diffR[i] = avgR;
        diffG[i] = avgG;
        diffB[i] = avgB;
      }
    }
  }

  // 3. Successive Over-Relaxation (SOR) Laplace Membrane Solver
  // Solves \nabla^2 diff = 0 inside the patch domain with fixed Dirichlet boundary
  const omega = 1.45; // SOR relaxation parameter
  const iterations = Math.min(
    80,
    Math.max(35, Math.round(Math.max(roiW, roiH) * 0.8)),
  );

  for (let iter = 0; iter < iterations; iter++) {
    for (let ry = 1; ry < roiH - 1; ry++) {
      for (let rx = 1; rx < roiW - 1; rx++) {
        const rIdx = ry * roiW + rx;
        if (type[rIdx] === 1) {
          const up = (ry - 1) * roiW + rx;
          const down = (ry + 1) * roiW + rx;
          const left = ry * roiW + (rx - 1);
          const right = ry * roiW + (rx + 1);

          const avgNeighborR =
            (diffR[up] + diffR[down] + diffR[left] + diffR[right]) * 0.25;
          const avgNeighborG =
            (diffG[up] + diffG[down] + diffG[left] + diffG[right]) * 0.25;
          const avgNeighborB =
            (diffB[up] + diffB[down] + diffB[left] + diffB[right]) * 0.25;

          diffR[rIdx] += omega * (avgNeighborR - diffR[rIdx]);
          diffG[rIdx] += omega * (avgNeighborG - diffG[rIdx]);
          diffB[rIdx] += omega * (avgNeighborB - diffB[rIdx]);
        }
      }
    }
  }

  // 4. Synthesize seamless output by adding Laplace membrane to source texture
  for (let ry = 0; ry < roiH; ry++) {
    const y = minY + ry;
    for (let rx = 0; rx < roiW; rx++) {
      const x = minX + rx;
      const rIdx = ry * roiW + rx;
      if (type[rIdx] > 0) {
        const gIdx = y * width + x;
        const alphaWeight = Math.min(
          1,
          Math.max(0, (mask[gIdx * 4 + 3] || mask[gIdx * 4]) / 255),
        );

        const sx = Math.min(width - 1, Math.max(0, Math.round(x + dx)));
        const sy = Math.min(height - 1, Math.max(0, Math.round(y + dy)));
        const sIdx = sy * width + sx;

        const patchedR = Math.min(
          255,
          Math.max(0, Math.round(src[sIdx * 4] + diffR[rIdx])),
        );
        const patchedG = Math.min(
          255,
          Math.max(0, Math.round(src[sIdx * 4 + 1] + diffG[rIdx])),
        );
        const patchedB = Math.min(
          255,
          Math.max(0, Math.round(src[sIdx * 4 + 2] + diffB[rIdx])),
        );

        src[gIdx * 4] = Math.round(
          src[gIdx * 4] * (1 - alphaWeight) + patchedR * alphaWeight,
        );
        src[gIdx * 4 + 1] = Math.round(
          src[gIdx * 4 + 1] * (1 - alphaWeight) + patchedG * alphaWeight,
        );
        src[gIdx * 4 + 2] = Math.round(
          src[gIdx * 4 + 2] * (1 - alphaWeight) + patchedB * alphaWeight,
        );
      }
    }
  }

  srcCtx.putImageData(srcData, 0, 0);
  return sourceCanvas.toDataURL("image/png");
}
