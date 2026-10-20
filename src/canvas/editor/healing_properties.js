/**
 * Healing-mode property model — the pure source of truth for which controls
 * the right panel shows for Spot / Patch / Clone, so node:test can pin the
 * isolation (notably: Patch exposes NO brush size or hardness).
 *
 * The editor requires each mode's property set to be its own list — a field
 * absent from a mode must not render for it, and the Draw/Eyedropper-adjacent
 * controls must never leak across modes.
 */

/** Which properties a healing mode shows, in panel order. */
export const HEALING_MODE_PROPERTIES = {
  spot: ["size", "hardness", "source", "contentAware"],
  aiRepair: ["size"],
  patch: ["source", "destination", "diffusion", "transparent"],
  clone: ["size", "hardness", "opacity", "flow", "aligned", "source", "preset"],
};

/** Fallback for an unknown mode: the classic spot-heal controls. */
const DEFAULT_HEALING_PROPERTIES = [
  "size",
  "hardness",
  "source",
  "contentAware",
];

/** The property keys a healing mode exposes (or the fallback). */
export function healingModeFields(mode) {
  return HEALING_MODE_PROPERTIES[mode] ?? DEFAULT_HEALING_PROPERTIES;
}

/** Whether a healing mode exposes a given property key. */
export function healingModeHas(mode, key) {
  return healingModeFields(mode).includes(key);
}
