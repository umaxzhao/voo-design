/**
 * Gradient tool state (the Gradient tool's panel-driven stop list).
 *
 * The panel edits a shared `type / angle / stops` model while the pointer drag
 * paints with it (see selection_effects_paint.js). Pure module: no canvas, no
 * React, no engine imports — the stop model reuses the colour picker's
 * DEFAULT_STOPS so the FigmaColorPicker and this state stay one language.
 */

import { DEFAULT_STOPS } from "../color_picker/gradient_fill.js";

export const GRADIENT_TOOL_TYPES = Object.freeze([
  "linear",
  "radial",
  "angular",
]);

function cloneStops(stops) {
  return (stops ?? []).map((stop) => ({ ...stop }));
}

export function createDefaultGradientToolState() {
  return {
    type: "linear",
    angle: 135,
    activeStopIndex: 0,
    stops: cloneStops(DEFAULT_STOPS),
  };
}

export function isPristineGradientStops(stops) {
  if (!Array.isArray(stops) || stops.length !== DEFAULT_STOPS.length) {
    return false;
  }
  return stops.every(
    (stop, index) =>
      stop.color === DEFAULT_STOPS[index].color &&
      stop.position === DEFAULT_STOPS[index].position &&
      stop.opacity === DEFAULT_STOPS[index].opacity,
  );
}

function clampInt(value, min, max, fallback) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function normalizeStops(stops) {
  const usable = (Array.isArray(stops) ? stops : [])
    .filter((stop) => stop && typeof stop.color === "string")
    .map((stop) => ({
      color:
        /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(stop.color.trim())
          ? stop.color.trim().toUpperCase()
          : "#FFFFFF",
      opacity: clampInt(stop.opacity ?? 100, 0, 100, 100),
      position: clampInt(stop.position ?? 0, 0, 100, 0),
    }));
  if (usable.length < 2) return cloneStops(DEFAULT_STOPS);
  return usable.sort((a, b) => a.position - b.position);
}

/** Returns a defensive copy of the panel state with every field clamped. */
export function normalizeGradientToolState(state) {
  const next = createDefaultGradientToolState();
  if (!state || typeof state !== "object") return next;
  const stops = normalizeStops(state.stops);
  return {
    type: GRADIENT_TOOL_TYPES.includes(state.type) ? state.type : next.type,
    angle: clampInt(Number(state.angle), 0, 359, next.angle),
    activeStopIndex: clampInt(
      state.activeStopIndex != null ? Number(state.activeStopIndex) : 0,
      0,
      stops.length - 1,
      next.activeStopIndex,
    ),
    stops,
  };
}

/**
 * Reverses the stop order: every position mirrors around the midpoint, which
 * is what the panel's "reverse" button promises and what flat position
 * swapping between endpoints alone would miss for multi-stop lists.
 */
export function rotateGradientStops(stops) {
  return normalizeStops(stops)
    .map((stop) => ({ ...stop, position: 100 - stop.position }))
    .sort((a, b) => a.position - b.position);
}
