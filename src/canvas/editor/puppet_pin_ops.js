/**
 * Pure puppet-pin ordering & rotation helpers — node:test-drivable, no DOM.
 *
 * These are the solver half of the puppet-warp pin controls: the pin's depth
 * (front/back) ordering and point rotation. The pointer/panel drive them; this
 * module stays pure so the geometry is pinned by tests.
 */

/** 0-based depth of a pin in the pin array, or -1 when absent. */
export function pinDepthIndex(pins, pinId) {
  return (Array.isArray(pins) ? pins : []).findIndex((pin) => pin.id === pinId);
}

/**
 * Moves a pin to the front (end of the array) or back (start), preserving the
 * relative order of the others. Returns a NEW array; the input is not mutated.
 * A missing pin id is a no-op.
 */
export function movePinDepth(pins, pinId, direction) {
  const list = Array.isArray(pins) ? pins : [];
  const index = list.findIndex((pin) => pin.id === pinId);
  if (index < 0) return list;
  if (direction !== "front" && direction !== "back") return list;
  const pin = list[index];
  const rest = list.filter((entry) => entry.id !== pinId);
  return direction === "front" ? [...rest, pin] : [pin, ...rest];
}

/** Degrees → radians. */
export function degToRad(deg) {
  return (Number(deg) * Math.PI) / 180;
}

/** Radians → degrees. */
export function radToDeg(rad) {
  return (Number(rad) * 180) / Math.PI;
}

/** Wraps an angle in degrees to the (−180, 180] range for a tidy readback. */
export function normalizeDeg(deg) {
  if (!Number.isFinite(Number(deg))) return 0;
  const value = Number(deg);
  const wrapped = ((value % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** Rotates a point about a pivot by `angleRad`; returns a new `{x, y}`. */
export function rotatePointAround(pivot, point, angleRad) {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

/**
 * Rotates the pin `pinId`'s (x, y) about `pivot` by `angleRad`, accumulating
 * the rotation on the pin as an INDEPENDENT `rotation` field (the pin's
 * displacement is unchanged by this — only the angle state and the pivoted
 * position change). Returns a NEW array; the source is not mutated.
 *
 * A missing pin or a zero angle is a no-op that returns the same array. When
 * `pivot` is omitted the pin rotates about its own rest anchor, which is a
 * no-op on an un-displaced pin — so callers that want an always-effective
 * rigid orbit pass an explicit shared pivot (the engine passes the image
 * centre for this reason).
 */
export function rotatePuppetPin(pins, pinId, angleRad, pivot) {
  const list = Array.isArray(pins) ? pins : [];
  const index = list.findIndex((pin) => pin.id === pinId);
  if (index < 0) return list;
  if (!Number.isFinite(angleRad) || angleRad === 0) return list;
  const pin = list[index];
  const center = pivot ?? { x: pin.restX ?? pin.x, y: pin.restY ?? pin.y };
  const next = rotatePointAround(center, { x: pin.x, y: pin.y }, angleRad);
  return list.map((entry) =>
    entry.id === pinId
      ? {
          ...entry,
          x: next.x,
          y: next.y,
          rotation: (entry.rotation ?? 0) + angleRad,
        }
      : entry,
  );
}
