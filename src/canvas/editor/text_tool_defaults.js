/**
 * Defaults used by the text tool before a layer is selected.
 *
 * The right panel's text-tool state writes here through the engine getters and
 * setters, and interactive text creation reads the same values. Keeping this
 * in one module makes "create text with the style I picked" real instead of a
 * panel full of controls that silently do nothing.
 */
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_STYLE,
  TEXT_ALIGNS,
  TEXT_FONT_WEIGHTS,
  TEXT_LETTER_SPACING_BOUNDS,
  TEXT_LINE_HEIGHT_BOUNDS,
} from "./scene_model_core.js";

const DEFAULTS = Object.freeze({
  fontFamily: DEFAULT_FONT_FAMILY,
  fontWeight: DEFAULT_TEXT_STYLE.fontWeight,
  fontSize: DEFAULT_FONT_SIZE,
  italic: DEFAULT_TEXT_STYLE.italic,
  underline: DEFAULT_TEXT_STYLE.underline,
  align: DEFAULT_TEXT_STYLE.align,
  lineHeight: DEFAULT_TEXT_STYLE.lineHeight,
  letterSpacing: DEFAULT_TEXT_STYLE.letterSpacing,
});

let current = { ...DEFAULTS };

/** The complete pending text-tool style; callers must not mutate the copy. */
export function getTextToolDefaults() {
  return { ...current };
}

/** One pending default, e.g. `getTextToolDefault("fontSize")`. */
export function getTextToolDefault(key) {
  return current[key];
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

/**
 * Writes one pending default. Unknown keys and invalid values are ignored so a
 * stale UI cannot corrupt the next created text node.
 */
export function setTextToolDefault(key, value) {
  if (!(key in current)) return false;
  let next = value;
  switch (key) {
    case "fontFamily":
      next = typeof value === "string" && value.trim() ? value : current.fontFamily;
      break;
    case "fontWeight": {
      const weight = String(value ?? "");
      next = TEXT_FONT_WEIGHTS.includes(weight) ? weight : current.fontWeight;
      break;
    }
    case "fontSize":
      next = boundedNumber(value, 1, 1000, current.fontSize);
      break;
    case "italic":
    case "underline":
      next = Boolean(value);
      break;
    case "align":
      next = TEXT_ALIGNS.includes(value) ? value : current.align;
      break;
    case "lineHeight":
      next = boundedNumber(
        value,
        TEXT_LINE_HEIGHT_BOUNDS.min,
        TEXT_LINE_HEIGHT_BOUNDS.max,
        current.lineHeight,
      );
      break;
    case "letterSpacing":
      next = boundedNumber(
        value,
        TEXT_LETTER_SPACING_BOUNDS.min,
        TEXT_LETTER_SPACING_BOUNDS.max,
        current.letterSpacing,
      );
      break;
    default:
      return false;
  }
  if (next === current[key]) return false;
  current = { ...current, [key]: next };
  return true;
}

/** Test/reset seam: restores the factory defaults. */
export function resetTextToolDefaults() {
  current = { ...DEFAULTS };
}
