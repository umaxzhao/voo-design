/**
 * Presentation maths for the histogram strip: bins in, an SVG area path and a
 * clipping readout out.
 *
 * The engine (`histogram.js`) answers "what does this picture contain"; this
 * module answers "how much of that fits in a 60px strip". Kept separate and
 * pure so the strip's shape is unit-testable without a canvas, and so the
 * engine keeps no opinion about the panel's geometry.
 */

/**
 * How many samples an analysis may walk before the strip is worth less than
 * the wait. The panels' analyses read a copy capped at 256px on its longest
 * edge (`HISTOGRAM_MAX_EDGE`), so a square source reaches here as 65,536
 * pixels and this budget halves the walk — the same shape at half the cost.
 * The cap, not this budget, is what keeps a 6000px picture cheap.
 */
export const HISTOGRAM_SAMPLE_BUDGET = 40000;

/**
 * Columns the strip draws. Folding 256 bins into 64 columns keeps every count
 * (the fold is a sum) while giving the strip bars wide enough to see.
 */
export const HISTOGRAM_COLUMNS = 64;

/** The path's own coordinate space; the SVG scales it to the rendered box. */
export const HISTOGRAM_PATH_WIDTH = 100;
export const HISTOGRAM_PATH_HEIGHT = 100;

function requirePositive(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`histogram_geometry: ${label} must be a positive number`);
  }
}

function requireHistogram(histogram) {
  if (!histogram || typeof histogram.length !== "number" || histogram.length === 0) {
    throw new TypeError("histogram_geometry: histogram must be a non-empty array-like");
  }
}

/**
 * The stride `computeHistogram`/`computeImageStats` should walk so that a
 * `width` x `height` buffer costs at most `budget` samples. Always at least 1:
 * a stride of 0 would read one pixel forever.
 */
export function sampleStrideFor(width, height, budget = HISTOGRAM_SAMPLE_BUDGET) {
  requirePositive(width, "width");
  requirePositive(height, "height");
  requirePositive(budget, "budget");
  const pixels = Math.ceil(width) * Math.ceil(height);
  return Math.max(1, Math.ceil(pixels / budget));
}

/**
 * Folds a histogram's bins into `columns` summed columns, so the strip shows
 * the same totals in fewer, wider bars. More columns than bins is clamped to
 * one column per bin — a fold cannot invent resolution.
 */
export function foldHistogramBins(histogram, columns = HISTOGRAM_COLUMNS) {
  requireHistogram(histogram);
  requirePositive(columns, "columns");
  const bins = histogram.length;
  const count = Math.max(1, Math.min(Math.floor(columns), bins));
  const folded = new Array(count).fill(0);
  for (let i = 0; i < bins; i++) {
    const column = Math.min(count - 1, Math.floor((i * count) / bins));
    folded[column] += histogram[i];
  }
  return folded;
}

/**
 * An SVG area path for one folded histogram, normalised to its own peak: the
 * strip shows shape, not absolute counts (which span orders of magnitude).
 *
 * Returns "" for an all-zero histogram — nothing to draw, and a zero-height
 * path would be a lie about the picture — and for an empty column list.
 */
export function histogramAreaPath(
  values,
  {
    width = HISTOGRAM_PATH_WIDTH,
    height = HISTOGRAM_PATH_HEIGHT,
  } = {},
) {
  if (!Array.isArray(values) || values.length === 0) return "";
  requirePositive(width, "width");
  requirePositive(height, "height");
  let peak = 0;
  for (const value of values) if (value > peak) peak = value;
  if (!(peak > 0)) return "";

  const step = width / values.length;
  const round = (value) => Number(value.toFixed(2));
  const points = values.map(
    (value, index) =>
      `${round((index + 0.5) * step)},${round(height - (value / peak) * height)}`,
  );
  return `M0,${round(height)} L${points.join(" L")} L${round(width)},${round(height)} Z`;
}

/**
 * The share of pixels already sitting at each end of the range, in percent.
 *
 * `clipping` is `computeImageStats().clipping.luma`, whose `low`/`high` are
 * fractions of the sampled pixels.
 */
export function clipPercentages(clipping) {
  if (!clipping || typeof clipping !== "object") {
    throw new TypeError("histogram_geometry: clipping is required");
  }
  const percent = (fraction) => {
    if (!Number.isFinite(fraction)) return 0;
    const value = fraction * 100;
    if (value <= 0) return 0;
    return Math.min(100, Number(value.toFixed(1)));
  };
  return { shadow: percent(clipping.low), highlight: percent(clipping.high) };
}
