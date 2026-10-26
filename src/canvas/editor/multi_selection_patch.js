/**
 * Multi-selection transform patches.
 *
 * A resize patch from Transform carries the primary node's absolute x/y
 * (resizeWithAnchor returns the new box). Broadcasting that patch verbatim to
 * every selected layer stacks them at one point, so secondary layers receive
 * the size change only and keep their own origin.
 */
export function isResizePatch(patch) {
  return Boolean(patch) && ("width" in patch || "height" in patch);
}

export function patchForMultiResize(patch, { primary = false } = {}) {
  if (!patch || primary || !isResizePatch(patch)) return patch;
  const next = { ...patch };
  delete next.x;
  delete next.y;
  return next;
}
