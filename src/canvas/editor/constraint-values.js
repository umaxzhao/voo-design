/** Stored constraint vocabulary and tolerant alias normalization. */

export const HORIZONTAL_CONSTRAINTS = Object.freeze([
  "left",
  "right",
  "leftRight",
  "center",
  "scale",
]);

export const VERTICAL_CONSTRAINTS = Object.freeze([
  "top",
  "bottom",
  "topBottom",
  "center",
  "scale",
]);

export const DEFAULT_CONSTRAINTS = Object.freeze({
  horizontal: "left",
  vertical: "top",
});

const HORIZONTAL_ALIASES = new Map([
  ["left", "left"],
  ["right", "right"],
  ["leftright", "leftRight"],
  ["left-right", "leftRight"],
  ["left_right", "leftRight"],
  ["stretch", "leftRight"],
  ["fill", "leftRight"],
  ["center", "center"],
  ["centre", "center"],
  ["middle", "center"],
  ["scale", "scale"],
]);

const VERTICAL_ALIASES = new Map([
  ["top", "top"],
  ["bottom", "bottom"],
  ["topbottom", "topBottom"],
  ["top-bottom", "topBottom"],
  ["top_bottom", "topBottom"],
  ["stretch", "topBottom"],
  ["fill", "topBottom"],
  ["center", "center"],
  ["centre", "center"],
  ["middle", "center"],
  ["scale", "scale"],
  // Figma's panel names the vertical property "left/right" rows above a
  // "top/bottom" row; accept the horizontal words as tolerant reads.
  ["left", "top"],
  ["right", "bottom"],
]);

function aliasFor(table, value) {
  if (typeof value !== "string") return null;
  return table.get(value.trim().toLowerCase()) ?? null;
}

/** Normalizes a stored constraint object; always returns a complete shape. */
export function normalizeConstraints(value) {
  return {
    horizontal: aliasFor(HORIZONTAL_ALIASES, value?.horizontal) ?? "left",
    vertical: aliasFor(VERTICAL_ALIASES, value?.vertical) ?? "top",
  };
}

/** True when two constraint objects normalize to the same modes. */
export function constraintsEqual(left, right) {
  const a = normalizeConstraints(left);
  const b = normalizeConstraints(right);
  return a.horizontal === b.horizontal && a.vertical === b.vertical;
}
