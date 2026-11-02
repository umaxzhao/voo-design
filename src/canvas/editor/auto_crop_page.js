/**
 * Smart crop for the design canvas: the page's content bounds in, a
 * `resolveAutoCrop()` window out, in document coordinates.
 *
 * The crop engine works on an image and an optional subject mask. A design
 * page is the same problem one level up: the "image" is the page and the
 * "subject" is whatever the page actually draws. This module builds that mask
 * on a coarse grid — a page-sized Float32 mask would be tens of megabytes,
 * while a 256px grid resolves a crop frame far finer than the user can drag —
 * and maps the engine's answer back into document pixels.
 *
 * `autoCropRectForPage()` is the pure half: page and boxes in, a frame out.
 * `applySmartCrop()` is the half the crop panel's Smart button calls: it reads
 * the same three things off a live editor engine and applies the frame. No
 * DOM and no React either way — the engine is a plain object.
 */

import { resolveAutoCrop } from "./auto_crop.js";
import { computeSaliencyMap, SALIENCY_ANALYSIS_MAX_EDGE } from "./saliency_map.js";
import { nodeAABB } from "./scene_geometry_bounds.js";
import { effectivePage, isHiddenByGroup } from "./scene_model.js";

/**
 * Longest edge of the mask grid handed to the engine. Cropping is a framing
 * decision, not a pixel one, so the mask only has to be fine enough that the
 * content edge lands within a fraction of a percent of the page.
 */
export const AUTO_CROP_GRID_MAX = 256;

function requirePage(page) {
  if (!page || typeof page !== "object") {
    throw new TypeError("autoCropRectForPage: page is required");
  }
  for (const field of ["x", "y", "width", "height"]) {
    if (typeof page[field] !== "number" || !Number.isFinite(page[field])) {
      throw new TypeError(`autoCropRectForPage: page.${field} must be a finite number`);
    }
  }
  if (page.width <= 0 || page.height <= 0) {
    throw new RangeError("autoCropRectForPage: page must have a positive size");
  }
}

function requireRatio(ratio) {
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0) {
    throw new RangeError("autoCropRectForPage: ratio must be a positive number");
  }
}

/**
 * Rasterises the content boxes into a grid mask of 255 inside them and 0
 * outside, or null when nothing on the page draws — an all-zero mask and no
 * mask both mean "no subject", and null says so without allocating.
 */
function buildMask(boxes, page, scale, gridWidth, gridHeight) {
  const usable = (boxes ?? []).filter(
    (box) =>
      box &&
      Number.isFinite(box.x) &&
      Number.isFinite(box.y) &&
      Number.isFinite(box.width) &&
      Number.isFinite(box.height) &&
      box.width > 0 &&
      box.height > 0,
  );
  if (usable.length === 0) return null;

  const mask = new Uint8Array(gridWidth * gridHeight);
  let filled = false;
  for (const box of usable) {
    const left = Math.max(0, Math.floor((box.x - page.x) / scale));
    const top = Math.max(0, Math.floor((box.y - page.y) / scale));
    const right = Math.min(gridWidth, Math.ceil((box.x + box.width - page.x) / scale));
    const bottom = Math.min(gridHeight, Math.ceil((box.y + box.height - page.y) / scale));
    if (right <= left || bottom <= top) continue;
    for (let y = top; y < bottom; y++) {
      mask.fill(255, y * gridWidth + left, y * gridWidth + right);
    }
    filled = true;
  }
  return filled ? mask : null;
}

/**
 * Nearest-neighbour resample of a supplied saliency map onto the engine's grid.
 *
 * The producer works in its own analysis resolution (`readImageRgba`'s capped
 * size); `resolveAutoCrop` only accepts weights at `gridWidth x gridHeight`.
 * The map is page-relative — when Smart Crop supplies one it comes from a
 * single image covering the whole page — so a plain linear resample is exact
 * enough for a framing decision. Returns null for any unusable map, which is
 * what keeps the no-saliency fallback intact.
 */
function resampleSaliency(saliency, gridWidth, gridHeight) {
  if (!saliency || typeof saliency !== "object") return null;
  const { weights, width, height } = saliency;
  if (!weights || typeof weights.length !== "number") return null;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return null;
  if (weights.length !== width * height) return null;

  let peak = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const value = weights[i];
    if (Number.isFinite(value) && value > peak) peak = value;
  }
  if (!(peak > 0)) return null;

  if (width === gridWidth && height === gridHeight) return weights;

  const resampled = new Float32Array(gridWidth * gridHeight);
  for (let y = 0; y < gridHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(((y + 0.5) * height) / gridHeight));
    const sourceRow = sourceY * width;
    const targetRow = y * gridWidth;
    for (let x = 0; x < gridWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(((x + 0.5) * width) / gridWidth));
      resampled[targetRow + x] = weights[sourceRow + sourceX];
    }
  }
  return resampled;
}

/**
 * The crop frame that keeps the page's content inside the requested ratio,
 * placed by the auto-crop engine's rule-of-thirds solve.
 *
 * @param {object} args
 * @param {{x: number, y: number, width: number, height: number}} args.page the visible page
 * @param {Array<{x: number, y: number, width: number, height: number}>} [args.boxes] content boxes, in document coordinates
 * @param {number} args.ratio target aspect ratio (width / height)
 * @param {number} [args.padding] fraction of the subject kept as breathing room
 * @param {{weights: ArrayLike<number>, width: number, height: number}} [args.saliency] page-relative importance map
 * @returns {{x: number, y: number, width: number, height: number, confidence: number, reason: string}}
 */
export function autoCropRectForPage({ page, boxes = [], ratio, padding, saliency } = {}) {
  requirePage(page);
  requireRatio(ratio);
  if (!Array.isArray(boxes)) {
    throw new TypeError("autoCropRectForPage: boxes must be an array");
  }

  const scale = Math.max(
    1,
    Math.ceil(Math.max(page.width, page.height) / AUTO_CROP_GRID_MAX),
  );
  const gridWidth = Math.max(1, Math.ceil(page.width / scale));
  const gridHeight = Math.max(1, Math.ceil(page.height / scale));

  // A real saliency map replaces the content-box mask. They describe the same
  // page from different ends: the box mask is a flat block where the page draws
  // (for a page-filling image, the whole page — a weight map that can only
  // centre), while saliency says where inside that block the subject is. When
  // no usable map survives, the box mask is exactly today's behaviour.
  const saliencyWeights = resampleSaliency(saliency, gridWidth, gridHeight);
  const mask = saliencyWeights ? null : buildMask(boxes, page, scale, gridWidth, gridHeight);

  const window = resolveAutoCrop({
    width: gridWidth,
    height: gridHeight,
    targetRatio: ratio,
    mask,
    saliency: saliencyWeights,
    ...(padding === undefined ? {} : { padding }),
  });

  // Back to document pixels, then clamped to the page: rounding the scaled
  // window can push it a fraction of a grid cell past the edge.
  const pageRight = page.x + page.width;
  const pageBottom = page.y + page.height;
  const x = Math.min(page.x + Math.round(window.x * scale), pageRight - 1);
  const y = Math.min(page.y + Math.round(window.y * scale), pageBottom - 1);
  const width = Math.max(1, Math.min(Math.round(window.width * scale), pageRight - x));
  const height = Math.max(1, Math.min(Math.round(window.height * scale), pageBottom - y));

  return {
    x,
    y,
    width,
    height,
    confidence: window.confidence,
    reason: window.reason,
  };
}

/** Nodes the renderer actually draws: visible, and not inside a hidden group. */
function visibleNodes(doc) {
  return (doc?.nodes ?? []).filter(
    (node) => node && node.visible !== false && !isHiddenByGroup(doc, node),
  );
}

/**
 * The boxes the page actually draws, in document coordinates.
 *
 * Visibility follows the renderer's rule (`visible !== false`, and nothing
 * inside a hidden group): a frame solved around a layer the user cannot see
 * would crop the picture to empty space. `nodeAABB` rather than the stored
 * rect, so a rotated or warped node is measured by what it covers.
 */
export function pageContentBoxes(doc) {
  return visibleNodes(doc).map((node) => nodeAABB(node));
}

/**
 * The single visible image that covers the whole page, or null.
 *
 * This is the only page shape where a pixel saliency map is meaningful: the
 * content-box mask degenerates to the page itself, so the box tells the engine
 * nothing above `resolveAutoCrop`'s ability to centre. Everything else —
 * several layers, a non-image layer, or an image smaller than the page — keeps
 * the box-mask path.
 */
export function pageCoveringImageNode(doc) {
  if (!doc || typeof doc !== "object") return null;
  const page = effectivePage(doc);
  if (!(page.width > 0) || !(page.height > 0)) return null;
  const nodes = visibleNodes(doc);
  if (nodes.length !== 1) return null;
  const node = nodes[0];
  if (!node || node.kind !== "image") return null;
  const box = nodeAABB(node);
  if (!(box.width > 0) || !(box.height > 0)) return null;
  const tolerance = Math.max(1, Math.max(page.width, page.height) * 0.001);
  const coversPage =
    box.x <= page.x + tolerance &&
    box.y <= page.y + tolerance &&
    box.x + box.width >= page.x + page.width - tolerance &&
    box.y + box.height >= page.y + page.height - tolerance;
  return coversPage ? node : null;
}

/**
 * Samples the page-covering image into a saliency map, or null.
 *
 * `readRgba` is injected by the bitmap adapter in `components/`
 * (`readImageRgba` over a real canvas); the editor zone never touches DOM
 * itself. Every failure — no covering image, no decoded bitmap, a throw from
 * the adapter, a producer that returns null — collapses to null, which is what
 * keeps Smart Crop's pre-saliency fallback byte-for-byte intact.
 */
function readPageSaliency(engine, doc, readRgba) {
  if (typeof readRgba !== "function") return null;
  const node = pageCoveringImageNode(doc);
  if (!node) return null;
  const bitmap = engine.getNodeBitmap?.(node) ?? null;
  if (!bitmap) return null;
  try {
    const { rgba, width, height } = readRgba(bitmap, { maxEdge: SALIENCY_ANALYSIS_MAX_EDGE });
    return computeSaliencyMap({ rgba, width, height });
  } catch {
    return null;
  }
}

/**
 * Smart crop against a live editor engine — what the crop panel's Smart button
 * runs.
 *
 * Reads the visible page, the boxes the page draws and the ratio the panel has
 * selected off the engine, solves the frame, and applies it with
 * `engine.setCropRect()` (which keeps the ratio and clamps to the page). The
 * panel's own refusal is the disabled button at no ratio (see
 * `editor.crop.smartNeedsRatio`); everything here throws instead of returning
 * quietly, because a Smart button that silently does nothing is exactly how
 * this feature shipped unwired once already.
 *
 * When the page is one image covering it and `options.readRgba` can sample
 * that image, the solve is driven by pixel saliency; otherwise (no adapter, no
 * bitmap, or a signal-less image) it is driven by the content-box mask, exactly
 * as before.
 *
 * @param {object} engine the page's editor engine
 * @param {{readRgba?: (bitmap: object, options: {maxEdge: number}) => {rgba: ArrayLike<number>, width: number, height: number}}} [options]
 * @returns {{x: number, y: number, width: number, height: number, confidence: number, reason: string}}
 */
export function applySmartCrop(engine, options = {}) {
  if (!engine || typeof engine.setCropRect !== "function") {
    throw new TypeError("applySmartCrop: an editor engine is required");
  }
  const doc = engine.getDocument?.();
  if (!doc) throw new Error("applySmartCrop: the engine has no document");
  const ratio = engine.getCropRatio?.();
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0) {
    throw new Error("applySmartCrop: a fixed crop ratio is required");
  }

  const saliency = readPageSaliency(engine, doc, options.readRgba);
  const rect = autoCropRectForPage({
    page: effectivePage(doc),
    boxes: pageContentBoxes(doc),
    ratio,
    ...(saliency ? { saliency } : {}),
  });
  engine.setCropRect(rect);
  return rect;
}
