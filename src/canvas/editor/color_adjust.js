/**
 * Colour adjustments for the CPU path (facade).
 *
 * Pure functions over RGBA buffers — no canvas, no GL, no React.
 * Re-exports the exact public API partitioned into focused sub-modules.
 */

export {
  applyColorBalance,
  applyBlackAndWhite,
  applyPhotoFilter,
} from "./color_adjust_balance.js";

export {
  applyVibrance,
  applyChannelMixer,
} from "./color_adjust_vibrance.js";

export {
  applySelectiveColor,
} from "./color_adjust_selective.js";

export {
  sampleGradient,
  applyGradientMap,
} from "./color_adjust_gradient.js";
