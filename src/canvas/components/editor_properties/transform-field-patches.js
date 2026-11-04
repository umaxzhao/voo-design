import {
  anchorDocPoint,
  fromNodeLocal,
  resizeWithAnchor,
  toNodeLocal,
} from "../../editor/scene_geometry.js";

/** Position controls change one axis; they must not resend the old box size. */
export function positionFieldPatch(node, axis, value, anchor) {
  const next = resizeWithAnchor(node, {
    [axis]: value
  }, anchor);
  return {
    [axis]: next[axis]
  };
}

/**
 * The inspector anchor point in a containing frame's local coordinate space.
 * The document model stores absolute boxes, so a child of a frame is reported
 * relative to that frame (Figma's nested-layer behaviour) by inverting the
 * frame's own transform. Without a frame this is the document point.
 */
export function positionPointInFrame(node, frame, anchor = "nw") {
  const point = anchorDocPoint(node, anchor);
  return frame ? toNodeLocal(frame, point) : point;
}

/**
 * Write an inspector X/Y value. `value` is in the frame's local space when a
 * frame is supplied, so the target point is converted back to document space
 * before the existing anchor maths runs. A rotated parent can change both
 * document axes for a single local axis edit, hence the possible x+y patch.
 */
export function positionFieldPatchInFrame(node, axis, value, anchor, frame) {
  if (!frame) return positionFieldPatch(node, axis, value, anchor);
  const local = positionPointInFrame(node, frame, anchor);
  const target = fromNodeLocal(frame, { ...local, [axis]: value });
  const next = resizeWithAnchor(
    node,
    { x: target.x, y: target.y },
    anchor,
  );
  const patch = {};
  if (next.x !== node.x) patch.x = next.x;
  if (next.y !== node.y) patch.y = next.y;
  return patch;
}

/** Compute field edits against the current node, preserving unedited dimensions. */
export function dimensionFieldPatch(node, axis, value, {
  anchor,
  lockRatio
}) {
  const width = node.width;
  const height = node.height;
  if (!width || !height) return null;
  if (node.kind === "text") {
    // Wrapped text owns a width; its height is measured from the content.
    if (node.boxWidth > 0) {
      if (axis !== "width") return null;
      const next = resizeWithAnchor(node, {
        width: value
      }, anchor);
      return {
        x: next.x,
        boxWidth: value
      };
    }
    const scaleFrom = axis === "width" ? width : height;
    const fontSize = Math.max(4, node.fontSize * value / scaleFrom);
    const scale = fontSize / node.fontSize;
    const next = resizeWithAnchor(node, {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    }, anchor);
    return {
      x: next.x,
      y: next.y,
      fontSize
    };
  }
  if (lockRatio) {
    const ratio = width / height;
    const size = axis === "width" ? {
      width: value,
      height: Math.max(1, Math.round(value / ratio))
    } : {
      width: Math.max(1, Math.round(value * ratio)),
      height: value
    };
    return resizeWithAnchor(node, size, anchor);
  }
  const next = resizeWithAnchor(node, {
    [axis]: value
  }, anchor);
  return {
    x: next.x,
    y: next.y,
    [axis]: next[axis]
  };
}
