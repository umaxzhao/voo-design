/**
 * Custom editor cursors.
 *
 * Rotation assets currently come from the temporary Affinity reference set.
 * Keep the filenames and intrinsic dimensions stable when replacing them so
 * the center hotspots remain aligned with the pointer.
 */

import { rotationFromPointer } from "./scene_geometry.js";
import { ROTATE_CURSOR } from "./cursor_assets.js";

export const ROTATION_CURSOR_ANGLE_STEP = 15;

const ROTATION_CURSOR_HOTSPOTS = Object.freeze({
  0: [11, 7],
  15: [12, 9],
  30: [12, 10],
  45: [11, 12],
  60: [10, 12],
  75: [9, 12],
  90: [7, 11],
  105: [9, 12],
  120: [10, 12],
  135: [12, 12],
  150: [12, 10],
  165: [12, 9],
  180: [11, 7],
  195: [12, 9],
  210: [12, 10],
  225: [11, 11],
  240: [10, 12],
  255: [9, 12],
  270: [7, 11],
  285: [9, 12],
  300: [10, 12],
  315: [11, 11],
  330: [12, 10],
  345: [12, 9],
});

const CURSOR_ASSET_BASE = import.meta.env?.BASE_URL ?? "/";

/** Snaps any finite angle to the nearest available clockwise cursor angle. */
export function snapRotationCursorAngle(angle) {
  if (!Number.isFinite(angle)) {
    throw new TypeError("Rotation cursor angle must be finite");
  }
  const normalized = ((angle % 360) + 360) % 360;
  return (
    (Math.round(normalized / ROTATION_CURSOR_ANGLE_STEP) *
      ROTATION_CURSOR_ANGLE_STEP) %
    360
  );
}

/** Returns a CSS cursor value with an explicit hotspot and system fallback. */
export function rotationCursorForAngle(angle) {
  // One supplied rotate cursor covers every snapped angle; the hotspot is the
  // centre of its curved arrow.
  snapRotationCursorAngle(angle);
  return ROTATE_CURSOR;
}

/** Aligns the double-arrow cursor tangentially around a transform centre. */
export function rotationCursorForPoint(center, point) {
  if (
    !Number.isFinite(center?.x) ||
    !Number.isFinite(center?.y) ||
    !Number.isFinite(point?.x) ||
    !Number.isFinite(point?.y)
  ) {
    throw new TypeError(
      "Rotation cursor points must contain finite coordinates",
    );
  }
  const angle = rotationFromPointer(center, point, true);
  return rotationCursorForAngle((360 - angle) % 360);
}
