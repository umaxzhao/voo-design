/**
 * Pure local inpainting algorithm for Spot Healing / Blemish Removal.
 *
 * Based on Fast Marching Method / Telea inpainting with boundary smoothing.
 * Runs 100% locally on CPU / Canvas pixel buffer in 10-30ms with zero AI/API dependencies.
 */

export function inpaintLocalImage(sourceCanvas, maskCanvas, radius = 6) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const srcCtx = sourceCanvas.getContext("2d");
  const maskCtx = maskCanvas.getContext("2d");

  const srcData = srcCtx.getImageData(0, 0, width, height);
  const maskData = maskCtx.getImageData(0, 0, width, height);

  const src = srcData.data;
  const mask = maskData.data;

  // 1. Mark damaged pixels: 0 = known background, 1 = mask border, 2 = damaged interior
  const flags = new Uint8Array(width * height);
  let damagedCount = 0;

  for (let i = 0; i < mask.length; i += 4) {
    const alpha = mask[i + 3];
    const red = mask[i];
    // Any non-zero mask is considered area to heal
    if (alpha > 30 || red > 30) {
      flags[i / 4] = 2; // damaged
      damagedCount++;
    }
  }

  if (damagedCount === 0) {
    return sourceCanvas.toDataURL("image/png");
  }

  // 2. Identify boundary pixels
  const queue = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (flags[idx] === 2) {
        // Check 4-connectivity
        let isBoundary = false;
        if (x > 0 && flags[idx - 1] === 0) isBoundary = true;
        else if (x < width - 1 && flags[idx + 1] === 0) isBoundary = true;
        else if (y > 0 && flags[idx - width] === 0) isBoundary = true;
        else if (y < height - 1 && flags[idx + width] === 0) isBoundary = true;

        if (isBoundary) {
          flags[idx] = 1;
          queue.push({ x, y, dist: 0 });
        }
      }
    }
  }

  // 3. Fast marching / weighted neighbor diffusion (Telea inspired)
  const r = Math.max(4, Math.min(18, radius));
  const r2 = r * r;

  let head = 0;
  while (head < queue.length) {
    const { x, y, dist } = queue[head++];
    const pIdx = y * width + x;

    // Inpaint this pixel from surrounding known pixels (flag === 0)
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumWeight = 0;

    const yMin = Math.max(0, y - r);
    const yMax = Math.min(height - 1, y + r);
    const xMin = Math.max(0, x - r);
    const xMax = Math.min(width - 1, x + r);

    for (let ny = yMin; ny <= yMax; ny++) {
      for (let nx = xMin; nx <= xMax; nx++) {
        const nIdx = ny * width + nx;
        if (flags[nIdx] === 0) {
          const dx = nx - x;
          const dy = ny - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2) {
            const weight = 1 / (1 + Math.sqrt(d2));
            const nPixel = nIdx * 4;
            sumR += src[nPixel] * weight;
            sumG += src[nPixel + 1] * weight;
            sumB += src[nPixel + 2] * weight;
            sumWeight += weight;
          }
        }
      }
    }

    if (sumWeight > 0) {
      const pPixel = pIdx * 4;
      src[pPixel] = Math.round(sumR / sumWeight);
      src[pPixel + 1] = Math.round(sumG / sumWeight);
      src[pPixel + 2] = Math.round(sumB / sumWeight);
      src[pPixel + 3] = 255;
    }

    flags[pIdx] = 0; // mark as solved

    // Expand to 4 neighbors that are still damaged
    const neighbors = [
      { nx: x - 1, ny: y },
      { nx: x + 1, ny: y },
      { nx: x, ny: y - 1 },
      { nx: x, ny: y + 1 },
    ];

    for (const { nx, ny } of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (flags[nIdx] === 2) {
          flags[nIdx] = 1;
          queue.push({ x: nx, y: ny, dist: dist + 1 });
        }
      }
    }
  }

  // 4. Put back inpainted image
  srcCtx.putImageData(srcData, 0, 0);
  return sourceCanvas.toDataURL("image/png");
}

export {
  PATCH_MASK_THRESHOLD,
  anyMaskedPixel,
  patchBlendImage,
} from "./local_inpaint_patch.js";

/**
 * Pure local Clone Stamp Tool (仿制图章工具):
 * Samples directly from sourceAnchor + (point - targetAnchor) with soft brush feathering.
 */
/**
 * @param {Uint8ClampedArray|null} coverage Optional per-pixel selection
 *   coverage, 0-255, one entry per pixel. Where it is 0 the stamp writes
 *   nothing; partial values let a feathered selection fade the edit rather
 *   than cut it off square.
 */
export function cloneStampImage(
  sourceCanvas,
  localPoints,
  dx,
  dy,
  diameter,
  hardness = 0.5,
  opacity = 1,
  flow = 1,
  coverage = null,
) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const srcCtx = sourceCanvas.getContext("2d");
  const srcData = srcCtx.getImageData(0, 0, width, height);
  const src = srcData.data;

  // Snapshot original image to sample unchanged pixels from
  const sampleData = new Uint8ClampedArray(src);

  const radius = Math.max(1, diameter / 2);
  const radius2 = radius * radius;
  const innerRadius = radius * Math.max(0, Math.min(1, hardness));
  const innerRadius2 = innerRadius * innerRadius;

  for (const pt of localPoints) {
    const minX = Math.max(0, Math.floor(pt.x - radius));
    const maxX = Math.min(width - 1, Math.ceil(pt.x + radius));
    const minY = Math.max(0, Math.floor(pt.y - radius));
    const maxY = Math.min(height - 1, Math.ceil(pt.y + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dist2 = (x - pt.x) * (x - pt.x) + (y - pt.y) * (y - pt.y);
        if (dist2 <= radius2) {
          let alpha = 1;
          if (dist2 > innerRadius2 && radius > innerRadius) {
            const dist = Math.sqrt(dist2);
            alpha = 1 - (dist - innerRadius) / (radius - innerRadius);
          }
          alpha *= opacity * flow;
          if (coverage) {
            alpha *= coverage[y * width + x] / 255;
            if (alpha <= 0) continue;
          }

          const sx = Math.round(x + dx);
          const sy = Math.round(y + dy);
          // Skip out-of-bounds source samples — never wrap (Affinity/PS stamp).
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          const sIdx = (sy * width + sx) * 4;
          const dIdx = (y * width + x) * 4;

          const sR = sampleData[sIdx];
          const sG = sampleData[sIdx + 1];
          const sB = sampleData[sIdx + 2];
          const sA = (sampleData[sIdx + 3] / 255) * alpha;

          src[dIdx] = Math.round(src[dIdx] * (1 - sA) + sR * sA);
          src[dIdx + 1] = Math.round(src[dIdx + 1] * (1 - sA) + sG * sA);
          src[dIdx + 2] = Math.round(src[dIdx + 2] * (1 - sA) + sB * sA);
          src[dIdx + 3] = Math.min(255, Math.round(src[dIdx + 3] + sA * 255));
        }
      }
    }
  }

  srcCtx.putImageData(srcData, 0, 0);
  return sourceCanvas.toDataURL("image/png");
}
