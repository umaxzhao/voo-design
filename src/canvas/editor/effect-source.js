import { isImagePaint } from "./render-paint-style.js";
import { clippingResources } from "./clipping-chain-cache.js";
import { bitmapContentVersion } from "./cpu_adjustments_matte.js";
import { getFontResourceVersion } from "./font_loader.js";

const STATIC_KINDS = new Set(["rect", "ellipse", "path", "group"]);
const resourceIds = new WeakMap();
let nextResourceId = 1;
const isOpaquePaint = paint => !paint || typeof paint !== "object" ||
  paint.fill != null && typeof paint.fill === "object" ||
  paint.stroke != null && typeof paint.stroke === "object";

function hasExternalPaint(paints) {
  if (paints == null) return false;
  if (!Array.isArray(paints)) return true;
  return paints.some(paint => isOpaquePaint(paint) ||
    paint.imageId || isImagePaint(paint.fill) || isImagePaint(paint.stroke));
}

/** Only resource-independent silhouettes may survive an unrelated render generation. */
export function isStaticEffectSource(node) {
  return STATIC_KINDS.has(node.kind) && !node.imageId && !node.src && !node.maskId &&
    !(typeof node.fill === "object" && node.fill !== null) &&
    !(typeof node.stroke === "object" && node.stroke !== null) &&
    !isImagePaint(node.fill) && !isImagePaint(node.stroke) &&
    !hasExternalPaint(node.fills) && !hasExternalPaint(node.strokes);
}

function resourceToken(value) {
  if (value === null || typeof value !== "object" && typeof value !== "function") {
    return `${typeof value}:${value}`;
  }
  let id = resourceIds.get(value);
  if (!id) { id = nextResourceId++; resourceIds.set(value, id); }
  // Store identity numbers, never decoded resources, in the retained key.
  return `resource:${id}:${bitmapContentVersion(value)}:${value.naturalWidth ?? value.width ?? ""}x${value.naturalHeight ?? value.height ?? ""}`;
}

/** Resource changes invalidate effects; selection and unrelated document edits do not. */
export function effectSourceGeneration(node, bitmapOf, maskOf, renderer = null) {
  if (isStaticEffectSource(node)) return "static";
  if (!STATIC_KINDS.has(node.kind) && node.kind !== "image" && node.kind !== "text") return null;
  if ((node.fill && typeof node.fill === "object") || (node.stroke && typeof node.stroke === "object")) return null;
  for (const paints of [node.fills, node.strokes]) {
    if (paints != null && (!Array.isArray(paints) || paints.some(isOpaquePaint))) return null;
  }
  // Image strokes have no common source resolver yet; retry instead of
  // assigning them an incomplete resource key.
  if (isImagePaint(node.stroke) || (node.strokes ?? []).some(paint =>
    paint.imageId || isImagePaint(paint.stroke) || isImagePaint(paint.fill))) return null;
  const resources = clippingResources([node], bitmapOf, maskOf);
  if (!resources) return null;
  resources.push(renderer);
  if (node.kind === "text") {
    const fonts = typeof document === "undefined" ? null : document.fonts;
    resources.push(getFontResourceVersion(), fonts?.size ?? 0, fonts?.status ?? "unavailable");
  }
  return resources.map(resourceToken).join("|");
}
