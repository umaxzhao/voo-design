/**
 * Numeric panel anchor and rotation helpers for scene geometry.
 */

import { calculateRotationAngle } from "./box_transform_math.js";
import {
  HORIZONTAL_SCALE_CURSOR,
  VERTICAL_SCALE_CURSOR,
} from "./cursor_assets.js";
import { fromNodeLocal } from "./scene_geometry_transform.js";
import { nodeAABB } from "./scene_geometry_bounds.js";

/**
 * The nine reference points of the property panel's anchor selector, as
 * fractions of the node's box: "nw" is the top-left corner, "center" the
 * middle. The anchor is the point that stays fixed when X/Y/W/H are edited
 * numerically — Figma/Photopea's reference point.
 */
export const ANCHOR_FRACTIONS = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  w: { x: 0, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
  e: { x: 1, y: 0.5 },
  sw: { x: 0, y: 1 },
  s: { x: 0.5, y: 1 },
  se: { x: 1, y: 1 },
};

/** The anchor keys in 3×3 grid order, row by row. */
export const ANCHOR_KEYS = [
  "nw",
  "n",
  "ne",
  "w",
  "center",
  "e",
  "sw",
  "s",
  "se",
];

function anchorFraction(anchor) {
  return ANCHOR_FRACTIONS[anchor] ?? ANCHOR_FRACTIONS.nw;
}

/** The anchor's position in document space, on the node's rotated frame. */
export function anchorDocPoint(node, anchor = "nw") {
  const f = anchorFraction(anchor);
  return fromNodeLocal(node, { x: f.x * node.width, y: f.y * node.height });
}

/**
 * Applies a numeric panel edit ({x, y, width, height} — any subset) while
 * honouring the chosen reference anchor.
 *
 * A size patch keeps the anchor stationary in document space; an x/y patch
 * moves the *anchor itself* to that coordinate (so with the default "nw"
 * anchor X is the left edge, with "center" it is the box centre's doc x).
 *
 * The maths leans on one property of the shared transform: `fromNodeLocal` is
 * affine in the node's x/y with an identity Jacobian, so the anchor's document
 * position is `node.x/y + offset`, where the offset — evaluated with the node
 * at the origin — depends on the size, rotation and shear alone. This is the
 * same re-anchor step `resizeNodeRect` performs after a handle drag.
 *
 * Nodes without a transform and the default anchor degenerate to the plain
 * patch: `{ x }` edits x and nothing else.
 */
export function resizeWithAnchor(node, patch, anchor = "nw") {
  const f = anchorFraction(anchor);
  const width = Math.max(
    1,
    Number.isFinite(patch.width) ? patch.width : node.width,
  );
  const height = Math.max(
    1,
    Number.isFinite(patch.height) ? patch.height : node.height,
  );
  // Where the anchor sits before the edit — the point a size change pins.
  const pinned = anchorDocPoint(node, anchor);
  const offset = fromNodeLocal(
    { ...node, x: 0, y: 0, width, height },
    { x: f.x * width, y: f.y * height },
  );
  return {
    x: Number.isFinite(patch.x) ? patch.x - offset.x : pinned.x - offset.x,
    y: Number.isFinite(patch.y) ? patch.y - offset.y : pinned.y - offset.y,
    width,
    height,
  };
}

/**
 * The rotation a canvas rotate-handle drag produces, in degrees.
 *
 * The handle rides the node's local "up", so a pointer straight above the box
 * centre reads as rotation 0, and the angle grows clockwise with the screen's
 * y-down axis — the same sign convention `ctx.rotate` uses. `snap` (Shift)
 * rounds to 15° increments. The result is normalized to (-180, 180], the
 * range the model stores.
 */
export function rotationFromPointer(center, point, snap = false) {
  return calculateRotationAngle({
    center,
    pointer: point,
    stalkOffset: 90,
    snap180: true,
    stepInterval: snap ? 15 : null,
  });
}

/** Distance from the selection's top edge to the rotate grip, in screen px. */
export const ROTATE_HANDLE_OFFSET = 20;

/**
 * The rotate handle of a selected node: `base` is the top edge midpoint the
 * stem starts from, `grip` the draggable knob ROTATE_HANDLE_OFFSET screen
 * pixels above it along the node's local up. Both are in document space.
 *
 * drawSelection paints exactly this and pointer hit-testing grabs the same
 * points, so the grip is never drawn where it cannot be reached — the same
 * shared-computation rule as the resize handles.
 */
export function rotationHandleGeometry(node, zoom) {
  if (
    (Array.isArray(node.perspectiveQuad) &&
      node.perspectiveQuad.length === 4) ||
    (Array.isArray(node.perspectiveCorners) &&
      node.perspectiveCorners.length === 4) ||
    (node.warpMesh &&
      Array.isArray(node.warpMesh.points) &&
      node.warpMesh.points.length > 0)
  ) {
    const aabb = nodeAABB(node);
    return {
      base: { x: aabb.x + aabb.width / 2, y: aabb.y },
      grip: {
        x: aabb.x + aabb.width / 2,
        y: aabb.y - ROTATE_HANDLE_OFFSET / (zoom || 1),
      },
    };
  }
  return {
    base: fromNodeLocal(node, { x: node.width / 2, y: 0 }),
    grip: fromNodeLocal(node, {
      x: node.width / 2,
      y: -ROTATE_HANDLE_OFFSET / (zoom || 1),
    }),
  };
}

/**
 * Mouse cursor for a handle, so the stage can hint the drag direction.
 *
 * Each handle owns a drag axis (e/w horizontal, nw/se at 45°, …); the node's
 * rotation turns that axis, and the result snaps to the nearest 45° bucket —
 * the four cursor shapes the platform has. At rotation 0 the buckets are
 * exactly the old fixed mapping. Shear is ignored: the hint stays cosmetic.
 */
const HANDLE_AXIS_DEG = {
  e: 0,
  w: 0,
  nw: 45,
  se: 45,
  n: 90,
  s: 90,
  ne: 135,
  sw: 135,
};

const AXIS_CURSORS = [
  HORIZONTAL_SCALE_CURSOR,
  "nwse-resize",
  VERTICAL_SCALE_CURSOR,
  "nesw-resize",
];

export function cursorForHandle(handle, rotation = 0) {
  const axis = HANDLE_AXIS_DEG[handle];
  if (axis === undefined) return "default";
  const turned = (((axis + rotation) % 180) + 180) % 180;
  return AXIS_CURSORS[Math.round(turned / 45) % 4];
}
