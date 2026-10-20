/**
 * Pixel selection transforms, bounding boxes, crops, and clip masks.
 */

import { contourBounds, traceMaskContours } from "./mask_contour.js";
import { contoursToMask, mapContoursToDoc } from "./pixel_selection_contour.js";

/**
 * Transforms a pixel selection into a new bounding box (Photoshop's
 * Select → Transform Selection): the mask is remapped through the target
 * rect's scale, rotation (about the new rect's centre) and translation.
 *
 * `transform` is the target box in document coordinates:
 * `{ x, y, width, height, rotation }`. The result is the same contour data
 * every other selection consumer holds.
 *
 * @param {ImageBitmap|HTMLCanvasElement|HTMLImageElement} source the layer bitmap.
 * @param {{nodeId: string, contours: Array, bounds: object, feather?: number}} selection
 * @param {object} node the layer node with x, y, width, height.
 * @returns {{nodeId: string, contours: Array, bounds: object, feather: number} | null}
 */
export function transformSelection(source, selection, node, transform) {
  const width = source.width;
  const height = source.height;
  if (!(width > 0) || !(height > 0) || !selection?.contours?.length) {
    return selection;
  }
  const base = contoursToMask(selection.contours, node, width, height);
  if (!base) return selection;

  const old =
    selection.bounds && selection.bounds.width > 0
      ? selection.bounds
      : {
          x: node.x ?? 0,
          y: node.y ?? 0,
          width: node.width ?? width,
          height: node.height ?? height,
        };
  const newX = Number.isFinite(transform?.x) ? transform.x : old.x;
  const newY = Number.isFinite(transform?.y) ? transform.y : old.y;
  const newW = Math.max(
    1,
    Number.isFinite(transform?.width) ? transform.width : old.width,
  );
  const newH = Math.max(
    1,
    Number.isFinite(transform?.height) ? transform.height : old.height,
  );
  const rotation = Number.isFinite(transform?.rotation)
    ? transform.rotation
    : 0;

  const oldCx = old.x + old.width / 2;
  const oldCy = old.y + old.height / 2;
  const newCx = newX + newW / 2;
  const newCy = newY + newH / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const scaleX = newW / old.width;
  const scaleY = newH / old.height;
  const maskPerDocX = width / (node.width ?? width);
  const maskPerDocY = height / (node.height ?? height);
  const oldCxM = (oldCx - (node.x ?? 0)) * maskPerDocX;
  const oldCyM = (oldCy - (node.y ?? 0)) * maskPerDocY;

  const out = new Float32Array(width * height);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      // Target mask pixel → target document point.
      const docX = px / maskPerDocX + (node.x ?? 0);
      const docY = py / maskPerDocY + (node.y ?? 0);
      // Target doc → local (inverse rotation about the new centre, unscale).
      const dx = docX - newCx;
      const dy = docY - newCy;
      const localX = (dx * cos + dy * sin) / scaleX;
      const localY = (-dx * sin + dy * cos) / scaleY;
      // Local → old document → old mask pixel.
      const bx = Math.round(oldCxM + localX * maskPerDocX);
      const by = Math.round(oldCyM + localY * maskPerDocY);
      if (bx >= 0 && by >= 0 && bx < width && by < height) {
        out[py * width + px] = base[by * width + bx];
      }
    }
  }

  for (let i = 0; i < out.length; i += 1) {
    out[i] = out[i] > 0.5 ? 1 : 0;
  }
  const rings = traceMaskContours(out, width, height);
  if (rings.length === 0) return selection;
  const contours = mapContoursToDoc(rings, node, width, height);
  return {
    nodeId: selection.nodeId,
    contours,
    bounds: contourBounds(contours),
    feather: selection.feather ?? 0,
  };
}

/** The live bounding box during a transform (doc coords), for the UI handles. */
export function transformedSelectionBounds(selection, transform) {
  const old =
    selection?.bounds?.width > 0
      ? selection.bounds
      : { x: 0, y: 0, width: 1, height: 1 };
  return {
    x: Number.isFinite(transform?.x) ? transform.x : old.x,
    y: Number.isFinite(transform?.y) ? transform.y : old.y,
    width: Math.max(
      1,
      Number.isFinite(transform?.width) ? transform.width : old.width,
    ),
    height: Math.max(
      1,
      Number.isFinite(transform?.height) ? transform.height : old.height,
    ),
    rotation: Number.isFinite(transform?.rotation) ? transform.rotation : 0,
  };
}

/**
 * The bitmap-pixel crop that contains a pixel selection plus padding, clamped
 * to the bitmap. Returns null when the selection lies entirely outside the
 * bitmap. The caller sends this crop to the image-edit model, so its aspect
 * ratio follows the selection box — whatever the model returns is drawn back
 * into exactly this rectangle.
 *
 * @param {object} node  the image node, with doc-space x/y/width/height
 * @param {object} selection  a pixel selection with a doc-space bounds
 * @param {number} bitmapWidth  the node's bitmap width in pixels
 * @param {number} bitmapHeight  the node's bitmap height in pixels
 * @param {number} [pad=8]  extra margin around the bounds, in doc pixels
 * @returns {{x:number,y:number,width:number,height:number}|null}
 */
export function selectionCropRect(
  node,
  selection,
  bitmapWidth,
  bitmapHeight,
  pad = 8,
) {
  const width = bitmapWidth;
  const height = bitmapHeight;
  if (!(width > 0) || !(height > 0)) return null;
  const scaleX = width / (node.width || width);
  const scaleY = height / (node.height || height);
  const b =
    selection?.bounds?.width > 0
      ? selection.bounds
      : {
          x: node.x,
          y: node.y,
          width: node.width ?? width,
          height: node.height ?? height,
        };
  const sx = Math.max(0, Math.floor((b.x - pad - node.x) * scaleX));
  const sy = Math.max(0, Math.floor((b.y - pad - node.y) * scaleY));
  const sw = Math.max(
    1,
    Math.min(width - sx, Math.ceil((b.width + pad * 2) * scaleX)),
  );
  const sh = Math.max(
    1,
    Math.min(height - sy, Math.ceil((b.height + pad * 2) * scaleY)),
  );
  if (sx >= width || sy >= height) return null;
  return { x: sx, y: sy, width: sw, height: sh };
}

/**
 * The rings an active selection contributes as a clip for a pixel edit on
 * `node`, in that node's bitmap pixels — or null when the selection does not
 * constrain this edit.
 *
 * An active selection is a hard boundary: a pixel tool may not write outside
 * it. Tools that build their own mask intersect it with these rings.
 *
 * A selection drawn on another layer does not clip. The rest of the editor
 * treats a pixel selection as belonging to the node it was made on —
 * combineSelections refuses to mix nodes, and the mask-from-selection path
 * checks the same thing — so honouring it here would be the one place that
 * disagreed.
 *
 * @param {{nodeId?: string, contours?: number[][][]} | null} selection
 * @param {{id: string, x: number, y: number} | null} node
 * @param {number} scaleX Document units to bitmap pixels, horizontally.
 * @param {number} scaleY Document units to bitmap pixels, vertically.
 * @returns {number[][][] | null}
 */
export function selectionClipRings(selection, node, scaleX, scaleY) {
  if (!selection?.contours?.length || !node) return null;
  if (selection.nodeId !== node.id) return null;
  const rings = selection.contours
    .filter((ring) => ring.length >= 3)
    .map((ring) =>
      ring.map(([x, y]) => [(x - node.x) * scaleX, (y - node.y) * scaleY]),
    );
  return rings.length ? rings : null;
}

/**
 * Cuts a tool's mask back to the active selection, for the tools that mark
 * what they will touch on a mask canvas. Returns whether a selection applied,
 * so the caller knows to check that anything survived the cut.
 */
export function clipMaskToSelection(selection, maskCtx, node, scaleX, scaleY) {
  const rings = selectionClipRings(selection, node, scaleX, scaleY);
  if (!rings) return false;
  maskCtx.save();
  maskCtx.globalCompositeOperation = "destination-in";
  maskCtx.fillStyle = "#ffffff";
  maskCtx.beginPath();
  for (const ring of rings) {
    ring.forEach(([x, y], index) => {
      if (index === 0) maskCtx.moveTo(x, y);
      else maskCtx.lineTo(x, y);
    });
    maskCtx.closePath();
  }
  maskCtx.fill();
  maskCtx.restore();
  return true;
}

/**
 * The same boundary as per-pixel coverage, for a tool that writes pixels
 * straight into an ImageData rather than through a mask canvas — a 2D clip
 * cannot reach those. Coverage rather than a yes/no also carries a feathered
 * selection's soft edge, which a hard clip would square off.
 */
export function selectionCoverage(
  selection,
  node,
  width,
  height,
  scaleX,
  scaleY,
) {
  const rings = selectionClipRings(selection, node, scaleX, scaleY);
  if (!rings) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
  ctx.fill();
  const data = ctx.getImageData?.(0, 0, width, height)?.data;
  if (!data) return null;
  const coverage = new Uint8ClampedArray(width * height);
  for (let i = 0; i < coverage.length; i += 1) coverage[i] = data[i * 4 + 3];
  return coverage;
}
