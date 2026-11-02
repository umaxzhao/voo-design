/**
 * The adjustment and effect catalog — the single source of truth for what
 * kinds exist, their labels, their neutral-state tests and the patch that
 * materialises one on "add".
 *
 * Facade module re-exporting all constants, queries, and starter factories.
 */

export {
  ADJUSTMENT_KINDS,
  EFFECT_KINDS,
  FILTER_KINDS,
  SIMPLE_ADJUSTMENTS,
  TONE_ADJUSTMENT_KINDS,
  adjustmentLabelKey,
  effectLabelKey,
} from "./adjustment_kinds.js";

export {
  isAdjustmentActive,
  isAdjustmentConfigured,
  listActiveAdjustments,
  listActiveEffects,
  listConfiguredAdjustments,
  listConfiguredEffects,
} from "./adjustment_queries.js";

export { starterAdjustment, starterEffect } from "./adjustment_starters.js";
