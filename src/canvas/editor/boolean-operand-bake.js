import { MAX_SHEAR_DEG } from "./scene_model_core.js";
import { booleanOutlineNode } from "./boolean-outline.js";
import { convertShapeToPathNode } from "./shape_to_path.js";
import { fromNodeLocal, nodeCorners } from "./scene_geometry_transform.js";
import { boundsOfPoints } from "./scene_geometry_bounds.js";

/** Saved node transforms clamp shear; bake only affine results outside that range. */
export function bakeUnrepresentableBooleanOperand(node) {
  if (Math.abs(node.shear ?? 0) <= MAX_SHEAR_DEG) return node;
  const pen = node.kind === "path" ? { ...node, pen: true, points: (node.points ?? []).map((point, index, points) => ({
    ...(Array.isArray(point) ? { x: point[0], y: point[1] } : point),
    close: Boolean(point.close || index === points.length - 1),
  })) } : null;
  const path = node.kind === "boolean" ? booleanOutlineNode(node)
    : pen ?? convertShapeToPathNode(node);
  if (!path) return node;
  const box = boundsOfPoints(nodeCorners(path).map(({ x, y }) => [x, y]));
  const sx = path.baseWidth ? path.width / path.baseWidth : 1;
  const sy = path.baseHeight ? path.height / path.baseHeight : 1;
  const points = path.points.map((anchor) => {
    const point = fromNodeLocal(path, { x: anchor.x * sx, y: anchor.y * sy });
    const handle = (value) => {
      if (!value) return null;
      const tip = fromNodeLocal(path, { x: (anchor.x + value[0]) * sx, y: (anchor.y + value[1]) * sy });
      return [tip.x - point.x, tip.y - point.y];
    };
    return { x: point.x - box.x, y: point.y - box.y,
      in: handle(anchor.in), out: handle(anchor.out), close: Boolean(anchor.close) };
  });
  const result = { ...path, ...box, baseWidth: box.width, baseHeight: box.height,
    points, rotation: 0, shear: 0, flipH: false, flipV: false };
  delete result.operation;
  delete result.sources;
  for (const key of ["cornerRadius", "poly", "polyKind", "sides", "spikes", "innerRatio", "line", "arrow", "arrowStart"]) delete result[key];
  return result;
}
