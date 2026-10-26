import { BLEND_MODES, TEXT_FONT_WEIGHTS, TEXT_LINE_HEIGHT_BOUNDS, TEXT_LETTER_SPACING_BOUNDS } from "../editor/scene_model_core.js";

const number = (minimum, maximum) => ({ type: "number", minimum, maximum });
const choice = (...values) => ({ type: "string", enum: values });
const object = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const color = { type: "string", pattern: "^(#[0-9a-fA-F]{3,8}|transparent|rgba?\\([^)]*\\)|hsla?\\([^)]*\\))$", description: "Editor color: hex, rgb(), rgba(), hsl(), hsla(), or transparent." };
const enabled = { type: "boolean" };
const opacity = number(0, 100);
const shadow = object({ enabled, color, blur: opacity, offsetX: number(-200, 200), offsetY: number(-200, 200), spread: opacity, opacity });
const glow = object({ enabled, color, blur: opacity, spread: opacity, opacity });
const stops = { type: "array", minItems: 2, items: object({
  color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, position: opacity, opacity,
}, ["color", "position"]) };
const geometry = object(Object.fromEntries(["centerX", "centerY", "width", "height", "startX", "startY", "endX", "endY"]
  .map((key) => [key, ["width", "height"].includes(key) ? number(0, 400) : number(-200, 300)])));
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });

export const STYLE_PATCH_PROPERTIES = {
  fill: { type: "string", description: "Solid color or the editor's CSS gradient string. Prefer gradient for structured stop/geometry edits." },
  stroke: color,
  fills: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
  strokes: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
  fillOpacity: number(0, 1), strokeOpacity: number(0, 1), opacity: number(0, 1),
  fillHidden: enabled, strokeHidden: enabled,
  strokeWidth: number(0, 100000), cornerRadius: number(0, 100000),
  strokeCap: choice("butt", "round", "square"), strokeJoin: choice("miter", "round", "bevel"),
  strokeAlign: choice("center", "inside", "outside"),
  strokeDash: { anyOf: [choice("solid", "dashed", "dotted"), { type: "array", minItems: 1, items: number(0, 100000) }] },
  strokeMiterLimit: number(1, 100000),
  blendMode: choice(...BLEND_MODES), layerBlur: number(0, 100), backgroundBlur: number(0, 100),
  gradient: object({ type: choice("linear", "radial", "angular", "diamond"), angle: number(-3600, 3600), stops, geometry }, ["type", "stops"]),
  effects: { ...nullable(object({
    shadow, innerShadow: shadow, glow, innerGlow: object({ enabled, color, blur: opacity, size: opacity, opacity }),
    bevel: object({ enabled, depth: opacity, size: number(0, 200), angle: number(0, 360), softness: opacity }),
    satin: object({ enabled, color, opacity, angle: number(0, 360), distance: opacity, blur: opacity, invert: enabled }),
    glass: object({ enabled, blur: opacity, tint: color, opacity, highlight: opacity, angle: number(0, 360) }),
    texture: object({ enabled, color, secondaryColor: nullable(color), opacity: number(0, 1), density: number(0, 1), size: number(1, 12), seed: number(0, 9999), blendMode: choice(...BLEND_MODES) }),
    fill: object({ enabled, color, opacity }),
    gradientOverlay: object({ enabled, stops: { type: "array", minItems: 2, items: object({ color, location: number(0, 1) }, ["color", "location"]) }, angle: number(0, 360), opacity }),
    stroke: object({ enabled, color, width: opacity, opacity, position: choice("inside", "center", "outside") }),
  })), description: "Replace the layer effect stack; null clears it. Effect opacity is 0–100 except texture (0–1)." },
};

export const TEXT_PATCH_PROPERTIES = {
  textContent: { type: "string" }, text: { type: "string" },
  fontFamily: { type: "string" }, fontSize: number(1, 100000),
  fontWeight: { anyOf: [{ type: "string", enum: TEXT_FONT_WEIGHTS }, { type: "number", enum: TEXT_FONT_WEIGHTS.map(Number).filter(Number.isFinite) }] },
  italic: enabled, underline: enabled,
  lineHeight: { ...number(TEXT_LINE_HEIGHT_BOUNDS.min, TEXT_LINE_HEIGHT_BOUNDS.max), description: "Font-size multiplier, not pixels." },
  letterSpacing: { ...number(TEXT_LETTER_SPACING_BOUNDS.min, TEXT_LETTER_SPACING_BOUNDS.max), description: "Additional spacing in document pixels." },
  textAlign: choice("left", "center", "right", "justify"), align: choice("left", "center", "right", "justify"),
  color, fill: color, boxWidth: number(0, 8192),
};

/** Validate the same field contract exposed to agents; reject rather than clamp. */
export function validateMutationField(value, schema, field) {
  const fail = () => { throw Object.assign(new Error(`agentInvalidArgs: Invalid field "${field}"`), { code: "agentInvalidArgs" }); };
  if (schema.anyOf) {
    for (const option of schema.anyOf) {
      try { validateMutationField(value, option, field); return; }
      catch (error) { if (error.code !== "agentInvalidArgs") throw error; }
    }
    fail();
  }
  if (schema.type === "null") { if (value !== null) fail(); return; }
  if (schema.type === "array") {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0)) fail();
    value.forEach((item, index) => validateMutationField(item, schema.items, `${field}[${index}]`));
    return;
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail();
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) fail();
    for (const [key, item] of Object.entries(value)) {
      const child = schema.properties?.[key];
      if (!child && schema.additionalProperties === false) fail();
      if (child) validateMutationField(item, child, `${field}.${key}`);
    }
    return;
  }
  if (typeof value !== schema.type) fail();
  if (schema.type === "number" && (!Number.isFinite(value) || value < schema.minimum || value > schema.maximum)) fail();
  if (schema.enum && !schema.enum.includes(value)) fail();
  if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail();
}
