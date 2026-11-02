/**
 * The single write path for a fill/stroke opacity edit. The properties row and
 * the colour picker both call this, so the two fields can never disagree about
 * clamping or rounding.
 */

/** Clamps a percent to 0-100 and rounds it to a whole number. */
export function clampPercent(percent) {
  const num = Number(percent);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

/** `{ [key]: 0-1 }` for a node edit, from a 0-100 percent. */
export function opacityPatch(key, percent) {
  return { [key]: clampPercent(percent) / 100 };
}

/** Typed text to a whole percent, or null when it is not a number. */
export function parseOpacityInput(text) {
  if (String(text).trim() === "") return null;
  const num = Number(text);
  return Number.isFinite(num) ? clampPercent(num) : null;
}
