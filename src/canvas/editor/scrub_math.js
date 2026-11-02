/**
 * Pure math behind the property panel's Figma-style drag-to-scrub fields.
 *
 * Kept component-free so the node:test suite can cover the delta→value
 * mapping, modifier multipliers, step snapping and clamping without a DOM.
 */

/** Pixels of horizontal drag that map to one step of the value. */
export const SCRUB_PIXELS_PER_STEP = 1.5;

/** Drags shorter than this count as a click (focus / edit), not a scrub. */
export const SCRUB_CLICK_THRESHOLD_PX = 3;

/** Shift scrubs coarsely, Alt finely — Figma's modifier convention. */
export function scrubMultiplier({ shiftKey = false, altKey = false } = {}) {
  if (shiftKey) return 10;
  if (altKey) return 0.1;
  return 1;
}

/** Decimal places needed to represent the step exactly (0.05 → 2). */
export function stepDecimals(step) {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const text = String(step);
  const point = text.indexOf(".");
  return point === -1 ? 0 : text.length - point - 1;
}

export function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Snap to the step grid and drop float dust (0.30000000000000004). */
export function snapToStep(value, step) {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(step) || step <= 0) return value;
  return Number((Math.round(value / step) * step).toFixed(stepDecimals(step)));
}

/**
 * The core mapping: a horizontal pixel delta becomes one step per
 * SCRUB_PIXELS_PER_STEP px, scaled by the modifier multiplier, then snapped
 * and clamped. With Alt (×0.1) the snap grid refines to a tenth of a step so
 * fine scrubbing still moves the value.
 */
export function scrubValue(
  base,
  deltaPx,
  {
    step = 1,
    min = -Infinity,
    max = Infinity,
    shiftKey,
    altKey,
    snapStepOnShift = null,
  } = {},
) {
  if (shiftKey && snapStepOnShift) {
    const rawDelta = (deltaPx / SCRUB_PIXELS_PER_STEP) * step;
    const snapped =
      Math.round((base + rawDelta) / snapStepOnShift) * snapStepOnShift;
    return clampValue(snapped, min, max);
  }
  const multiplier = scrubMultiplier({ shiftKey, altKey });
  const granularity = step * Math.min(1, multiplier);
  const delta = (deltaPx / SCRUB_PIXELS_PER_STEP) * step * multiplier;
  return clampValue(snapToStep(base + delta, granularity), min, max);
}

/**
 * Commit helper for the editable value chips: parse typed text, fall back to
 * the current value when it isn't a number, then snap and clamp.
 */
export function parseValueInput(
  raw,
  { step = 1, min = -Infinity, max = Infinity, fallback } = {},
) {
  const text = typeof raw === "string" ? raw.trim() : raw;
  // Number("") is 0, so blank text must take the fallback path explicitly.
  const parsed = text === "" ? NaN : Number(text);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return clampValue(snapToStep(value, step), min, max);
}
