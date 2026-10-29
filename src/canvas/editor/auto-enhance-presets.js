/**
 * The levels slider ranges, mirroring `LEVELS_SLIDERS` in
 * src/canvas/components/editor_properties/adjustment_controls_constants.js.
 * Levels is a compound row rather than a scalar adjustment, so its ranges
 * are listed explicitly for the planner's clamping rules.
 */
export const LEVELS_RANGE = Object.freeze({
  black: { min: 0, max: 100 },
  white: { min: 0, max: 100 },
  gamma: { min: 0.1, max: 5 },
  outBlack: { min: 0, max: 100 },
  outWhite: { min: 0, max: 100 },
});

/** log2(0) is -Infinity; one level of mean light is as dark as we measure. */
export const MIN_MEASURABLE_MEAN = 1;

/**
 * How much of the 0..100 levels scale the measured black/white pair must span
 * before the frame is treated as carrying tone information at all.
 *
 * Below this the pair is effectively a point — a solid colour, an all-black or
 * all-white frame, or a buffer whose pixels are all transparent and therefore
 * measure nothing — and such a frame has no *variation* to read: a levels
 * stretch would divide it by ~0 and a contrast correction would aim at a span
 * that is not there, so both keep the neutral reading instead. This is the
 * floor for the two sliders that need a distribution; the ones that need a
 * level are guarded by hasMeasurableLevel, because a flat frame's brightness
 * (unlike its contrast) is a real measurement.
 */
export const MIN_LEVELS_SPAN = 5;

/** Levels are stored in percent; the histogram reports 0..255 levels. */
export const LEVEL_PERCENT_SCALE = 255 / 100;

export const DEFAULT_PRESET_ID = "neutral";

/**
 * The presets, as data. Gains are in final slider percent so a preset reads as
 * the edit it produces (a `shadowsGain` of 45 means "all of the frame crushed
 * to black earns +45 % shadows"), and none of them is strong enough to clip on
 * its own — the clamps below are a backstop, not the intended operating point.
 *
 * `targetMean` is the mean luma the exposure correction aims at, where a well
 * exposed frame sits: 118 is the 18 % grey card read back in sRGB
 * (0.466 ^ (1/2.2)). Every preset carries its own, so the correction is never a
 * silent default.
 */
const PRESETS = [
  {
    /** Faithful correction: fix the range and the cast, change nothing else. */
    id: "neutral",
    targetMean: 118,
    exposureStrength: 0.8,
    brightnessPerEV: 12,
    brightnessLift: 0,
    contrastTarget: 0.9,
    contrastGain: 80,
    contrastLift: 0,
    shadowsGain: 45,
    shadowLift: 0,
    highlightsGain: 50,
    highlightLift: 0,
    wbGain: 0.35,
    wbTintGain: 0.3,
    autoLevels: true,
    levelsOutputBlack: 0,
    levelsOutputWhite: 100,
  },
  {
    /** Social look: brighter mid-tones, lifted blacks, punchier contrast. */
    id: "bright",
    targetMean: 140,
    exposureStrength: 1,
    brightnessPerEV: 14,
    brightnessLift: 8,
    contrastTarget: 0.95,
    contrastGain: 90,
    contrastLift: 4,
    shadowsGain: 60,
    shadowLift: 12,
    highlightsGain: 60,
    highlightLift: -4,
    wbGain: 0.4,
    wbTintGain: 0.3,
    autoLevels: true,
    levelsOutputBlack: 3,
    levelsOutputWhite: 100,
  },
  {
    /** Low-light recovery: maximum shadow lift, gentle contrast so noise stays down. */
    id: "lowlight",
    targetMean: 112,
    exposureStrength: 1,
    brightnessPerEV: 10,
    brightnessLift: 0,
    contrastTarget: 0.85,
    contrastGain: 60,
    contrastLift: 0,
    shadowsGain: 80,
    shadowLift: 20,
    highlightsGain: 70,
    highlightLift: 0,
    wbGain: 0.3,
    wbTintGain: 0.25,
    autoLevels: true,
    levelsOutputBlack: 0,
    levelsOutputWhite: 100,
  },
  {
    /** Product/landscape look: full contrast, near-neutral white balance. */
    id: "punch",
    targetMean: 120,
    exposureStrength: 0.7,
    brightnessPerEV: 10,
    brightnessLift: 0,
    contrastTarget: 1,
    contrastGain: 110,
    contrastLift: 6,
    shadowsGain: 40,
    shadowLift: 0,
    highlightsGain: 45,
    highlightLift: 0,
    wbGain: 0.25,
    wbTintGain: 0.2,
    autoLevels: true,
    levelsOutputBlack: 0,
    levelsOutputWhite: 100,
  },
];

// Frozen because presets are shared data: a caller that mutates a preset it
// read would change every later plan in the session.
for (const preset of PRESETS) Object.freeze(preset);

/** The presets, in panel order. Ids and values only. */
export const AUTO_ENHANCE_PRESETS = Object.freeze(PRESETS);

