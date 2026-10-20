/**
 * Histogram analysis for the tone adjustments.
 *
 * The levels, curves and exposure controls are unusable without an instrument
 * that reports where the tones actually sit. This module is that instrument: it
 * turns an RGBA byte buffer into per-channel and luma histograms, the clipping
 * statistics a photo editor warns about, and the black/white/mean/median points
 * the auto-enhance planner consumes.
 *
 * Pure maths: no DOM, no canvas, no GL, no React — it runs under `node --test`
 * exactly as it runs on the CPU adjustment path.
 */

/**
 * Rec.709 luma weights. The editor keys its gradient-map tone work on Rec.709
 * (see color_adjust_gradient.js) while the pixel filters use Rec.601; a *tone*
 * instrument belongs with the former, and Photoshop's luminance histogram
 * reports the same weighting.
 */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/** Bin count of the histogram the panel draws. 256 keeps 1 bin = 1 level. */
export const DEFAULT_HISTOGRAM_BINS = 256;

/**
 * How many levels off the end still count as "clipped". Pure 0/255 counts miss
 * the real damage: a sensor that crushes to 1 or blows to 253 has already lost
 * the data, so the warning keys on a small band instead.
 */
export const DEFAULT_CLIP_TOLERANCE = 2;

/** The band is symmetric, so it can never span more than half the range. */
export const MAX_CLIP_TOLERANCE = 127;

/**
 * The black/white points, as cumulative fractions. They are not 0/1: one dead
 * pixel (dust, a hot pixel) must not define the white point, and 0.5 % is the
 * conventional clip allowance a levels auto-button uses.
 */
export const BLACK_POINT_FRACTION = 0.005;
export const WHITE_POINT_FRACTION = 0.995;

/**
 * Stated tolerance for `stride` downsampling: with stride N, any bin's share of
 * the counted pixels may differ from the full-resolution histogram by at most
 * this fraction of the total. It is a bound for photographic content, not a
 * guarantee — a periodic texture whose period divides N can alias past it, so
 * callers downsample for the display and re-measure at stride 1 when a number
 * is going to be written into a document.
 */
export const HISTOGRAM_STRIDE_TOLERANCE = 0.05;

/** The four chains computeHistogram counts, in result-key order. */
const CHANNEL_KEYS = ["r", "g", "b", "luma"];

/** Validates options shared by computeHistogram and computeImageStats. */
function resolveHistogramOptions(options, where) {
  const opts = options ?? {};
  if (typeof opts !== "object") {
    throw new TypeError(`${where}: options must be an object`);
  }

  const bins = opts.bins ?? DEFAULT_HISTOGRAM_BINS;
  if (typeof bins !== "number" || !Number.isFinite(bins) || !Number.isInteger(bins)) {
    throw new TypeError(`${where}: bins must be a finite integer`);
  }
  if (bins < 1) throw new RangeError(`${where}: bins must be >= 1`);

  const channelCount = opts.channels ?? 4;
  if (channelCount !== 3 && channelCount !== 4) {
    throw new RangeError(`${where}: channels must be 3 or 4`);
  }

  const stride = opts.stride ?? 1;
  if (typeof stride !== "number" || !Number.isFinite(stride) || !Number.isInteger(stride)) {
    throw new TypeError(`${where}: stride must be a finite integer`);
  }
  if (stride < 1) throw new RangeError(`${where}: stride must be >= 1`);

  const tolerance = opts.clipTolerance ?? DEFAULT_CLIP_TOLERANCE;
  if (typeof tolerance !== "number" || !Number.isFinite(tolerance)) {
    throw new TypeError(`${where}: clipTolerance must be a finite number`);
  }

  return {
    bins,
    channelCount,
    stride,
    tolerance: Math.min(MAX_CLIP_TOLERANCE, Math.max(0, tolerance)),
  };
}

/** Rejects a buffer that cannot hold a single whole pixel. */
function requireByteBuffer(rgba, where, channelCount) {
  if (rgba === null || rgba === undefined || typeof rgba.length !== "number") {
    throw new TypeError(`${where}: rgba must be an array-like of bytes`);
  }
  if (rgba.length === 0) throw new RangeError(`${where}: rgba is empty`);
  if (rgba.length < channelCount) {
    throw new RangeError(`${where}: rgba holds less than one ${channelCount}-byte pixel`);
  }
}

/** Rejects a histogram that is not a non-empty array-like of counts. */
function requireHistogram(histogram, where) {
  if (histogram === null || histogram === undefined || typeof histogram.length !== "number") {
    throw new TypeError(`${where}: histogram must be an array-like of bin counts`);
  }
  if (histogram.length === 0) {
    throw new RangeError(`${where}: histogram must have at least one bin`);
  }
}

/** Resolves the pixel total, defaulting to the histogram's own sum. */
function resolveTotal(histogram, total, where) {
  if (total === undefined || total === null) return sumHistogram(histogram);
  if (typeof total !== "number" || !Number.isFinite(total)) {
    throw new TypeError(`${where}: total must be a finite number`);
  }
  if (total < 0) throw new RangeError(`${where}: total must be >= 0`);
  return total;
}

/**
 * The bin a level falls in. The 0..255 level range maps onto `bins` equal
 * slices, so `bins: 256` gives the identity (bin == level) and the top bin
 * always owns level 255.
 */
export function binIndexForLevel(level, bins) {
  return Math.min(bins - 1, (level * bins) >> 8);
}

/**
 * The level a bin index stands for, on the 0..255 scale. The mapping is
 * endpoint-inclusive — bin 0 is 0 and the last bin is 255 — so a white point
 * read off a coarse histogram still lands on a real level instead of 254.
 */
export function levelForBinIndex(index, bins) {
  if (bins <= 1) return 127.5;
  return (index * 255) / (bins - 1);
}

/** Total counts in a histogram (its own pixel total). */
export function sumHistogram(histogram) {
  requireHistogram(histogram, "sumHistogram");
  let sum = 0;
  for (let i = 0; i < histogram.length; i++) sum += histogram[i];
  return sum;
}

/** Bin counts as fractions of `total` (defaults to the histogram's own sum). */
export function normalizeHistogram(histogram, total) {
  requireHistogram(histogram, "normalizeHistogram");
  const sum = resolveTotal(histogram, total, "normalizeHistogram");
  const out = new Float64Array(histogram.length);
  if (sum <= 0) return out;
  for (let i = 0; i < histogram.length; i++) out[i] = histogram[i] / sum;
  return out;
}

/**
 * The level below which `fraction` of the counted pixels sit.
 *
 * Uses the first bin whose cumulative count reaches the target (the "lower"
 * percentile), so the value is an actual populated level rather than an
 * interpolation between two — the levels dialog wants a point a user can see,
 * and interpolation would move the black point onto dead space.
 */
export function percentileFromHistogram(histogram, total, fraction) {
  requireHistogram(histogram, "percentileFromHistogram");
  if (typeof fraction !== "number" || !Number.isFinite(fraction)) {
    throw new TypeError("percentileFromHistogram: fraction must be a finite number");
  }
  const bins = histogram.length;
  const sum = resolveTotal(histogram, total, "percentileFromHistogram");
  if (sum <= 0) return 0;

  const target = Math.min(1, Math.max(0, fraction)) * sum;
  let acc = 0;
  for (let i = 0; i < bins; i++) {
    acc += histogram[i];
    // A zero target (fraction 0) means "the darkest tone that exists", so it
    // must skip the empty leading bins rather than stop on bin 0.
    if (target > 0 ? acc >= target : acc > 0) return levelForBinIndex(i, bins);
  }
  return levelForBinIndex(bins - 1, bins);
}

/**
 * The "no data" stats: no tone information, so every level reads 0.
 *
 * 0 rather than a sentinel because every level this module reports is a level
 * on the 0..255 scale, and consumers pass the readings straight back into the
 * level maths: a sentinel outside the range (the -1 an index of -1 produces)
 * comes back out of `levelForBinIndex` as -1 again, so a caller gets a black
 * point of -1 and an inverted stretch instead of an empty reading.
 */
function emptyStats(total) {
  return { total, min: 0, max: 0, black: 0, white: 0, mean: 0, median: 0 };
}

/**
 * Black point, white point, mean, median and occupied range of one histogram.
 * All levels are on the 0..255 scale; `total` is the pixel count behind them.
 *
 * A histogram with no populated bin — an empty histogram, or a caller-supplied
 * pixel total with nothing counted behind it — carries no tone to report, and
 * every level field is then 0 (see emptyStats), never a value off the scale.
 */
export function histogramStats(histogram, total) {
  requireHistogram(histogram, "histogramStats");
  const bins = histogram.length;
  const sum = resolveTotal(histogram, total, "histogramStats");

  let weighted = 0;
  let lowest = -1;
  let highest = -1;
  for (let i = 0; i < bins; i++) {
    const count = histogram[i];
    if (!count) continue;
    weighted += count * levelForBinIndex(i, bins);
    if (lowest < 0) lowest = i;
    highest = i;
  }
  if (highest < 0 || sum <= 0) return emptyStats(sum);

  return {
    total: sum,
    min: levelForBinIndex(lowest, bins),
    max: levelForBinIndex(highest, bins),
    black: percentileFromHistogram(histogram, sum, BLACK_POINT_FRACTION),
    white: percentileFromHistogram(histogram, sum, WHITE_POINT_FRACTION),
    mean: weighted / sum,
    median: percentileFromHistogram(histogram, sum, 0.5),
  };
}

/** A clipped fraction pair, guarded against a zero pixel total. */
function clipPair(low, high, total) {
  if (total <= 0) return { low: 0, high: 0 };
  return { low: low / total, high: high / total };
}

/**
 * Per-channel, luma and combined RGB histograms of an RGBA (or RGB) buffer.
 *
 * Fully transparent pixels are skipped when the buffer carries alpha: they hold
 * no colour, and counting their black would read as a crushed shadow that is
 * not in the picture. `stride` counts every Nth pixel for a cheap read on large
 * images (see HISTOGRAM_STRIDE_TOLERANCE for what that costs in accuracy), and
 * `bins` sizes every histogram in the result.
 *
 * @param {ArrayLike<number>} rgba bytes, 4 (RGBA) or 3 (RGB) per pixel
 * @param {{bins?: number, channels?: 3|4, stride?: number, clipTolerance?: number}} [options]
 * @returns {{
 *   bins: number, total: number, stride: number, channelCount: number, tolerance: number,
 *   r: Uint32Array, g: Uint32Array, b: Uint32Array, luma: Uint32Array, rgb: Uint32Array,
 *   clipping: {tolerance: number, r: {low: number, high: number}, g: object, b: object, luma: object}
 * }}
 */
export function computeHistogram(rgba, options = {}) {
  const { bins, channelCount, stride, tolerance } = resolveHistogramOptions(
    options,
    "computeHistogram"
  );
  requireByteBuffer(rgba, "computeHistogram", channelCount);

  const containsAlpha = channelCount === 4;
  const pixelCount = Math.floor(rgba.length / channelCount);
  const r = new Uint32Array(bins);
  const g = new Uint32Array(bins);
  const b = new Uint32Array(bins);
  const luma = new Uint32Array(bins);
  const rgb = new Uint32Array(bins);
  // Index order follows CHANNEL_KEYS so the clipping pairs read back by name.
  const low = new Uint32Array(4);
  const high = new Uint32Array(4);
  const highEdge = 255 - tolerance;
  let total = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * channelCount;
    if (containsAlpha && rgba[offset + 3] === 0) continue;

    const rv = rgba[offset];
    const gv = rgba[offset + 1];
    const bv = rgba[offset + 2];
    const lv = Math.round(LUMA_R * rv + LUMA_G * gv + LUMA_B * bv);

    const ri = binIndexForLevel(rv, bins);
    const gi = binIndexForLevel(gv, bins);
    const bi = binIndexForLevel(bv, bins);
    const li = binIndexForLevel(lv, bins);
    r[ri]++;
    g[gi]++;
    b[bi]++;
    luma[li]++;
    rgb[ri]++;
    rgb[gi]++;
    rgb[bi]++;
    total++;

    const levels = [rv, gv, bv, lv];
    for (let c = 0; c < 4; c++) {
      if (levels[c] <= tolerance) low[c]++;
      if (levels[c] >= highEdge) high[c]++;
    }
  }

  return {
    bins,
    total,
    stride,
    channelCount,
    tolerance,
    r,
    g,
    b,
    luma,
    // The parade overlay: the three colour channels summed bin by bin, so its
    // own bin total is 3 x `total`. Pass that sum to normalizeHistogram.
    rgb,
    clipping: {
      tolerance,
      r: clipPair(low[0], high[0], total),
      g: clipPair(low[1], high[1], total),
      b: clipPair(low[2], high[2], total),
      luma: clipPair(low[3], high[3], total),
    },
  };
}

/**
 * The whole analysis the panel and the auto-enhance planner need, in one pass.
 *
 * `channels[key]` carries that channel's histogram plus its stats, so a caller
 * reads `analysis.channels.luma.mean` and `analysis.channels.r.black` without
 * re-walking the bins. The `rgb` entry is the three-channel aggregate and its
 * `total` is therefore 3 x the pixel total.
 *
 * @param {ArrayLike<number>} rgba bytes, 4 (RGBA) or 3 (RGB) per pixel
 * @param {{bins?: number, channels?: 3|4, stride?: number, clipTolerance?: number}} [options]
 */
export function computeImageStats(rgba, options = {}) {
  const histogram = computeHistogram(rgba, options);
  const channels = {};
  for (const key of CHANNEL_KEYS) {
    channels[key] = { histogram: histogram[key], ...histogramStats(histogram[key], histogram.total) };
  }
  channels.rgb = { histogram: histogram.rgb, ...histogramStats(histogram.rgb) };

  return {
    bins: histogram.bins,
    total: histogram.total,
    stride: histogram.stride,
    channelCount: histogram.channelCount,
    histogram,
    channels,
    clipping: histogram.clipping,
  };
}
