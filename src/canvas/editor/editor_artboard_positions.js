/** Free-canvas positions are independent of workflow node coordinates. */

const POSITION_LIMIT = 1_000_000;

export function normalizeArtboardPosition(value) {
  if (
    !value ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    Math.abs(value.x) > POSITION_LIMIT ||
    Math.abs(value.y) > POSITION_LIMIT
  ) {
    return null;
  }
  return { x: Math.round(value.x), y: Math.round(value.y) };
}

export function positionArtboard(layout, value) {
  const saved = normalizeArtboardPosition(value);
  return saved ? { ...layout, ...saved } : layout;
}

export function dragArtboardPosition(start, delta, zoom) {
  if (!(zoom > 0)) throw new RangeError("Artboard zoom must be positive");
  return normalizeArtboardPosition({
    x: start.x + delta.x / zoom,
    y: start.y + delta.y / zoom,
  });
}
