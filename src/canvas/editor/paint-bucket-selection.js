import { toNodeLocal } from "./scene_geometry.js";
import { wandSelectFromBitmap } from "./pixel_selection.js";

/** Resolve a clicked colour region into the target bitmap's mask coordinates. */
export function resolveBucketSelection({ bitmap, node, point, tolerance, contiguous, sampleAll, getComposite }) {
  const composite = sampleAll ? getComposite?.(true) : null;
  if (sampleAll && !composite?.bitmap) return null;
  const source = composite?.bitmap ?? bitmap;
  const sampleNode = composite?.node ?? node;
  const bucket = wandSelectFromBitmap(source, toNodeLocal(sampleNode, point), sampleNode,
    tolerance, { contiguous: contiguous !== false });
  if (!bucket) return null;
  // Composite contours are in page space. The fill compositor consumes masks
  // against the untransformed target bitmap, including rotated/sheared images.
  const contours = sampleNode === node ? bucket.contours : bucket.contours.map((ring) => ring.map(([x, y]) => {
    const local = toNodeLocal(node, { x, y });
    return [node.x + local.x, node.y + local.y];
  }));
  return { ...bucket, contours, nodeId: node.id };
}
