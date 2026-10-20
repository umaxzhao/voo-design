/**
 * Identity compliance — does a generated raster obey its resolved identity lock?
 *
 * `evaluateDeterministicRules` judges a vector document (layers, text overflow,
 * safe margins, contrast) but it reads nodes, never pixels, so nothing in the
 * repo can tell whether a *generated image* actually stayed inside the run's
 * brand boundary. This module is that check, and it is deliberately narrow: it
 * reports only what pixels can prove.
 *
 * Pure logic — no DOM, no canvas, no React. Buffers arrive already decoded and
 * downsampled; decoding the model output is the caller's job.
 *
 * Fail-closed, and that is the point of the module: a missing, empty or
 * unreadable input is `"unknown"` with a `reason`, never `"compliant"`. A lock
 * that resolves no colour boundary (only fonts, a logo id or a safe area)
 * constrains nothing a raster can be measured against, so it is `"unknown"`
 * too — a caller must not read that as a pass. Issue ids are stable so the same
 * input always produces byte-identical output.
 *
 * @module editor/identity_compliance
 */

import { computeHistogram } from "./histogram.js";
import { sanitizeIdentityLock } from "../agent-runtime/identity-lock.js";

/** How many dominant colours a palette reports by default. */
export const DEFAULT_MAX_PALETTE_COLORS = 5;

/** Only the Euclidean sRGB metric is implemented; named so it can be selected. */
export const COLOR_METRIC_SRGB_EUCLIDEAN = "euclidean-srgb";

/**
 * Default maximum Euclidean sRGB distance (0..~441) a palette colour may sit
 * from the nearest lock colour before it counts as drift. Chosen to accept a
 * shade or a re-encoded near-match while catching a different hue family.
 */
export const DEFAULT_COLOR_TOLERANCE = 60;

/**
 * Default distance at which a palette colour is treated as a forbidden colour
 * actually being present. Tighter than the drift tolerance: "present" means the
 * forbidden swatch is in the picture, not merely nearby.
 */
export const DEFAULT_FORBIDDEN_TOLERANCE = 30;

/**
 * Default share of the opaque pixels a palette entry must hold to be judged.
 * Below it the entry is anti-aliasing/compression noise, and flagging it would
 * be a false accusation.
 */
export const DEFAULT_MIN_COVERAGE = 0.02;

/** Rule ids, stable strings a consumer can switch on. */
export const RULE_PALETTE_DRIFT = "identity_palette_drift";
export const RULE_FORBIDDEN_COLOR = "identity_forbidden_color";

/**
 * Quantisation steps per channel for the joint palette grid.
 *
 * A palette is a 3-D colour histogram, not three independent channel
 * histograms: red/green/blue marginals cannot say which combos actually occur.
 * The grid is folded onto one byte so the shared `computeHistogram` (which owns
 * the counting, see `extractCompliancePalette`) can bin it: 6 levels per
 * channel is 6^3 = 216 distinct cells, and 216 < 256 keeps the cell index a
 * valid 8-bit level. Coarse cells decide what counts as *one* colour; the
 * actual pixels in each cell are averaged, so a solid swatch still reports its
 * exact hex rather than the cell centre.
 */
const PALETTE_LEVELS = 6;
const PALETTE_CELLS = PALETTE_LEVELS ** 3;
const PALETTE_LEVEL_STEP = PALETTE_LEVELS - 1;

/**
 * `computeHistogram` bins levels with `(level * bins) >> 8`, which is the
 * identity only when `bins === 256`. At this bin count a cell index is its own
 * bin, so `histogram.r[index]` is exactly the joint cell count.
 */
const IDENTITY_BINS = 256;

/** One byte as two lowercase hex digits. */
function toHexByte(value) {
  return value.toString(16).padStart(2, "0");
}

/** `{r,g,b}` (0..255 each) to a canonical `#rrggbb` string. */
function rgbToHex(rgb) {
  return `#${toHexByte(rgb.r)}${toHexByte(rgb.g)}${toHexByte(rgb.b)}`;
}

/**
 * Parses `#rgb`, `#rrggbb` or `#rrggbbaa` (alpha ignored) into bytes, or
 * `null`. Accepts a missing leading `#`; anything else — a font name, a CSS
 * keyword — is not a colour this module can check from pixels.
 */
function parseHexColor(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const body = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-f]{3}$/i.test(body)) {
    return {
      r: parseInt(body[0] + body[0], 16),
      g: parseInt(body[1] + body[1], 16),
      b: parseInt(body[2] + body[2], 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(body)) {
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
    };
  }
  if (/^[0-9a-f]{8}$/i.test(body)) {
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
    };
  }
  return null;
}

/** Euclidean distance in sRGB (0..~441.7). Deterministic, no colour space I/O. */
function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** `{status:"unknown", issues:[]}` with a reason — the fail-closed result. */
function unknown(reason) {
  return { status: "unknown", issues: [], reason };
}

/**
 * The dominant colours of one RGBA buffer, most common first.
 *
 * Fully transparent pixels hold no colour and are skipped — both when the
 * histogram counts and when the per-cell averages are accumulated, so a
 * transparent `#ff0000` cannot masquerade as red. The bin counting itself is
 * delegated to `computeHistogram`: this function only folds each pixel's RGB
 * onto the joint grid and writes that cell index into a scratch buffer whose
 * bytes the histogram bins (see PALETTE_LEVELS for why one byte is enough).
 *
 * @param {ArrayLike<number>} rgba 4 bytes per pixel, row-major
 * @param {number} width pixels per row
 * @param {number} height rows
 * @param {{maxColors?: number}} [options]
 * @returns {{colors: Array<{hex: string, ratio: number}>, total: number}|null}
 *   `null` for bad dimensions, a buffer whose length is not `width*height*4`,
 *   or no opaque pixels.
 */
export function extractCompliancePalette(rgba, width, height, options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const w = Number(width);
  const h = Number(height);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null;
  if (!rgba || typeof rgba.length !== "number") return null;

  const pixelCount = w * h;
  if (rgba.length !== pixelCount * 4) return null;

  const maxColors =
    Number.isInteger(opts.maxColors) && opts.maxColors > 0
      ? opts.maxColors
      : DEFAULT_MAX_PALETTE_COLORS;

  // The cell index of each opaque pixel, addressed by the histogram. A
  // transparent pixel is left as zeroed bytes (alpha 0), which computeHistogram
  // skips by the same rule the averages below use.
  const keyed = new Uint8ClampedArray(pixelCount * 4);
  // Sums for the average colour of each cell; counts come from the histogram.
  const sumR = new Float64Array(PALETTE_CELLS);
  const sumG = new Float64Array(PALETTE_CELLS);
  const sumB = new Float64Array(PALETTE_CELLS);

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const at = pixel * 4;
    if (rgba[at + 3] === 0) continue;

    const r = rgba[at];
    const g = rgba[at + 1];
    const b = rgba[at + 2];
    const cell =
      (Math.round((r / 255) * PALETTE_LEVEL_STEP) * PALETTE_LEVELS +
        Math.round((g / 255) * PALETTE_LEVEL_STEP)) *
        PALETTE_LEVELS +
      Math.round((b / 255) * PALETTE_LEVEL_STEP);

    keyed[at] = cell;
    keyed[at + 1] = cell;
    keyed[at + 2] = cell;
    keyed[at + 3] = 255;

    sumR[cell] += r;
    sumG[cell] += g;
    sumB[cell] += b;
  }

  const histogram = computeHistogram(keyed, {
    bins: IDENTITY_BINS,
    channels: 4,
  });
  const total = histogram.total;
  if (total === 0) return null;

  const cells = [];
  for (let cell = 0; cell < PALETTE_CELLS; cell++) {
    const count = histogram.r[cell];
    if (!count) continue;
    cells.push({
      cell,
      count,
      rgb: {
        r: Math.round(sumR[cell] / count),
        g: Math.round(sumG[cell] / count),
        b: Math.round(sumB[cell] / count),
      },
    });
  }

  // Most common first; the cell index breaks ties so equal counts never depend
  // on iteration order or engine sort stability.
  cells.sort((a, b) => b.count - a.count || a.cell - b.cell);

  return {
    colors: cells.slice(0, maxColors).map((entry) => ({
      hex: rgbToHex(entry.rgb),
      ratio: entry.count / total,
    })),
    total,
  };
}

/** A finite, non-negative tolerance from options, or `null` when invalid. */
function resolveTolerance(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

/** The effective options for a check, or `{error}` when any is unusable. */
function resolveCheckOptions(options) {
  const opts = options && typeof options === "object" ? options : {};

  if (
    opts.colorMetric !== undefined &&
    opts.colorMetric !== COLOR_METRIC_SRGB_EUCLIDEAN
  ) {
    return { error: `unsupported colorMetric "${String(opts.colorMetric)}"` };
  }

  const colorTolerance = resolveTolerance(opts.colorTolerance, DEFAULT_COLOR_TOLERANCE);
  if (colorTolerance === null) {
    return { error: "colorTolerance must be a finite non-negative number" };
  }
  const forbiddenTolerance = resolveTolerance(
    opts.forbiddenTolerance,
    DEFAULT_FORBIDDEN_TOLERANCE,
  );
  if (forbiddenTolerance === null) {
    return { error: "forbiddenTolerance must be a finite non-negative number" };
  }

  let minCoverage = DEFAULT_MIN_COVERAGE;
  if (opts.minCoverage !== undefined) {
    if (
      typeof opts.minCoverage !== "number" ||
      !Number.isFinite(opts.minCoverage) ||
      opts.minCoverage < 0 ||
      opts.minCoverage > 1
    ) {
      return { error: "minCoverage must be a finite number in [0, 1]" };
    }
    minCoverage = opts.minCoverage;
  }

  const maxColors =
    Number.isInteger(opts.maxColors) && opts.maxColors > 0
      ? opts.maxColors
      : DEFAULT_MAX_PALETTE_COLORS;

  return { colorTolerance, forbiddenTolerance, minCoverage, maxColors };
}

/**
 * Splits a (possibly raw) lock into the colour constraints pixels can check.
 * The lock is normalized through `sanitizeIdentityLock` so this module consumes
 * the canonical shape instead of redefining it. Fonts, logo ids and safe areas
 * are vector-only and deliberately dropped: they must never fabricate an issue.
 */
function resolveLockColors(lock) {
  if (lock === null || lock === undefined) {
    return { error: "no identity lock provided" };
  }
  const normalized = sanitizeIdentityLock(lock);
  if (!normalized) {
    return { error: "identity lock is not an object" };
  }

  const colors = [];
  for (const entry of normalized.colors) {
    const rgb = parseHexColor(entry?.hex);
    if (rgb) colors.push({ hex: rgbToHex(rgb), rgb });
  }

  // Only forbidden entries that are colours are checkable from pixels; a
  // forbidden font name must not become a colour accusation.
  const forbidden = [];
  for (const raw of normalized.forbidden) {
    const rgb = parseHexColor(raw);
    if (rgb) {
      forbidden.push({
        raw: String(raw).trim(),
        key: encodeURIComponent(String(raw).trim().toLowerCase()),
        rgb,
      });
    }
  }

  if (colors.length === 0 && forbidden.length === 0) {
    return {
      error:
        "identity lock carries no colour constraints measurable from pixels (fonts, logo and safe area are vector-only)",
    };
  }
  return { colors, forbidden };
}

/**
 * Checks decoded raster samples against a resolved identity lock.
 *
 * Rules, and only rules pixels can honestly decide:
 *   - palette drift: a dominant palette colour further than `colorTolerance`
 *     from every lock colour;
 *   - forbidden colour: a dominant palette colour within `forbiddenTolerance`
 *     of a `forbidden` entry that parses as a colour.
 *
 * Logo presence is explicitly NOT checked: pixels alone cannot tell a brand
 * logo from any other shape, so a guess would be a false accusation.
 *
 * Fail-closed: if the lock constrains nothing measurable, if there are no
 * samples, or if any sample cannot be read, the result is `"unknown"` with a
 * `reason` and no issues. Otherwise `status` is `"drift"` when at least one
 * rule fired and `"compliant"` when none did.
 *
 * @param {Object} [input]
 * @param {Array<{rgba: ArrayLike<number>, width: number, height: number, targetId?: string}>} [input.samples]
 * @param {Object|null} [input.lock] resolved (or raw) identity lock
 * @param {Object} [input.options]
 * @param {"euclidean-srgb"} [input.options.colorMetric] default `"euclidean-srgb"`
 * @param {number} [input.options.colorTolerance] default 60
 * @param {number} [input.options.forbiddenTolerance] default 30
 * @param {number} [input.options.minCoverage] default 0.02; a palette entry
 *   held by fewer than this share of opaque pixels is ignored by both rules, so
 *   anti-aliasing slivers cannot become accusations
 * @param {number} [input.options.maxColors] default 5
 * @returns {{status: "compliant"|"drift"|"unknown", issues: Array<Object>, reason?: string}}
 */
export function checkIdentityCompliance({ samples, lock, options } = {}) {
  const opts = resolveCheckOptions(options);
  if (opts.error) return unknown(opts.error);

  const constraints = resolveLockColors(lock);
  if (constraints.error) return unknown(constraints.error);

  if (!Array.isArray(samples) || samples.length === 0) {
    return unknown("no image samples provided");
  }

  const palettes = [];
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    const targetId =
      sample && sample.targetId !== undefined && sample.targetId !== null && sample.targetId !== ""
        ? String(sample.targetId)
        : `sample_${index}`;
    const palette = extractCompliancePalette(
      sample?.rgba,
      sample?.width,
      sample?.height,
      { maxColors: opts.maxColors },
    );
    if (!palette) {
      return unknown(`sample "${targetId}" is unreadable`);
    }
    palettes.push({
      targetId,
      width: Number(sample.width),
      height: Number(sample.height),
      palette,
    });
  }

  const issues = [];
  for (const { targetId, width, height, palette } of palettes) {
    const region = { x: 0, y: 0, w: width, h: height };

    for (const color of palette.colors) {
      if (color.ratio < opts.minCoverage) continue;
      const rgb = parseHexColor(color.hex);
      if (!rgb) continue; // extraction only emits canonical hex; defensive.

      if (constraints.colors.length > 0) {
        let nearest = null;
        let nearestDistance = Infinity;
        for (const lockColor of constraints.colors) {
          const distance = colorDistance(rgb, lockColor.rgb);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = lockColor;
          }
        }
        if (nearestDistance > opts.colorTolerance) {
          issues.push({
            id: `issue_identity_palette_drift_${targetId}_${color.hex.slice(1)}`,
            targetType: "image",
            targetId,
            region: { ...region },
            rule: RULE_PALETTE_DRIFT,
            severity: "warning",
            evidence:
              `Image "${targetId}" uses colour ${color.hex} (${(color.ratio * 100).toFixed(1)}% ` +
              `of opaque pixels); the nearest identity-lock colour ${nearest.hex} is ` +
              `${nearestDistance.toFixed(1)} away (tolerance ${opts.colorTolerance}).`,
            suggestion:
              `Re-map ${color.hex} to the identity-lock palette ` +
              `(nearest approved colour: ${nearest.hex}).`,
          });
        }
      }

      for (const forbidden of constraints.forbidden) {
        const distance = colorDistance(rgb, forbidden.rgb);
        if (distance <= opts.forbiddenTolerance) {
          issues.push({
            id: `issue_identity_forbidden_color_${targetId}_${forbidden.key}_${color.hex.slice(1)}`,
            targetType: "image",
            targetId,
            region: { ...region },
            rule: RULE_FORBIDDEN_COLOR,
            severity: "error",
            evidence:
              `Image "${targetId}" contains forbidden colour "${forbidden.raw}" ` +
              `(palette colour ${color.hex}, ${distance.toFixed(1)} away, ` +
              `tolerance ${opts.forbiddenTolerance}).`,
            suggestion: `Remove forbidden colour "${forbidden.raw}" from the generated image.`,
          });
        }
      }
    }
  }

  return {
    status: issues.length > 0 ? "drift" : "compliant",
    issues,
  };
}
