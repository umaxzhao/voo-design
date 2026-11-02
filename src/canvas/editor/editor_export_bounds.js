/**
 * Selection bounding box calculation and canvas encoding helpers for export.
 */

import { NODE_KIND } from "./scene_model.js";
import { nodeAABB } from "./scene_geometry.js";

/** Node kinds drawNode paints a body for — the only ones worth compositing. */
export const RENDERABLE_KINDS = new Set([
  NODE_KIND.IMAGE,
  NODE_KIND.RECT,
  NODE_KIND.ELLIPSE,
  NODE_KIND.PATH,
  NODE_KIND.TEXT,
  NODE_KIND.BOOLEAN,
]);

/**
 * The union bounding box of the given nodes, or null when none of them
 * carries a usable rectangle. Nodes missing numeric x/y/width/height (or
 * with a non-positive size) are skipped gracefully.
 */
export function selectionBounds(nodes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes ?? []) {
    if (!node) continue;
    const { x, y, width, height } = node;
    if (![x, y, width, height].every(Number.isFinite)) continue;
    if (width <= 0 || height <= 0) continue;
    const box = nodeAABB(node);
    if (
      !box ||
      !Number.isFinite(box.x) ||
      !Number.isFinite(box.y) ||
      !Number.isFinite(box.width) ||
      !Number.isFinite(box.height)
    ) {
      continue;
    }
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Encodes a canvas to a data URL in the requested format. PNG is lossless and
 * ignores quality; JPEG and WebP accept a 0..1 quality (undefined = encoder
 * default). The 8-bit sRGB pipeline the report keeps means no colour-space
 * conversion happens here — the canvas pixels are already sRGB.
 */
export function encodeCanvas(canvas, { type = "image/png", quality } = {}) {
  if (type === "image/png") return canvas.toDataURL("image/png");
  return canvas.toDataURL(type, quality);
}

/** Shared pixel sizing: preserve fractional origins and never allocate zero pixels. */
export function exportPixelSize(bounds, scale = 1) {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    scale: factor,
    width: Math.max(1, Math.round(bounds.width * factor)),
    height: Math.max(1, Math.round(bounds.height * factor)),
  };
}

/** Undefined retains legacy automatic backdrop behavior for internal callers. */
export function exportPageBackground(transparent, hasBlends = false) {
  return transparent === undefined ? hasBlends : !transparent;
}

/** Override the sheet color without changing artwork or drawing a checkerboard. */
export function exportBackdropDocument(doc, transparent) {
  if (transparent === undefined) return doc;
  return { ...doc, backgroundColor: transparent ? "transparent" :
    (doc.backgroundColor && doc.backgroundColor !== "transparent" ? doc.backgroundColor : "#ffffff") };
}
