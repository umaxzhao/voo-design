/**
 * One-tap auto enhance: histogram statistics in, a plan of adjustment values
 * out, all of it in the units the existing adjustment kinds already use.
 *
 * The planner is deliberately a pure function of `computeImageStats()` output
 * and a preset — no image, no DOM, no randomness — so the same frame always
 * yields the same edit and a test can drive it without a canvas.
 *
 * Every emitted value is snapped to its kind's slider step and clamped to the
 * range the catalog documents, so a plan can be applied row by row without a
 * second round of validation.
 */

import { SIMPLE_ADJUSTMENTS } from "./adjustment_kinds.js";

import { LEVELS_RANGE, AUTO_ENHANCE_PRESETS, MIN_MEASURABLE_MEAN, MIN_LEVELS_SPAN, LEVEL_PERCENT_SCALE, DEFAULT_PRESET_ID } from "./auto-enhance-presets.js";
export { LEVELS_RANGE, AUTO_ENHANCE_PRESETS } from "./auto-enhance-presets.js";

/** The catalog's slider range for a scalar adjustment kind. */
function simpleRange(kind) {
  const meta = SIMPLE_ADJUSTMENTS.find((entry) => entry.kind === kind);
  if (!meta) throw new RangeError(`auto_enhance: "${kind}" is not a scalar adjustment kind`);
  return { min: meta.min, max: meta.max, step: meta.step ?? 1 };
}

/** Rounds to the slider's step and kills float noise (0.1 -> 0.30000000000000004). */
function snapToStep(value, step) {
  return Number((Math.round(value / step) * step).toFixed(4));
}

/** A scalar adjustment value, snapped to its step and clamped to its range. */
function scalarValue(kind, value) {
  const { min, max, step } = simpleRange(kind);
  return Math.min(max, Math.max(min, snapToStep(value, step)));
}

/** A levels field, clamped to its documented range. */
function levelsValue(field, value) {
  const { min, max } = LEVELS_RANGE[field];
  return Math.min(max, Math.max(min, value));
}

/** Resolves a preset by id, or the preset object a caller read off the list. */
function resolvePreset(preset) {
  if (preset !== undefined && preset !== null && typeof preset !== "string" && typeof preset !== "object") {
    throw new TypeError("planAutoEnhance: preset must be a preset id or a preset object");
  }
  const id = typeof preset === "string" ? preset : (preset?.id ?? DEFAULT_PRESET_ID);
  const found = AUTO_ENHANCE_PRESETS.find((entry) => entry.id === id);
  if (!found) throw new RangeError(`planAutoEnhance: unknown preset "${id}"`);
  return found;
}

function resolveTargetMean(targetMean, preset) {
  const value = targetMean ?? preset.targetMean;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("planAutoEnhance: targetMean must be a finite number");
  }
  if (value <= 0 || value > 255) {
    throw new RangeError("planAutoEnhance: targetMean must be within 1..255");
  }
  return value;
}

function requireFinite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`planAutoEnhance: ${label} must be a finite number`);
  }
  return value;
}

/** Pulls the numbers the planner needs out of a computeImageStats() result. */
function measureStats(stats) {
  if (!stats || typeof stats !== "object") {
    throw new TypeError("planAutoEnhance: stats must be an object");
  }
  const channels = stats.channels;
  if (!channels || typeof channels !== "object") {
    throw new TypeError(
      "planAutoEnhance: stats.channels is required — pass a computeImageStats() result"
    );
  }
  const luma = channels.luma;
  if (!luma || typeof luma !== "object") {
    throw new TypeError("planAutoEnhance: stats.channels.luma is required");
  }
  const clipLuma = stats.clipping?.luma ?? {};

  return {
    total: requireFinite(stats.total, "stats.total"),
    meanLuma: requireFinite(luma.mean, "stats.channels.luma.mean"),
    black: requireFinite(luma.black, "stats.channels.luma.black"),
    white: requireFinite(luma.white, "stats.channels.luma.white"),
    meanR: requireFinite(channels.r?.mean, "stats.channels.r.mean"),
    meanG: requireFinite(channels.g?.mean, "stats.channels.g.mean"),
    meanB: requireFinite(channels.b?.mean, "stats.channels.b.mean"),
    clipLow: requireFinite(clipLuma.low ?? 0, "stats.clipping.luma.low"),
    clipHigh: requireFinite(clipLuma.high ?? 0, "stats.clipping.luma.high"),
  };
}

/**
 * Whether the frame carries a level the planner may correct exposure from.
 *
 * There are two ways for a frame to report no usable level, and both used to
 * come back as "extremely dark, correct by the maximum": a buffer with no
 * opaque pixels at all — its mean is 0 because there was nothing to average,
 * not because the picture is black (and it is the D5 case that handed a fully
 * transparent buffer +2 EV) — and a frame whose every counted pixel sits inside
 * the clip tolerance band at one end of the range, which measures a *saturated*
 * level ("at least this dark") rather than a level. Correcting exposure from
 * either means inventing the tone the frame did not report.
 *
 * It deliberately does not key on a flat frame: a solid mid-grey frame is not
 * clipped, so its level is a real measurement and it is corrected like any
 * other frame of that brightness. Only the *saturated* end is unusable.
 */
function hasMeasurableLevel(measured) {
  return measured.total > 0 && measured.clipLow < 1 && measured.clipHigh < 1;
}

/**
 * Exposure in EV, as a photographic stop ratio between the measured mean and
 * the preset's target. log2 keeps it a light-linear correction: a frame half as
 * bright as the target earns +1 EV whatever its absolute level, which is what
 * makes the correction monotonic in the input — a darker frame can never come
 * out with a brighter correction than a lighter one for the same preset.
 */
function exposureFor(measured, preset, targetMean) {
  const reference = Math.max(measured.meanLuma, MIN_MEASURABLE_MEAN);
  return Math.log2(targetMean / reference) * preset.exposureStrength;
}

/**
 * The measured black/white points in the percent the levels row stores, plus
 * whether the pair spans enough range to carry tone information at all.
 *
 * `hasTone` answers that question once for the two sliders that need it —
 * contrast and the auto-levels pair (see MIN_LEVELS_SPAN). It is false for a
 * solid colour, for an all-black or all-white frame and for a buffer with no
 * opaque pixels, all of which measure a span of exactly 0, and it says nothing
 * about how the picture *should* look.
 */
function measuredTone(measured) {
  const black = levelsValue("black", Math.round(measured.black / LEVEL_PERCENT_SCALE));
  const white = levelsValue("white", Math.round(measured.white / LEVEL_PERCENT_SCALE));
  return { black, white, hasTone: white - black >= MIN_LEVELS_SPAN };
}

/**
 * Auto-levels black/white points from the histogram percentiles, in the
 * percent the levels row stores. The pair collapses to neutral when the
 * measured range is too narrow to stretch (see MIN_LEVELS_SPAN).
 *
 * Gamma stays 1: the mid-tone is already carried by the exposure correction,
 * and moving both would make the two controls fight over the same pixels.
 */
function levelsFor(tone, preset) {
  const outBlack = levelsValue("outBlack", preset.levelsOutputBlack);
  const outWhite = levelsValue("outWhite", preset.levelsOutputWhite);
  const neutral = { black: 0, white: 100, gamma: 1, outBlack, outWhite };
  if (!preset.autoLevels || !tone.hasTone) return neutral;
  return { black: tone.black, white: tone.white, gamma: 1, outBlack, outWhite };
}

/**
 * Grey-world white balance, expressed as the temperature/tint sliders.
 *
 * The assumption is that the average scene colour is neutral, so a channel
 * sitting above its reference *is* the cast. Deviations are relative rather
 * than absolute so the correction does not scale with exposure, and the gains
 * are partial: a genuinely one-hue scene (a green field, a red wall) is a real
 * colour, not a cast, and grey-world would neutralise it — so the plan nudges
 * the white balance and never overrules the photographer.
 *
 * Both axes are measured against the red channel — blue against red is the
 * warm-cool (temperature) axis, green against red is the green-magenta (tint)
 * axis — where the first version measured them against the mean of the three.
 * The mean couples the axes: a blue cast drags it up, which manufactures a
 * green deviation the frame does not have (R = 100, G = 100, B = 200 read as
 * "8 points short of green") and then injects green to "correct" it. Sharing a
 * red reference makes them independent by construction: a frame whose red and
 * green means are equal is balanced on green-magenta whatever its blue channel
 * does, which is exactly what the two sliders model. The deviations are still
 * scaled by the overall mean, so the correction stays level-independent.
 *
 * Signs come from the LUT that consumes these values: temperature warms red and
 * cools blue, tint slides green towards magenta, so a red-heavy frame takes a
 * negative temperature and a green-heavy frame a positive tint.
 */
function whiteBalanceFor(measured, preset) {
  const mean = (measured.meanR + measured.meanG + measured.meanB) / 3;
  if (!(mean > 0)) return { temperature: 0, tint: 0 };

  const devR = (measured.meanR - mean) / mean;
  const devB = (measured.meanB - mean) / mean;
  const devG = (measured.meanG - measured.meanR) / mean;

  return {
    temperature: -preset.wbGain * (devR - devB) * 100,
    tint: preset.wbTintGain * devG * 100,
  };
}

/**
 * Plans a one-tap enhance for a measured image.
 *
 * A frame that reports no usable measurement gets no correction derived from
 * it, each reading guarded by what it actually needs (see hasMeasurableLevel
 * and MIN_LEVELS_SPAN):
 *
 *   - exposure and brightness are dropped when the frame has no measurable
 *     level — no opaque pixels at all, or every pixel clipped to one end;
 *   - contrast and the auto-levels pair are dropped when the measured span is
 *     under MIN_LEVELS_SPAN, i.e. a solid colour or a uniform black/white frame.
 *
 * Reading those placeholder measurements as real is what used to hand a fully
 * transparent buffer the catalogue maximum (+2 EV, 66 % brightness, 72 %
 * contrast). What the frame *reports* rather than what the planner infers still
 * applies — the clipping fractions behind highlights/shadows, the channel means
 * behind temperature/tint — and so does the preset's own lift, which is part of
 * the look it names rather than a measurement of this frame.
 *
 * @param {object} stats a `computeImageStats()` result
 * @param {{preset?: string|object, targetMean?: number}} [options]
 * @returns {{
 *   preset: string,
 *   values: {exposure: number, brightness: number, contrast: number, highlights: number,
 *            shadows: number, temperature: number, tint: number, levels: object},
 *   adjustments: Record<string, object>
 * }} `values` in each kind's own unit, `adjustments` the same numbers as
 *    `{ enabled, value }` rows ready to merge into a node's adjustments.
 */
export function planAutoEnhance(stats, options = {}) {
  const opts = options ?? {};
  if (typeof opts !== "object") {
    throw new TypeError("planAutoEnhance: options must be an object");
  }
  const preset = resolvePreset(opts.preset);
  const targetMean = resolveTargetMean(opts.targetMean, preset);
  const measured = measureStats(stats);

  const tone = measuredTone(measured);
  // The two "is there anything to correct" gates: 1 keeps the frame-derived
  // term of the sliders they guard, 0 drops it. Each is named for the reading
  // it guards, so a change to what counts as a usable measurement lands in one
  // place. The presets' own lifts are image-independent and stay either way.
  const levelGate = hasMeasurableLevel(measured) ? 1 : 0;
  const spanGate = tone.hasTone ? 1 : 0;
  const span = (measured.white - measured.black) / 255;
  const exposure = exposureFor(measured, preset, targetMean);
  const whiteBalance = whiteBalanceFor(measured, preset);

  const values = {
    exposure: scalarValue("exposure", levelGate * exposure),
    // Brightness carries the same correction as exposure, in the percent the
    // brightness slider speaks, plus whatever lift the preset asks for. It is
    // monotonic in exposure, so it preserves the "darker never corrects
    // brighter" ordering.
    brightness: scalarValue(
      "brightness",
      levelGate * exposure * preset.brightnessPerEV + preset.brightnessLift
    ),
    contrast: scalarValue(
      "contrast",
      spanGate * (preset.contrastTarget - span) * preset.contrastGain + preset.contrastLift
    ),
    highlights: scalarValue(
      "highlights",
      preset.highlightLift - measured.clipHigh * preset.highlightsGain
    ),
    shadows: scalarValue("shadows", preset.shadowLift + measured.clipLow * preset.shadowsGain),
    temperature: scalarValue("temperature", whiteBalance.temperature),
    tint: scalarValue("tint", whiteBalance.tint),
    levels: levelsFor(tone, preset),
  };

  return {
    preset: preset.id,
    values,
    adjustments: {
      exposure: { enabled: true, value: values.exposure },
      brightness: { enabled: true, value: values.brightness },
      contrast: { enabled: true, value: values.contrast },
      highlights: { enabled: true, value: values.highlights },
      shadows: { enabled: true, value: values.shadows },
      temperature: { enabled: true, value: values.temperature },
      tint: { enabled: true, value: values.tint },
      levels: { enabled: true, ...values.levels },
    },
  };
}

/** The preset with this id, or null — for a panel that renders the list. */
export function getAutoEnhancePreset(id) {
  return AUTO_ENHANCE_PRESETS.find((preset) => preset.id === id) ?? null;
}
