import { resizeWithAnchor } from "../../editor/scene_geometry.js";

/** Position controls change one axis; they must not resend the old box size. */
export function positionFieldPatch(node, axis, value, anchor) {
  const next = resizeWithAnchor(node, {
    [axis]: value
  }, anchor);
  return {
    [axis]: next[axis]
  };
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
