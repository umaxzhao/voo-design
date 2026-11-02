import { PORTRAIT_RETOUCH_STEPS } from "./portrait-retouch-constants.js";

/**
 * On-device portrait retouching engine (skin smoothing / blemish removal /
 * skin brightening).
 *
 * Pure pixel maths over RGBA bytes: no DOM, no canvas, no ONNX, no WebGL, so
 * the module runs unchanged in the extension, the web build and under
 * `node --test`. Every entry point takes `(rgba, width, height, options)` and
 * returns a NEW Uint8ClampedArray; the input buffer is never mutated.
 *
 * Algorithms
 *   skinSmooth       Edge-preserving guided filter (He, Sun & Tang 2010) with
 *                    the luminance plane as guide. Where the local variance is
 *                    high (the skin boundary, eyes, hair) the regression slope
 *                    `a` approaches 1 and the filter returns the pixel almost
 *                    unchanged; where it is flat, `a` is small and the pixel is
 *                    pulled towards its local mean. That is the "smooth the
 *                    skin, keep the features" behaviour, and it costs no edge
 *                    detection pass.
 *   blemishRemoval   Small dark/red outliers are found by comparing each pixel
 *                    against the median of its own neighbourhood, then blended
 *                    towards that median. The median (not the mean) is what
 *                    makes a spot detectable without the spot itself biasing
 *                    the reference. A directional-continuity test runs first so
 *                    eyelashes, hair and lip lines survive.
 *   skinBrighten     Multiplicative luminance gain (gamma curve) applied to
 *                    hue-gated skin only. Scaling R, G and B by the same
 *                    positive ratio keeps the R:G:B balance, so skin lightens
 *                    instead of bleaching towards grey.
 *
 * Application order (see PORTRAIT_RETOUCH_STEPS): blemish, then skinSmooth,
 * then skinBrighten. Spots are corrected before smoothing because the guided
 * filter would otherwise smear a raw spot into a wider, softer halo; the
 * brightening runs last so the luminance lift is not re-averaged away.
 *
 * Cost model: the guided filter keeps a handful of Float32Array planes of
 * `width * height` (ten float planes plus one byte plane), allocated once per
 * call and reused across the colour channels. Peak memory is therefore O(n)
 * with a large constant, so callers should hand in the region actually being
 * retouched (the layer bounds, or the matting bounding box) rather than a
 * full-resolution canvas when the document is very large.
 */

import { RETOUCH_ERRORS, PortraitRetouchError } from "./portrait_retouch_errors.js";

// Re-exported so a caller can catch the engine's failures from a single import.
export { RETOUCH_ERRORS, PortraitRetouchError };

/**
 * The retouch steps in the order `applyPortraitRetouch` applies them.
 * Exported as data so the UI can lay out its sliders in the same order instead
 * of hardcoding it a second place.
 */
export { PORTRAIT_RETOUCH_STEPS } from "./portrait-retouch-constants.js";

// --- Tuning constants (single source of truth for every magic number below) ---

const SMOOTH_RADIUS_DEFAULT = 3;
/** Regularisation of the guided filter. In normalised luminance units this is
 *  sqrt(0.002) ~ 4.5/255: detail below that amplitude is treated as noise. */
const SMOOTH_EPS_DEFAULT = 0.002;
/**
 * How much darker / redder than its neighbourhood median a pixel must be to
 * count as a spot at all. Below this it is texture, not a blemish. */
const BLEMISH_DARK_DELTA_DEFAULT = 16;
const BLEMISH_RED_DELTA_DEFAULT = 16;
/** The removal window must be wider than the spot: a spot that fills most of
 *  its own window drags the median towards its own value and stops looking like
 *  an outlier. radius 3 (a 7x7 window) clears the small blemishes this targets;
 *  measurably, a 5px mole goes 105 -> 192 at radius 3 but only 105 -> 135 at
 *  radius 2. Wider spots need a wider radius. */
const BLEMISH_RADIUS_DEFAULT = 3;
/** Excess beyond the threshold that maps to a full-strength correction. */
const BLEMISH_ANOMALY_SPAN = 16;
/** Luminance distance within which two neighbours count as "the same line". */
const BLEMISH_LINE_TOLERANCE = 14;
/** Consecutive samples along one direction that make a line a line. */
const BLEMISH_LINE_PROBE = 3;
/** Gamma exponent reached at |amount| = 1 (kept below 1 stop so skin keeps its
 *  texture instead of clipping to flat white). */
const BRIGHTEN_GAMMA_RANGE = 0.75;
const SKIN_CB_MIN = 70;
const SKIN_CB_MAX = 135;
const SKIN_CR_MIN = 130;
const SKIN_CR_MAX = 192;
/** Hue window (degrees) for warm skin; the ramps fade the effect in and out so
 *  lips and blush do not get a hard edge. */
const SKIN_HUE_FULL_MIN = 10;
const SKIN_HUE_FULL_MAX = 40;
const SKIN_HUE_FADE_MIN = 0;
const SKIN_HUE_FADE_MAX = 50;
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;
const WEIGHT_FULL = 255;

const UINT8_CTORS = [Uint8Array, Uint8ClampedArray];

/**
 * Capability predicate for the editor's AI feature surface.
 *
 * Portrait retouching is plain JS over typed arrays, so unlike upscale or
 * matting it has no WASM/ONNX/OffscreenCanvas prerequisite and is available in
 * every build (extension, Electron, hosted web) and in Node. Exported here so
 * `ai_capabilities.js` can delegate rather than duplicate the answer.
 */
export function isPortraitRetouchSupported() {
  return typeof Uint8ClampedArray === "function" && typeof Float32Array === "function";
}

function fail(code, detail) {
  throw new PortraitRetouchError(code, detail);
}

function clampIndex(value, max) {
  return value < 0 ? 0 : value > max ? max : value;
}

function lumaAt(rgba, index) {
  const o = index * 4;
  return LUMA_R * rgba[o] + LUMA_G * rgba[o + 1] + LUMA_B * rgba[o + 2];
}

/** Fail-fast validation shared by every public entry point. */
export function validateRetouchParams(rgba, width, height, options = {}) {
  if (!UINT8_CTORS.some((Ctor) => rgba instanceof Ctor)) {
    fail(RETOUCH_ERRORS.INVALID_BUFFER, "rgba must be a Uint8Array or Uint8ClampedArray");
  }
  if (!Number.isInteger(width) || width <= 0) {
    fail(RETOUCH_ERRORS.INVALID_DIMENSIONS, `width must be a positive integer, got ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    fail(RETOUCH_ERRORS.INVALID_DIMENSIONS, `height must be a positive integer, got ${height}`);
  }
  if (rgba.length !== width * height * 4) {
    fail(
      RETOUCH_ERRORS.DIMENSION_MISMATCH,
      `buffer holds ${rgba.length} bytes, ${width}x${height} RGBA needs ${width * height * 4}`,
    );
  }
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    fail(RETOUCH_ERRORS.INVALID_PARAMETER, "options must be a plain object");
  }
  const { mask } = options;
  if (mask === undefined || mask === null) return;
  if (!UINT8_CTORS.some((Ctor) => mask instanceof Ctor)) {
    fail(RETOUCH_ERRORS.INVALID_PARAMETER, "mask must be a Uint8Array or Uint8ClampedArray");
  }
  if (mask.length !== width * height) {
    fail(
      RETOUCH_ERRORS.MASK_MISMATCH,
      `mask holds ${mask.length} samples, ${width}x${height} needs ${width * height}`,
    );
  }
}

/** Reads a bounded scalar option, throwing (never clamping) when out of range. */
function readBounded(value, name, min, max) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(RETOUCH_ERRORS.INVALID_PARAMETER, `${name} must be a finite number`);
  }
  if (value < min || value > max) {
    fail(RETOUCH_ERRORS.INVALID_PARAMETER, `${name} must be within [${min}, ${max}], got ${value}`);
  }
  return value;
}

/**
 * Reads a scalar option that must be strictly positive, throwing (never
 * clamping) when it is not.
 *
 * `readBounded` cannot express this and its inclusive `min` is the wrong shape
 * for the guided filter's regularisation: `eps` sits in the denominator of the
 * local linear model (`varI + eps`), where 0 is not "no regularisation" but a
 * division by the local variance — an exact 0/0 in every flat window, which
 * wrote NaN through the slope and landed as black. A strictly positive floor is
 * what makes the denominator provably non-zero, so the artifact cannot come
 * back.
 */
function readPositive(value, name, max) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(RETOUCH_ERRORS.INVALID_PARAMETER, `${name} must be a finite number`);
  }
  if (value <= 0 || value > max) {
    fail(RETOUCH_ERRORS.INVALID_PARAMETER, `${name} must be within (0, ${max}], got ${value}`);
  }
  return value;
}

function readRadius(value, name) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    fail(RETOUCH_ERRORS.INVALID_PARAMETER, `${name} must be a non-negative integer`);
  }
  return value;
}

/**
 * Skin chroma model in ITU-R BT.601 YCbCr.
 *
 * The Cb/Cr box is deliberately wide: it has to hold fair, olive, tan and dark
 * skin in one box, plus the extra red of a flushed spot (which the blemish step
 * needs to see). The RGB pre-checks reject neutrals and cool colours that would
 * otherwise fall inside that box, and keep saturated blue/green out.
 *
 * Known limit, by construction: chroma cannot separate dark hair, a brow or an
 * eyelash line from dark skin in shadow - they land in the same Cb/Cr box - so
 * skinSmooth and skinBrighten do act on them unless the caller passes a `mask`
 * (the matting result is the intended source). Narrowing the box to exclude
 * them would exclude dark skin tones with them, which is the worse trade.
 * blemishRemoval keeps those structures intact structurally instead, through
 * its line probe.
 */
export function isSkinPixel(r, g, b) {
  if (r < 45 || r <= g || r <= b || r - b < 12) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= SKIN_CB_MIN && cb <= SKIN_CB_MAX && cr >= SKIN_CR_MIN && cr <= SKIN_CR_MAX;
}

/**
 * Separable box blur with clamp-to-edge boundaries.
 *
 * The horizontal pass accumulates the leading window and then slides it, so the
 * cost is O(1) per pixel instead of O(radius). Each axis clamps its own radius
 * so a radius wider than the image repeats no sample.
 *
 * `scratch` is caller-owned row storage of `width * height` floats and must be
 * distinct from both `src` and `dst`: allocating it per call would churn one
 * full-size buffer per pass. The vertical pass reads only that scratch, never
 * `dst`, so passing the same array as `src` and `dst` blurs in place legally.
 */
function boxBlur2D(src, dst, width, height, radius, scratch) {
  if (radius <= 0 || (width === 1 && height === 1)) {
    if (src !== dst) dst.set(src);
    return;
  }
  const radX = Math.min(radius, width - 1);
  const radY = Math.min(radius, height - 1);
  const temp = scratch;
  const invX = 1 / (2 * radX + 1);
  const invY = 1 / (2 * radY + 1);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let dx = -radX; dx <= radX; dx++) sum += src[row + clampIndex(dx, width - 1)];
    for (let x = 0; x < width; x++) {
      temp[row + x] = sum * invX;
      sum += src[row + clampIndex(x + radX + 1, width - 1)];
      sum -= src[row + clampIndex(x - radX, width - 1)];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let dy = -radY; dy <= radY; dy++) sum += temp[clampIndex(dy, height - 1) * width + x];
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum * invY;
      sum += temp[clampIndex(y + radY + 1, height - 1) * width + x];
      sum -= temp[clampIndex(y - radY, height - 1) * width + x];
    }
  }
}

/**
 * Median of the (2 * radius + 1)^2 neighbourhood around (cx, cy), read through
 * a strided view: `src[(y * width + x) * stride + offset]`.
 *
 * Pass `stride = 1, offset = 0` for a scalar plane (luminance, redness) and
 * `stride = 4, offset = channel` for an RGBA channel. `scratch` is caller-owned
 * storage of at least the window size, reused across pixels so the hot loop
 * allocates nothing.
 */
function windowMedian(src, stride, offset, width, height, cx, cy, radius, scratch) {
  const radX = Math.min(radius, width - 1);
  const radY = Math.min(radius, height - 1);
  let k = 0;
  for (let dy = -radY; dy <= radY; dy++) {
    const row = clampIndex(cy + dy, height - 1) * width;
    for (let dx = -radX; dx <= radX; dx++) {
      scratch[k++] = src[(row + clampIndex(cx + dx, width - 1)) * stride + offset];
    }
  }
  const view = scratch.subarray(0, k);
  view.sort();
  return view[k >> 1];
}

/**
 * True when (x, y) sits on a line passing through the pixel (eyelash, hair,
 * eyebrow, lip line).
 *
 * An isolated spot is surrounded by background on every side, while a line
 * pixel has one axis where several *consecutive* samples keep its luminance.
 * The probe runs along rays rather than looking at the immediate neighbours
 * because the endpoint of a line has background on one side of its own axis -
 * a one-step test reads every hair tip and eyelash end as a spot and lightens
 * it, which is exactly the texture this step must not touch.
 */
function isLinearFeature(luma, width, height, x, y, value) {
  const axes = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (const [dx, dy] of axes) {
    for (const sign of [1, -1]) {
      let run = 0;
      for (let step = 1; step <= BLEMISH_LINE_PROBE; step++) {
        const px = x + sign * dx * step;
        const py = y + sign * dy * step;
        if (px < 0 || px >= width || py < 0 || py >= height) break;
        if (Math.abs(luma[py * width + px] - value) >= BLEMISH_LINE_TOLERANCE) break;
        run++;
      }
      if (run >= BLEMISH_LINE_PROBE) return true;
    }
  }
  return false;
}

/**
 * Per-pixel blend weight for one retouch step, quantised to a byte plane.
 *
 * 0 means "this pixel is out of scope" and stays exactly 0 through the
 * quantisation, which is what makes a `mask` of 0 byte-identical to the input.
 */
function buildWeightPlane(rgba, width, height, { strength, mask, skinOnly }) {
  const n = width * height;
  const weight = new Uint8Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (skinOnly && !isSkinPixel(rgba[o], rgba[o + 1], rgba[o + 2])) continue;
    const factor = mask ? mask[i] / WEIGHT_FULL : 1;
    const value = Math.round(factor * strength * WEIGHT_FULL);
    if (value > 0) {
      weight[i] = value;
      any = true;
    }
  }
  return any ? weight : null;
}

/**
 * Edge-preserving skin smoothing.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba source pixels (untouched)
 * @param {number} width
 * @param {number} height
 * @param {{strength?: number, radius?: number, mask?: Uint8Array|Uint8ClampedArray,
 *          eps?: number, skinOnly?: boolean}} [options]
 *   strength 0..1 (0 is a per-pixel identity), radius is the guided-filter
 *   window radius in pixels, mask is a per-pixel 0..255 gate (0 = untouched,
 *   e.g. the matting result), skinOnly defaults to true (false makes every
 *   pixel eligible instead of only those `isSkinPixel` accepts).
 *   eps must be strictly positive (0..1 is the useful band, default
 *   SMOOTH_EPS_DEFAULT): it is the guided filter's regularisation and sits in
 *   the denominator of the local linear model, so eps = 0 divides by the local
 *   variance and turns every flat region black. It is rejected at validation
 *   rather than clamped, because "no regularisation" is not a weaker filter,
 *   it is an undefined one.
 * @returns {Uint8ClampedArray} a new buffer, alpha copied through unchanged
 */
export function skinSmooth(rgba, width, height, options = {}) {
  validateRetouchParams(rgba, width, height, options);
  const strength = readBounded(options.strength, "strength", 0, 1) ?? 0;
  const radius = readRadius(options.radius, "radius") ?? SMOOTH_RADIUS_DEFAULT;
  const eps = readPositive(options.eps, "eps", 1) ?? SMOOTH_EPS_DEFAULT;
  const skinOnly = options.skinOnly !== false;
  const out = new Uint8ClampedArray(rgba);
  if (strength === 0) return out;

  const weight = buildWeightPlane(rgba, width, height, {
    strength,
    mask: options.mask,
    skinOnly,
  });
  // Nothing in scope (no skin, or the mask excludes everything): the identity
  // holds per pixel, so skip the filter entirely rather than filter and discard.
  if (!weight) return out;

  const n = width * height;
  const guide = new Float32Array(n);
  const meanI = new Float32Array(n);
  const varI = new Float32Array(n);
  const planeP = new Float32Array(n);
  const planeIP = new Float32Array(n);
  const meanP = new Float32Array(n);
  const meanIP = new Float32Array(n);
  const coefA = new Float32Array(n);
  const coefB = new Float32Array(n);
  // Row storage shared by every blur pass below, so no pass allocates.
  const blurScratch = new Float32Array(n);

  for (let i = 0; i < n; i++) guide[i] = lumaAt(rgba, i) / 255;

  // Guide statistics, shared by all three colour channels. `planeP` is reused
  // as the second-moment scratch here and reloaded per channel below.
  boxBlur2D(guide, meanI, width, height, radius, blurScratch);
  for (let i = 0; i < n; i++) planeP[i] = guide[i] * guide[i];
  boxBlur2D(planeP, planeIP, width, height, radius, blurScratch);
  for (let i = 0; i < n; i++) varI[i] = Math.max(0, planeIP[i] - meanI[i] * meanI[i]);

  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) {
      const value = rgba[i * 4 + c] / 255;
      planeP[i] = value;
      planeIP[i] = guide[i] * value;
    }
    boxBlur2D(planeP, meanP, width, height, radius, blurScratch);
    boxBlur2D(planeIP, meanIP, width, height, radius, blurScratch);
    // Local linear model of P over the guide: P ~ a * I + b. Where the local
    // variance is large, `a` tends to 1 and `b` to 0, so an edge comes back out
    // of the filter essentially untouched.
    for (let i = 0; i < n; i++) {
      const slope = (meanIP[i] - meanI[i] * meanP[i]) / (varI[i] + eps);
      coefA[i] = slope;
      coefB[i] = meanP[i] - slope * meanI[i];
    }
    // Safe in place: boxBlur2D never reads its destination.
    boxBlur2D(coefA, coefA, width, height, radius, blurScratch);
    boxBlur2D(coefB, coefB, width, height, radius, blurScratch);

    for (let i = 0; i < n; i++) {
      const w = weight[i] / WEIGHT_FULL;
      if (w === 0) continue;
      const idx = i * 4 + c;
      const original = rgba[idx];
      const filtered = (coefA[i] * guide[i] + coefB[i]) * 255;
      out[idx] = original + (filtered - original) * w;
    }
  }
  return out;
}

/**
 * Blemish removal: pulls small dark or red outliers back towards the median of
 * their own neighbourhood, leaving linear features (hair, eyelashes, lip line)
 * alone.
 *
 * @param {{strength?: number, radius?: number, mask?: Uint8Array|Uint8ClampedArray,
 *          darkThreshold?: number, redThreshold?: number, skinOnly?: boolean}} [options]
 *   darkThreshold / redThreshold are how far beyond the local median a pixel
 *   must sit before it counts as a spot.
 * @returns {Uint8ClampedArray} a new buffer, alpha copied through unchanged
 */
export function blemishRemoval(rgba, width, height, options = {}) {
  validateRetouchParams(rgba, width, height, options);
  const strength = readBounded(options.strength, "strength", 0, 1) ?? 0;
  const radius = readRadius(options.radius, "radius") ?? BLEMISH_RADIUS_DEFAULT;
  const darkThreshold =
    readBounded(options.darkThreshold, "darkThreshold", 0, 255) ?? BLEMISH_DARK_DELTA_DEFAULT;
  const redThreshold =
    readBounded(options.redThreshold, "redThreshold", 0, 255) ?? BLEMISH_RED_DELTA_DEFAULT;
  const skinOnly = options.skinOnly !== false;
  const mask = options.mask;
  const out = new Uint8ClampedArray(rgba);
  if (strength === 0 || radius === 0) return out;

  const n = width * height;
  const dark = new Float32Array(n);
  const redness = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    dark[i] = lumaAt(rgba, i);
    redness[i] = rgba[o] - rgba[o + 1];
  }
  const windowSize = (2 * radius + 1) * (2 * radius + 1);
  const scratch = new Float32Array(windowSize);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const idx = i * 4;
      if (skinOnly && !isSkinPixel(rgba[idx], rgba[idx + 1], rgba[idx + 2])) continue;
      const maskFactor = mask ? mask[i] / WEIGHT_FULL : 1;
      if (maskFactor === 0) continue;

      const excessDark =
        windowMedian(dark, 1, 0, width, height, x, y, radius, scratch) - dark[i];
      const excessRed =
        redness[i] - windowMedian(redness, 1, 0, width, height, x, y, radius, scratch);
      const isDark = excessDark > darkThreshold;
      const isRed = excessRed > redThreshold;
      if (!isDark && !isRed) continue;
      if (isLinearFeature(dark, width, height, x, y, dark[i])) continue;

      // How far past the threshold the pixel sits, as a 0..1 correction ramp:
      // a just-noticeable outlier is barely touched, a strong spot is fully
      // replaced by the local median.
      let anomaly = 0;
      if (isDark) {
        anomaly = Math.min(1, (excessDark - darkThreshold) / BLEMISH_ANOMALY_SPAN + 0.5);
      }
      if (isRed) {
        anomaly = Math.max(
          anomaly,
          Math.min(1, (excessRed - redThreshold) / BLEMISH_ANOMALY_SPAN + 0.5),
        );
      }
      const blend = strength * anomaly * maskFactor;
      if (blend <= 0) continue;

      for (let c = 0; c < 3; c++) {
        const target = windowMedian(rgba, 4, c, width, height, x, y, radius, scratch);
        out[idx + c] = rgba[idx + c] + (target - rgba[idx + c]) * blend;
      }
    }
  }
  return out;
}

/** Weight of the warm-skin hue window, ramped at both edges. */
function skinHueWeight(r, g, b) {
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta < 5) return 0;
  let hue;
  if (max === r) hue = ((g - b) / delta) * 60;
  else if (max === g) hue = ((b - r) / delta + 2) * 60;
  else hue = ((r - g) / delta + 4) * 60;
  if (hue < SKIN_HUE_FADE_MIN || hue > SKIN_HUE_FADE_MAX) return 0;
  if (hue < SKIN_HUE_FULL_MIN) {
    return (hue - SKIN_HUE_FADE_MIN) / (SKIN_HUE_FULL_MIN - SKIN_HUE_FADE_MIN);
  }
  if (hue > SKIN_HUE_FULL_MAX) {
    return (SKIN_HUE_FADE_MAX - hue) / (SKIN_HUE_FADE_MAX - SKIN_HUE_FULL_MAX);
  }
  return 1;
}

/**
 * Luminance lift (or lift-down) for skin tones.
 *
 * @param {{amount?: number, mask?: Uint8Array|Uint8ClampedArray, skinOnly?: boolean}} [options]
 *   amount runs -1..1 (positive brightens, negative darkens); 0 is a per-pixel
 *   identity.
 * @returns {Uint8ClampedArray} a new buffer, alpha copied through unchanged
 */
export function skinBrighten(rgba, width, height, options = {}) {
  validateRetouchParams(rgba, width, height, options);
  const amount = readBounded(options.amount, "amount", -1, 1) ?? 0;
  const skinOnly = options.skinOnly !== false;
  const mask = options.mask;
  const out = new Uint8ClampedArray(rgba);
  if (amount === 0) return out;

  // One gamma curve for the whole image; each pixel is scaled by the ratio it
  // implies, so brightening is multiplicative and never desaturates.
  const gamma = Math.pow(2, -amount * BRIGHTEN_GAMMA_RANGE);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    if (skinOnly && !isSkinPixel(r, g, b)) continue;
    const maskFactor = mask ? mask[i] / WEIGHT_FULL : 1;
    if (maskFactor === 0) continue;

    const hueWeight = skinHueWeight(r, g, b);
    const w = maskFactor * hueWeight;
    if (w === 0) continue;

    const y = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    if (y <= 0) continue;
    const ratio = Math.pow(y / 255, gamma) * (255 / y);
    out[idx] = r + (r * ratio - r) * w;
    out[idx + 1] = g + (g * ratio - g) * w;
    out[idx + 2] = b + (b * ratio - b) * w;
  }
  return out;
}

/** Applies one step of PORTRAIT_RETOUCH_STEPS to the buffer it is handed. */
const STEP_APPLIERS = Object.freeze({
  blemish: (buffer, width, height, options) => blemishRemoval(buffer, width, height, options),
  skinSmooth: (buffer, width, height, options) => skinSmooth(buffer, width, height, options),
  skinBrighten: (buffer, width, height, options) => skinBrighten(buffer, width, height, options),
});

/**
 * Normalises one step option: a bare number is shorthand for the step's own
 * scalar (`strength` for blemish/skinSmooth, `amount` for skinBrighten), an
 * object is that step's full option set.
 */
function resolveStepOptions(raw, scalarKey, scalarRange) {
  if (raw === undefined || raw === null) return null;
  const step = typeof raw === "object" ? { ...raw } : { [scalarKey]: raw };
  if (!(scalarKey in step)) {
    fail(RETOUCH_ERRORS.INVALID_PARAMETER, `${scalarKey} is required for this step`);
  }
  readBounded(step[scalarKey], scalarKey, scalarRange[0], scalarRange[1]);
  const value = step[scalarKey];
  const enabled = scalarKey === "amount" ? value !== 0 : value > 0;
  return enabled ? step : null;
}

/**
 * Single entry point: applies every enabled step in PORTRAIT_RETOUCH_STEPS
 * order and returns a new buffer. The input is never mutated.
 *
 * @param {{blemish?: number|object, skinSmooth?: number|object,
 *          skinBrighten?: number|object, mask?: Uint8Array|Uint8ClampedArray,
 *          skinOnly?: boolean}} [options]
 *   Each step accepts a number (`{ skinSmooth: 0.6 }`) or its own option object
 *   (`{ skinSmooth: { strength: 0.6, radius: 4 } }`). `mask` and `skinOnly`
 *   apply to every step. All-zero options return an untouched copy.
 * @returns {Uint8ClampedArray}
 */
export function applyPortraitRetouch(rgba, width, height, options = {}) {
  validateRetouchParams(rgba, width, height, options);
  const { mask, skinOnly } = options;
  const shared = skinOnly === undefined ? { mask } : { mask, skinOnly };
  const enabled = [];
  for (const step of PORTRAIT_RETOUCH_STEPS) {
    if (step === "skinBrighten") {
      const resolved = resolveStepOptions(options.skinBrighten, "amount", [-1, 1]);
      if (resolved) enabled.push([step, { ...resolved, ...shared }]);
      continue;
    }
    const resolved = resolveStepOptions(options[step], "strength", [0, 1]);
    if (resolved) enabled.push([step, { ...resolved, ...shared }]);
  }
  if (enabled.length === 0) return new Uint8ClampedArray(rgba);

  let current = rgba;
  for (const [step, stepOptions] of enabled) {
    current = STEP_APPLIERS[step](current, width, height, stepOptions);
  }
  return current instanceof Uint8ClampedArray ? current : new Uint8ClampedArray(current);
}
