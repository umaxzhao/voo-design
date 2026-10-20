import { HUE_BAND_KEYS } from "./scene_model_core.js";
import { ADJUSTMENT_KINDS, EFFECT_KINDS } from "./adjustment_kinds.js";

/** True when any per-band Hue/Saturation band carries a non-zero offset. */
function hasNonNeutralBands(bands) {
  if (!bands || typeof bands !== "object") return false;
  return HUE_BAND_KEYS.some((key) => {
    const band = bands[key];
    return Boolean(
      band &&
      ((band.h ?? 0) !== 0 || (band.s ?? 0) !== 0 || (band.l ?? 0) !== 0),
    );
  });
}

const enabled = (a) => a?.enabled !== false;

function hasCustomCurve(points) {
  return (
    Array.isArray(points) &&
    points.length >= 2 &&
    points.some((p) => Math.abs((p.y ?? 0) - (p.x ?? 0)) > 0.001)
  );
}

function mixerRowNeutral(row, r, g, b) {
  return (
    !row ||
    ((row.red ?? r) === r &&
      (row.green ?? g) === g &&
      (row.blue ?? b) === b &&
      (row.constant ?? 0) === 0)
  );
}

/**
 * Whether an adjustment category is currently non-neutral on a node.
 * Mirrors the tone_lut flags so the layers panel's list matches the render.
 */
export function isAdjustmentActive(adjustments, kind) {
  const a = adjustments?.[kind];
  if (!a || typeof a !== "object") return false;
  switch (kind) {
    case "levels":
      return (
        enabled(a) &&
        (a.black !== 0 ||
          a.white !== 100 ||
          a.gamma !== 1 ||
          a.outBlack !== 0 ||
          a.outWhite !== 100)
      );
    case "invert":
    case "threshold":
    case "blackAndWhite":
    case "gradientMap":
      return Boolean(a.enabled);
    case "curves":
      return (
        enabled(a) &&
        (hasCustomCurve(a.luminance) ||
          hasCustomCurve(a.r) ||
          hasCustomCurve(a.g) ||
          hasCustomCurve(a.b))
      );
    case "colorBalance":
      return (
        enabled(a) &&
        ["shadows", "midtones", "highlights"].some((zone) => {
          const z = a[zone];
          return (
            z &&
            ((z.cyanRed ?? 0) !== 0 ||
              (z.magentaGreen ?? 0) !== 0 ||
              (z.yellowBlue ?? 0) !== 0)
          );
        })
      );
    case "photoFilter":
      return enabled(a) && (a.density ?? 0) > 0;
    case "channelMixer":
      return (
        enabled(a) &&
        (a.monochrome
          ? true
          : !(
              mixerRowNeutral(a.red, 100, 0, 0) &&
              mixerRowNeutral(a.green, 0, 100, 0) &&
              mixerRowNeutral(a.blue, 0, 0, 100)
            ))
      );
    case "selectiveColor": {
      const targets = [
        "reds",
        "yellows",
        "greens",
        "cyans",
        "blues",
        "magentas",
        "whites",
        "neutrals",
        "blacks",
      ];
      return (
        enabled(a) &&
        targets.some((name) => {
          const row = a[name];
          return (
            row &&
            ((row.c ?? 0) !== 0 ||
              (row.m ?? 0) !== 0 ||
              (row.y ?? 0) !== 0 ||
              (row.k ?? 0) !== 0)
          );
        })
      );
    }
    case "vignette":
      return enabled(a) && (a.value ?? 0) > 0;
    case "hue":
      // Colorize alone is a real change even with the hue dial at 0, and so
      // is any non-neutral per-band offset.
      return (
        enabled(a) &&
        ((a.value ?? 0) !== 0 ||
          Boolean(a.colorize) ||
          hasNonNeutralBands(a.bands))
      );
    default:
      // The scalar adjustments: zero value is the neutral state.
      return enabled(a) && (a.value ?? 0) !== 0;
  }
}

export function isAdjustmentConfigured(adjustments, kind) {
  const a = adjustments?.[kind];
  if (!a || typeof a !== "object") return false;
  switch (kind) {
    case "levels":
      return (
        a.black !== 0 ||
        a.white !== 100 ||
        a.gamma !== 1 ||
        a.outBlack !== 0 ||
        a.outWhite !== 100
      );
    case "invert":
    case "threshold":
    case "blackAndWhite":
    case "gradientMap":
      return a.enabled !== undefined ? Boolean(a.enabled) : false;
    case "curves":
      return (
        hasCustomCurve(a.luminance) ||
        hasCustomCurve(a.r) ||
        hasCustomCurve(a.g) ||
        hasCustomCurve(a.b)
      );
    case "colorBalance":
      return ["shadows", "midtones", "highlights"].some((zone) => {
        const z = a[zone];
        return (
          z &&
          ((z.cyanRed ?? 0) !== 0 ||
            (z.magentaGreen ?? 0) !== 0 ||
            (z.yellowBlue ?? 0) !== 0)
        );
      });
    case "photoFilter":
      return (a.density ?? 0) > 0;
    case "channelMixer":
      return a.monochrome
        ? true
        : !(
            mixerRowNeutral(a.red, 100, 0, 0) &&
            mixerRowNeutral(a.green, 0, 100, 0) &&
            mixerRowNeutral(a.blue, 0, 0, 100)
          );
    case "selectiveColor": {
      const targets = [
        "reds",
        "yellows",
        "greens",
        "cyans",
        "blues",
        "magentas",
        "whites",
        "neutrals",
        "blacks",
      ];
      return targets.some((name) => {
        const row = a[name];
        return (
          row &&
          ((row.c ?? 0) !== 0 ||
            (row.m ?? 0) !== 0 ||
            (row.y ?? 0) !== 0 ||
            (row.k ?? 0) !== 0)
        );
      });
    }
    case "vignette":
      return (a.value ?? 0) > 0;
    case "hue":
      return (
        (a.value ?? 0) !== 0 ||
        Boolean(a.colorize) ||
        hasNonNeutralBands(a.bands)
      );
    default:
      // The scalar adjustments: non-zero value means configured.
      return (a.value ?? 0) !== 0;
  }
}

/** The active (enabled & non-neutral) adjustment kinds on a node. */
export function listActiveAdjustments(adjustments) {
  return ADJUSTMENT_KINDS.filter((kind) =>
    isAdjustmentActive(adjustments, kind),
  );
}

/** All configured adjustment kinds on a node (including user-disabled/hidden with data). */
export function listConfiguredAdjustments(adjustments) {
  if (!adjustments || typeof adjustments !== "object") return [];
  return ADJUSTMENT_KINDS.filter((kind) =>
    isAdjustmentConfigured(adjustments, kind),
  );
}

/** The enabled effect kinds on a node, in display order. */
export function listActiveEffects(effects) {
  if (!effects || typeof effects !== "object") return [];
  return EFFECT_KINDS.filter((kind) => effects[kind]?.enabled === true);
}

/** All configured effect kinds on a node (including disabled/hidden). */
export function listConfiguredEffects(effects) {
  if (!effects || typeof effects !== "object") return [];
  return EFFECT_KINDS.filter((kind) => {
    const ef = effects[kind];
    return ef && typeof ef === "object";
  });
}
