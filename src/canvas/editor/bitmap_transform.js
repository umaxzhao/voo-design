/**
 * Baking 90° rotations and mirrors into bitmap pixels.
 *
 * Rotating or flipping an image node rewrites its source bitmap rather than
 * transforming it at render time — a render-time transform would ripple
 * through hit-testing, snapping, matte coordinate mapping and export. The
 * bitmap path (engine) and the matte path (mask tools) both render through
 * `renderTransformed`, so the two can never drift apart. Everything here is
 * pure canvas math and unit-testable with a fake 2d context.
 */

export const TRANSFORM_KINDS = ["rotate90", "rotate270", "flipH", "flipV"];

/** The output dimensions: rotations swap the axes, mirrors keep them. */
export function transformedSize(kind, width, height) {
  if (kind === "rotate90" || kind === "rotate270") {
    return { width: height, height: width };
  }
  if (kind === "flipH" || kind === "flipV") return { width, height };
  throw new Error(`Unknown bitmap transform: ${kind}`);
}

/**
 * Moves a 2d context so that drawing the source at (0, 0) lands transformed
 * inside a canvas sized by `transformedSize`.
 */
export function applyTransform(ctx, kind, width, height) {
  switch (kind) {
    case "rotate90":
      ctx.translate(height, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case "rotate270":
      ctx.translate(0, width);
      ctx.rotate(-Math.PI / 2);
      break;
    case "flipH":
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      break;
    case "flipV":
      ctx.translate(0, height);
      ctx.scale(1, -1);
      break;
    default:
      throw new Error(`Unknown bitmap transform: ${kind}`);
  }
}

/**
 * Renders `source` (a bitmap, image or canvas) transformed into a fresh
 * canvas sized to the result. `createCanvas` is injectable so tests can run
 * without a DOM.
 */
export function renderTransformed(
  source,
  kind,
  createCanvas = () => document.createElement("canvas"),
) {
  const width = source.naturalWidth ?? source.width;
  const height = source.naturalHeight ?? source.height;
  const size = transformedSize(kind, width, height);
  const canvas = createCanvas();
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  ctx.save();
  applyTransform(ctx, kind, width, height);
  ctx.drawImage(source, 0, 0);
  ctx.restore();
  return canvas;
}

/**
 * Transforms an image crop rectangle when its backing bitmap is transformed.
 *
 * @param {{x: number, y: number, width: number, height: number}} crop
 * @param {"rotate90" | "rotate270" | "flipH" | "flipV"} kind
 * @param {number} width - Source bitmap width before transform
 * @param {number} height - Source bitmap height before transform
 */
export function transformCropRect(crop, kind, width, height) {
  if (!crop) return null;
  const cw = crop.width;
  const ch = crop.height;
  let next;
  switch (kind) {
    case "flipH":
      next = { x: width - (crop.x + cw), y: crop.y, width: cw, height: ch };
      break;
    case "flipV":
      next = { x: crop.x, y: height - (crop.y + ch), width: cw, height: ch };
      break;
    case "rotate90":
      next = { x: height - (crop.y + ch), y: crop.x, width: ch, height: cw };
      break;
    case "rotate270":
      next = { x: crop.y, y: width - (crop.x + cw), width: ch, height: cw };
      break;
    default:
      throw new Error(`Unknown bitmap transform: ${kind}`);
  }
  return {
    x: Math.round(next.x),
    y: Math.round(next.y),
    width: Math.round(next.width),
    height: Math.round(next.height),
  };
}
