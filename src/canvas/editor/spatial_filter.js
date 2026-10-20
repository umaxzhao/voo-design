/**
 * Spatial filters (blur / sharpen) for the CPU adjustment path, plus the
 * radius maths both render paths share.
 *
 * Pure functions over ImageData-like RGBA buffers: no canvas, no GL, no
 * React. The GPU twins of these kernels live in gl_spatial.js; keep the
 * sharpen kernel and the radius scaling in lockstep with the shaders there.
 */

/**
 * Blur radius in natural-resolution pixels at slider value 100. The GLSL
 * loop bound in gl_spatial.js assumes this maximum.
 */
export const MAX_BLUR_RADIUS = 32;

/**
 * The CPU blur caps its effective radius here. The GPU runs a true two-pass
 * gaussian at any slider value; the CPU approximates it with box passes whose
 * cost grows with the radius, so past this cap the fallback stops getting
 * blurrier rather than stall the editor on a 4K frame. Documented
 * degradation: above the cap the CPU result is less blurry than the GPU's,
 * and at any radius the box approximation is slightly softer-edged than a
 * true gaussian.
 */
export const CPU_BLUR_RADIUS_CAP = 20;

/**
 * Effective blur radius in render-target pixels.
 *
 * The slider expresses a radius at the bitmap's natural resolution, but a
 * preview renders smaller than natural — an unscaled pixel radius would blur
 * the preview less than the export. Scaling by target/natural keeps the two
 * agreeing. The ratio clamps at 1: supersampled targets (never larger than
 * natural in practice) must not invent extra blur.
 */
export function scaledRadius(value, targetWidth, naturalWidth) {
  if (!(value > 0) || !(targetWidth > 0) || !(naturalWidth > 0)) return 0;
  const ratio = Math.min(1, targetWidth / naturalWidth);
  return (value / 100) * MAX_BLUR_RADIUS * ratio;
}

/** The radius the CPU fallback actually uses for a requested radius. */
export function cpuBlurRadius(radius) {
  return Math.min(Math.max(0, radius), CPU_BLUR_RADIUS_CAP);
}

/**
 * 3x3 unsharp sharpen, in place: centre boosted by `1 + 4*amount`, the four
 * direct neighbours subtracted by `amount` — the same kernel the GLSL in
 * gl_spatial.js applies, including edge replication (CLAMP_TO_EDGE). Alpha is
 * convolved like any other channel, matching the GPU. Cost is O(1) per pixel,
 * fine even at 4K.
 */
export function applySharpen(data, width, height, amount) {
  if (!(amount > 0)) return data;
  const src = Uint8ClampedArray.from(data);
  const gain = 1 + 4 * amount;
  for (let y = 0; y < height; y++) {
    const yUp = Math.max(0, y - 1) * width;
    const yDown = Math.min(height - 1, y + 1) * width;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const xLeft = Math.max(0, x - 1);
      const xRight = Math.min(width - 1, x + 1);
      const center = (row + x) * 4;
      const up = (yUp + x) * 4;
      const down = (yDown + x) * 4;
      const left = (row + xLeft) * 4;
      const right = (row + xRight) * 4;
      for (let c = 0; c < 4; c++) {
        data[center + c] =
          src[center + c] * gain -
          (src[up + c] + src[down + c] + src[left + c] + src[right + c]) *
            amount;
      }
    }
  }
  return data;
}

/** One horizontal box pass with edge replication, src -> dst (RGBA bytes). */
function boxBlurHorizontal(src, dst, width, height, radius) {
  const window = 2 * radius + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let i = -radius; i <= radius; i++) {
      const o = (row + Math.min(width - 1, Math.max(0, i))) * 4;
      r += src[o];
      g += src[o + 1];
      b += src[o + 2];
      a += src[o + 3];
    }
    for (let x = 0; x < width; x++) {
      const o = (row + x) * 4;
      dst[o] = r / window;
      dst[o + 1] = g / window;
      dst[o + 2] = b / window;
      dst[o + 3] = a / window;
      const add = (row + Math.min(width - 1, x + radius + 1)) * 4;
      const sub = (row + Math.max(0, x - radius)) * 4;
      r += src[add] - src[sub];
      g += src[add + 1] - src[sub + 1];
      b += src[add + 2] - src[sub + 2];
      a += src[add + 3] - src[sub + 3];
    }
  }
}

/** One vertical box pass with edge replication, src -> dst (RGBA bytes). */
function boxBlurVertical(src, dst, width, height, radius) {
  const window = 2 * radius + 1;
  for (let x = 0; x < width; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let i = -radius; i <= radius; i++) {
      const o = (Math.min(height - 1, Math.max(0, i)) * width + x) * 4;
      r += src[o];
      g += src[o + 1];
      b += src[o + 2];
      a += src[o + 3];
    }
    for (let y = 0; y < height; y++) {
      const o = (y * width + x) * 4;
      dst[o] = r / window;
      dst[o + 1] = g / window;
      dst[o + 2] = b / window;
      dst[o + 3] = a / window;
      const add = (Math.min(height - 1, y + radius + 1) * width + x) * 4;
      const sub = (Math.max(0, y - radius) * width + x) * 4;
      r += src[add] - src[sub];
      g += src[add + 1] - src[sub + 1];
      b += src[add + 2] - src[sub + 2];
      a += src[add + 3] - src[sub + 3];
    }
  }
}

/**
 * Gaussian-ish blur, in place: three separable box passes (H+V each), which
 * by the central limit theorem approximate the gaussian the GPU shader runs.
 * Each pass is a sliding window, so the whole filter is O(1) per pixel
 * regardless of radius — the caller still caps the radius via
 * cpuBlurRadius(), see CPU_BLUR_RADIUS_CAP for why.
 */
export function applyBoxBlur(data, width, height, radius) {
  const r = Math.round(radius);
  if (r < 1) return data;
  // Intermediate passes stay in scratch buffers so only the final result is
  // written back; per-pass uint8 rounding is an acceptable approximation.
  const scratchA = new Uint8ClampedArray(data.length);
  const scratchB = new Uint8ClampedArray(data.length);
  let src = data;
  for (let pass = 0; pass < 3; pass++) {
    const last = pass === 2;
    boxBlurHorizontal(src, scratchA, width, height, r);
    boxBlurVertical(scratchA, last ? data : scratchB, width, height, r);
    src = last ? data : scratchB;
  }
  return data;
}
