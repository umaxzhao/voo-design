import { nodeCorners } from "./scene_geometry_transform.js";
import { boundsOfPoints } from "./scene_geometry_bounds.js";
import { nodeVisualAABB, nodeWorldEffectPad, nodeScreenEffectPad } from "./viewport_culling.js";
import { additionalStrokePaints, primaryStrokePaint } from "./stroke-paint-passes.js";
import { booleanContours } from "./boolean-outline.js";

function localGeometryBounds(node) {
  if (node.kind !== "boolean") return { x: 0, y: 0, width: node.width, height: node.height };
  const points = booleanContours(node).flatMap((ring) => ring.map(({ x, y }) => [x, y]));
  return boundsOfPoints(points) ?? { x: 0, y: 0, width: node.width, height: node.height };
}

export function strokeMaskBounds(node) {
  // Expand in the node's own axes before transformation. This includes rotated
  // and sheared miter tips at any world coordinate without a fixed world box.
  const padding = Math.max(1, node.strokeWidth ?? 1) * Math.max(1, node.strokeMiterLimit ?? 4) + 1;
  const local = localGeometryBounds(node);
  // Operand rotation can extend a Boolean beyond its stored container box.
  // Preserve the container's transform pivot while expanding actual contours.
  return boundsOfPoints(nodeCorners({ ...node, effectiveLocal: {
    x: local.x - padding, y: local.y - padding,
    width: local.width + padding * 2, height: local.height + padding * 2 } }).map(({ x, y }) => [x, y]));
}


/** Mask surfaces must contain every visible paint, including miter tips. */
export function paintedNodeBounds(node) {
  const bounds = nodeVisualAABB(node);
  let left = bounds.x, top = bounds.y;
  let right = bounds.x + bounds.width, bottom = bounds.y + bounds.height;
  if (node.kind === "boolean") {
    const geometry = boundsOfPoints(nodeCorners({ ...node, effectiveLocal: localGeometryBounds(node) }).map(({ x, y }) => [x, y]));
    const pad = nodeWorldEffectPad(node) + nodeScreenEffectPad(node);
    left = Math.min(left, geometry.x - pad); top = Math.min(top, geometry.y - pad);
    right = Math.max(right, geometry.x + geometry.width + pad); bottom = Math.max(bottom, geometry.y + geometry.height + pad);
  }
  for (const paint of [primaryStrokePaint(node), ...additionalStrokePaints(node)]) {
    if (!(paint.strokeWidth > 0) || !paint.stroke || paint.stroke === "transparent") continue;
    const stroke = strokeMaskBounds(paint);
    left = Math.min(left, stroke.x); top = Math.min(top, stroke.y);
    right = Math.max(right, stroke.x + stroke.width); bottom = Math.max(bottom, stroke.y + stroke.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
