/** Paint target resolution and pixel blending rules. */

import { NODE_KIND } from "./scene_model.js";
import { softBrushAlpha, softBrushStampSpacing } from "./scene_renderer.js";

export const RETOUCH_MODES = new Set([
  "blur",
  "sharpen",
  "smudge",
  "dodge",
  "burn",
  "sponge",
]);

/**
 * The brush's target when no explicit node was given (pure, unit-testable):
 * the selected image layer — a paint layer or a plain picture alike — or the
 * topmost paint layer id as the fallback, or null when there is none.
 *
 * Painting on the selected layer is what keeps the brush from spawning a
 * fresh layer above the layer the user is looking at (Photoshop's raster
 * model: the brush works on whatever layer is selected).
 */
export function resolvePaintTarget(primary, fallbackPaintLayerId) {
  if (
    primary &&
    primary.kind === NODE_KIND.IMAGE &&
    !primary.locked &&
    !primary.lockImagePixels
  ) {
    return primary.id;
  }
  return fallbackPaintLayerId ?? null;
}

/**
 * Brush blend modes → canvas composite operations.
 *
 * Every separable and non-separable mode the 2D context can express natively.
 * The remaining PSD-style modes (linear burn/dodge, vivid/linear/pin light,
 * hard mix, subtract, divide, dissolve) have no globalCompositeOperation
 * equivalent, so they take the per-pixel path in `stampCustom`.
 */
export const BRUSH_COMPOSITE = {
  "source-over": "source-over",
  darken: "darken",
  multiply: "multiply",
  "color-burn": "color-burn",
  "color-dodge": "color-dodge",
  lighten: "lighten",
  screen: "screen",
  overlay: "overlay",
  "soft-light": "soft-light",
  "hard-light": "hard-light",
  difference: "difference",
  exclusion: "exclusion",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
};

/** The midpoint of two points; affine, so it survives the doc→canvas map. */
export const midOf = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * The transparency lock's per-pixel rule (Photoshop's "Lock transparent
 * pixels"): the paint colour mixes in by the dab's coverage, but the pixel's
 * alpha never grows — the existing shape is frozen, so a stroke over
 * transparent space paints nothing. `mix` is the dab alpha (sprite × flow
 * or opacity). Returns the new RGBA as 0..255 values.
 */
export function lockedStampPixel(dst, src, mix) {
  if (dst[3] <= 0 || mix <= 0) {
    return [dst[0], dst[1], dst[2], dst[3]];
  }
  const t = Math.min(1, Math.max(0, mix));
  return [
    dst[0] * (1 - t) + src[0] * t,
    dst[1] * (1 - t) + src[1] * t,
    dst[2] * (1 - t) + src[2] * t,
    dst[3],
  ];
}

/**
 * Coverage that lets a stroke's overlapping stamps saturate to a soft,
 * translucent band rather than an opaque marker. The softer the brush the
 * lower the target, so a hardness-0 airbrush stays clearly see-through.
 */
export const CORE_SATURATION = 3.5;

export function strokeCoverage(diameter, hardness) {
  const radius = Math.max(1, diameter / 2);
  const spacing = stampSpacing(radius);
  let sum = 0;
  for (let distance = 0; distance <= radius; distance += spacing) {
    const t = distance / radius;
    const alpha = softBrushAlpha(t, hardness);
    sum += distance === 0 ? alpha : 2 * alpha;
  }
  if (sum <= 0) return 1;
  return Math.min(1, CORE_SATURATION / sum);
}

/**
 * Stamp pitch along a stroke. Denser than the vector renderer's default so a
 * soft brush's narrow opaque core never shows as a beaded chain of dabs —
 * the overlap is what makes the stroke read as one soft pass.
 */
export function stampSpacing(radius) {
  return Math.max(0.35, softBrushStampSpacing(radius) * 0.35);
}

/**
 * Validates and clamps stroke options with strict boundaries and type coercion.
 * `Number(x) || fallback` would eat a legitimate 0, and `??` does not
 * intercept NaN — only non-finite input falls back to the default.
 */
export function normalizeStrokeOptions(options) {
  const clampOr = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    opacity: clampOr(options.opacity, 0, 1, 1),
    flow: clampOr(options.flow, 0, 1, 1),
    roundness: clampOr(options.roundness, 0.01, 1, 1),
    angle: Number(options.angle) || 0,
    strength: clampOr(options.strength, 0, 1, 0.5),
    exposure: clampOr(options.exposure, 0, 1, 0.5),
    tonalRange: ["shadows", "midtones", "highlights"].includes(options.tonalRange)
      ? options.tonalRange
      : "midtones",
    protectLuminosity: Boolean(options.protectLuminosity),
    saturating: Boolean(options.saturating),
    pressureSize: Boolean(options.pressureSize),
    pressureOpacity: Boolean(options.pressureOpacity),
    penStroke: options.penStroke === true,
  };
}
