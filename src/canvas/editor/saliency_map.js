/**
 * Pure visual-saliency producer for Smart Crop.
 *
 * `resolveAutoCrop()` has always accepted a single-channel `saliency` buffer,
 * but nothing in the repo produced one — every caller only ever passed the
 * coarse page-content box mask. This module fills that gap with a
 * deterministic, dependency-free scorer over an RGBA buffer, so Smart Crop can
 * see the picture inside a page-filling image instead of only its box.
 *
 * Scoring (per pixel, then divided by the peak energy):
 *   edge     = edgeGain     * luminance-gradient / MAX_LUMINANCE_GRADIENT
 *   contrast = contrastGain * |rgb - mean|        / MAX_COLOR_DISTANCE
 *   center   = centerPrior  * radial falloff from the frame centre
 *   plus a flat boost where a face box covers the pixel / the alpha mask is
 *   non-zero.
 *
 * Downsampling contract: `rgba` is expected to ALREADY be at the analysis
 * resolution (`width x height`). This function never resamples. The bitmap
 * adapter in `components/` decides the resolution with
 * `readImageRgba(bitmap, { maxEdge: SALIENCY_ANALYSIS_MAX_EDGE })` and passes
 * the returned `width`/`height` straight through; the caller (`auto_crop_page`)
 * owns the final resample onto the page grid, so `readImageRgba`'s `scale`
 * stays inside the adapter and is deliberately not part of this contract.
 *
 * Cost: single-scale (no pyramid, no iteration) and linear in the pixel count
 * — a small constant number of passes over the analysis buffer, no DOM and no
 * dependencies.
 *
 * Returns `null` rather than a fabricated "confident" map when the input is
 * unusable or carries no content signal (uniform/flat frames): callers must
 * then behave exactly as they did before saliency existed.
 */

export const SALIENCY_ANALYSIS_MAX_EDGE = 256;

const DEFAULT_CENTER_PRIOR = 0.15;
const DEFAULT_EDGE_GAIN = 1;
const DEFAULT_CONTRAST_GAIN = 0.6;
/** Flat boost for pixels a face box covers / the alpha mask marks. */
const FACE_BOOST = 1;
const ALPHA_BOOST = 0.75;

const LUM_R = 0.299;
const LUM_G = 0.587;
const LUM_B = 0.114;
/** Largest gradient between two 8-bit luminances (a diagonal step). */
const MAX_LUMINANCE_GRADIENT = 255 * Math.SQRT2;
/** Largest L1 colour distance from the mean (opposite RGB cube corners). */
const MAX_COLOR_DISTANCE = 255 * 3;

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function finiteNonNegative(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

/**
 * Clamps face boxes (image-pixel space) to the frame, dropping unusable ones.
 * Returns integer half-open boxes so the per-pixel test is exact and cheap.
 */
function normalizeFaceBoxes(faceBoxes, width, height) {
  if (!Array.isArray(faceBoxes)) return [];
  const boxes = [];
  for (const box of faceBoxes) {
    if (!box || typeof box !== "object") continue;
    const x = Number(box.x);
    const y = Number(box.y);
    const boxWidth = Number(box.width);
    const boxHeight = Number(box.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(boxWidth) || !Number.isFinite(boxHeight)) {
      continue;
    }
    if (!(boxWidth > 0) || !(boxHeight > 0)) continue;
    const left = Math.max(0, Math.floor(x));
    const top = Math.max(0, Math.floor(y));
    const right = Math.min(width, Math.ceil(x + boxWidth));
    const bottom = Math.min(height, Math.ceil(y + boxHeight));
    if (right <= left || bottom <= top) continue;
    boxes.push({ left, top, right, bottom });
  }
  return boxes;
}

function insideAnyFaceBox(boxes, x, y) {
  for (const box of boxes) {
    if (x >= box.left && x < box.right && y >= box.top && y < box.bottom) return true;
  }
  return false;
}

/**
 * @param {object} [args]
 * @param {ArrayLike<number>} args.rgba RGBA bytes at `width x height`, already downsampled
 * @param {number} args.width analysis-frame width in pixels
 * @param {number} args.height analysis-frame height in pixels
 * @param {Array<{x: number, y: number, width: number, height: number}>} [args.faceBoxes] boxes in analysis-frame pixels
 * @param {ArrayLike<number>|null} [args.alphaMask] single-channel mask at `width x height`; non-zero pixels are boosted
 * @param {number} [args.centerPrior] weight of the radial centre bias (default 0.15)
 * @param {number} [args.edgeGain] weight of the luminance-gradient term (default 1)
 * @param {number} [args.contrastGain] weight of the colour-distance term (default 0.6)
 * @returns {{weights: Float32Array, width: number, height: number, source: string}|null}
 */
export function computeSaliencyMap({
  rgba,
  width,
  height,
  faceBoxes = [],
  alphaMask = null,
  centerPrior = DEFAULT_CENTER_PRIOR,
  edgeGain = DEFAULT_EDGE_GAIN,
  contrastGain = DEFAULT_CONTRAST_GAIN,
} = {}) {
  if (!rgba || typeof rgba.length !== "number") return null;
  if (!isPositiveInt(width) || !isPositiveInt(height)) return null;
  const pixelCount = width * height;
  if (rgba.length !== pixelCount * 4) return null;

  let alphaPresent = false;
  if (alphaMask !== null && alphaMask !== undefined) {
    // A wrong-length mask is unusable input, not a mask to guess around.
    if (typeof alphaMask.length !== "number" || alphaMask.length !== pixelCount) return null;
    for (let i = 0; i < pixelCount; i += 1) {
      if (alphaMask[i] > 0) {
        alphaPresent = true;
        break;
      }
    }
  }

  const faces = normalizeFaceBoxes(faceBoxes, width, height);
  const facePresent = faces.length > 0;
  const edgeWeight = finiteNonNegative(edgeGain, DEFAULT_EDGE_GAIN);
  const contrastWeight = finiteNonNegative(contrastGain, DEFAULT_CONTRAST_GAIN);
  const centerWeight = finiteNonNegative(centerPrior, DEFAULT_CENTER_PRIOR);

  // Pass 1: luminance-gradient magnitude per pixel, plus RGB sums for the mean.
  const gradient = new Float32Array(pixelCount);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const index = row + x;
      const offset = index * 4;
      const r = rgba[offset];
      const g = rgba[offset + 1];
      const b = rgba[offset + 2];
      sumR += r;
      sumG += g;
      sumB += b;
      const luminance = r * LUM_R + g * LUM_G + b * LUM_B;
      let dx = 0;
      let dy = 0;
      if (x + 1 < width) {
        const right = offset + 4;
        dx = rgba[right] * LUM_R + rgba[right + 1] * LUM_G + rgba[right + 2] * LUM_B - luminance;
      }
      if (y + 1 < height) {
        const below = offset + width * 4;
        dy = rgba[below] * LUM_R + rgba[below + 1] * LUM_G + rgba[below + 2] * LUM_B - luminance;
      }
      gradient[index] = Math.sqrt(dx * dx + dy * dy);
    }
  }

  const meanR = sumR / pixelCount;
  const meanG = sumG / pixelCount;
  const meanB = sumB / pixelCount;

  // Pass 2: score every pixel. Edge/contrast use fixed physical maxima so the
  // gains stay comparable; the observed peak below does the final [0, 1] scale.
  const weights = new Float32Array(pixelCount);
  const centerScale = Math.max(width, height) / 2;
  let maxEnergy = 0;
  let maxContentSignal = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const ny = (y + 0.5 - height / 2) / centerScale;
    for (let x = 0; x < width; x += 1) {
      const index = row + x;
      const offset = index * 4;
      const gradientTerm = (gradient[index] / MAX_LUMINANCE_GRADIENT) * edgeWeight;
      const contrastRaw =
        Math.abs(rgba[offset] - meanR) +
        Math.abs(rgba[offset + 1] - meanG) +
        Math.abs(rgba[offset + 2] - meanB);
      const contrastTerm = (contrastRaw / MAX_COLOR_DISTANCE) * contrastWeight;
      // Radial falloff: 1 at the frame centre, reaching 0 by the corners.
      const nx = (x + 0.5 - width / 2) / centerScale;
      const centerFalloff = Math.max(0, 1 - Math.sqrt(nx * nx + ny * ny));
      const faceTerm = facePresent && insideAnyFaceBox(faces, x, y) ? FACE_BOOST : 0;
      const alphaTerm = alphaPresent && alphaMask[index] > 0 ? ALPHA_BOOST : 0;
      // The centre prior may never create a map on its own: a flat frame must
      // stay `null` so callers keep today's centring fallback.
      const contentSignal = gradientTerm + contrastTerm + faceTerm + alphaTerm;
      const energy = contentSignal + centerWeight * centerFalloff;
      weights[index] = energy;
      if (contentSignal > maxContentSignal) maxContentSignal = contentSignal;
      if (energy > maxEnergy) maxEnergy = energy;
    }
  }

  if (!(maxContentSignal > 0) || !(maxEnergy > 0)) return null;

  for (let i = 0; i < pixelCount; i += 1) weights[i] /= maxEnergy;

  const signals = [];
  if (edgeWeight > 0) signals.push("edge");
  if (contrastWeight > 0) signals.push("contrast");
  if (centerWeight > 0) signals.push("center");
  if (facePresent) signals.push("face");
  if (alphaPresent) signals.push("alpha");

  return { weights, width, height, source: signals.join("+") };
}
