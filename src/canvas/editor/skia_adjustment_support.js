/**
 * Which of the editor's adjustment factors canvas-core's `ImageAdjustments`
 * can paint, and which it cannot.
 *
 * The 2D renderer implements a rich tonal model (see `tone_lut.js` /
 * `cpu_adjustments.js`): per-hue bands, curves, colour balance, black & white,
 * vibrance, channel mixer, selective colour, gradient map, plus the effect
 * sliders (blur, sharpen, noise, clouds, …). canvas-core's scene element only
 * carries `imageAdjustments` — a 4x5 colour matrix built from seven factors
 * (`exposure/contrast/saturation/temperature/tint/highlights/shadows`). Any
 * factor the user set that is NOT one of those seven is real but has no
 * canvas-core representation, so it must be surfaced to the UI / tests rather
 * than silently dropped. `unsupportedSkiaAdjustments` is that reporter.
 *
 * This is a pure module so `node:test` can drive it directly.
 */

/** The seven factors canvas-core's colour matrix can express. */
export const SKIA_SUPPORTED_ADJUSTMENTS = new Set([
  "exposure",
  "contrast",
  "saturation",
  "temperature",
  "tint",
  "highlights",
  "shadows",
]);

/** The editor's full adjustment vocabulary (see `createDefaultAdjustments`). */
export const ADJUSTMENT_FACTORS = [
  "exposure",
  "contrast",
  "saturation",
  "temperature",
  "tint",
  "highlights",
  "shadows",
  "brightness",
  "hue",
  "lightness",
  "vibrance",
  "vignette",
  "blur",
  "sharpen",
  "noise",
  "clouds",
  "pixelate",
  "posterize",
  "solarize",
  "halftone",
  "sepia",
  "emboss",
  "levels",
  "invert",
  "threshold",
  "colorBalance",
  "blackAndWhite",
  "photoFilter",
  "channelMixer",
  "selectiveColor",
  "gradientMap",
  "curves",
];

const clamp = (value) => Math.max(-100, Math.min(100, value));

/**
 * Maps `node.adjustments`' seven expressible factors onto canvas-core's
 * `ImageAdjustments` scale (each factor clamped to -100..100, the range
 * canvas-core's `normalizeImageAdjustments` enforces).
 *
 * Returns `null` when none of the seven is active, so callers omit the field
 * instead of emitting an all-zero (no-op) object.
 *
 * @param {object|null} adjustments - `node.adjustments` (or `undefined`).
 * @returns {{exposure:number,contrast:number,saturation:number,temperature:number,tint:number,highlights:number,shadows:number}|null}
 */
export function mapAdjustmentsToSkia(adjustments) {
  if (!adjustments) return null;
  const value = (key) => {
    const factor = adjustments[key];
    if (!factor || factor.enabled === false) return 0;
    const n = Number(factor.value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  // 2D exposure is in EV/stops (adjustment_kinds: -2..2), while canvas-core
  // divides by 100 (so 100 = one stop). Map EV onto that /100 scale so a "1 EV"
  // setting is one stop; canvas-core clamps at 100, so anything beyond ±1 stop
  // is inexpressible there and must be verified visually (Phase 2).
  const result = {
    exposure: clamp(value("exposure") * 100),
    contrast: clamp(value("contrast")),
    saturation: clamp(value("saturation")),
    temperature: clamp(value("temperature")),
    tint: clamp(value("tint")),
    highlights: clamp(value("highlights")),
    shadows: clamp(value("shadows")),
  };
  if (Object.values(result).every((v) => v === 0)) return null;
  return result;
}

function zoneNeutral(zone) {
  return (
    !zone ||
    ((zone.cyanRed ?? 0) === 0 &&
      (zone.magentaGreen ?? 0) === 0 &&
      (zone.yellowBlue ?? 0) === 0)
  );
}

function channelsNeutral(channels) {
  return (
    !channels ||
    ((channels.c ?? 0) === 0 &&
      (channels.m ?? 0) === 0 &&
      (channels.y ?? 0) === 0 &&
      (channels.k ?? 0) === 0)
  );
}

function channelMixerNeutral(mixer) {
  if (!mixer) return true;
  if (mixer.monochrome) return false;
  const rowIsIdentity = (row, main) => {
    if (!row) return true;
    const channels = ["red", "green", "blue"];
    return (
      channels.every(
        (ch) =>
          (row[ch] ?? (ch === main ? 100 : 0)) === (ch === main ? 100 : 0),
      ) && (row.constant ?? 0) === 0
    );
  };
  return (
    rowIsIdentity(mixer.red, "red") &&
    rowIsIdentity(mixer.green, "green") &&
    rowIsIdentity(mixer.blue, "blue") &&
    (mixer.gray?.red ?? 0) === 40 &&
    (mixer.gray?.green ?? 0) === 40 &&
    (mixer.gray?.blue ?? 0) === 20 &&
    (mixer.gray?.constant ?? 0) === 0
  );
}

function curveNeutral(points) {
  if (!Array.isArray(points)) return true;
  if (points.length === 0) return true;
  return points.every((p) => (p?.y ?? p?.x) === (p?.x ?? 0));
}

/**
 * Whether `adjustments` has factor `key` meaningfully set (not at its neutral
 * state). A factor that defaults to "disabled" (invert, threshold, gradientMap,
 * blackAndWhite) counts only when it has been enabled.
 */
function factorIsSet(adjustments, key) {
  const factor = adjustments[key];
  if (!factor) return false;
  if (factor.enabled === false) return false;
  switch (key) {
    case "invert":
    case "threshold":
    case "blackAndWhite":
    case "gradientMap":
      return factor.enabled === true;
    case "hue":
      return (
        (factor.value ?? 0) !== 0 ||
        Boolean(factor.colorize) ||
        Boolean(factor.bands)
      );
    case "levels":
      return (
        (factor.black ?? 0) !== 0 ||
        (factor.white ?? 100) !== 100 ||
        (factor.gamma ?? 1) !== 1 ||
        (factor.outBlack ?? 0) !== 0 ||
        (factor.outWhite ?? 100) !== 100
      );
    case "colorBalance":
      return (
        !zoneNeutral(factor.shadows) ||
        !zoneNeutral(factor.midtones) ||
        !zoneNeutral(factor.highlights)
      );
    case "photoFilter":
      return (factor.density ?? 0) !== 0;
    case "channelMixer":
      return !channelMixerNeutral(factor);
    case "selectiveColor":
      return [
        "reds",
        "yellows",
        "greens",
        "cyans",
        "blues",
        "magentas",
        "whites",
        "neutrals",
        "blacks",
      ].some((zone) => !channelsNeutral(factor[zone]));
    case "curves":
      return (
        !curveNeutral(factor.luminance) ||
        !curveNeutral(factor.r) ||
        !curveNeutral(factor.g) ||
        !curveNeutral(factor.b)
      );
    default:
      // Numeric single-value slider: neutral is value 0.
      return (factor.value ?? 0) !== 0;
  }
}

/**
 * The factors that are set on `adjustments` but that canvas-core's
 * `ImageAdjustments` cannot express — i.e. the Skia path would silently drop
 * them. Each entry is a factor key from the editor's vocabulary.
 *
 * @param {object|null} adjustments - `node.adjustments`.
 * @returns {string[]} unsupported-but-set factor keys, in vocabulary order.
 */
export function unsupportedSkiaAdjustments(adjustments) {
  if (!adjustments) return [];
  const out = [];
  for (const key of ADJUSTMENT_FACTORS) {
    if (SKIA_SUPPORTED_ADJUSTMENTS.has(key)) continue;
    if (factorIsSet(adjustments, key)) out.push(key);
  }
  return out;
}
