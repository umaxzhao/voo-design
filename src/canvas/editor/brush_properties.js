/**
 * Brush property model — which fields each brush mode exposes, and the
 * independent per-mode state.
 *
 * The editor requires strength / flow / opacity / smoothness to be INDEPENDENT
 * states (never a reused alias such as one `opacity` standing in for several
 * concepts). This module is the single source of truth for what a mode shows,
 * and `createBrushState` is a pure object whose setters touch exactly one field,
 * so the independence is testable and the panel borrows this mapping.
 *
 * Node:test can drive this directly (no DOM/React).
 */

/** Keys a brush mode shows, in panel order. */
export const BRUSH_MODE_PROPERTIES = {
  smudge: ["size", "strength", "smoothness", "preset"],
  blur: ["size", "strength", "smoothness"],
  sharpen: ["size", "strength", "smoothness"],
  dodge: [
    "size",
    "exposure",
    "flow",
    "smoothness",
    "shadows",
    "midtones",
    "highlights",
    "protectLuminosity",
  ],
  burn: [
    "size",
    "exposure",
    "flow",
    "smoothness",
    "shadows",
    "midtones",
    "highlights",
    "protectLuminosity",
  ],
  sponge: ["size", "flow", "opacity", "smoothness", "saturating"],
  eraser: ["size", "hardness", "opacity", "flow", "smoothness", "preset"],
};

/** Fallback for an unknown mode: the classic pixel-brush controls. */
const DEFAULT_MODE_PROPERTIES = ["size", "opacity", "flow", "smoothness"];

/** The property keys a mode exposes (or the fallback). */
export function brushModeFields(mode) {
  return BRUSH_MODE_PROPERTIES[mode] ?? DEFAULT_MODE_PROPERTIES;
}

/**
 * Whether a brush mode paints foreground/background color.
 *
 * Normal brush mode paints color, while retouch modes (smudge, blur, sharpen,
 * dodge, burn, sponge) operate directly on existing layer pixel values.
 */
export function brushModeHasColor(mode) {
  return mode === "normal";
}

/**
 * Whether a brush mode supports brush tip presets (and .ABR importing).
 *
 * Normal brush, eraser, and smudge use dab tip presets, while parametric
 * retouch modes (blur, sharpen, dodge, burn, sponge) do not.
 */
export function brushModeHasPresets(mode) {
  return mode === "normal" || mode === "eraser" || mode === "smudge";
}

/** Every scalar field an independent brush state can carry. */
export const BRUSH_STATE_KEYS = [
  "size",
  "hardness",
  "opacity",
  "flow",
  "smoothness",
  "strength",
  "exposure",
  "tonalRange",
  "protectLuminosity",
  "saturating",
  "preset",
  "roundness",
  "angle",
  "blendMode",
];

/**
 * A small independent brush state. `set(key, value)` updates exactly `key` —
 * it never touches a sibling, so e.g. changing `strength` leaves `opacity`
 * untouched.
 */
export function createBrushState(initial = {}) {
  const state = {
    size: 24,
    hardness: 0.5,
    opacity: 1,
    flow: 1,
    smoothness: 0,
    strength: 0.5,
    exposure: 0.5,
    tonalRange: "midtones",
    protectLuminosity: false,
    saturating: true,
    preset: "medium_round",
    roundness: 1,
    angle: 0,
    blendMode: "normal",
    ...initial,
  };
  return {
    get: (key) => state[key],
    set: (key, value) => {
      if (key in state) state[key] = value;
      return state;
    },
    snapshot: () => ({ ...state }),
  };
}
