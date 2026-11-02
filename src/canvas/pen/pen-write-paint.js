import { isCssGradient, parseGradient } from "../color_picker/gradient_fill.js";
import { normalizeStrokeProps } from "../editor/stroke_style.js";
import { BLEND_MODES } from "./pen_to_voo.js";
import { UNWRITABLE_GRADIENTS } from "./pen-write-contract.js";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const ANGLE_DIRECTIONS = Object.freeze({
  "to top": 0,
  "to top right": 45,
  "to right top": 45,
  "to right": 90,
  "to bottom right": 135,
  "to right bottom": 135,
  "to bottom": 180,
  "to bottom left": 225,
  "to left bottom": 225,
  "to left": 270,
  "to top left": 315,
  "to left top": 315,
});

/** The editor's blend names -> Pen's, derived from the importer's table. */
const PEN_BLEND_MODES = Object.freeze(
  Object.fromEntries(Object.entries(BLEND_MODES).map(([pen, voo]) => [voo, pen])),
);

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
export const round = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

/** `#RRGGBB` plus a 0-100 opacity as `#RRGGBBAA`; Pen stores fill alpha in the hex. */
function withAlpha(color, opacityPercent = 100) {
  if (typeof color !== "string" || !HEX_COLOR.test(color)) return color;
  const hex = color.slice(1);
  const base =
    hex.length === 3
      ? hex
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : hex.slice(0, 6);
  const existingAlpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  const alpha = Math.round(
    Math.max(0, Math.min(1, existingAlpha * (opacityPercent / 100))) * 255,
  );
  if (alpha >= 255) return `#${base.toUpperCase()}`;
  return `#${base.toUpperCase()}${alpha.toString(16).padStart(2, "0").toUpperCase()}`;
}

/** CSS angles are clockwise from up; Pen rotations are counter-clockwise. */
function parseCssAngle(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (Object.hasOwn(ANGLE_DIRECTIONS, text)) return ANGLE_DIRECTIONS[text];
  const match = /^(-?\d+(?:\.\d+)?)deg$/.exec(text);
  return match ? Number(match[1]) : 180;
}

function penRotationFromCssAngle(degrees) {
  return round(((-degrees % 360) + 360) % 360);
}

/** A Pen gradient fill, or null when the gradient cannot be expressed. */
function penGradient(value, { opacity = 1, blendMode = null } = {}) {
  const gradient = parseGradient(value);
  if (!gradient || UNWRITABLE_GRADIENTS.has(gradient.type)) return null;
  const colors = (gradient.stops ?? [])
    .map((stop) => ({
      color: withAlpha(stop.color, stop.opacity ?? 100),
      position: clamp01((stop.position ?? 0) / 100),
    }))
    .sort((left, right) => left.position - right.position);
  if (colors.length < 2) return null;

  const geometry = gradient.geometry ?? {};
  const fill = {
    type: "gradient",
    gradientType: gradient.type === "angular" ? "angular" : gradient.type,
    colors,
  };
  if (opacity < 1) fill.opacity = round(opacity);
  const penBlend = penBlendMode(blendMode);
  if (penBlend) fill.blendMode = penBlend;

  if (gradient.type === "linear") {
    fill.rotation = penRotationFromCssAngle(parseCssAngle(gradient.angle));
    return fill;
  }
  fill.center = {
    x: clamp01((geometry.centerX ?? 50) / 100),
    y: clamp01((geometry.centerY ?? 50) / 100),
  };
  fill.size = {
    width: Math.max(0.01, clamp01((geometry.width ?? 100) / 100)),
    height: Math.max(0.01, clamp01((geometry.height ?? 100) / 100)),
  };
  if (gradient.type === "angular") {
    fill.rotation = penRotationFromCssAngle(parseCssAngle(gradient.angle));
  }
  return fill;
}

export function penBlendMode(blendMode) {
  if (!blendMode || blendMode === "source-over") return null;
  return PEN_BLEND_MODES[blendMode] ?? null;
}

/**
 * One Pen fill from a VOO paint. Returns the `#RRGGBB[AA]` shorthand for a
 * plain colour, the schema's object form when blend or alpha needs a field,
 * and null for a paint Pen cannot hold.
 */
function penPaint({ fill, opacity = 1, blendMode = null, imageId = null }, ctx) {
  if (imageId) {
    const url = typeof ctx.imageUrl === "function" ? ctx.imageUrl(imageId) : null;
    if (typeof url === "string" && url) {
      const paint = { type: "image", url, mode: "cover" };
      if (opacity < 1) paint.opacity = round(opacity);
      const penBlend = penBlendMode(blendMode);
      if (penBlend) paint.blendMode = penBlend;
      return paint;
    }
  }
  if (typeof fill !== "string" || !fill || fill === "transparent") return null;
  if (isCssGradient(fill)) return penGradient(fill, { opacity, blendMode });
  if (!HEX_COLOR.test(fill)) return null;
  const color = withAlpha(fill, opacity * 100);
  const penBlend = penBlendMode(blendMode);
  return penBlend ? { type: "color", color, blendMode: penBlend } : color;
}

/** Every visible fill of a node, in paint order. */
function penFills(node, ctx, imageId) {
  const paints = Array.isArray(node.fills)
    ? node.fills.filter((paint) => paint && paint.visible !== false)
    : [
        {
          fill: node.fill,
          opacity: node.fillOpacity ?? 1,
          blendMode: node.fillBlendMode,
          imageId,
        },
      ];
  const fills = [];
  for (const paint of paints) {
    const value = penPaint(
      {
        fill: paint.fill ?? node.fill,
        opacity: paint.opacity ?? 1,
        blendMode: paint.blendMode ?? null,
        imageId: paint.imageId ?? (paints.length === 1 ? imageId : null),
      },
      ctx,
    );
    if (value) fills.push(value);
  }
  return fills;
}

/** Pen stroke fields for a node, or null when it paints no stroke. */
function penStroke(node, ctx) {
  const width = Number(node.strokeWidth ?? 0);
  if (!(width > 0)) return null;
  const paint = penPaint(
    { fill: node.stroke, opacity: node.strokeOpacity ?? 1 },
    ctx,
  );
  if (!paint) return null;
  const props = normalizeStrokeProps(node);
  return {
    stroke: paint,
    strokeWidth: round(width),
    strokeAlignment:
      props.align === "inside" ? "inner" : props.align === "outside" ? "outer" : "center",
    strokeLinecap: props.cap,
    strokeLinejoin: props.join,
  };
}

/** Pen effect records: layer blur, backdrop blur and the two shadows. */
export function penEffects(node) {
  const effects = [];
  if (Number(node.layerBlur) > 0) {
    effects.push({ type: "blur", radius: round(node.layerBlur) });
  }
  if (Number(node.backgroundBlur) > 0) {
    effects.push({ type: "background_blur", radius: round(node.backgroundBlur) });
  }
  const shadow = node.effects?.shadow;
  if (shadow?.enabled) effects.push(penShadow(shadow, "outer"));
  const innerShadow = node.effects?.innerShadow;
  if (innerShadow?.enabled) effects.push(penShadow(innerShadow, "inner"));
  if (effects.length === 0) return null;
  return effects.length === 1 ? effects[0] : effects;
}

function penShadow(shadow, shadowType) {
  return {
    type: "shadow",
    shadowType,
    offset: { x: round(shadow.offsetX), y: round(shadow.offsetY) },
    blur: round(shadow.blur),
    color: withAlpha(shadow.color, shadow.opacity ?? 100),
  };
}

/** `cornerRadius` in Pen's number / [tl, tr, br, bl] form, or undefined. */
export function penCornerRadius(node) {
  const radius = node.cornerRadius;
  if (typeof radius === "number") {
    return Number.isFinite(radius) && radius > 0 ? round(radius) : undefined;
  }
  if (!radius || typeof radius !== "object") return undefined;
  const corners = ["tl", "tr", "br", "bl"].map((key) => Number(radius[key] ?? 0));
  if (!corners.every(Number.isFinite) || !corners.some((value) => value > 0)) {
    return undefined;
  }
  return corners.map(round);
}

/** The paint, stroke and effect fields a Pen graphic node accepts. */
export function penGraphics(node, ctx, { imageId = null } = {}) {
  const out = {};
  const fills = penFills(node, ctx, imageId);
  if (fills.length === 1) out.fill = fills[0];
  else if (fills.length > 1) out.fill = fills;
  const stroke = penStroke(node, ctx);
  if (stroke) Object.assign(out, stroke);
  const effects = penEffects(node);
  if (effects) out.effect = effects;
  return out;
}

