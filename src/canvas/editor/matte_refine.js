/**
 * Cleaning up the edge of a matting model's answer.
 *
 * A segmentation model answers "which pixels are the subject" on its own
 * square input, and its answer carries two artefacts that are obvious the
 * moment the cutout is put on a different background:
 *
 * 1. The matte is mapped back up to the picture's size, so its transition band
 *    is as many pixels wide as the ratio between the two, and a hard model
 *    edge turns into a staircase along every diagonal.
 * 2. That band sits where the model's output grid landed rather than where the
 *    picture's colours change, so the edge is soft in a direction the picture
 *    contradicts.
 *
 * So the refinement here is range-aware rather than shape-aware: alpha is
 * moved only where the picture's own colours say an edge is.
 *
 * **Colour unmixing is deliberately absent.** A pixel the model called "half
 * subject" still carries the colour it had in the original picture, and on a
 * new background that half reads as a fringe of the old one — but reversing
 * that needs the picture's RGBA beside the matte, and what this module is
 * handed is a matte whose RGB is white by construction (`maskToRgba` in
 * `matting_transform.js`): the old background's colour is not in the buffer to
 * solve for. The one stage that does hold both is `applyMatte`'s render-time
 * composite (`cpu_adjustments_matte.js`), which redraws on every pan and zoom
 * and cannot pay for a float-plane pass over every pixel. A `defringe()`
 * written for that job had no caller anywhere in `src/`, so it was removed
 * rather than left as tested-but-unreachable debt; a cutout edge therefore
 * keeps whatever fringe the model left on it. Do not re-add one without
 * naming the stage that will call it.
 *
 * All of it is arithmetic over typed arrays — no DOM, no canvas, no ONNX. A
 * refiner that could only be judged through a rendered image is a refiner
 * whose bugs are invisible; these functions run under `node --test`.
 */

/**
 * Defaults, tuned for hair and fur rather than for hard-edged objects.
 *
 * `radius` is the window the local model is fitted in: wide enough to see the
 * subject's colour on both sides of a soft edge, narrow enough not to average
 * across a whole face. `epsilon` is the guide's variance below which a window
 * counts as flat and the fit falls back to a plain mean — small, because a
 * real colour edge should transfer almost entirely. `band` is how far from the
 * matte's own transition a pixel may be rewritten, and `strength` is how much
 * of the rewritten value is taken — below 1 so that a model that was already
 * right is not pulled around by texture it happened to find.
 */
export const MATTE_REFINE_DEFAULTS = Object.freeze({
  radius: 8,
  epsilon: 1e-4,
  band: 2,
  strength: 0.6,
});

/** Feather window; a couple of pixels is all a feathered edge needs. */
export const MATTE_FEATHER_DEFAULTS = Object.freeze({ radius: 2 });

/**
 * Rec. 601 luma weights, used to reduce the guide to one channel.
 *
 * A single-channel guide keeps the guided filter's working set at one float
 * per pixel per stage; per-channel guidance is a little better on edges whose
 * sides differ in hue but not in brightness, and costs three times the memory
 * on a picture that may be 32 megapixels (see `workspace_cap.js`).
 */
const LUMA_RED = 0.299;
const LUMA_GREEN = 0.587;
const LUMA_BLUE = 0.114;

/** Below this weight there is nothing in the window to estimate a mean from. */
const EMPTY_WEIGHT = 1e-6;

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function assertGeometry(width, height) {
  const whole = Number.isInteger(width) && Number.isInteger(height);
  if (!whole || width <= 0 || height <= 0) {
    throw new Error("matteRefineInvalidSize");
  }
}

/**
 * The matte as 0..1 floats in a fresh array.
 *
 * Byte-typed mattes carry 0..255 and float ones carry 0..1; normalising here
 * means every function below works in one unit. The copy is not incidental:
 * callers hand in the mask the editor still owns, and these functions must
 * never write to it.
 */
function alphaToUnit(alpha, width, height) {
  const count = width * height;
  if (!alpha || typeof alpha.length !== "number" || alpha.length !== count) {
    throw new Error("matteRefineAlphaSizeMismatch");
  }
  const isByte = alpha instanceof Uint8Array || alpha instanceof Uint8ClampedArray;
  const scale = isByte ? 1 / 255 : 1;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) out[i] = clamp01(alpha[i] * scale);
  return out;
}

function assertRgbaLength(rgba, count) {
  if (!rgba || typeof rgba.length !== "number" || rgba.length !== count * 4) {
    throw new Error("matteRefineRgbaSizeMismatch");
  }
}

/** A window radius as a whole number of pixels; anything unusable is zero. */
function resolveRadius(value, fallback) {
  const radius = Math.floor(Number(value ?? fallback));
  return Number.isFinite(radius) && radius > 0 ? radius : 0;
}

/**
 * One-dimensional window means along every line of a grid.
 *
 * Sums are accumulated into a prefix array first, so each output costs one
 * subtraction instead of one addition per window pixel: the radius stops
 * contributing to the running time, which matters because the refinement
 * below takes several of these passes and the naive form is O(pixels *
 * radius²) — 289 taps per pixel per pass at the default radius.
 *
 * A window that runs off the end of a line clamps instead of shrinking, so the
 * border keeps a full-width divisor and is not darkened by a mean over fewer
 * samples.
 *
 * @param {number} lineCount how many lines to walk.
 * @param {number} lineLength how many elements each line has.
 * @param {number} lineStride distance in the buffer between line starts.
 * @param {number} elementStride distance between elements within a line.
 */
function lineMeans(
  source,
  dest,
  lineCount,
  lineLength,
  lineStride,
  elementStride,
  radius,
  prefix,
) {
  for (let line = 0; line < lineCount; line += 1) {
    const base = line * lineStride;
    prefix[0] = 0;
    for (let i = 0; i < lineLength; i += 1) {
      prefix[i + 1] = prefix[i] + source[base + i * elementStride];
    }
    for (let i = 0; i < lineLength; i += 1) {
      const low = Math.max(0, i - radius);
      const high = Math.min(lineLength - 1, i + radius);
      dest[base + i * elementStride] =
        (prefix[high + 1] - prefix[low]) / (high - low + 1);
    }
  }
}

/**
 * Mean of a square window, as two passes of `lineMeans`.
 *
 * A box is separable, so averaging the rows and then averaging the columns of
 * that result gives exactly the 2D box mean.
 */
function boxBlur(source, dest, width, height, radius, scratch, prefix) {
  if (radius < 1) {
    dest.set(source);
    return dest;
  }
  lineMeans(source, scratch, height, width, width, 1, radius, prefix);
  lineMeans(scratch, dest, width, height, 1, width, radius, prefix);
  return dest;
}

/**
 * The pixels a refinement may rewrite: those within `radius` of an alpha value
 * that is neither 0 nor 1.
 *
 * This is what keeps a confident matte confident. Both filters below would
 * otherwise average the subject's solid interior with the soft pixels at its
 * edge — the guided filter's classical halo — leaving a subject that is 90%
 * opaque for ten pixels inside its own silhouette, through which a new
 * background shows as a ghost of the edge. Alpha that the model was sure about
 * is not the problem being fixed, so it is left alone; only the transition,
 * where the model was guessing anyway, is opened to change.
 *
 * "Within radius" is a box mean of two indicators — one for pixels below 1,
 * one for pixels above 0 — because a non-zero mean over a window is the same
 * statement as "the window contains at least one such pixel", and a box mean
 * is a great deal simpler than a sliding min/max. The means are exact zeros
 * when their windows are, so the test costs no tolerance beyond guarding
 * against a rounding error in the prefix sums.
 *
 * @returns {Uint8Array} 1 where the pixel may change, else 0.
 */
function edgeBand(matte, width, height, radius, scratch, prefix) {
  const count = width * height;
  const below = new Float32Array(count);
  const above = new Float32Array(count);
  const indicator = new Float32Array(count);
  for (let i = 0; i < count; i += 1) indicator[i] = matte[i] < 1 ? 1 : 0;
  boxBlur(indicator, below, width, height, radius, scratch, prefix);
  for (let i = 0; i < count; i += 1) indicator[i] = matte[i] > 0 ? 1 : 0;
  boxBlur(indicator, above, width, height, radius, scratch, prefix);

  const band = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const both = below[i] > EMPTY_WEIGHT && above[i] > EMPTY_WEIGHT;
    band[i] = both ? 1 : 0;
  }
  return band;
}

/**
 * Snaps a matte's edge onto the picture's own colour edges.
 *
 * This is a guided filter (He, Sun & Tang) with the picture's luminance as the
 * guide and alpha as the thing being filtered. In every window it fits the
 * local straight line `alpha ≈ slope * luminance + offset` by least squares
 * and rebuilds alpha from it. The effect is the one a matting edge needs:
 * where the guide is flat — the inside of a coat, the empty background — the
 * fit has no slope, so alpha is left alone; where the guide steps at an edge,
 * the fit has a large slope and alpha is rebuilt as that same step, which is
 * what pulls the transition onto the colour boundary rather than leaving it
 * wherever the model's output grid happened to land.
 *
 * Two deliberate departures from the paper, both measured against synthetic
 * edges with a known ground truth (see `tests/matte_refine.test.js`):
 *
 * - **The slope and offset are not averaged over a second window.** The paper
 *   does that to suppress noise, and it also spreads what was a one-pixel edge
 *   into a smooth ramp two radii wide — on an already-correct hard edge it
 *   made the result worse than the input. Skipping it is what lets `q =
 *   slope * luminance + offset` come out as a step.
 * - **The result is applied only inside `band` pixels of the matte's own
 *   transition** (`edgeBand`), for the halo reason described there.
 *
 * With both, the distance from a known edge fell on every synthetic case
 * tried, including the cases where the model's matte was already right.
 *
 * @param {Float32Array|Uint8Array} alpha 0..1 floats or 0..255 bytes.
 * @param {object} options
 * @param {Float32Array|Uint8Array} options.guide the source picture's RGBA
 *   bytes (length `width * height * 4`) — the colours the edge is snapped to.
 * @param {number} [options.radius] window the local model is fitted in.
 * @param {number} [options.epsilon] guide variance below which a window is flat.
 * @param {number} [options.band] how far from the transition alpha may change.
 * @param {number} [options.strength] 0 returns an exact copy of `alpha`.
 * @returns {Float32Array} a new matte, 0..1.
 */
export function refineMatte(alpha, width, height, options = {}) {
  assertGeometry(width, height);
  const count = width * height;
  // The normalised copy is what gets written back and returned, so the caller's
  // array is never touched; every pass below reads it before anything is.
  const matte = alphaToUnit(alpha, width, height);
  const radius = resolveRadius(options.radius, MATTE_REFINE_DEFAULTS.radius);
  const strength = clamp01(options.strength ?? MATTE_REFINE_DEFAULTS.strength);
  // No strength or no window is a request for the matte unchanged.
  if (strength === 0 || radius < 1) return matte;

  const { guide } = options;
  assertRgbaLength(guide, count);
  const epsilon = Math.max(1e-12, Number(options.epsilon ?? MATTE_REFINE_DEFAULTS.epsilon));
  const bandRadius = resolveRadius(options.band, MATTE_REFINE_DEFAULTS.band);

  const luminance = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    luminance[i] =
      (LUMA_RED * guide[p] + LUMA_GREEN * guide[p + 1] + LUMA_BLUE * guide[p + 2]) / 255;
  }

  const scratch = new Float32Array(count);
  const prefix = new Float32Array(Math.max(width, height) + 1);
  const allocate = () => new Float32Array(count);
  // The band is read off the input, so it has to exist before the output loop
  // starts overwriting `matte`.
  const band = edgeBand(matte, width, height, bandRadius, scratch, prefix);
  const meanGuide = boxBlur(luminance, allocate(), width, height, radius, scratch, prefix);
  const meanAlpha = boxBlur(matte, allocate(), width, height, radius, scratch, prefix);

  const product = allocate();
  for (let i = 0; i < count; i += 1) product[i] = luminance[i] * luminance[i];
  const meanGuideSq = boxBlur(product, allocate(), width, height, radius, scratch, prefix);
  for (let i = 0; i < count; i += 1) product[i] = luminance[i] * matte[i];
  const meanGuideAlpha = boxBlur(product, allocate(), width, height, radius, scratch, prefix);

  for (let i = 0; i < count; i += 1) {
    if (band[i] === 0) continue;
    // Covariance and variance of the window, from the means of the products.
    // Variance is clamped at zero: it is mathematically non-negative here and
    // rounding in the prefix sums can make it a hair negative.
    const variance = Math.max(0, meanGuideSq[i] - meanGuide[i] * meanGuide[i]);
    const covariance = meanGuideAlpha[i] - meanGuide[i] * meanAlpha[i];
    const slope = covariance / (variance + epsilon);
    const offset = meanAlpha[i] - slope * meanGuide[i];
    // The rebuilt alpha can overshoot where the fit is steep — that overshoot
    // is the edge being sharpened, so it is clipped, not scaled back.
    const refined = clamp01(slope * luminance[i] + offset);
    matte[i] = clamp01(matte[i] + strength * (refined - matte[i]));
  }
  return matte;
}

/**
 * Softens a matte's edge, and only its edge.
 *
 * The blur is not applied to the matte, it is offered to the pixels near the
 * transition (`edgeBand`): everything else keeps its value bit for bit, so a
 * solid subject is not diluted to 0.98 in its middle — a matte that is merely
 * soft in the interior composites a ghost of the new background through the
 * subject.
 *
 * @returns {Float32Array} a new matte, 0..1; interiors stay exactly 0 or 1.
 */
export function featherMatte(alpha, width, height, options = {}) {
  assertGeometry(width, height);
  const count = width * height;
  const matte = alphaToUnit(alpha, width, height);
  const radius = resolveRadius(options.radius, MATTE_FEATHER_DEFAULTS.radius);
  if (radius < 1) return matte;

  const scratch = new Float32Array(count);
  const prefix = new Float32Array(Math.max(width, height) + 1);
  const band = edgeBand(matte, width, height, radius, scratch, prefix);
  const blurred = boxBlur(matte, new Float32Array(count), width, height, radius, scratch, prefix);

  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = band[i] === 0 ? matte[i] : clamp01(blurred[i]);
  }
  return out;
}

/*
 * There is no combined "refine then feather" entry point either, and its
 * absence is deliberate. `refineMatteResult` used to be one — refining,
 * feathering and defringing a picture in a single call — but its only caller
 * was the defringe it no longer has, and `local_matting.js` cannot use a
 * combined call anyway: it has to be able to skip the refinement on a picture
 * too large for it while still feathering. Both passes are exported and the
 * one production caller sequences them, so a wrapper here would be an export
 * nothing calls.
 */
