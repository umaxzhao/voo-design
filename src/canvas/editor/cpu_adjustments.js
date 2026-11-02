/**
 * The CPU path for image adjustments and mattes (facade).
 *
 * Runs tone mapping, color adjustments, pixel filters, and convolutions on CPU.
 * Re-exports the exact public API partitioned into focused sub-modules.
 */

export {
  invalidateMatteComposite,
  invalidateBitmapComposite,
  applyMatte,
} from "./cpu_adjustments_matte.js";

export {
  buildCurveLUT,
  evaluateMonotoneCubicSpline,
} from "./tone_lut.js";

export {
  invalidateAdjustmentCache,
  applyAdjustments,
  applyAdjustmentsToCanvas,
} from "./cpu_adjustments_runner.js";
