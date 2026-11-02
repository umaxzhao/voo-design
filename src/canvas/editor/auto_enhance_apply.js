/**
 * The one-tap auto-enhance click path, as data: measure a bitmap's pixels,
 * plan the edit, and describe the node patch it becomes.
 *
 * `auto_enhance.js` owns the planning and `histogram.js` the measuring; this
 * module is only the seam between them and the editor's node model, so the
 * click path can be unit-tested on a synthetic buffer without a canvas, a React
 * render or an engine.
 */

import { computeImageStats } from "./histogram.js";
import { planAutoEnhance } from "./auto_enhance.js";

/**
 * The preset the one-tap button applies. Deliberately the faithful correction
 * rather than the punchier looks: a single click has no preview, so the button
 * must not guess at a style the user did not ask for.
 */
export const ONE_TAP_ENHANCE_PRESET = "neutral";

/**
 * Longest edge of the copy the one-tap measurement reads.
 *
 * The planner consumes percentages and percentiles, and a 256px copy reports
 * those as faithfully as the original — so a click never walks a full-size
 * layer, and a 6000px picture costs the same as a thumbnail.
 */
export const ENHANCE_SAMPLE_EDGE = 256;

/**
 * Measures an RGBA buffer and plans the one-tap enhance for it.
 *
 * @param {ArrayLike<number>} rgba bytes, 4 per pixel
 * @param {{preset?: string, bins?: number, stride?: number, clipTolerance?: number}} [options]
 * @returns {ReturnType<typeof planAutoEnhance>} the plan, presets and values included
 */
export function planOneTapEnhance(rgba, options = {}) {
  const opts = options ?? {};
  if (typeof opts !== "object") {
    throw new TypeError("planOneTapEnhance: options must be an object");
  }
  const stats = computeImageStats(rgba, {
    channels: 4,
    bins: opts.bins,
    stride: opts.stride,
    clipTolerance: opts.clipTolerance,
  });
  return planAutoEnhance(stats, {
    preset: opts.preset ?? ONE_TAP_ENHANCE_PRESET,
  });
}

/** Rejects anything that is not a `planAutoEnhance()` result. */
function requirePlan(plan) {
  if (!plan || typeof plan !== "object") {
    throw new TypeError("mergeEnhanceAdjustments: plan must be an object");
  }
  const adjustments = plan.adjustments;
  if (!adjustments || typeof adjustments !== "object") {
    throw new TypeError(
      "mergeEnhanceAdjustments: plan.adjustments is required — pass a planAutoEnhance() result",
    );
  }
  return adjustments;
}

/**
 * The `adjustments` object the node should carry after the one-tap enhance.
 *
 * The plan's rows are copies, never the plan's own objects: the caller writes
 * the result into a live node, and a node holding a reference into a shared
 * plan would be mutated by whatever reads that plan next.
 *
 * Kinds outside the plan (curves, effects applied earlier) are preserved
 * untouched — the enhance corrects tone, it does not reset the layer.
 *
 * @param {object|null|undefined} existing the node's current adjustments
 * @param {object} plan a `planAutoEnhance()` result
 */
export function mergeEnhanceAdjustments(existing, plan) {
  const rows = requirePlan(plan);
  if (existing !== undefined && existing !== null && typeof existing !== "object") {
    throw new TypeError("mergeEnhanceAdjustments: existing adjustments must be an object");
  }
  const merged = { ...(existing ?? {}) };
  for (const [kind, row] of Object.entries(rows)) {
    if (!row || typeof row !== "object") {
      throw new TypeError(`mergeEnhanceAdjustments: "${kind}" is not an adjustment row`);
    }
    merged[kind] = { ...row };
  }
  return merged;
}
