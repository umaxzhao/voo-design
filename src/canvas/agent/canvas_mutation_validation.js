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

function validatePaints(value, field) {
  if (!Array.isArray(value)) invalid(field, "an array of paint values", value);
  for (let index = 0; index < value.length; index += 1) {
    const paint = value[index];
    if (typeof paint === "string") {
      if (!COLOR_PATTERN.test(paint)) invalid(`${field}[${index}]`, "an editor color string", paint);
    } else if (paint && typeof paint === "object" && !Array.isArray(paint)) {
      const copy = { ...paint };
      for (const [key, item] of Object.entries(copy)) {
        if (["color", "fill", "stroke"].includes(key) && typeof item === "string" && !COLOR_PATTERN.test(item)) invalid(`${field}[${index}].${key}`, "an editor color string", item);
        if (["opacity", "offset", "position"].includes(key)) finite(item, `${field}[${index}].${key}`, 0, 1);
      }
    } else invalid(`${field}[${index}]`, "a color string or paint object", paint);
  }
}

export function validateLayerPatch(type, value) {
  const allowedByType = {
    layout: ["x", "y", "width", "height", "rotation"],
    style: ["fill", "stroke", "fills", "strokes", "strokeWidth", "cornerRadius", "opacity"],
    text: ["textContent", "text", "fontSize", "fontFamily", "fontWeight", "textAlign", "color"],
  };
  if (type === "autoLayout") return { autoLayout: validateAutoLayout(value) };
  if (!allowedByType[type]) invalid("type", "layout, style, text, or autoLayout", type);
  const patch = fields(value, allowedByType[type], "patch");
  for (const [key, item] of Object.entries(patch)) {
    if (type === "layout") {
      finite(item, `patch.${key}`, key === "width" || key === "height" ? 0 : -MAX_LAYOUT_VALUE, key === "width" || key === "height" ? MAX_SIZE : MAX_LAYOUT_VALUE);
    } else if (type === "style") {
      if (["fills", "strokes"].includes(key)) validatePaints(item, `patch.${key}`);
      else if (["fill", "stroke"].includes(key)) {
        if (typeof item !== "string" || !COLOR_PATTERN.test(item)) invalid(`patch.${key}`, "an editor color string", item);
      } else if (key === "opacity") finite(item, `patch.${key}`, 0, 1);
      else finite(item, `patch.${key}`, 0, MAX_SIZE);
    } else if (["textContent", "text", "fontFamily", "fontWeight", "textAlign"].includes(key)) {
      if (typeof item !== "string") invalid(`patch.${key}`, "a string", item);
      if (key === "textAlign" && !["left", "center", "right", "justify"].includes(item)) invalid(`patch.${key}`, "left, center, right, or justify", item);
    } else if (key === "fontSize") finite(item, `patch.${key}`, 1, MAX_SIZE);
    else if (key === "color" && (typeof item !== "string" || !COLOR_PATTERN.test(item))) invalid(`patch.${key}`, "an editor color string", item);
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
