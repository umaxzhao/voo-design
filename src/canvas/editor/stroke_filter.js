/**
 * The stroke-ring maths for the node stroke effect.
 *
 * Pure functions over alpha buffers — no canvas, no GL, no React. The stroke
 * is the band of pixels the node's alpha outline would cover at a given
 * width: outside keeps the band the shape's alpha gains when dilated,
 * inside keeps the band it loses when eroded, center keeps both halves.
 * Dilation/erosion are square box filters over the alpha, computed with
 * sliding-window maxima so the cost stays linear in the pixel count.
 */

/** Symmetric square-box max filter over a Uint8Array (treats it as W×H). */
export function boxMax(src, width, height, radius) {
  const r = Math.max(0, Math.round(radius));
  if (r === 0 || width <= 0 || height <= 0) return Uint8Array.from(src);
  const tmp = new Uint8Array(width * height);

  // Horizontal: causal forward scan covers [x-r, x], anti-causal backward
  // covers [x, x+r]; the elementwise max is the symmetric [x-r, x+r] box.
  for (let y = 0; y < height; y += 1) {
    const base = y * width;
    const q = [];
    let head = 0;
    for (let x = 0; x < width; x += 1) {
      const v = src[base + x];
      while (q.length > head && src[base + q[q.length - 1]] <= v) q.pop();
      q.push(x);
      while (q.length > head && q[head] < x - r) head += 1;
      tmp[base + x] = src[base + q[head]];
    }
    const bq = [];
    let bhead = 0;
    for (let x = width - 1; x >= 0; x -= 1) {
      const v = src[base + x];
      while (bq.length > bhead && src[base + bq[bq.length - 1]] <= v) bq.pop();
      bq.push(x);
      while (bq.length > bhead && bq[bhead] > x + r) bhead += 1;
      const i = base + x;
      const b = src[base + bq[bhead]];
      tmp[i] = b > tmp[i] ? b : tmp[i];
    }
  }

  // Vertical pass on the horizontal result.
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    const q = [];
    let head = 0;
    for (let y = 0; y < height; y += 1) {
      const i = y * width + x;
      const v = tmp[i];
      while (q.length > head && tmp[q[q.length - 1]] <= v) q.pop();
      q.push(i);
      while (q.length > head && q[head] < (y - r) * width + x) head += 1;
      out[i] = tmp[q[head]];
    }
    const bq = [];
    let bhead = 0;
    for (let y = height - 1; y >= 0; y -= 1) {
      const i = y * width + x;
      const v = tmp[i];
      while (bq.length > bhead && tmp[bq[bq.length - 1]] <= v) bq.pop();
      bq.push(i);
      while (bq.length > bhead && bq[bhead] > (y + r) * width + x) bhead += 1;
      const b = tmp[bq[bhead]];
      out[i] = b > out[i] ? b : out[i];
    }
  }
  return out;
}

/** Symmetric square-box min filter: invert, max, invert. */
export function boxMin(src, width, height, radius) {
  const size = width * height;
  const inverted = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) inverted[i] = 255 - src[i];
  const maxed = boxMax(inverted, width, height, radius);
  for (let i = 0; i < size; i += 1) maxed[i] = 255 - maxed[i];
  return maxed;
}

/**
 * Separable square-box mean filter (a cheap blur): three box passes on the
 * value approximate a Gaussian. The causal/anti-causal sliding-window sums
 * keep each pass linear in the pixel count.
 */
export function boxBlur(src, width, height, radius) {
  const r = Math.max(1, Math.round(radius));
  const tmp = new Float64Array(width * height);

  // Horizontal: running sums forward and backward, then average.
  for (let y = 0; y < height; y += 1) {
    const base = y * width;
    let sum = 0;
    for (let x = 0; x < width; x += 1) {
      sum += src[base + x];
      if (x > 2 * r) sum -= src[base + x - 2 * r - 1];
      tmp[base + x] = sum / Math.min(2 * r + 1, x + 1);
    }
    sum = 0;
    for (let x = width - 1; x >= 0; x -= 1) {
      sum += src[base + x];
      if (x < width - 2 * r - 1) sum -= src[base + x + 2 * r + 1];
      const window = Math.min(2 * r + 1, width - x);
      const v = sum / window;
      tmp[base + x] = v > tmp[base + x] ? v : tmp[base + x];
    }
  }

  // Vertical on the horizontal result.
  const out = new Float64Array(width * height);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = 0; y < height; y += 1) {
      const i = y * width + x;
      sum += tmp[i];
      if (y > 2 * r) sum -= tmp[(y - 2 * r - 1) * width + x];
      out[i] = sum / Math.min(2 * r + 1, y + 1);
    }
    sum = 0;
    for (let y = height - 1; y >= 0; y -= 1) {
      const i = y * width + x;
      sum += tmp[i];
      if (y < height - 2 * r - 1) sum -= tmp[(y + 2 * r + 1) * width + x];
      const window = Math.min(2 * r + 1, height - y);
      const v = sum / window;
      out[i] = v > out[i] ? v : out[i];
    }
  }
  return out;
}

/**
 * Builds an inner-shadow alpha map: the silhouette shifted by the light
 * offset no longer covers the far edge, so that band — blurred for softness
 * and clipped to the shape — is the shadow. Returns null when nothing casts.
 *
 * @param {Uint8Array} alpha the node's painted alpha, width×height
 * @param {number} offsetX light shift, px
 * @param {number} offsetY light shift, px
 * @param {number} blur softness radius, px
 */
export function buildInnerShadow(alpha, width, height, offsetX, offsetY, blur, spread = 0) {
  const size = width * height;
  const dx = Math.round(offsetX);
  const dy = Math.round(offsetY);
  const crisp = new Float64Array(size);
  let any = false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const sx = x - dx;
      const sy = y - dy;
      const shifted =
        sx >= 0 && sy >= 0 && sx < width && sy < height
          ? alpha[sy * width + sx]
          : 0;
      const v = alpha[i] - shifted;
      if (v > 0) {
        crisp[i] = v;
        any = true;
      }
    }
  }
  if (!any) return null;
  const blurred = blur > 0 ? boxBlur(crisp, width, height, blur) : crisp;
  // Spread is the share of the band that stays solid instead of fading out:
  // 0 keeps the blur as it is, 100 keeps the crisp band. Approximates Figma's
  // inner spread, which widens the solid part of the shadow.
  const solid = Math.min(1, Math.max(0, spread / 100));
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    // Clip to the shape and scale back to a byte.
    const mixed = blurred[i] + (crisp[i] - blurred[i]) * solid;
    const v = (mixed * alpha[i]) / 255;
    out[i] = Math.min(255, Math.round(v));
  }
  return out;
}

/**
 * Builds an inner-glow alpha map: the rim band inside the silhouette edge
 * (the shape minus its eroded self), blurred for softness and clipped to the
 * shape — a soft halo hugging the inside of the edge. Returns null when
 * nothing glows.
 *
 * @param {Uint8Array} alpha the node's painted alpha, width×height
 * @param {number} size how far the glow extends inward, px
 * @param {number} blur softness radius, px
 */
export function buildInnerGlow(alpha, width, height, size, blur) {
  const s = Math.max(0, Math.min(48, Math.round(size)));
  const count = width * height;
  if (!(s > 0) || width <= 0 || height <= 0) return null;
  const eroded = boxMin(alpha, width, height, s);
  const rim = new Float64Array(count);
  let any = false;
  for (let i = 0; i < count; i += 1) {
    const v = alpha[i] - eroded[i];
    if (v > 0) {
      rim[i] = v;
      any = true;
    }
  }
  if (!any) return null;
  const blurred = blur > 0 ? boxBlur(rim, width, height, blur) : rim;
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = Math.min(255, Math.round((blurred[i] * alpha[i]) / 255));
  }
  return out;
}

/**
 * Builds a satin alpha map: the sheen Photoshop draws from the silhouette
 * offset against itself. The band where the shape and its offset copy differ
 * — blurred for softness and clipped to the shape — reads as the ripple; the
 * invert flag swaps the band for its complement, like Photoshop's invert.
 * Returns null when nothing sheens (zero offset).
 *
 * @param {Uint8Array} alpha the node's painted alpha, width×height
 * @param {number} offsetX sheen shift, px
 * @param {number} offsetY sheen shift, px
 * @param {number} blur softness radius, px
 * @param {boolean} invert
 */
export function buildSatin(
  alpha,
  width,
  height,
  offsetX,
  offsetY,
  blur,
  invert,
) {
  const count = width * height;
  const dx = Math.round(offsetX);
  const dy = Math.round(offsetY);
  if (dx === 0 && dy === 0) return null;
  const crisp = new Float64Array(count);
  let any = false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const sx = x - dx;
      const sy = y - dy;
      const shifted =
        sx >= 0 && sy >= 0 && sx < width && sy < height
          ? alpha[sy * width + sx]
          : 0;
      const d = Math.abs(alpha[i] - shifted);
      if (d > 0) {
        crisp[i] = d;
        any = true;
      }
    }
  }
  if (!any) return null;
  const blurred = blur > 0 ? boxBlur(crisp, width, height, blur) : crisp;
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    let v = (blurred[i] * alpha[i]) / 255;
    if (invert) v = alpha[i] - v;
    out[i] = Math.min(255, Math.max(0, Math.round(v)));
  }
  return out;
}

/**
 * Builds the stroke ring alpha (0..255, same length as the alpha buffer)
 * for a node's silhouette, or null when the stroke width is zero.
 *
 * @param {Uint8Array} alpha the node's painted alpha, width×height
 * @param {number} width
 * @param {number} height
 * @param {number} strokeWidth in px
 * @param {'inside'|'center'|'outside'} position
 */
export function buildStrokeRing(alpha, width, height, strokeWidth, position) {
  const w = Math.max(0, Math.min(48, Math.round(strokeWidth)));
  if (!(w > 0) || width <= 0 || height <= 0) return null;
  const size = width * height;
  let ring;
  if (position === "inside") {
    const eroded = boxMin(alpha, width, height, w);
    ring = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) ring[i] = alpha[i] - eroded[i];
  } else if (position === "outside") {
    const dilated = boxMax(alpha, width, height, w);
    ring = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) ring[i] = dilated[i] - alpha[i];
  } else {
    const dilated = boxMax(alpha, width, height, Math.ceil(w / 2));
    const eroded = boxMin(alpha, width, height, Math.floor(w / 2));
    ring = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) ring[i] = dilated[i] - eroded[i];
  }
  return ring;
}
