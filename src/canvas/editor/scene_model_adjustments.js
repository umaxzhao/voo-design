// Seam: Adjustment normalization and defensive value clamping.
/* eslint-disable no-unused-vars */
import {
  REGION_PALETTE,
  REGION_COLOR,
  getRegionColor,
  MIN_REGION_SIZE,
  LEGACY_DOC_VERSION,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  LINE_HEIGHT_RATIO,
  TEXT_FONT_WEIGHTS,
  TEXT_ALIGNS,
  DEFAULT_TEXT_STYLE,
  MIN_DOC_SIZE,
  BLEND_MODES,
  normalizeBlendMode,
  MAX_SHEAR_DEG,
  normalizeCornerRadius,
  normalizeRotationDeg,
  normalizeNodeTransform,
  hasBlendModes,
  DEFAULT_ADJUSTMENTS,
  isDefaultAdjustments,
  deepEqual,
  normalizePoints,
  parseAdjustmentValue,
  HUE_BAND_KEYS,
  normalizeHueSatBands,
  DOC_VERSION,
  NODE_KIND,
  DEFAULT_BLEND_MODE,
  newId,
  createDefaultAdjustments,
  getBaseDefaults,
  createDocument,
  createImageNode,
} from "./scene_model_core.js";

/** Sorts and clamps a gradient stop list; falls back on a broken list. */
/* eslint-enable no-unused-vars */
export function normalizeGradientStops(stops, fallback) {
  const list = Array.isArray(stops)
    ? stops
        .filter((x) => x && typeof x.color === "string" && /^#[0-9a-fA-F]{6}$/.test(x.color) && Number.isFinite(x.location))
        .map((x) => ({ color: x.color, location: Math.max(0, Math.min(1, x.location)) }))
        .sort((x, y) => x.location - y.location)
    : [];
  return list.length < 2 ? fallback : list;
}

/** Clamps one channel-mixer row into its -200..200 ranges. */
export function normalizeMixerRow(row, fallback) {
  return {
    red: parseAdjustmentValue(row?.red, -200, 200, fallback.red),
    green: parseAdjustmentValue(row?.green, -200, 200, fallback.green),
    blue: parseAdjustmentValue(row?.blue, -200, 200, fallback.blue),
    constant: parseAdjustmentValue(row?.constant, -200, 200, fallback.constant),
  };
}

/** Clamps one selective-colour ink row into its -100..100 ranges. */
export function normalizeInkRow(row, fallback) {
  return {
    c: parseAdjustmentValue(row?.c, -100, 100, fallback.c),
    m: parseAdjustmentValue(row?.m, -100, 100, fallback.m),
    y: parseAdjustmentValue(row?.y, -100, 100, fallback.y),
    k: parseAdjustmentValue(row?.k, -100, 100, fallback.k),
  };
}

/** Clamps one colour-balance zone into its -100..100 channel ranges. */
export function normalizeColorBalanceZone(zone, fallback) {
  return {
    cyanRed: parseAdjustmentValue(zone?.cyanRed, -100, 100, fallback.cyanRed),
    magentaGreen: parseAdjustmentValue(zone?.magentaGreen, -100, 100, fallback.magentaGreen),
    yellowBlue: parseAdjustmentValue(zone?.yellowBlue, -100, 100, fallback.yellowBlue),
  };
}

/** Keeps only well-formed #rrggbb hex colours, falling back otherwise. */
export function normalizeHexColor(color, fallback) {
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

export function normalizeAdjustments(adj) {
  // A missing/foreign `adj` returns the plain neutral baseline. Return a FRESH
  // factory object (not the shared baseline) so each node owns its instance.
  if (!adj || typeof adj !== "object") return createDefaultAdjustments();
  // `adj` is present: read the per-field fallback values from the single hoisted
  // baseline instead of building a fresh defaults object per call.
  const defaults = DEFAULT_ADJUSTMENTS;
  return {
    brightness: {
      enabled: Boolean(adj.brightness?.enabled ?? defaults.brightness.enabled),
      value: parseAdjustmentValue(adj.brightness?.value, -100, 100, defaults.brightness.value),
    },
    contrast: {
      enabled: Boolean(adj.contrast?.enabled ?? defaults.contrast.enabled),
      value: parseAdjustmentValue(adj.contrast?.value, -100, 100, defaults.contrast.value),
    },
    hue: {
      enabled: Boolean(adj.hue?.enabled ?? defaults.hue.enabled),
      value: parseAdjustmentValue(adj.hue?.value, -180, 180, defaults.hue.value),
      colorize: Boolean(adj.hue?.colorize),
      bands: normalizeHueSatBands(adj.hue?.bands),
    },
    saturation: {
      enabled: Boolean(adj.saturation?.enabled ?? defaults.saturation.enabled),
      value: parseAdjustmentValue(adj.saturation?.value, -100, 100, defaults.saturation.value),
    },
    lightness: {
      enabled: Boolean(adj.lightness?.enabled ?? defaults.lightness.enabled),
      value: parseAdjustmentValue(adj.lightness?.value, -100, 100, defaults.lightness.value),
    },
    exposure: {
      enabled: Boolean(adj.exposure?.enabled ?? defaults.exposure.enabled),
      value: parseAdjustmentValue(adj.exposure?.value, -2, 2, defaults.exposure.value),
    },
    temperature: {
      enabled: Boolean(adj.temperature?.enabled ?? defaults.temperature.enabled),
      value: parseAdjustmentValue(adj.temperature?.value, -100, 100, defaults.temperature.value),
    },
    tint: {
      enabled: Boolean(adj.tint?.enabled ?? defaults.tint.enabled),
      value: parseAdjustmentValue(adj.tint?.value, -100, 100, defaults.tint.value),
    },
    highlights: {
      enabled: Boolean(adj.highlights?.enabled ?? defaults.highlights.enabled),
      value: parseAdjustmentValue(adj.highlights?.value, -100, 100, defaults.highlights.value),
    },
    shadows: {
      enabled: Boolean(adj.shadows?.enabled ?? defaults.shadows.enabled),
      value: parseAdjustmentValue(adj.shadows?.value, -100, 100, defaults.shadows.value),
    },
    vignette: {
      enabled: Boolean(adj.vignette?.enabled ?? defaults.vignette.enabled),
      value: parseAdjustmentValue(adj.vignette?.value, 0, 100, defaults.vignette.value),
    },
    blur: {
      enabled: Boolean(adj.blur?.enabled ?? defaults.blur.enabled),
      value: parseAdjustmentValue(adj.blur?.value, 0, 100, defaults.blur.value),
    },
    sharpen: {
      enabled: Boolean(adj.sharpen?.enabled ?? defaults.sharpen.enabled),
      value: parseAdjustmentValue(adj.sharpen?.value, 0, 100, defaults.sharpen.value),
    },
    noise: {
      enabled: Boolean(adj.noise?.enabled ?? defaults.noise.enabled),
      value: parseAdjustmentValue(adj.noise?.value, 0, 100, defaults.noise.value),
    },
    pixelate: {
      enabled: Boolean(adj.pixelate?.enabled ?? defaults.pixelate.enabled),
      value: parseAdjustmentValue(adj.pixelate?.value, 0, 100, defaults.pixelate.value),
    },
    posterize: {
      enabled: Boolean(adj.posterize?.enabled ?? defaults.posterize.enabled),
      value: parseAdjustmentValue(adj.posterize?.value, 0, 100, defaults.posterize.value),
    },
    sepia: {
      enabled: Boolean(adj.sepia?.enabled ?? defaults.sepia.enabled),
      value: parseAdjustmentValue(adj.sepia?.value, 0, 100, defaults.sepia.value),
    },
    clouds: {
      enabled: Boolean(adj.clouds?.enabled ?? defaults.clouds.enabled),
      value: parseAdjustmentValue(adj.clouds?.value, 0, 100, defaults.clouds.value),
    },
    solarize: {
      enabled: Boolean(adj.solarize?.enabled ?? defaults.solarize.enabled),
      value: parseAdjustmentValue(adj.solarize?.value, 0, 100, defaults.solarize.value),
    },
    halftone: {
      enabled: Boolean(adj.halftone?.enabled ?? defaults.halftone.enabled),
      value: parseAdjustmentValue(adj.halftone?.value, 0, 100, defaults.halftone.value),
    },
    emboss: {
      enabled: Boolean(adj.emboss?.enabled ?? defaults.emboss.enabled),
      value: parseAdjustmentValue(adj.emboss?.value, 0, 100, defaults.emboss.value),
    },
    curves: {
      enabled: Boolean(adj.curves?.enabled ?? defaults.curves.enabled),
      luminance: normalizePoints(adj.curves?.luminance, defaults.curves.luminance),
      r: normalizePoints(adj.curves?.r, defaults.curves.r),
      g: normalizePoints(adj.curves?.g, defaults.curves.g),
      b: normalizePoints(adj.curves?.b, defaults.curves.b),
    },
    levels: {
      enabled: Boolean(adj.levels?.enabled ?? defaults.levels.enabled),
      black: parseAdjustmentValue(adj.levels?.black, 0, 100, defaults.levels.black),
      white: parseAdjustmentValue(adj.levels?.white, 0, 100, defaults.levels.white),
      gamma: parseAdjustmentValue(adj.levels?.gamma, 0.1, 5, defaults.levels.gamma),
      outBlack: parseAdjustmentValue(adj.levels?.outBlack, 0, 100, defaults.levels.outBlack),
      outWhite: parseAdjustmentValue(adj.levels?.outWhite, 0, 100, defaults.levels.outWhite),
    },
    invert: {
      enabled: Boolean(adj.invert?.enabled ?? defaults.invert.enabled),
    },
    threshold: {
      enabled: Boolean(adj.threshold?.enabled ?? defaults.threshold.enabled),
      value: parseAdjustmentValue(adj.threshold?.value, 0, 255, defaults.threshold.value),
    },
    colorBalance: {
      enabled: Boolean(adj.colorBalance?.enabled ?? defaults.colorBalance.enabled),
      preserveLuminosity:
        adj.colorBalance?.preserveLuminosity === undefined
          ? defaults.colorBalance.preserveLuminosity
          : adj.colorBalance?.preserveLuminosity,
      shadows: normalizeColorBalanceZone(adj.colorBalance?.shadows, defaults.colorBalance.shadows),
      midtones: normalizeColorBalanceZone(adj.colorBalance?.midtones, defaults.colorBalance.midtones),
      highlights: normalizeColorBalanceZone(adj.colorBalance?.highlights, defaults.colorBalance.highlights),
    },
    blackAndWhite: {
      enabled: Boolean(adj.blackAndWhite?.enabled ?? defaults.blackAndWhite.enabled),
      reds: parseAdjustmentValue(adj.blackAndWhite?.reds, -200, 300, defaults.blackAndWhite.reds),
      yellows: parseAdjustmentValue(adj.blackAndWhite?.yellows, -200, 300, defaults.blackAndWhite.yellows),
      greens: parseAdjustmentValue(adj.blackAndWhite?.greens, -200, 300, defaults.blackAndWhite.greens),
      cyans: parseAdjustmentValue(adj.blackAndWhite?.cyans, -200, 300, defaults.blackAndWhite.cyans),
      blues: parseAdjustmentValue(adj.blackAndWhite?.blues, -200, 300, defaults.blackAndWhite.blues),
      magentas: parseAdjustmentValue(adj.blackAndWhite?.magentas, -200, 300, defaults.blackAndWhite.magentas),
      useTint: Boolean(adj.blackAndWhite?.useTint ?? defaults.blackAndWhite.useTint),
      tintColor: normalizeHexColor(adj.blackAndWhite?.tintColor, defaults.blackAndWhite.tintColor),
    },
    photoFilter: {
      enabled: Boolean(adj.photoFilter?.enabled ?? defaults.photoFilter.enabled),
      color: normalizeHexColor(adj.photoFilter?.color, defaults.photoFilter.color),
      density: parseAdjustmentValue(adj.photoFilter?.density, 0, 100, defaults.photoFilter.density),
      preserveLuminosity:
        adj.photoFilter?.preserveLuminosity === undefined
          ? defaults.photoFilter.preserveLuminosity
          : adj.photoFilter?.preserveLuminosity,
    },
    vibrance: {
      enabled: Boolean(adj.vibrance?.enabled ?? defaults.vibrance.enabled),
      value: parseAdjustmentValue(adj.vibrance?.value, -100, 100, defaults.vibrance.value),
    },
    channelMixer: {
      enabled: Boolean(adj.channelMixer?.enabled ?? defaults.channelMixer.enabled),
      monochrome: Boolean(adj.channelMixer?.monochrome ?? defaults.channelMixer.monochrome),
      red: normalizeMixerRow(adj.channelMixer?.red, defaults.channelMixer.red),
      green: normalizeMixerRow(adj.channelMixer?.green, defaults.channelMixer.green),
      blue: normalizeMixerRow(adj.channelMixer?.blue, defaults.channelMixer.blue),
      gray: normalizeMixerRow(adj.channelMixer?.gray, defaults.channelMixer.gray),
    },
    selectiveColor: {
      enabled: Boolean(adj.selectiveColor?.enabled ?? defaults.selectiveColor.enabled),
      mode: adj.selectiveColor?.mode === "absolute" ? "absolute" : "relative",
      reds: normalizeInkRow(adj.selectiveColor?.reds, defaults.selectiveColor.reds),
      yellows: normalizeInkRow(adj.selectiveColor?.yellows, defaults.selectiveColor.yellows),
      greens: normalizeInkRow(adj.selectiveColor?.greens, defaults.selectiveColor.greens),
      cyans: normalizeInkRow(adj.selectiveColor?.cyans, defaults.selectiveColor.cyans),
      blues: normalizeInkRow(adj.selectiveColor?.blues, defaults.selectiveColor.blues),
      magentas: normalizeInkRow(adj.selectiveColor?.magentas, defaults.selectiveColor.magentas),
      whites: normalizeInkRow(adj.selectiveColor?.whites, defaults.selectiveColor.whites),
      neutrals: normalizeInkRow(adj.selectiveColor?.neutrals, defaults.selectiveColor.neutrals),
      blacks: normalizeInkRow(adj.selectiveColor?.blacks, defaults.selectiveColor.blacks),
    },
    gradientMap: {
      enabled: Boolean(adj.gradientMap?.enabled ?? defaults.gradientMap.enabled),
      reverse: Boolean(adj.gradientMap?.reverse ?? defaults.gradientMap.reverse),
      stops: normalizeGradientStops(adj.gradientMap?.stops, defaults.gradientMap.stops),
    },
  };
}
