/** Shared merged contours for Canvas2D rendering and vector export. */
import { NODE_KIND } from "./scene_model_core.js";
import { tessellateNodeToWorldPolygons } from "./path-boolean-geometry.js";
import { clipMultiLoopShapes } from "./path-boolean-clipping.js";
import { fromNodeLocal } from "./scene_geometry_transform.js";

const contourCache = new WeakMap();
const OPERATIONS = new Set(["union", "subtract", "intersect", "exclude"]);

function sourceContours(source) {
  const box = { x: source.x ?? 0, y: source.y ?? 0,
    width: source.w, height: source.h, rotation: source.rotation ?? 0,
    shear: source.shear ?? 0, flipH: source.flipH, flipV: source.flipV };
  // Normalize at the origin before moving the source. Besides avoiding large
  // world-coordinate clipping errors, this keeps pen anchors unambiguously local.
  const contours = source.type === NODE_KIND.BOOLEAN
    ? mergeContours(source.booleanSources ?? [], source.booleanOperation)
    : tessellateNodeToWorldPolygons({ ...source, kind: source.type,
      x: 0, y: 0, width: source.w, height: source.h,
      rotation: 0, shear: 0, flipH: false, flipV: false });
  return contours.map((ring) => ring.map((point) => fromNodeLocal(box, point)));
}

function mergeContours(sources, operation = "union") {
  if (!sources.length) return [];
  const op = OPERATIONS.has(operation) ? operation : "union";
  let contours = sourceContours(sources[0]);
  for (const source of sources.slice(1)) {
    contours = clipMultiLoopShapes(contours, sourceContours(source), op);
  }
  return contours;
}

/** Geometry stays local: moving/rotating a container never reruns clipping. */
export function booleanContours(node) {
  const sources = node.sources ?? [];
  const signature = JSON.stringify([node.operation, sources]);
  const cached = contourCache.get(sources);
  if (cached?.signature === signature) return cached.contours;
  const contours = mergeContours(sources, node.operation);
  contourCache.set(sources, { signature, contours });
  return contours;
}

/** An ordinary closed path allows every paint to share one final boundary. */
export function booleanOutlineNode(node) {
  const points = booleanContours(node).flatMap((ring) => ring.map((point, index) => ({
    x: point.x, y: point.y, close: index === ring.length - 1,
  })));
  return { ...node, kind: NODE_KIND.PATH, pen: true, points,
    baseWidth: node.width, baseHeight: node.height, fillRule: "evenodd",
    strokeAlign: node.strokeAlign ?? "inside", arrow: false, arrowStart: false };
}
