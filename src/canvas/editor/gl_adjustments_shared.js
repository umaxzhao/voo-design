/**
 * Shared adjustment renderer singleton lifecycle.
 *
 * Pages share one WebGL context; torn down only when the last holder releases.
 */

import { createAdjustmentRenderer } from "./gl_adjustments_pipeline.js";

let sharedRenderer = null;
let sharedHolders = 0;

export function acquireAdjustmentRenderer() {
  if (!sharedRenderer) sharedRenderer = createAdjustmentRenderer();
  sharedHolders += 1;
  return sharedRenderer;
}

export function releaseAdjustmentRenderer() {
  if (sharedHolders === 0) return;
  sharedHolders -= 1;
  if (sharedHolders > 0) return;
  sharedRenderer.dispose();
  sharedRenderer = null;
}

/** Live holder count, for tests and for diagnosing a leaked page. */
export function adjustmentRendererHolders() {
  return sharedHolders;
}
