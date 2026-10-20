/**
 * Pure crop-panel field decision — which mode shows which input fields.
 *
 * The crop tool has three modes and the right panel must expose only the
 * inputs its current mode declares (Fixed Ratio shows the ratio entry, Fixed
 * Size shows the W/H numeric pair, Free shows neither). Keeping this decision
 * as a pure exported function lets node:test assert the field set without a
 * DOM/React environment (tests/ cannot render components).
 *
 * The always-on crop controls (mode picker, straighten angle, Apply/Cancel,
 * "Delete Cropped Pixels") are NOT part of this field set — only the per-mode
 * optional inputs are.
 */

export const CROP_MODE_FREE = "free";
export const CROP_MODE_RATIO = "ratio";
export const CROP_MODE_SIZE = "size";

/**
 * The optional input fields a mode exposes. Keys are consumed by the panel to
 * decide which inputs to render:
 *
 * - `free`  — "[]" (only the always-on controls)
 * - `ratio` — `["ratio"]` (the aspect-ratio entry)
 * - `size`  — `["width", "height"]` (the fixed W/H entry)
 */
export function cropModeFields(mode) {
  if (mode === CROP_MODE_RATIO) return ["ratio"];
  if (mode === CROP_MODE_SIZE) return ["width", "height"];
  return [];
}

/** True when `mode` exposes the given optional field. */
export function hasCropInput(mode, field) {
  return cropModeFields(mode).includes(field);
}
