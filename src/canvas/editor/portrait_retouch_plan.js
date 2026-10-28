/**
 * The portrait-retouch slider model, as data, plus the mapping from slider
 * percent to the engine's own option units.
 *
 * `portrait_retouch.js` takes strengths in 0..1 and a brighten amount in
 * -1..1; the panel speaks percent. One place does that conversion, so a slider
 * range and the engine's accepted range can never drift apart silently — the
 * tests assert both sides agree.
 */

import { PORTRAIT_RETOUCH_STEPS } from "./portrait-retouch-constants.js";

/**
 * The three editable steps, in the order the panel lays them out (smooth,
 * blemish, then brighten — the order a retoucher works in). The engine applies
 * them in `PORTRAIT_RETOUCH_STEPS` order regardless: spots are corrected before
 * the guided filter, or it would smear a raw spot into a wider halo.
 *
 * Defaults are deliberately conservative: this is a one-shot apply with an
 * undoable but not previewable result, so the first click must improve the
 * picture rather than make a statement.
 */
export const RETOUCH_SLIDERS = Object.freeze([
  Object.freeze({
    key: "skinSmooth",
    labelKey: "editor.retouch.smooth",
    engineKey: "strength",
    unit: "%",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 35,
  }),
  Object.freeze({
    key: "blemish",
    labelKey: "editor.retouch.blemish",
    engineKey: "strength",
    unit: "%",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 30,
  }),
  Object.freeze({
    key: "skinBrighten",
    labelKey: "editor.retouch.brighten",
    engineKey: "amount",
    unit: "%",
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 10,
  }),
]);

/** Slider percent for every step, at the conservative defaults. */
export function defaultRetouchStrengths() {
  const values = {};
  for (const slider of RETOUCH_SLIDERS) values[slider.key] = slider.defaultValue;
  return values;
}

function sliderFor(step) {
  const slider = RETOUCH_SLIDERS.find((entry) => entry.key === step);
  if (!slider) {
    throw new RangeError(`retouchOptions: "${step}" is not a retouch step`);
  }
  return slider;
}

/** One slider value, validated against its own range — never clamped. */
function readPercent(slider, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`retouchOptions: ${slider.key} must be a finite number`);
  }
  if (value < slider.min || value > slider.max) {
    throw new RangeError(
      `retouchOptions: ${slider.key} must be within [${slider.min}, ${slider.max}], got ${value}`,
    );
  }
  return Number((value / 100).toFixed(4));
}

/**
 * Turns the panel's slider percent into `applyPortraitRetouch()` options.
 *
 * A step at zero is omitted rather than passed as zero: the engine treats an
 * absent step as "do not run" and a zero the same way, but omitting keeps the
 * options readable in a bug report and skips the option-object build.
 *
 * @param {Record<string, number>} strengths percent per step
 * @returns {{[key: string]: {[engineKey: string]: number}}}
 */
export function retouchOptions(strengths) {
  if (!strengths || typeof strengths !== "object" || Array.isArray(strengths)) {
    throw new TypeError("retouchOptions: strengths must be a plain object");
  }
  for (const step of Object.keys(strengths)) sliderFor(step);

  const options = {};
  for (const slider of RETOUCH_SLIDERS) {
    const value = strengths[slider.key] ?? 0;
    const unitValue = readPercent(slider, value);
    // Brighten runs both ways (negative darkens), so its zero test is exact;
    // the smoothing steps are non-negative and simply skip at zero.
    if (slider.engineKey === "amount" ? unitValue === 0 : unitValue <= 0) continue;
    options[slider.key] = { [slider.engineKey]: unitValue };
  }
  return options;
}

/** True when at least one step would actually change a pixel. */
export function hasRetouchWork(strengths) {
  return Object.keys(retouchOptions(strengths)).length > 0;
}

/** Every step the engine applies, for callers that assert the panel is complete. */
export const RETOUCH_STEPS = PORTRAIT_RETOUCH_STEPS;

/**
 * Largest layer the retouch will run on, in pixels.
 *
 * `applyPortraitRetouch` is ONE synchronous call — the guided filter keeps
 * about ten Float32 planes of `width * height` — so this cap is the whole of
 * the protection against blocking the main thread, and the button's busy state
 * cannot paint until the call returns.
 *
 * Measured on the reference machine (Node 22, Apple silicon, the panel's
 * defaults — smooth 35% / blemish 30% / brighten 10%):
 *
 *   | 1.0 MP |  545 ms | | 3.0 MP | 1675 ms |
 *   | 2.0 MP | 1207 ms | | 4.0 MP | 2246 ms |
 *   | 6.0 MP | 3557 ms (537 MB RSS) |
 *
 * The previous 6 MP cap therefore admitted a 3.5-second main-thread freeze, long
 * enough that the busy state never appeared: a hang rather than a wait. 2 MP is
 * the largest cap whose worst case stays around a second, which the caller's
 * own "working" state can cover (use_editor_raster.js yields once before the
 * call so that state actually paints).
 *
 * The engine processes whatever region it is handed, but nothing here can hand
 * it a region: the result replaces the layer's bitmap, so a partial read would
 * write back a partial picture. Above the cap the click refuses with a visible
 * reason instead of risking the tab.
 */
export const RETOUCH_MAX_PIXELS = 2000000;

/** The code the caller surfaces when a layer is above RETOUCH_MAX_PIXELS. */
export const RETOUCH_TOO_LARGE = "retouchTooLarge";

/** RETOUCH_TOO_LARGE for a layer above the budget, null when it fits. */
export function retouchBudgetError(width, height) {
  if (typeof width !== "number" || typeof height !== "number" || !(width > 0) || !(height > 0)) {
    throw new RangeError("retouchBudgetError: width and height must be positive");
  }
  return width * height > RETOUCH_MAX_PIXELS ? RETOUCH_TOO_LARGE : null;
}
