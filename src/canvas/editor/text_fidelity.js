/**
 * Pure text fidelity and measurement module for editor and HTML import.
 *
 * Implements CSS text property mappings (line-height, decoration, italic,
 * text-transform, rich inline cascade inheritance), observable metrics fallback,
 * and host metrics adapter seam.
 */

import { DEFAULT_FONT_SIZE, LINE_HEIGHT_RATIO } from "./scene_model.js";

/** 0.55em per Latin/ASCII glyph, 1em per wide (CJK etc.) glyph. */
export function isWideChar(ch) {
  return /[\u1100-\u115f\u2e80-\ua4cf\uaac0-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef\u3040-\u30ff\u4e00-\u9fff]/.test(
    ch,
  );
}

/**
 * Parses CSS line-height into a ratio relative to font size (clamped to [0.8, 3.0]).
 */
export function parseLineHeight(raw, fontSize = DEFAULT_FONT_SIZE) {
  if (raw == null || raw === "" || raw === "normal") return LINE_HEIGHT_RATIO;
  const str = String(raw).trim().toLowerCase();
  if (str.endsWith("px")) {
    const pxVal = Number.parseFloat(str);
    if (Number.isFinite(pxVal) && fontSize > 0) {
      return Math.max(0.8, Math.min(3.0, pxVal / fontSize));
    }
  }
  if (str.endsWith("%")) {
    const pct = Number.parseFloat(str);
    if (Number.isFinite(pct)) {
      return Math.max(0.8, Math.min(3.0, pct / 100));
    }
  }
  const ratio = Number.parseFloat(str);
  if (Number.isFinite(ratio)) {
    return Math.max(0.8, Math.min(3.0, ratio));
  }
  return LINE_HEIGHT_RATIO;
}

/**
 * Parses CSS text-decoration into boolean flags.
 */
export function parseTextDecoration(raw) {
  if (!raw) return { underline: false, lineThrough: false };
  const str = String(raw).toLowerCase();
  return {
    underline: str.includes("underline"),
    lineThrough: str.includes("line-through"),
  };
}

/**
 * Applies CSS text-transform (uppercase, lowercase, capitalize) to string.
 */
export function applyTextTransform(text, transform) {
  if (!text || !transform) return String(text ?? "");
  const mode = String(transform).trim().toLowerCase();
  if (mode === "uppercase") return String(text).toUpperCase();
  if (mode === "lowercase") return String(text).toLowerCase();
  if (mode === "capitalize") {
    return String(text).replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
  }
  return String(text);
}

/**
 * Estimates text dimensions with an observable fallback / host adapter seam.
 *
 * @param {string} text - The text to measure
 * @param {number} fontSize - Font size in px
 * @param {number} [boxWidth=0] - Fixed box width for wrapping
 * @param {object} [options]
 * @param {number} [options.lineHeight] - Line height ratio
 * @param {number} [options.letterSpacing=0] - Letter spacing in px
 * @param {function} [options.metricsAdapter] - Host measurement function
 * @returns {{width: number, height: number, fallback: boolean, source: string, lineCount: number}}
 */
export function estimateTextSize(text, fontSize, boxWidth = 0, options = {}) {
  const fSize = fontSize > 0 ? fontSize : DEFAULT_FONT_SIZE;
  const lhRatio = options.lineHeight ?? LINE_HEIGHT_RATIO;
  const lSpacing = options.letterSpacing ?? 0;

  // Host adapter seam: if provided, use host measurement
  if (typeof options.metricsAdapter === "function") {
    const measured = options.metricsAdapter(text, fSize, { boxWidth, ...options });
    if (measured && Number.isFinite(measured.width) && Number.isFinite(measured.height)) {
      return {
        width: Math.ceil(measured.width),
        height: Math.ceil(measured.height),
        fallback: false,
        source: "host-adapter",
        lineCount: measured.lineCount ?? 1,
      };
    }
  }

  // Observable character-heuristic fallback
  const rawLines = String(text ?? "").split("\n");
  let maxLineWidth = 0;
  let totalLines = 0;

  for (const line of rawLines) {
    let lineWidth = 0;
    for (const ch of line) {
      lineWidth += (isWideChar(ch) ? 1.0 : 0.55) * fSize + lSpacing;
    }
    if (lineWidth > maxLineWidth) maxLineWidth = lineWidth;

    const wrapped =
      boxWidth > 0 ? Math.max(1, Math.ceil(lineWidth / Math.max(1, boxWidth))) : 1;
    totalLines += wrapped;
  }

  return {
    width: maxLineWidth,
    height: fSize * lhRatio * Math.max(1, totalLines),
    fallback: true,
    source: "character-heuristic",
    lineCount: totalLines,
  };
}

export const INHERITABLE_TEXT_PROPERTIES = [
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textAlign",
  "textTransform",
  "textShadow",
];

/**
 * Cascades parent text styles to an inline child element.
 */
export function inheritInlineTextStyle(parentStyle = {}, childStyle = {}, childTag = "") {
  const tag = String(childTag ?? "").toLowerCase();
  const inherited = {};
  for (const prop of INHERITABLE_TEXT_PROPERTIES) {
    if (parentStyle[prop] != null) {
      inherited[prop] = parentStyle[prop];
    }
  }
  Object.assign(inherited, childStyle);

  // Tag semantics
  if (tag === "strong" || tag === "b") {
    inherited.fontWeight = childStyle.fontWeight ?? "bold";
  }
  if (tag === "em" || tag === "i") {
    inherited.fontStyle = childStyle.fontStyle ?? "italic";
  }
  if (tag === "u") {
    inherited.textDecoration = childStyle.textDecoration ?? "underline";
  }
  if (tag === "s" || tag === "strike" || tag === "del") {
    inherited.textDecoration = childStyle.textDecoration ?? "line-through";
  }
  if (tag === "small") {
    const parentSize = Number.parseFloat(parentStyle.fontSize) || DEFAULT_FONT_SIZE;
    inherited.fontSize = childStyle.fontSize ?? `${Math.round(parentSize * 0.8)}px`;
  }
  if (tag === "a" && !childStyle.color) {
    inherited.color = "#0066cc";
    inherited.textDecoration = childStyle.textDecoration ?? "underline";
  }

  return inherited;
}

/**
 * Checks for unsupported text CSS properties and records warnings.
 */
export function checkUnsupportedTextProperties(style, ctx) {
  if (!style || !ctx || !Array.isArray(ctx.warnings)) return;
  const UNSUPPORTED_TEXT_KEYS = [
    "textOverflow",
    "hyphens",
    "textEmphasis",
    "fontVariantCaps",
  ];
  for (const k of UNSUPPORTED_TEXT_KEYS) {
    if (style[k] != null && style[k] !== "" && style[k] !== "none" && style[k] !== "normal") {
      const kebab = k.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);
      const warn = `unsupported-property:${kebab}`;
      if (!ctx.warnings.includes(warn)) ctx.warnings.push(warn);
    }
  }
}
