/**
 * Applies an outline offset to a pen path node, returning the rebuilt node.
 *
 * Anchors are stored relative to the node box and scaled by
 * width / baseWidth. The offset runs in that scaled local space, and the
 * node is rebased onto the new box with unit scale, the same way
 * createPenNode lays out a fresh path.
 */

import { transformTerms } from "./scene_geometry_transform.js";
import { NODE_KIND } from "./scene_model.js";
import {
  normalisePenAnchor,
  penAnchorsBounds,
} from "./scene_model_paths.js";
import { offsetClosedPenAnchors, OFFSET_FAILURE } from "./path_offset.js";

/** Scales one handle offset ([dx, dy]) into the node's local space. */
function scaleHandle(handle, scaleX, scaleY) {
  if (!Array.isArray(handle) || handle.length !== 2) return null;
  return [handle[0] * scaleX, handle[1] * scaleY];
}

/**
 * Returns `{ ok: true, node }` with the offset path, or `{ ok: false, reason }`.
 * Rotated, sheared or flipped nodes are refused: rebuilding their box would
 * shift the rotation centre, so the caller must not guess.
 */
export function offsetPathNode(node, distance) {
  if (!node || node.kind !== NODE_KIND.PATH || !Array.isArray(node.points)) {
    return { ok: false, reason: OFFSET_FAILURE.NOT_PATH };
  }
  if (transformTerms(node) !== null) {
    return { ok: false, reason: OFFSET_FAILURE.TRANSFORMED };
  }

  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const localAnchors = node.points.map((point) => ({
    x: point.x * scaleX,
    y: point.y * scaleY,
    in: scaleHandle(point.in, scaleX, scaleY),
    out: scaleHandle(point.out, scaleX, scaleY),
    close: point.close === true,
  }));

  const offset = offsetClosedPenAnchors(localAnchors, distance);
  if (!offset.ok) return offset;

  const strokeWidth = node.strokeWidth ?? 1;
  const bounds = penAnchorsBounds(offset.anchors, strokeWidth);
  const points = offset.anchors.map((anchor) =>
    normalisePenAnchor(anchor, bounds.x, bounds.y),
  );
  return {
    ok: true,
    node: {
      ...node,
      x: node.x + bounds.x,
      y: node.y + bounds.y,
      width: bounds.width,
      height: bounds.height,
      baseWidth: bounds.width,
      baseHeight: bounds.height,
      points,
    },
  };
}
