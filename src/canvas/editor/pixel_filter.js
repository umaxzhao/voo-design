/**
 * One-click Photoshop-style pixel filters for the CPU adjustment path.
 *
 * Pure functions over RGBA buffers — no canvas, no GL, no React. Unlike the
 * tone categories these have no GLSL twin: when any of them is active the
 * whole frame runs through `applyAdjustments` in scene_renderer.js, which the
 * tone LUT flags via `cpuOnly`. Each function clamps into the Uint8ClampedArray
 * it is handed and returns it, in place.
 */

/** The largest block a pixelate at value 100 can produce, in px. */
const MAX_PIXELATE_SIZE = 32;
/** Posterize levels at value 100. Photoshop's posterize runs 2-255; 32 reads
 * cleanly without banding the whole image to two shades. */
const MAX_POSTERIZE_LEVELS = 32;

/**
 * Film grain: shift each channel by a deterministic pseudo-random offset whose
 * spread grows with `amount` (0-100). Deterministic by pixel so the cached
 * frame never flickers between renders and export matches the preview.
 */
export function applyNoise(data, width, height, amount) {
  if (!(amount > 0)) return data;
  const spread = amount * 1.28;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const pixel = i / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    for (let c = 0; c < 3; c += 1) {
      // A cheap integer hash of (x, y, channel) into [-1, 1].
      let n = (x * 374761393 + y * 668265263 + c * 2246822519) | 0;
      n = ((n ^ (n >> 13)) * 3266489917) | 0;
      n = (n ^ (n >> 16)) & 0xffffffff;
      const unit = (n / 0xffffffff) * 2 - 1;
      data[i + c] = Math.max(0, Math.min(255, data[i + c] + unit * spread));
    }
  }
  return data;
}

/**
 * Mosaic: replace each `size`-sized block with its average colour, where
 * `size` grows from 2 to MAX_PIXELATE_SIZE with `amount` (0-100).
 */
export function applyPixelate(data, width, height, amount) {
  if (!(amount > 0)) return data;
  if (!Number.isFinite(amount)) return data;
  const amountC = Math.min(amount, 100);
  const size = Math.max(
    2,
    Math.round((amountC / 100) * (MAX_PIXELATE_SIZE - 1)) + 1,
  );
  const src = Uint8ClampedArray.from(data);
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = 0; dy < size; dy += 1) {
        const row = Math.min(height - 1, y + dy);
        for (let dx = 0; dx < size; dx += 1) {
          const col = Math.min(width - 1, x + dx);
          const o = (row * width + col) * 4;
          if (src[o + 3] === 0) continue;
          r += src[o];
          g += src[o + 1];
          b += src[o + 2];
          count += 1;
        }
      }
      if (count === 0) continue;
      const avgR = r / count;
      const avgG = g / count;
      const avgB = b / count;
      for (let dy = 0; dy < size; dy += 1) {
        const row = Math.min(height - 1, y + dy);
        for (let dx = 0; dx < size; dx += 1) {
          const col = Math.min(width - 1, x + dx);
          const o = (row * width + col) * 4;
          if (data[o + 3] === 0) continue;
          data[o] = avgR;
          data[o + 1] = avgG;
          data[o + 2] = avgB;
        }
      }
    }
  }
  return data;
}

/**
 * Posterize: snap every channel to one of `levels` steps, where `levels`
 * scales from 2 to MAX_POSTERIZE_LEVELS with `amount` (0-100).
 */
export function applyPosterize(data, width, height, amount) {
  if (!(amount > 0)) return data;
  const levels = Math.max(
    2,
    Math.round((amount / 100) * (MAX_POSTERIZE_LEVELS - 2)) + 2,
  );
  const step = 255 / (levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c += 1) {
      data[i + c] = Math.round(Math.round(data[i + c] / step) * step);
    }
  }
  return data;
}

/**
 * Sepia: blend each pixel toward the classic photographic sepia matrix by
 * `amount` (0-100). 100 is a full sepia tone; lower values keep the original
 * colour mixed in.
 */
export function applySepia(data, width, height, amount) {
  if (!(amount > 0)) return data;
  const mix = amount / 100;
  const inv = 1 - mix;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    data[i] = inv * r + mix * (0.393 * r + 0.769 * g + 0.189 * b);
    data[i + 1] = inv * g + mix * (0.349 * r + 0.686 * g + 0.168 * b);
    data[i + 2] = inv * b + mix * (0.272 * r + 0.534 * g + 0.131 * b);
  }
  return data;
}

/**
 * Emboss: raise the top-left edge and sink the bottom-right by diffing each
 * pixel against its diagonal neighbour. `amount` (0-100) scales the depth; a
 * 128 mid-grey base keeps flat areas from going fully black.
 */
export function applyEmboss(data, width, height, amount) {
  if (!(amount > 0)) return data;
  const strength = amount * 1.6;
  const src = Uint8ClampedArray.from(data);
  for (let y = 0; y < height; y += 1) {
    const yNext = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const xNext = Math.min(width - 1, x + 1);
      const o = (y * width + x) * 4;
      if (src[o + 3] === 0) continue;
      const diag = (yNext * width + xNext) * 4;
      for (let c = 0; c < 3; c += 1) {
        const lum = 0.299 * src[o] + 0.587 * src[o + 1] + 0.114 * src[o + 2];
        const lumDiag =
          0.299 * src[diag] + 0.587 * src[diag + 1] + 0.114 * src[diag + 2];
        data[o + c] = Math.max(
          0,
          Math.min(255, 128 + (lum - lumDiag) * strength),
        );
      }
    }
  }
  return data;
}

/** Deterministic pseudo-random hash for procedural noise/clouds. */
function noise2D(x, y) {
  let n = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263) | 0;
  n = ((n ^ (n >> 13)) * 3266489917) | 0;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x, y) {
  const iX = Math.floor(x);
  const iY = Math.floor(y);
  const fX = x - iX;
  const fY = y - iY;

  // Cubic smoothstep interpolation
  const uX = fX * fX * (3 - 2 * fX);
  const uY = fY * fY * (3 - 2 * fY);

  const n00 = noise2D(iX, iY);
  const n10 = noise2D(iX + 1, iY);
  const n01 = noise2D(iX, iY + 1);
  const n11 = noise2D(iX + 1, iY + 1);

  const nx0 = n00 * (1 - uX) + n10 * uX;
  const nx1 = n01 * (1 - uX) + n11 * uX;

  return nx0 * (1 - uY) + nx1 * uY;
}

function fbmClouds(x, y, octaves = 5) {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  let totalAmp = 0;
  for (let i = 0; i < octaves; i += 1) {
    val += smoothNoise(x * freq, y * freq) * amp;
    totalAmp += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return val / totalAmp;
}

/**
 * Clouds (Photoshop-style Perlin FBM Fractal noise).
 * Blends fractal atmospheric cloud noise over the layer with configurable amount (0-100).
 */
export function applyClouds(data, width, height, amount) {
  if (!(amount > 0)) return data;
  const mix = amount / 100;
  const scale = 0.015;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] === 0) continue;
      const cVal = fbmClouds(x * scale, y * scale) * 255;
      data[idx] = Math.round(data[idx] * (1 - mix) + cVal * mix);
      data[idx + 1] = Math.round(data[idx + 1] * (1 - mix) + cVal * mix);
      data[idx + 2] = Math.round(data[idx + 2] * (1 - mix) + cVal * mix);
    }
  }
  return data;
}

/**
 * Solarize: invert pixel luminosity when it exceeds threshold, classic darkroom / Man Ray effect.
 */
export function applySolarize(data, width, height, amount) {
  if (!(amount > 0)) return data;
  const threshold = Math.round(255 * (1 - amount / 100));
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c += 1) {
      if (data[i + c] > threshold) {
        data[i + c] = 255 - data[i + c];
      }
    }
  }
  return data;
}

/**
 * Halftone: simulates newspaper halftone printing grid dots.
 */
export function applyHalftone(data, width, height, amount) {
  if (!(amount > 0)) return data;
  if (!Number.isFinite(amount)) return data;
  const amountC = Math.min(amount, 100);
  const dotSize = Math.max(3, Math.round(4 + (amountC / 100) * 12));
  const src = Uint8ClampedArray.from(data);
  for (let y = 0; y < height; y += dotSize) {
    for (let x = 0; x < width; x += dotSize) {
      let lumSum = 0;
      let count = 0;
      for (let dy = 0; dy < dotSize; dy += 1) {
        const py = Math.min(height - 1, y + dy);
        for (let dx = 0; dx < dotSize; dx += 1) {
          const px = Math.min(width - 1, x + dx);
          const o = (py * width + px) * 4;
          if (src[o + 3] === 0) continue;
          lumSum += 0.299 * src[o] + 0.587 * src[o + 1] + 0.114 * src[o + 2];
          count += 1;
        }
      }
      if (count === 0) continue;
      const avgLum = lumSum / count;
      const dotRadius = (dotSize / 2) * (1 - avgLum / 255) * (amountC / 100);
      const cx = x + dotSize / 2;
      const cy = y + dotSize / 2;

      for (let dy = 0; dy < dotSize; dy += 1) {
        const py = Math.min(height - 1, y + dy);
        for (let dx = 0; dx < dotSize; dx += 1) {
          const px = Math.min(width - 1, x + dx);
          const o = (py * width + px) * 4;
          if (data[o + 3] === 0) continue;
          // px/cx and py/cy are bounded by the 16px dot cell, so squaring
          // cannot overflow and sqrt preserves the same distance predicate.
          const distanceX = px - cx;
          const distanceY = py - cy;
          const dist = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
          if (dist <= dotRadius) {
            data[o] = 20;
            data[o + 1] = 20;
            data[o + 2] = 20;
          } else {
            data[o] = Math.min(255, data[o] + 30);
            data[o + 1] = Math.min(255, data[o + 1] + 30);
            data[o + 2] = Math.min(255, data[o + 2] + 30);
          }
        }
      }
    }
  }
  return data;
}
