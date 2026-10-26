import { STYLE_PATCH_PROPERTIES, TEXT_PATCH_PROPERTIES, validateMutationField } from "./canvas-mutation-schema.js";
import { isCssGradient, parseGradient, formatGradient, DEFAULT_GRADIENT_GEOMETRY } from "../color_picker/gradient_fill.js";

const MAX_LAYOUT_VALUE = 100000;
const MAX_SIZE = 100000;
const COLOR_PATTERN = /^(#[\da-f]{3,8}|transparent|rgba?\([^)]*\)|hsla?\([^)]*\))$/i;

function invalid(field, expected, value) {
  throw Object.assign(
    new Error(`agentInvalidArgs: Invalid field "${field}": expected ${expected}, got ${JSON.stringify(value)}`),
    { code: "agentInvalidArgs" },
  );
}

function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field, "an object", value);
  return { ...value };
}

function finite(value, field, min = -MAX_LAYOUT_VALUE, max = MAX_LAYOUT_VALUE) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    invalid(field, `a finite number in [${min}, ${max}]`, value);
  }
}

function fields(patch, allowed, field) {
  const copy = object(patch, field);
  for (const key of Object.keys(copy)) if (!allowed.includes(key)) invalid(`${field}.${key}`, "a supported field", copy[key]);
  if (!Object.keys(copy).length) invalid(field, "an object with at least one supported field", copy);
  return copy;
}

function validateColorOrGradient(value, field) {
  if (typeof value !== "string") invalid(field, "an editor paint string", value);
  if (COLOR_PATTERN.test(value)) return;
  // The UI parser supplies fallback stops for malformed input. Agent writes
  // must reject that input rather than silently painting the fallback.
  const explicitColors = value.match(/#[\da-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) ?? [];
  if (isCssGradient(value) && explicitColors.length >= 2 && parseGradient(value).stops.length >= 2) return;
  invalid(field, "an editor color or gradient string", value);
}

function validatePaints(value, field) {
  if (!Array.isArray(value)) invalid(field, "an array of paint values", value);
  for (let index = 0; index < value.length; index += 1) {
    const paint = value[index];
    if (typeof paint === "string") {
      validateColorOrGradient(paint, `${field}[${index}]`);
    } else if (paint && typeof paint === "object" && !Array.isArray(paint)) {
      const copy = { ...paint };
      for (const [key, item] of Object.entries(copy)) {
        if (["color", "fill", "stroke"].includes(key)) validateColorOrGradient(item, `${field}[${index}].${key}`);
        if (["opacity", "offset", "position"].includes(key)) finite(item, `${field}[${index}].${key}`, 0, 1);
      }
    } else invalid(`${field}[${index}]`, "a color string or paint object", paint);
  }
}

export function validateLayerPatch(type, value) {
  if (type === "autoLayout") return { autoLayout: validateAutoLayout(value) };
  if (type === "layout") {
    const patch = fields(value, ["x", "y", "width", "height", "rotation"], "patch");
    for (const [key, item] of Object.entries(patch)) finite(item, `patch.${key}`, ["width", "height"].includes(key) ? 0 : -MAX_LAYOUT_VALUE, MAX_SIZE);
    return patch;
  }
  const properties = type === "style" ? STYLE_PATCH_PROPERTIES : type === "text" ? TEXT_PATCH_PROPERTIES : null;
  if (!properties) invalid("type", "layout, style, text, or autoLayout", type);
  const patch = fields(value, Object.keys(properties), "patch");
  for (const [key, item] of Object.entries(patch)) {
    validateMutationField(item, properties[key], `patch.${key}`);
    if (key === "fill") validateColorOrGradient(item, `patch.${key}`);
    if (["fills", "strokes"].includes(key)) validatePaints(item, `patch.${key}`);
  }
  if (type === "text") {
    // Only write content when supplied; style-only changes must not erase it.
    for (const [alias, canonical] of [["textContent", "text"], ["textAlign", "align"], ["color", "fill"]]) {
      if (Object.hasOwn(patch, alias)) {
        if (Object.hasOwn(patch, canonical) && patch[canonical] !== patch[alias]) invalid(`patch.${alias}`, `the same value as ${canonical}`, patch[alias]);
        patch[canonical] = patch[alias];
        delete patch[alias];
      }
    }
  }
  if (patch.gradient) {
    if (Object.hasOwn(patch, "fill") || Object.hasOwn(patch, "fills")) invalid("patch.gradient", "a gradient without a competing fill/fills", patch.gradient);
    const { type: gradientType, angle = 135, stops, geometry = {} } = patch.gradient;
    const endpointKeys = ["startX", "startY", "endX", "endY"];
    const count = endpointKeys.filter((key) => Object.hasOwn(geometry, key)).length;
    if (count !== 0 && count !== 4) invalid("patch.gradient.geometry", "all four gradient line endpoints", geometry);
    patch.fill = formatGradient(gradientType, `${angle}deg`, stops.map((stop) => ({ opacity: 100, ...stop })), { ...DEFAULT_GRADIENT_GEOMETRY, ...geometry });
    delete patch.gradient;
  }
  return patch;
}

export function validateAutoLayout(value) {
  const config = fields(value, ["enabled", "direction", "gap", "padding", "wrap", "alignment"], "config");
  if (typeof config.enabled !== "boolean") invalid("config.enabled", "a boolean", config.enabled);
  if (config.direction !== undefined && !["horizontal", "vertical"].includes(config.direction)) invalid("config.direction", "horizontal or vertical", config.direction);
  for (const key of ["gap", "padding"]) if (config[key] !== undefined) finite(config[key], `config.${key}`, 0, MAX_SIZE);
  for (const key of ["wrap"]) if (config[key] !== undefined && typeof config[key] !== "boolean") invalid(`config.${key}`, "a boolean", config[key]);
  if (config.alignment !== undefined && !["start", "center", "end", "stretch", "space-between"].includes(config.alignment)) invalid("config.alignment", "a supported alignment", config.alignment);
  return config;
}

export function validateLayerId(value) {
  if (typeof value !== "string" || !value.trim()) invalid("layerId", "a non-empty string", value);
  return value;
}
