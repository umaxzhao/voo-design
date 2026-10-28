/**
 * Base element generation, fill formatting, gradients, and stroke styles for Skia adapter.
 */

import { isLockedByGroup } from "./scene_model_groups.js";
import { isCssGradient, parseGradient } from "../color_picker/gradient_fill.js";

/**
 * A CSS gradient string as the scene gradient the renderer paints.
 *
 * A gradient lives in `fill` as the CSS string the colour picker writes, and
 * `parseGradient` is the one parser that reads it — the same one the picker
 * and the 2D renderer use. Three parsers for one format is how a gradient
 * ends up looking different in the picker, on the canvas and in an export.
 *
 * The parser already speaks the renderer's units: geometry as a percentage of
 * the box, stop position and opacity as 0..100. Only the angle needs work,
 * because it arrives as a CSS string like "135deg".
 */
export function toSceneGradient(parsed) {
  const geometry = parsed.geometry ?? {};
  return {
    type: parsed.type,
    angle: parseFloat(parsed.angle) || 0,
    centerX: geometry.centerX ?? 50,
    centerY: geometry.centerY ?? 50,
    width: geometry.width ?? 100,
    height: geometry.height ?? 100,
    // A gradient edited on the canvas carries its direction line; the Skia
    // painter draws linear gradients from these when present, exactly like
    // the 2D path.
    ...(geometry.startX !== undefined
      ? {
          startX: geometry.startX,
          startY: geometry.startY,
          endX: geometry.endX,
          endY: geometry.endY,
        }
      : {}),
    stops: (parsed.stops ?? []).map((stop) => ({
      color: stop.color,
      opacity: stop.opacity ?? 100,
      position:
        stop.position ?? (stop.location != null ? stop.location * 100 : 0),
    })),
  };
}

/**
 * Scene elements paint in array order, and our documents are already stored
 * bottom-first, so the index is the depth.
 */
export function baseOf(node, index, offsetX, offsetY, doc) {
  return {
    id: node.id,
    parentId: null,
    bounds: {
      x: (node.x ?? 0) + offsetX,
      y: (node.y ?? 0) + offsetY,
      width: node.width ?? 0,
      height: node.height ?? 0,
    },
    visible: node.visible !== false,
    opacity: node.opacity ?? 1,
    rotation: node.rotation ?? 0,
    flipX: Boolean(node.flipH),
    flipY: Boolean(node.flipV),
    zIndex: index + 1,
    // A folder's lock reaches everything inside it, so a node in a locked
    // folder has to read as locked here too — the flag is what the renderer
    // uses to refuse an interaction, and reporting it free would let a locked
    // node be dragged.
    locked: Boolean(node.locked) || (doc ? isLockedByGroup(doc, node) : false),
    ...(toSkiaBlendMode(node.blendMode)
      ? { blendMode: toSkiaBlendMode(node.blendMode) }
      : {}),
  };
}

/**
 * Maps a document blendMode to the subset supported by the canvas-core Skia painter.
 *
 * Supported in canvas-core: standard CSS blend modes plus "plus-lighter" and "plus-darker"
 * (which uses a custom linear-burn SkSL blender). "linear-dodge" maps to "plus-lighter",
 * and "linear-burn" maps to "plus-darker".
 * PSD-only per-pixel modes (dissolve, vivid-light, linear-light, pin-light, hard-mix,
 * subtract, divide) have no Skia painter equivalent; they are omitted so the document keeps
 * rendering with default composite mode instead of passing an unknown mode to CanvasKit.
 */
const SKIA_SUPPORTED_BLEND_MODES = {
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  "color-dodge": "color-dodge",
  "color-burn": "color-burn",
  "hard-light": "hard-light",
  "soft-light": "soft-light",
  difference: "difference",
  exclusion: "exclusion",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
  "plus-lighter": "plus-lighter",
  "plus-darker": "plus-darker",
  "linear-dodge": "plus-lighter",
  "linear-burn": "plus-darker",
};

export function toSkiaBlendMode(blendMode) {
  if (!blendMode || blendMode === "source-over" || blendMode === "normal") {
    return undefined;
  }
  return SKIA_SUPPORTED_BLEND_MODES[blendMode];
}

/**
 * The fills for a node that paints a filled box — a rect or an ellipse.
 *
 * A gradient wins over the colour when the node carries one; the colour stays
 * underneath so removing the gradient restores it. `transparent` is not a
 * colour the renderer needs to paint, it is the absence of a fill.
 */
export function fillsOf(node) {
  const fill = node.fill;
  if (!fill || fill === "transparent") return undefined;
  const fillOpacity = node.fillOpacity ?? 1;
  if (isCssGradient(fill)) {
    const parsed = toSceneGradient(parseGradient(fill));
    // Two stops are the least that makes a ramp; anything less is a colour
    // the parser could not read, and painting it as one would be a guess.
    if (parsed.stops.length >= 2) {
      return [{ color: parsed.stops[0].color, opacity: fillOpacity, gradient: parsed }];
    }
    return undefined;
  }
  return [{ color: fill, opacity: fillOpacity }];
}

export function strokeOf(node) {
  if (!node.stroke) return undefined;
  const strokeAlign =
    node.strokeAlign ??
    (node.kind === "rect" || node.kind === "ellipse" ? "inside" : undefined);
  return {
    color: node.stroke,
    opacity: node.strokeOpacity ?? node.opacity ?? 1,
    width: node.strokeWidth ?? 1,
    ...(strokeAlign ? { align: strokeAlign } : {}),
  };
}
