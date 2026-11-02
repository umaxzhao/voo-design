/**
 * Contour and mask geometry for pixel selections.
 *
 * Normalises marquee bounds, approximates ellipses, rebases between
 * document space and node-local pixel coordinates, and rasterises
 * contours into mask alpha buffers.
 */

import {
  alphaFromRgba,
  contourBounds,
  traceMaskContours,
} from "./mask_contour.js";

/** How many segments approximate an elliptical marquee. */
const ELLIPSE_SEGMENTS = 64;

/** Normalises a drag into a rect with positive extents. */
export function normaliseRect(rect) {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;
  return {
    x,
    y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

/**
 * Restricts selection geometry to the editable image rectangle.
 *
 * Pixel selections belong to one raster layer, not to the infinite editor
 * workspace. Keeping every vertex inside that layer prevents marquee, lasso,
 * and moved-selection chrome from extending into the pasteboard.
 */
export function clampContoursToRect(contours, rect) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return [];
  const minX = rect.x;
  const minY = rect.y;
  const maxX = rect.x + rect.width;
  const maxY = rect.y + rect.height;
  return (contours ?? []).map((ring) =>
    ring.map(([x, y]) => [
      Math.max(minX, Math.min(maxX, x)),
      Math.max(minY, Math.min(maxY, y)),
    ]),
  );
}

/** A rectangular marquee as a single ring, wound clockwise. */
export function rectContour(rect) {
  const { x, y, width, height } = normaliseRect(rect);
  if (!(width > 0) || !(height > 0)) return [];
  return [
    [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ],
  ];
}

/**
 * An elliptical marquee as one sampled ring.
 *
 * Sampled rather than described as an arc because everything downstream — the
 * ants, hit-testing, the clip path used to delete — takes polygons, and one
 * representation for every selection shape is what keeps those simple.
 */
export function ellipseContour(rect, segments = ELLIPSE_SEGMENTS) {
  const { x, y, width, height } = normaliseRect(rect);
  if (!(width > 0) || !(height > 0)) return [];
  const radiusX = width / 2;
  const radiusY = height / 2;
  const centreX = x + radiusX;
  const centreY = y + radiusY;
  const ring = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    ring.push([
      centreX + Math.cos(angle) * radiusX,
      centreY + Math.sin(angle) * radiusY,
    ]);
  }
  return [ring];
}

/**
 * Rings in a picture's pixels, rebased onto the document.
 *
 * A layer is drawn into `node.width` x `node.height` document units whatever
 * its bitmap's real size, so the selection has to be scaled by that ratio and
 * offset to the node's origin — skipping it puts the outline near the document
 * origin at roughly the wrong size, which looks like a tracing bug rather than
 * a placement one.
 *
 * @param {Array<Array<[number, number]>>} rings contours in mask pixels.
 * @param {{x: number, y: number, width: number, height: number}} node
 * @param {number} maskWidth
 * @param {number} maskHeight
 */
export function mapContoursToDoc(rings, node, maskWidth, maskHeight) {
  if (!(maskWidth > 0) || !(maskHeight > 0)) return [];
  const scaleX = (node.width ?? maskWidth) / maskWidth;
  const scaleY = (node.height ?? maskHeight) / maskHeight;
  const originX = node.x ?? 0;
  const originY = node.y ?? 0;
  return rings.map((ring) =>
    ring.map(([x, y]) => [originX + x * scaleX, originY + y * scaleY]),
  );
}

/**
 * Decodes a matte and traces it into a selection the engine can hold.
 *
 * @param {Blob} matte full-size PNG whose alpha is the selection.
 * @param {object} node the layer the matte belongs to.
 * @returns {Promise<{nodeId: string, contours: Array, bounds: object} | null>}
 *   null when the matte selects nothing, so the caller can say so rather than
 *   installing an invisible selection.
 */
export async function selectionFromMatte(matte, node) {
  const bitmap = await createImageBitmap(matte);
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const alpha = alphaFromRgba(
      ctx.getImageData(0, 0, width, height).data,
      width,
      height,
    );
    const rings = traceMaskContours(alpha, width, height, { smooth: 3 });
    if (rings.length === 0) return null;
    const contours = mapContoursToDoc(rings, node, width, height);
    return {
      nodeId: node.id,
      contours,
      bounds: contourBounds(contours),
      feather: 0.5,
    };
  } finally {
    bitmap.close?.();
  }
}

/** Rasterises selection contours into a 0/1 mask over the layer's bitmap. */
export function contoursToMask(contours, node, width, height) {
  const scaleX = width / (node.width ?? width);
  const scaleY = height / (node.height ?? height);
  const originX = node.x ?? 0;
  const originY = node.y ?? 0;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // The mask is read back through alphaFromRgba (alpha only), so the
  // background must be *transparent* black — an opaque "#000" fill paints
  // alpha 255 everywhere and every contour would select the whole layer.
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  for (const ring of contours ?? []) {
    ctx.beginPath();
    ring.forEach(([x, y], index) => {
      const px = (x - originX) * scaleX;
      const py = (y - originY) * scaleY;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill("evenodd");
  }
  return alphaFromRgba(
    ctx.getImageData(0, 0, width, height).data,
    width,
    height,
  );
}
