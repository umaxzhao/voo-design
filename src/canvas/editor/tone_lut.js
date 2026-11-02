/**
 * Tone mapping for the visual adjustments (facade).
 *
 * Exposure, temperature/tint, brightness, contrast, highlights/shadows and the
 * four tone curves all collapse into a single 256-entry lookup table per
 * channel — that table is what both the CPU pixel loop and the WebGL shader
 * consume, which is what keeps the two paths producing the same colours.
 *
 * Pure maths: no canvas, no GL, no React.
 * Re-exports the exact public API partitioned into focused sub-modules.
 */

export {
  evaluateMonotoneCubicSpline,
  buildCurveLUT,
} from "./tone_lut_curves.js";

export {
  hueBandIndex,
  vignetteFactor,
} from "./tone_lut_vignette.js";

export {
  buildToneLut,
} from "./tone_lut_build.js";

export {
  packToneLutTexture,
} from "./tone_lut_texture.js";
