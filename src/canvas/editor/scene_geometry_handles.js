/**
 * Handle placement and resize math for scene geometry.
 */

import { NODE_KIND } from "./scene_model.js";
import { resolveCornerRadii } from "./scene_model_core.js";
import {
  OPPOSITE_HANDLE,
  edgesOfHandle as sharedEdgesOfHandle,
  handleAtPoint as sharedHandleAtPoint,
  handleFromPoints as sharedHandleFromPoints,
  handlePoints as sharedHandlePoints,
  oppositeHandlePoint as sharedOppositeHandlePoint,
  resizeBoxLocal,
} from "./box_transform_math.js";
import {
  fromNodeLocal,
  toNodeLocalDelta,
  transformTerms,
} from "./scene_geometry_transform.js";
import { nodeAABB } from "./scene_geometry_bounds.js";

export { OPPOSITE_HANDLE };

/**
 * Every handle name a resize can be addressed by, in compass order.
 *
 * Wider than what `handlePoints` returns on purpose: the pointer only ever
 * reaches the four corners, but the W/H fields and scripted resizes still name
 * an edge, and the math has to accept it.
 */
export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** The handles the pointer can actually grab: all 8 handles (4 corners + 4 edge midpoints). */
export const SELECTABLE_HANDLES = HANDLES;

/** Smallest node a resize drag may produce, in document pixels. */
export const MIN_NODE_SIZE = 8;

export function edgesOfHandle(handle) {
  return sharedEdgesOfHandle(handle);
}

/**
 * Handle centres in the same space as `rect`.
 *
 * Returned in `HANDLES` order so callers can render them without re-sorting.
 */
export function handlePoints(rect) {
  return sharedHandlePoints(rect);
}

/**
 * The point diametrically opposite `handle` on `rect`, or null for a handle
 * name that is not a compass point.
 */
export function oppositeHandlePoint(rect, handle) {
  return sharedOppositeHandlePoint(rect, handle);
}

/**
 * The handle under a point, or null.
 *
 * `tolerance` is in the same space as the rect — callers working in document
 * space pass a screen tolerance divided by the zoom, so the grab area stays
 * the same physical size at every zoom level.
 */
export function handleAtPoint(rect, point, tolerance) {
  return sharedHandleAtPoint(rect, point, tolerance);
}

/**
 * The handle under a point from a precomputed `{ handle, x, y }` list, or
 * null — the hit-test half of `selectionHandlePoints`, so the pointer grabs
 * exactly the handles `drawSelection` painted, however the node is rotated.
 * Distance is Euclidean within `tolerance`, in the list's own space.
 */
export function handleFromPoints(points, point, tolerance) {
  return sharedHandleFromPoints(points, point, tolerance);
}

/**
 * The eight resize handles of a node in document space, in HANDLES order.
 *
 * drawSelection renders exactly these points and pointer hit-testing grabs
 * the same list, so the chrome can never draw a handle the pointer cannot
 * reach. For an unrotated node they are `handlePoints(nodeRect(node))`.
 */
export function selectionHandlePoints(node) {
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
    return handlePoints(aabb);
  }
  const localBox = node.effectiveLocal ?? {
    x: 0,
    y: 0,
    width: node.width,
    height: node.height,
  };
  const local = handlePoints(localBox);
  return local.map((point) => ({
    handle: point.handle,
    ...fromNodeLocal(node, point),
  }));
}

/**
 * The unit inward direction (corner → box centre) of a corner-radius handle,
 * in node-local space. Dragging the handle towards the centre grows the
 * radius, towards the corner shrinks it — Figma's mapping. The drag handler
 * projects the local-space pointer delta onto this vector, which is what
 * makes the drag bidirectional (an unsigned distance can only ever grow the
 * radius).
 */
export function cornerRadiusInwardDirection(handle) {
  switch (handle) {
    case "radius-nw":
      return { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    case "radius-ne":
      return { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
    case "radius-se":
      return { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    case "radius-sw":
      return { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    default:
      return null;
  }
}

/** 4 inner corner radius dot handles for rect nodes, inset by cornerRadius + 16 doc px */
export function rectCornerRadiusHandles(node) {
  if (node.kind !== NODE_KIND.RECT) return [];
  const maxR = Math.min(node.width / 2, node.height / 2);
  const radii = resolveCornerRadii(node.cornerRadius, node.width, node.height);
  const offsetNw = Math.min(Math.max(radii.tl + 14, 18), maxR);
  const offsetNe = Math.min(Math.max(radii.tr + 14, 18), maxR);
  const offsetSe = Math.min(Math.max(radii.br + 14, 18), maxR);
  const offsetSw = Math.min(Math.max(radii.bl + 14, 18), maxR);

  const local = [
    { handle: "radius-nw", x: offsetNw, y: offsetNw },
    { handle: "radius-ne", x: node.width - offsetNe, y: offsetNe },
    { handle: "radius-se", x: node.width - offsetSe, y: node.height - offsetSe },
    { handle: "radius-sw", x: offsetSw, y: node.height - offsetSw },
  ];

  return local.map((point) => ({
    handle: point.handle,
    ...fromNodeLocal(node, point),
  }));
}

/**
 * Applies a resize drag to a rectangle.
 *
 * `keepRatio` locks the original aspect ratio (Shift on a corner handle) and
 * `fromCentre` grows both opposite edges at once (Alt), matching Figma.
 * The result never goes below `MIN_NODE_SIZE` on either axis, and flipping is
 * clamped rather than mirrored — mirroring an image is a separate action.
 */
export function resizeRect(rect, handle, delta, options = {}) {
  const keepRatio = Boolean(options.keepRatio ?? options.lockRatio);
  const fromCentre = Boolean(options.fromCentre);
  const minSize = options.minSize ?? MIN_NODE_SIZE;
  return resizeBoxLocal(rect, handle, delta, {
    keepRatio,
    fromCentre,
    minWidth: minSize,
    minHeight: minSize,
  });
}

/**
 * Applies a resize drag to a (possibly rotated or sheared) node.
 *
 * The drag runs in the node's local frame — the pointer delta goes through
 * `toNodeLocalDelta`, then the plain `resizeRect` does its work — and the
 * result is re-anchored into document space: the fixed point (the opposite
 * handle, or the centre when `fromCentre`) keeps its exact document position,
 * which is what makes a rotated resize feel like grabbing the painted handle
 * rather than the stored box. The re-anchor is a pure translation because
 * `fromNodeLocal` is affine in the node's x/y.
 *
 * Nodes without a transform degenerate to a plain `resizeRect` call, byte for
 * byte.
 */
export function resizeNodeRect(node, handle, delta, options = {}) {
  if (!transformTerms(node)) {
    return resizeRect(
      { x: node.x, y: node.y, width: node.width, height: node.height },
      handle,
      delta,
      options,
    );
  }
  const localDelta = toNodeLocalDelta(node, delta);
  const before = { x: 0, y: 0, width: node.width, height: node.height };
  const resized = resizeRect(before, handle, localDelta, options);
  const anchor = options.fromCentre
    ? { x: resized.width / 2, y: resized.height / 2 }
    : oppositeHandlePoint(
        {
          x: 0,
          y: 0,
          width: resized.width,
          height: resized.height,
        },
        handle,
      );
  // The same physical point in the pre-drag local frame: resizeRect returns
  // the new box *in* that frame, so its x/y is exactly the frame shift.
  const pinned = { x: anchor.x + resized.x, y: anchor.y + resized.y };
  const docBefore = fromNodeLocal(node, pinned);
  const unshifted = fromNodeLocal(
    { ...node, x: 0, y: 0, width: resized.width, height: resized.height },
    anchor,
  );
  return {
    x: docBefore.x - unshifted.x,
    y: docBefore.y - unshifted.y,
    width: resized.width,
    height: resized.height,
  };
}

/**
 * Resizes the *document*, which is anchored at the origin rather than centred.
 *
 * Figma semantics: contents keep their offset from the top-left corner, so no
 * node moves. Dragging the left or top edge therefore changes only the size —
 * the caller compensates the viewport so the opposite screen edge stays put.
 */
export function resizeDocument(
  size,
  edges,
  deltaX,
  deltaY,
  minSize,
  options = {},
) {
  let { width, height } = size;
  const mult = options.fromCentre ? 2 : 1;
  if (edges.right) width += deltaX * mult;
  if (edges.left) width -= deltaX * mult;
  if (edges.bottom) height += deltaY * mult;
  if (edges.top) height -= deltaY * mult;
  return {
    width: Math.max(minSize, Math.round(width)),
    height: Math.max(minSize, Math.round(height)),
  };
}
