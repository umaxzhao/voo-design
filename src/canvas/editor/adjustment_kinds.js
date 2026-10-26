/**
 * Adjustment and effect kinds, catalog tables, and label key mappings.
 */

/**
 * The scalar adjustments, in panel order, each `{ enabled, value }` with a
 * zero neutral value. Metadata drives the generic slider editor.
 */
export const SIMPLE_ADJUSTMENTS = [
  {
    kind: "brightness",
    labelKey: "editor.props.brightness",
    min: -100,
    max: 100,
    unit: "%",
    starter: 10,
  },
  {
    kind: "contrast",
    labelKey: "editor.props.contrast",
    min: -100,
    max: 100,
    unit: "%",
    starter: 10,
  },
  {
    kind: "hue",
    labelKey: "editor.props.hue",
    min: -180,
    max: 180,
    unit: "°",
    starter: 15,
  },
  {
    kind: "saturation",
    labelKey: "editor.props.saturation",
    min: -100,
    max: 100,
    unit: "%",
    starter: 20,
  },
  {
    kind: "lightness",
    labelKey: "editor.props.lightness",
    min: -100,
    max: 100,
    unit: "%",
    starter: 10,
  },
  {
    kind: "exposure",
    labelKey: "editor.props.exposure",
    min: -2,
    max: 2,
    step: 0.1,
    unit: " EV",
    starter: 0.5,
  },
  {
    kind: "temperature",
    labelKey: "editor.props.temperature",
    min: -100,
    max: 100,
    unit: "%",
    starter: 10,
  },
  {
    kind: "tint",
    labelKey: "editor.props.tint",
    min: -100,
    max: 100,
    unit: "%",
    starter: 10,
  },
  {
    kind: "highlights",
    labelKey: "editor.props.highlights",
    min: -100,
    max: 100,
    unit: "%",
    starter: 15,
  },
  {
    kind: "shadows",
    labelKey: "editor.props.shadows",
    min: -100,
    max: 100,
    unit: "%",
    starter: 15,
  },
  {
    kind: "vignette",
    labelKey: "editor.props.vignette",
    min: 0,
    max: 100,
    unit: "%",
    starter: 20,
  },
  {
    kind: "blur",
    labelKey: "editor.props.blur",
    min: 0,
    max: 100,
    unit: "%",
    starter: 10,
  },
  {
    kind: "sharpen",
    labelKey: "editor.props.sharpen",
    min: 0,
    max: 100,
    unit: "%",
    starter: 20,
  },
  {
    kind: "clarity",
    labelKey: "editor.props.clarity",
    min: -100,
    max: 100,
    unit: "%",
    starter: 20,
  },
  {
    kind: "highPass",
    labelKey: "editor.props.highPass",
    min: 0,
    max: 100,
    unit: "%",
    starter: 30,
  },
  {
    kind: "motionBlur",
    labelKey: "editor.props.motionBlur",
    min: 0,
    max: 100,
    unit: "%",
    starter: 30,
  },
  {
    kind: "noise",
    labelKey: "editor.props.noise",
    min: 0,
    max: 100,
    unit: "%",
    starter: 10,
  },
  {
    kind: "clouds",
    labelKey: "editor.props.clouds",
    min: 0,
    max: 100,
    unit: "%",
    starter: 50,
  },
  {
    kind: "pixelate",
    labelKey: "editor.props.pixelate",
    min: 0,
    max: 100,
    unit: "%",
    starter: 10,
  },
  {
    kind: "posterize",
    labelKey: "editor.props.posterize",
    min: 0,
    max: 100,
    unit: "%",
    starter: 20,
  },
  {
    kind: "solarize",
    labelKey: "editor.props.solarize",
    min: 0,
    max: 100,
    unit: "%",
    starter: 50,
  },
  {
    kind: "halftone",
    labelKey: "editor.props.halftone",
    min: 0,
    max: 100,
    unit: "%",
    starter: 50,
  },
  {
    kind: "sepia",
    labelKey: "editor.props.sepia",
    min: 0,
    max: 100,
    unit: "%",
    starter: 30,
  },
  {
    kind: "emboss",
    labelKey: "editor.props.emboss",
    min: 0,
    max: 100,
    unit: "%",
    starter: 30,
  },
  {
    kind: "median",
    labelKey: "editor.props.median",
    min: 0,
    max: 100,
    unit: "%",
    starter: 25,
  },
  {
    kind: "bloom",
    labelKey: "editor.props.bloom",
    min: 0,
    max: 100,
    unit: "%",
    starter: 30,
  },
  {
    kind: "zoomBlur",
    labelKey: "editor.props.zoomBlur",
    min: 0,
    max: 100,
    unit: "%",
    starter: 30,
  },
  {
    kind: "twirl",
    labelKey: "editor.props.twirl",
    min: -100,
    max: 100,
    unit: "%",
    starter: 30,
  },
  {
    kind: "denoise",
    labelKey: "editor.props.denoise",
    min: 0,
    max: 100,
    unit: "%",
    starter: 30,
  },
  {
    kind: "defringe",
    labelKey: "editor.props.defringe",
    min: 0,
    max: 100,
    unit: "%",
    starter: 40,
  },
  {
    kind: "hazeRemoval",
    labelKey: "editor.props.hazeRemoval",
    min: 0,
    max: 100,
    unit: "%",
    starter: 40,
  },
  {
    kind: "diffuseGlow",
    labelKey: "editor.props.diffuseGlow",
    min: 0,
    max: 100,
    unit: "%",
    starter: 40,
  },
  {
    kind: "unsharpMask",
    labelKey: "editor.props.unsharpMask",
    min: 0,
    max: 100,
    unit: "%",
    starter: 50,
  },
];

/**
 * Tone and Color Adjustments (Photoshop adjustment layers / sliders).
 */
export const TONE_ADJUSTMENT_KINDS = [
  "brightness",
  "contrast",
  "levels",
  "curves",
  "exposure",
  "highlights",
  "shadows",
  "temperature",
  "tint",
  "hue",
  "saturation",
  "vibrance",
  "colorBalance",
  "blackAndWhite",
  "photoFilter",
  "channelMixer",
  "selectiveColor",
  "gradientMap",
  "invert",
  "threshold",
];

/**
 * Creative & Pixel Filters (Photoshop Filter gallery: Blur, Sharpen, Noise, Clouds, Mosaic, etc.).
 */
export const FILTER_KINDS = [
  "blur",
  "sharpen",
  "clarity",
  "highPass",
  "motionBlur",
  "noise",
  "clouds",
  "pixelate",
  "posterize",
  "solarize",
  "halftone",
  "emboss",
  "median",
  "bloom",
  "zoomBlur",
  "twirl",
  "denoise",
  "defringe",
  "hazeRemoval",
  "diffuseGlow",
  "unsharpMask",
  "sepia",
  "vignette",
];

/** All adjustment & filter kinds for backward compatibility. */
export const ADJUSTMENT_KINDS = [...TONE_ADJUSTMENT_KINDS, ...FILTER_KINDS];

/** The effect kinds, in display order (see normalizeEffects). */
export const EFFECT_KINDS = [
  "shadow",
  "glow",
  "innerShadow",
  "innerGlow",
  "satin",
  "bevel",
  "glass",
  "texture",
  "fill",
  "gradientOverlay",
  "stroke",
];

/** Label key for an adjustment kind's popover title. */
export function adjustmentLabelKey(kind) {
  const simple = SIMPLE_ADJUSTMENTS.find((a) => a.kind === kind);
  if (simple) return simple.labelKey;
  const keys = {
    curves: "editor.props.curves",
    levels: "editor.props.adjLevels",
    invert: "editor.props.invert",
    threshold: "editor.props.threshold",
    colorBalance: "editor.props.colorBalance",
    blackAndWhite: "editor.props.blackAndWhite",
    vibrance: "editor.props.vibrance",
    photoFilter: "editor.props.photoFilter",
    channelMixer: "editor.props.channelMixer",
    selectiveColor: "editor.props.selectiveColor",
    gradientMap: "editor.props.gradientMap",
  };
  return keys[kind] ?? "editor.props.adjustments";
}

/** Label key for an effect kind's popover title. */
export function effectLabelKey(kind) {
  const keys = {
    shadow: "editor.props.effectShadow",
    glow: "editor.props.effectGlow",
    innerShadow: "editor.props.effectInnerShadow",
    innerGlow: "editor.props.effectInnerGlow",
    satin: "editor.props.effectSatin",
    bevel: "editor.props.effectBevel",
    glass: "editor.props.effectGlass",
    texture: "editor.props.effectTexture",
    fill: "editor.props.effectFill",
    gradientOverlay: "editor.props.effectGradientOverlay",
    stroke: "editor.props.effectStroke",
  };
  return keys[kind] ?? "editor.props.effects";
}
