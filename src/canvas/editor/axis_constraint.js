/**
 * Photoshop-style axis constraint for Shift-drags.
 *
 * The decision is pure so the pointer layer and the tests share it: given the
 * TOTAL displacement from the drag origin, the dominant axis wins and the
 * other is zeroed. A perfect tie locks horizontal — diagonals are never
 * locked in, and a dominant axis always exists.
 *
 * Callers recompute this from the drag origin on every pointer event, so
 * pressing or releasing Shift mid-drag re-constrains without a jump.
 */
export function constrainAxisDelta(dx, dy, active) {
  if (!active) return { dx, dy };
  if (Math.abs(dx) >= Math.abs(dy)) return { dx, dy: 0 };
  return { dx: 0, dy };
}
