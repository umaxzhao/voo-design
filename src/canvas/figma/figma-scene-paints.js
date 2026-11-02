import { figmaObject as asObject, figmaArray as asArray, figmaNumber as asNumber, figmaHashHex as hashHex } from "./figma-value.js";
import { imageBytesToDataUrl } from "./fig-file.js";
import { formatGradient } from "../color_picker/gradient_fill.js";
import { blendModeOf } from "./figma-effects.js";
import { figmaImagePaint } from "./figma-image-paint.js";
function channelHex(unit) {
  const clamped = Math.min(1, Math.max(0, unit));
  return Math.round(clamped * 255).toString(16).padStart(2, "0");
}

/** A CANVAS record's page background as opaque hex, or null when it has none. */
export function canvasBackgroundHex(raw) {
  const color = asObject(raw?.backgroundColor);
  if (!color) return null;
  return `#${channelHex(asNumber(color.r))}${channelHex(asNumber(color.g))}${channelHex(asNumber(color.b))}`;
}
/** First visible solid paint as `#rrggbb` (or `#rrggbbaa` when translucent). */
export function solidPaintHex(paints) {
  for (const entry of asArray(paints)) {
    const paint = asObject(entry);
    if (!paint || paint.visible === false || paint.type !== "SOLID") continue;
    const color = asObject(paint.color);
    if (!color) continue;
    const alpha = asNumber(color.a, 1) * asNumber(paint.opacity, 1);
    const rgb = `#${channelHex(asNumber(color.r))}${channelHex(asNumber(color.g))}${channelHex(asNumber(color.b))}`;
    return alpha >= 0.999 ? rgb : `${rgb}${channelHex(alpha)}`;
  }
  return null;
}

/** Figma gradient paint types the editor can draw, mapped to the editor gradient kind. */
const GRADIENT_KINDS = Object.freeze({
  GRADIENT_LINEAR: "linear",
  GRADIENT_RADIAL: "radial",
  GRADIENT_ANGULAR: "angular",
  GRADIENT_DIAMOND: "diamond",
});

/** Converts one gradient stop; stops without a colour are dropped. */
function gradientStopOf(stop) {
  const color = asObject(stop?.color);
  if (!color) return null;
  const rgb = `#${channelHex(asNumber(color.r))}${channelHex(asNumber(color.g))}${channelHex(asNumber(color.b))}`;
  return {
    color: rgb,
    opacity: asNumber(color.a, 1) * 100,
    position: asNumber(stop.position) * 100,
  };
}

/**
 * The editor CSS gradient for the first visible gradient paint, or null.
 *
 * Figma places a gradient with a transform from its unit space to the node box;
 * the gradient axis runs from (0, 0.5) to (1, 0.5) in that space. Linear
 * gradients keep that axis as their start and end points (percent of the box),
 * so the editor draws the same direction the designer set.
 */
export function gradientPaintFill(paints) {
  for (const entry of asArray(paints)) {
    const paint = asObject(entry);
    if (!paint || paint.visible === false) continue;
    const kind = GRADIENT_KINDS[paint.type];
    if (!kind) continue;
    // Decoded paints carry the stops as `stops`; older exports name them `gradientStops`.
    const stops = asArray(paint.stops ?? paint.gradientStops).map(gradientStopOf).filter(Boolean);
    if (stops.length < 2) continue;
    const matrix = asObject(paint.transform) ?? {};
    const m = (key, fallback) => asNumber(matrix[key], fallback);
    if (kind === "linear") {
      const geometry = {
        centerX: 50,
        centerY: 50,
        startX: (m("m02", 0) + m("m01", 0) * 0.5) * 100,
        startY: (m("m12", 0) + m("m11", 1) * 0.5) * 100,
        endX: (m("m00", 1) + m("m01", 0) * 0.5 + m("m02", 0)) * 100,
        endY: (m("m10", 0) + m("m11", 1) * 0.5 + m("m12", 0)) * 100,
      };
      return formatGradient("linear", "90deg", stops, geometry);
    }
    const geometry = {
      centerX: (m("m02", 0) + (m("m00", 1) + m("m01", 0)) / 2) * 100,
      centerY: (m("m12", 0) + (m("m10", 0) + m("m11", 1)) / 2) * 100,
      width: 100,
      height: 100,
    };
    return formatGradient(kind, "0deg", stops, geometry);
  }
  return null;
}

/** The first visible image paint, if any. */
export function imagePaint(paints) {
  for (const entry of asArray(paints)) {
    const paint = asObject(entry);
    if (paint && paint.visible !== false && paint.type === "IMAGE") return paint;
  }
  return null;
}
/** Keep paints on their owning node, in Figma's bottom-to-top order. */
export function fillPaintsOf(raw, ctx) {
  return asArray(raw.fillPaints).map((paint) => {
    if (!asObject(paint)) return null;
    let fill = solidPaintHex([{ ...paint, visible: true, opacity: 1 }])
      ?? gradientPaintFill([{ ...paint, visible: true }]);
    let imageId;
    if (paint.type === "IMAGE") {
      const hash = hashHex(asObject(paint.image)?.hash);
      const bytes = hash && ctx.images.get(hash);
      if (!hash || !ctx.imageHashes.has(hash)) return null;
      imageId = `img-${hash}`;
      if (ctx.externalAssets) fill = "transparent";
      else {
        if (!bytes) return null;
        ctx.assets[imageId] = imageBytesToDataUrl(bytes);
        fill = ctx.assets[imageId];
      }
    }
    if (!fill) return null;
    return { fill, ...(imageId ? { imageId, ...figmaImagePaint(paint) } : {}), opacity: asNumber(paint.opacity, 1),
      visible: paint.visible !== false, blendMode: blendModeOf(paint) };
  }).filter(Boolean);
}
