/**
 * The DESTRUCTIVE crop path — a separate sibling of the non-destructive crop.
 *
 * The non-destructive path (editor_crop.js `applyCrop`) records the crop rect
 * as `doc.crop`, a viewport; nothing is deleted. "Delete Cropped Pixels"
 * instead BAKES the crop: the document is resized to the crop, `doc.crop` is
 * cleared, and every node is clipped to the crop and translated to the new
 * origin — nodes entirely outside the crop are removed (their pixels are gone).
 *
 * This is the pure document-structure half: it resizes the doc, clears the
 * crop, culls fully-exterior nodes and clips the rest. The engine additionally
 * rasterises the intersecting part of each image node's bitmap (flatten) when
 * it commits; that pixel-flatten is renderer work, not this module's.
 */
import { MIN_DOC_SIZE } from "./scene_model_core.js";

/**
 * A pure check: would a node still have visible pixels inside `rect`?
 */
export function nodeIntersectsCrop(node, rect) {
  const left = Math.max(node.x, rect.x);
  const top = Math.max(node.y, rect.y);
  const right = Math.min(node.x + node.width, rect.x + rect.width);
  const bottom = Math.min(node.y + node.height, rect.y + rect.height);
  return right - left >= 1 && bottom - top >= 1;
}

/**
 * Bakes `rect` into `doc` destructively and returns the new doc. Returns the
 * original doc unchanged when `rect` is missing or would not shrink the page
 * (a no-op crop never records). The input is never mutated.
 */
export function applyDestructiveCrop(doc, rect) {
  if (
    !doc ||
    !rect ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  )
    return doc;
  const pageMinX = 0;
  const pageMinY = 0;
  const pageW = doc.width || 0;
  const pageH = doc.height || 0;
  const rx = Math.max(pageMinX, Math.min(rect.x, pageW - MIN_DOC_SIZE));
  const ry = Math.max(pageMinY, Math.min(rect.y, pageH - MIN_DOC_SIZE));
  const rw = Math.max(MIN_DOC_SIZE, Math.min(rect.width, pageW - rx));
  const rh = Math.max(MIN_DOC_SIZE, Math.min(rect.height, pageH - ry));
  if (rw >= pageW && rh >= pageH && rx === 0 && ry === 0) return doc;

  const right = rx + rw;
  const bottom = ry + rh;
  const nodes = (doc.nodes ?? []).flatMap((node) => {
    const left = Math.max(node.x, rx);
    const top = Math.max(node.y, ry);
    const nodeRight = Math.min(node.x + node.width, right);
    const nodeBottom = Math.min(node.y + node.height, bottom);
    if (nodeRight - left < 1 || nodeBottom - top < 1) {
      // Entirely outside the crop: its pixels are gone.
      return [];
    }
    return [
      {
        ...node,
        x: left - rx,
        y: top - ry,
        width: nodeRight - left,
        height: nodeBottom - top,
      },
    ];
  });

  return { ...doc, crop: null, width: rw, height: rh, nodes };
}

/**
 * The bitmap-crop plan for flattening an image node whose box the destructive
 * crop clipped. Returns the source rect (in the node's bitmap pixels) and the
 * node's *new* box (in the post-crop document), or null when the node must be
 * culled (no pixels remain) or needs no clip (fully inside).
 *
 * The bitmap covers the node's doc box `(node.x, node.y, node.width, node.height)`,
 * so the crop offset scales by bitmap/natural vs doc size.
 */
export function imageNodeCropPlan(node, rect, bitmapW, bitmapH) {
  if (!node || !rect) return null;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const ix0 = Math.max(node.x, rect.x);
  const iy0 = Math.max(node.y, rect.y);
  const ix1 = Math.min(node.x + node.width, right);
  const iy1 = Math.min(node.y + node.height, bottom);
  if (ix1 - ix0 < 1 || iy1 - iy0 < 1) return null; // cull
  const docW = node.width || 1;
  const docH = node.height || 1;
  const bw = bitmapW || docW;
  const bh = bitmapH || docH;
  const sx = ((ix0 - node.x) / docW) * bw;
  const sy = ((iy0 - node.y) / docH) * bh;
  const sw = ((ix1 - ix0) / docW) * bw;
  const sh = ((iy1 - iy0) / docH) * bh;
  return {
    sx,
    sy,
    sw,
    sh,
    newBox: {
      x: ix0 - rect.x,
      y: iy0 - rect.y,
      width: ix1 - ix0,
      height: iy1 - iy0,
    },
    needsClip: ix1 - ix0 < node.width || iy1 - iy0 < node.height,
  };
}
