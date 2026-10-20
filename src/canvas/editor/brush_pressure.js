/**
 * Brush pressure & per-mode field helpers — pure, so node:test can drive the
 * independence guarantees without a DOM/React environment.
 *
 * The editor requires strength / flow / opacity / smoothness to be INDEPENDENT
 * states (never one field aliased for several concepts). These functions are
 * the single source of truth for (a) how pen pressure modulates size/opacity
 * per its two independent toggles, and (b) which field each retouch mode draws
 * its effect force from. editor_paint.js calls them, so the tests track the
 * real behaviour rather than a parallel copy.
 */

/** Pen pressure maps [0,1] onto a [0.4, 1.2] dab-size factor. */
export const pressureScale = (pressure) =>
  0.4 + Math.min(1, Math.max(0, pressure || 0)) * 0.8;

/**
 * The dab size for a stroke, given the pressure toggle. When `pressureSize`
 * is off — the default, and the mouse case — the size is the stable brush
 * size regardless of any `pressure` value. With it on, a tablet's pressure
 * scales the size through `pressureScale`.
 */
export function resolvePressureSize(size, pressure, pressureSize) {
  const factor = pressureSize ? pressureScale(pressure) : 1;
  return Math.max(1, size * factor);
}

/**
 * The stroke's stamped opacity, given the pressure toggle. `pressureOpacity`
 * off keeps the stable brush opacity; on, a tablet's pressure scales it.
 */
export function resolvePressureOpacity(opacity, pressure, pressureOpacity) {
  const scale = pressureOpacity ? Math.min(1, Math.max(0, pressure || 0)) : 1;
  return Math.min(1, Math.max(0, opacity * scale));
}

/**
 * Which independent field a retouch mode draws its force from.
 * smudge / blur / sharpen → strength, dodge / burn → exposure, sponge → flow,
 * eraser → hardness (its defining control). The panel's per-mode property
 * lists (brush_properties.js) must contain this field.
 */
export function brushModeDrawField(mode) {
  switch (mode) {
    case "sponge":
      return "flow";
    case "dodge":
    case "burn":
      return "exposure";
    case "eraser":
      return "hardness";
    case "smudge":
    case "blur":
    case "sharpen":
    default:
      return "strength";
  }
}
