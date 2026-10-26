// Seam: Text nodes, text styling, and visual effect normalization.
/* eslint-disable no-unused-vars */
import {
  REGION_PALETTE,
  REGION_COLOR,
  getRegionColor,
  MIN_REGION_SIZE,
  LEGACY_DOC_VERSION,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  LINE_HEIGHT_RATIO,
  TEXT_FONT_WEIGHTS,
  TEXT_ALIGNS,
  DEFAULT_TEXT_STYLE,
  MIN_DOC_SIZE,
  BLEND_MODES,
  normalizeBlendMode,
  MAX_SHEAR_DEG,
  normalizeCornerRadius,
  normalizeRotationDeg,
  normalizeNodeTransform,
  hasBlendModes,
  DEFAULT_ADJUSTMENTS,
  isDefaultAdjustments,
  deepEqual,
  normalizePoints,
  parseAdjustmentValue,
  HUE_BAND_KEYS,
  normalizeHueSatBands,
  DOC_VERSION,
  NODE_KIND,
  DEFAULT_BLEND_MODE,
  newId,
  createDefaultAdjustments,
  getBaseDefaults,
  createDocument,
  createImageNode,
  TEXT_LETTER_SPACING_BOUNDS,
  TEXT_LINE_HEIGHT_BOUNDS,
} from "./scene_model_core.js";
import { normalizeAdjustments } from "./scene_model_adjustments.js";
import {
  normalizeGradientStops,
  normalizeMixerRow,
  normalizeInkRow,
  normalizeColorBalanceZone,
  normalizeHexColor,
  BASE_DEFAULTS,
  DEFAULT_PAGE_BACKGROUND,
  effectivePage,
} from "./scene_model_geometry.js";
import {
  createAdjustmentNode,
  isAdjustmentNode,
  createRectNode,
  createEllipseNode,
  BOOLEAN_OPERATIONS,
  BOOLEAN_SOURCE_KINDS,
  canCombine,
  booleanSourceOf,
  syncBooleanNode,
  createBooleanNode,
  DEFAULT_BRUSH_HARDNESS,
  DEFAULT_SOFT_BRUSH_HARDNESS,
  normalizePathHardness,
} from "./scene_model_node_builders.js";
import { createPathNode, pathBounds, normalisePenAnchor, cubicExtrema1D, penAnchorsBounds, createPenNode } from "./scene_model_paths.js";

/**
 * A text node.
 *
 * `width`/`height` are measured from the glyphs by the renderer, which owns the
 * only font metrics available; they are stored so hit-testing and the layers
 * panel work before the first paint.
 */
/* eslint-enable no-unused-vars */
export function createTextNode({ x, y, text, fill, fontSize }) {
  return {
    ...BASE_DEFAULTS,
    id: newId(),
    kind: NODE_KIND.TEXT,
    x,
    y,
    width: 0,
    height: 0,
    // A fixed text-box width in document units; 0 means the box auto-sizes to
    // the widest line (the long-standing behaviour). When set, the renderer
    // wraps text to fit, Figma-style.
    boxWidth: 0,
    text,
    fill,
    fontSize: fontSize ?? DEFAULT_FONT_SIZE,
    fontFamily: DEFAULT_FONT_FAMILY,
    ...DEFAULT_TEXT_STYLE,
  };
}

export function normalizeColourOrNull(value) {
  return typeof value === "string" && value ? value : null;
}

/**
 * A text shadow: `{ enabled, color, blur, offsetX, offsetY }`, or null.
 *
 * The whole object is null when the feature is off so a serialised node stays
 * small and the renderer has a single falsy check.
 */
export function normalizeTextShadow(value) {
  if (!value || typeof value !== "object") return null;
  return {
    enabled: Boolean(value.enabled),
    color: normalizeColourOrNull(value.color) ?? "#000000",
    blur: parseAdjustmentValue(value.blur, 0, 100, 8),
    offsetX: parseAdjustmentValue(value.offsetX, -200, 200, 4),
    offsetY: parseAdjustmentValue(value.offsetY, -200, 200, 4),
  };
}

/**
 * A node's drop shadow: `{ enabled, color, blur, offsetX, offsetY, opacity }`,
 * or null. Fields follow the text shadow's conventions so the same render
 * path serves both; opacity (0-100) scales the shadow's alpha on top of the
 * colour's own alpha.
 */
export function normalizeDropShadow(value) {
  if (!value || typeof value !== "object") return null;
  return {
    enabled: Boolean(value.enabled),
    color: normalizeColourOrNull(value.color) ?? "#000000",
    blur: parseAdjustmentValue(value.blur, 0, 100, 8),
    offsetX: parseAdjustmentValue(value.offsetX, -200, 200, 4),
    offsetY: parseAdjustmentValue(value.offsetY, -200, 200, 4),
    spread: parseAdjustmentValue(value.spread, 0, 100, 0),
    opacity: parseAdjustmentValue(value.opacity, 0, 100, 80),
  };
}

/**
 * A node's outer glow: `{ enabled, color, blur, spread, opacity }`, or null.
 * Blur is the softness of the halo, spread how far it pushes out beyond the
 * shape's own edge.
 */
export function normalizeOuterGlow(value) {
  if (!value || typeof value !== "object") return null;
  return {
    enabled: Boolean(value.enabled),
    color: normalizeColourOrNull(value.color) ?? "#ffd166",
    blur: parseAdjustmentValue(value.blur, 0, 100, 12),
    spread: parseAdjustmentValue(value.spread, 0, 100, 0),
    opacity: parseAdjustmentValue(value.opacity, 0, 100, 100),
  };
}

/**
 * A node's bevel/emboss: `{ enabled, depth, size, angle, softness }`, or null.
 * Depth (0-100) is the highlight/shadows' strength, size the extent of the
 * rim in px, angle the light direction in degrees (0 = light from above),
 * softness how much the rim edges blend out.
 */
export function normalizeBevel(value) {
  if (!value || typeof value !== "object") return null;
  return {
    enabled: Boolean(value.enabled),
    depth: parseAdjustmentValue(value.depth, 0, 100, 60),
    size: parseAdjustmentValue(value.size, 0, 200, 8),
    angle: parseAdjustmentValue(value.angle, 0, 360, 135),
    softness: parseAdjustmentValue(value.softness, 0, 100, 30),
  };
}

/**
 * Figma-style Texture: a coloured two-tone grain overlay. It reuses the same
 * seeded grain tile as Noise, but with a tint, density and scale of its own.
 */
export function normalizeTexture(value) {
  if (!value || typeof value !== "object") return null;
  return {
    enabled: Boolean(value.enabled),
    color: normalizeColourOrNull(value.color) ?? "#808080",
    secondaryColor: normalizeColourOrNull(value.secondaryColor) ?? null,
    opacity: parseAdjustmentValue(value.opacity, 0, 1, 0.18),
    density: parseAdjustmentValue(value.density, 0, 1, 0.5),
    size: parseAdjustmentValue(value.size, 1, 12, 2),
    seed: Math.round(parseAdjustmentValue(value.seed, 0, 9999, 1)),
    blendMode: typeof value.blendMode === "string" ? value.blendMode : "overlay",
  };
}

/**
 * Figma-style glass: blur what is behind the layer, tint it and add a light
 * edge. `{ enabled, blur, tint, opacity, highlight, angle }`, or null.
 */
export function normalizeGlass(value) {
  if (!value || typeof value !== "object") return null;
  return {
    enabled: Boolean(value.enabled),
    blur: parseAdjustmentValue(value.blur, 0, 100, 20),
    tint: normalizeColourOrNull(value.tint) ?? "#ffffff",
    opacity: parseAdjustmentValue(value.opacity, 0, 100, 25),
    highlight: parseAdjustmentValue(value.highlight, 0, 100, 40),
    angle: parseAdjustmentValue(value.angle, 0, 360, 135),
  };
}

/**
 * A node's colour overlay (Photoshop's solid fill): `{ enabled, color,
 * opacity }`, or null. The color paints over the node's own pixels where
 * they have alpha — the body keeps its shape and is re-coloured.
 */
export function normalizeFill(value) {
  if (!value || typeof value !== "object") return null;
  return {
    enabled: Boolean(value.enabled),
    color: normalizeColourOrNull(value.color) ?? "#000000",
    opacity: parseAdjustmentValue(value.opacity, 0, 100, 100),
  };
}

/**
 * A node's stroke outline: `{ enabled, color, width, position, opacity }`,
 * or null. Position is inside / center / outside the silhouette edge.
 */
export function normalizeStroke(value) {
  if (!value || typeof value !== "object") return null;
  return {
    enabled: Boolean(value.enabled),
    color: normalizeColourOrNull(value.color) ?? "#000000",
    width: parseAdjustmentValue(value.width, 0, 100, 2),
    position: ["inside", "center", "outside"].includes(value.position) ? value.position : "center",
    opacity: parseAdjustmentValue(value.opacity, 0, 100, 100),
  };
}

/**
 * A node's inner shadow: `{ enabled, color, blur, offsetX, offsetY, opacity }`,
 * or null — the shadow cast inside the silhouette edge.
 */
export function normalizeInnerShadow(value) {
  if (!value || typeof value !== "object") return null;
  return {
    enabled: Boolean(value.enabled),
    color: normalizeColourOrNull(value.color) ?? "#000000",
    blur: parseAdjustmentValue(value.blur, 0, 100, 8),
    offsetX: parseAdjustmentValue(value.offsetX, -200, 200, 0),
    offsetY: parseAdjustmentValue(value.offsetY, -200, 200, 0),
    spread: parseAdjustmentValue(value.spread, 0, 100, 0),
    opacity: parseAdjustmentValue(value.opacity, 0, 100, 75),
  };
}

/**
 * A node's inner glow: `{ enabled, color, blur, size, opacity }`, or null —
 * a soft halo hugging the inside of the silhouette edge. Size is how far the
 * glow extends inward.
 */
export function normalizeInnerGlow(value) {
  if (!value || typeof value !== "object") return null;
  return {
    enabled: Boolean(value.enabled),
    color: normalizeColourOrNull(value.color) ?? "#ffd166",
    blur: parseAdjustmentValue(value.blur, 0, 100, 12),
    size: parseAdjustmentValue(value.size, 0, 100, 0),
    opacity: parseAdjustmentValue(value.opacity, 0, 100, 100),
  };
}

/**
 * A node's satin: `{ enabled, color, blur, distance, angle, invert, opacity }`,
 * or null — the sheen ripple Photoshop draws inside the silhouette.
 */
export function normalizeSatin(value) {
  if (!value || typeof value !== "object") return null;
  return {
    enabled: Boolean(value.enabled),
    color: normalizeColourOrNull(value.color) ?? "#000000",
    blur: parseAdjustmentValue(value.blur, 0, 100, 8),
    distance: parseAdjustmentValue(value.distance, 0, 100, 5),
    angle: parseAdjustmentValue(value.angle, 0, 360, 120),
    invert: Boolean(value.invert),
    opacity: parseAdjustmentValue(value.opacity, 0, 100, 75),
  };
}

/**
 * A node's gradient overlay: `{ enabled, stops, angle, opacity }`, or null —
 * a linear gradient painted over the body through its alpha, at an angle
 * (0° = gradient running upward). Stops share the gradient-map shape.
 */
export function normalizeGradientOverlay(value) {
  if (!value || typeof value !== "object") return null;
  const stops = normalizeGradientStops(value.stops, [
    { color: "#000000", location: 0 },
    { color: "#ffffff", location: 1 },
  ]);
  return {
    enabled: Boolean(value.enabled),
    stops,
    angle: parseAdjustmentValue(value.angle, 0, 360, 90),
    opacity: parseAdjustmentValue(value.opacity, 0, 100, 100),
  };
}

/**
 * A node's effect set: `{ shadow, glow, innerShadow, innerGlow, satin, bevel,
 * fill, gradientOverlay, stroke }`, or null when nothing is enabled. Each
 * effect is an object or null, mirroring how text shadow stores a single
 * effect — a serialised node stays small when effects are off.
 */
export function normalizeEffects(value) {
  if (!value || typeof value !== "object") return null;
  const shadow = normalizeDropShadow(value.shadow);
  const glow = normalizeOuterGlow(value.glow);
  const innerShadow = normalizeInnerShadow(value.innerShadow);
  const innerGlow = normalizeInnerGlow(value.innerGlow);
  const satin = normalizeSatin(value.satin);
  const bevel = normalizeBevel(value.bevel);
  const glass = normalizeGlass(value.glass);
  const texture = normalizeTexture(value.texture);
  const fill = normalizeFill(value.fill);
  const gradientOverlay = normalizeGradientOverlay(value.gradientOverlay);
  const stroke = normalizeStroke(value.stroke);
  if (!shadow && !glow && !innerShadow && !innerGlow && !satin && !bevel && !glass && !texture && !fill && !gradientOverlay && !stroke) return null;
  const effects = {};
  if (shadow) effects.shadow = shadow;
  if (glow) effects.glow = glow;
  if (innerShadow) effects.innerShadow = innerShadow;
  if (innerGlow) effects.innerGlow = innerGlow;
  if (satin) effects.satin = satin;
  if (bevel) effects.bevel = bevel;
  if (glass) effects.glass = glass;
  if (texture) effects.texture = texture;
  if (fill) effects.fill = fill;
  if (gradientOverlay) effects.gradientOverlay = gradientOverlay;
  if (stroke) effects.stroke = stroke;
  return effects;
}

/** Text-case values the renderer understands; anything else reads as typed. */
const TEXT_CASES = Object.freeze(["original", "upper", "lower", "title"]);

/** Path-text geometry is user data, but its scalar controls are bounded here. */
function normalizeTextPath(value) {
  if (!value || typeof value !== "object") return null;
  return {
    ...value,
    startOffset: parseAdjustmentValue(value.startOffset, -500, 2000, 0),
    side: value.side === "bottom" ? "bottom" : "top",
    reverse: Boolean(value.reverse),
  };
}

/**
 * Reads a text node's additive styling fields, replacing anything missing or
 * unrecognised with the defaults. Old documents have none of these fields and
 * must come out exactly at DEFAULT_TEXT_STYLE.
 *
 * Weight is stored as a string (the panel's option values); older documents and
 * the text-tool panel wrote numbers, so coerce before checking the whitelist.
 */
export function normalizeTextStyle(node) {
  const fontWeight = String(node.fontWeight ?? "");
  return {
    fontWeight: TEXT_FONT_WEIGHTS.includes(fontWeight) ? fontWeight : DEFAULT_TEXT_STYLE.fontWeight,
    italic: Boolean(node.italic ?? DEFAULT_TEXT_STYLE.italic),
    underline: Boolean(node.underline ?? DEFAULT_TEXT_STYLE.underline),
    align: TEXT_ALIGNS.includes(node.align) ? node.align : DEFAULT_TEXT_STYLE.align,
    direction: node.direction === "vertical" ? "vertical" : DEFAULT_TEXT_STYLE.direction,
    letterSpacing: parseAdjustmentValue(node.letterSpacing, TEXT_LETTER_SPACING_BOUNDS.min, TEXT_LETTER_SPACING_BOUNDS.max, DEFAULT_TEXT_STYLE.letterSpacing),
    lineHeight: parseAdjustmentValue(node.lineHeight, TEXT_LINE_HEIGHT_BOUNDS.min, TEXT_LINE_HEIGHT_BOUNDS.max, DEFAULT_TEXT_STYLE.lineHeight),
    baselineShift: parseAdjustmentValue(node.baselineShift, -100, 100, DEFAULT_TEXT_STYLE.baselineShift),
    boxWidth: parseAdjustmentValue(node.boxWidth, 0, 8192, 0),
    textCase: TEXT_CASES.includes(node.textCase) ? node.textCase : "original",
    paragraphSpacing: parseAdjustmentValue(node.paragraphSpacing, 0, 200, DEFAULT_TEXT_STYLE.paragraphSpacing),
    textPath: normalizeTextPath(node.textPath),
    stroke: normalizeColourOrNull(node.stroke),
    strokeWidth: parseAdjustmentValue(node.strokeWidth, 0, 40, DEFAULT_TEXT_STYLE.strokeWidth),
    shadow: normalizeTextShadow(node.shadow),
    highlight: normalizeColourOrNull(node.highlight),
  };
}
