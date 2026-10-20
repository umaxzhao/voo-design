// HTML import style parsing and paint resolution seam.

import {
  normalizeGradient,
  formatGradientString,
  checkUnsupportedGradient,
} from "./gradient_model.js";

export const INLINE_TAGS = new Set([
  "span",
  "a",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "del",
  "strike",
  "label",
  "small",
  "code",
  "mark",
]);

/** Tags with no visual payload the parser skips. */
export const SKIP_TAGS = new Set([
  "style",
  "script",
  "link",
  "meta",
  "noscript",
  "title",
  "head",
]);

export const GRADIENT_RE = /(?:linear|radial|conic)-gradient\(/i;

/** "font-size" → "fontSize" — every reader below expects camelCase. */
function camelCaseKey(key) {
  return key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/** Normalises `style` (raw css string or object) into a plain property map. */
export function parseInlineStyle(style) {
  if (!style) return {};
  if (typeof style === "object") {
    const out = {};
    for (const [key, value] of Object.entries(style)) {
      out[camelCaseKey(key)] = value;
    }
    return out;
  }
  const out = {};
  for (const declaration of String(style).split(";")) {
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const key = declaration.slice(0, colon).trim();
    if (key) out[camelCaseKey(key)] = declaration.slice(colon + 1).trim();
  }
  return out;
}

/** "10px" / "10" → 10; null/auto/unparseable → fallback. */
export function px(value, fallback = null) {
  if (value == null || value === "" || value === "auto") return fallback;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

export {
  extractHtmlSnippet,
  StreamingLayoutFilter,
} from "./streaming_layout_filter.js";

/**
 * Sanitizes layout preview HTML by stripping script tags, inline event handler
 * attributes (e.g. onclick, onload, onerror), and javascript: URI schemes.
 * Preserves styling, CSS, layout tags, and safe markup.
 *
 * @param {string} html
 * @returns {string}
 */
export function sanitizeLayoutHtml(html) {
  if (!html || typeof html !== "string") return "";

  // 1. Strip <script ...>...</script> blocks (closed or unclosed)
  let clean = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi,
    "",
  );
  clean = clean.replace(/<script\b[^>]*>[\s\S]*$/gi, "");
  clean = clean.replace(/<script\b[^>]*>/gi, "");

  // 2. Strip inline event handlers like onclick="...", onload='...', onerror=...
  clean = clean.replace(
    /\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    "",
  );

  // 3. Strip or neutralize javascript: and vbscript: URLs in href/src/action
  clean = clean.replace(
    /\b(href|src|action)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]*)/gi,
    '$1="about:blank"',
  );
  clean = clean.replace(
    /\b(href|src|action)\s*=\s*("vbscript:[^"]*"|'vbscript:[^']*'|vbscript:[^\s>]*)/gi,
    '$1="about:blank"',
  );

  return clean;
}

/** Pulls the full gradient(...) expression out of a style value. */
function extractGradient(value) {
  const start = String(value ?? "").search(GRADIENT_RE);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < value.length; i += 1) {
    if (value[i] === "(") depth += 1;
    else if (value[i] === ")") {
      depth -= 1;
      if (depth === 0) return value.slice(start, i + 1);
    }
  }
  return value.slice(start);
}

/** Resolves an element's background to a fill paint (color or gradient). */
export function resolveFill(style, ctx) {
  const candidates = [
    style.background,
    style.backgroundImage,
    style.backgroundColor,
  ].filter((value) => typeof value === "string" && value && value !== "none");
  for (const value of candidates) {
    const unsupp = checkUnsupportedGradient(value);
    if (unsupp && ctx?.warnings && !ctx.warnings.includes(unsupp)) {
      ctx.warnings.push(unsupp);
    }
    if (GRADIENT_RE.test(value)) {
      const gradient = extractGradient(value);
      if (gradient) {
        const normalized = normalizeGradient(gradient);
        if (normalized) return formatGradientString(normalized);
        return gradient;
      }
      continue;
    }
    if (value.startsWith("url(")) continue;
    if (value === "transparent") continue;
    return value;
  }
  return null;
}

/** The 16 CSS basic colour keywords (the contract's colour vocabulary). */
const NAMED_COLORS = {
  black: "#000000",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  white: "#ffffff",
  maroon: "#800000",
  red: "#ff0000",
  purple: "#800080",
  fuchsia: "#ff00ff",
  green: "#008000",
  lime: "#00ff00",
  olive: "#808000",
  yellow: "#ffff00",
  navy: "#000080",
  blue: "#0000ff",
  teal: "#008080",
  aqua: "#00ffff",
  orange: "#ffa500",
  transparent: "#000000",
};

/** Parses a CSS colour into {color, opacity(0-100)}; null when unrecognised. */
function parseShadowColor(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  let match = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (match) {
    let hex = match[1];
    if (hex.length === 3 || hex.length === 4) {
      hex = [...hex].map((ch) => ch + ch).join("");
    }
    if (hex.length === 6)
      return { color: `#${hex.toLowerCase()}`, opacity: 100 };
    if (hex.length === 8) {
      const alpha = parseInt(hex.slice(6), 16) / 255;
      return {
        color: `#${hex.slice(0, 6).toLowerCase()}`,
        opacity: Math.max(0, Math.min(100, Math.round(alpha * 100))),
      };
    }
    return null;
  }
  match =
    /^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*(?:,\s*([\d.]+%?)\s*)?\)$/i.exec(
      value,
    );
  if (match) {
    const toChannel = (part) => {
      const num = Number.parseFloat(part);
      return part.endsWith("%")
        ? Math.round((num / 100) * 255)
        : Math.round(num);
    };
    const color = `#${[match[1], match[2], match[3]]
      .map(toChannel)
      .map((ch) => Math.max(0, Math.min(255, ch)).toString(16).padStart(2, "0"))
      .join("")}`;
    let opacity = 100;
    if (match[4] != null && match[4] !== "") {
      const alpha = Number.parseFloat(match[4]);
      opacity = match[4].endsWith("%") ? alpha : alpha * 100;
    }
    return { color, opacity: Math.max(0, Math.min(100, Math.round(opacity))) };
  }
  const named = NAMED_COLORS[value.toLowerCase()];
  if (named) {
    return {
      color: named,
      opacity: value.toLowerCase() === "transparent" ? 0 : 100,
    };
  }
  return null;
}

/** The first comma-separated shadow, ignoring commas inside colour functions. */
function firstShadow(value) {
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) return value.slice(0, i);
  }
  return value;
}

/**
 * Parses a CSS shadow (box-shadow / text-shadow) into the editor's shadow
 * shape. Only the first of comma-separated shadows is kept and the optional
 * spread token is dropped — the layer model holds one simple drop shadow.
 * Returns null when there is nothing to preserve (none / inset / unparseable).
 */
export function resolveShadow(raw) {
  if (raw == null || raw === "" || raw === "none") return null;
  const value = String(raw);
  if (/\binset\b/i.test(value)) return null; // the model has no inner shadow here
  const decl = firstShadow(value).trim();
  // Leading numeric tokens (offsetX offsetY blur [spread]) then a colour —
  // matched greedily so the rest (which may contain spaces, e.g. rgb(1, 2, 3))
  // is always the colour.
  const parts =
    /^-?[\d.]+(?:px)?\s+-?[\d.]+(?:px)?(?:\s+-?[\d.]+(?:px)?)?(?:\s+-?[\d.]+(?:px)?)?\s*(.*)$/.exec(
      decl,
    );
  if (!parts) return null;
  const nums = parts[0].match(/-?[\d.]+/g).map(Number);
  const parsed = parseShadowColor(parts[1].trim());
  if (!parsed) return null;
  const [offsetX, offsetY, blur = 0] = nums;
  return {
    enabled: true,
    color: parsed.color,
    blur,
    offsetX,
    offsetY,
    opacity: parsed.opacity,
  };
}

/** border-radius → number of px, or "ellipse" for a 50% circle box. */
