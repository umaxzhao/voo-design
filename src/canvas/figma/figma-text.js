/**
 * Text style from a Figma TEXT record.
 *
 * The family and style are kept as the design names them, so a font that is
 * not installed here still reads as the designer's choice: the node renders
 * with a fallback face, and the family is listed as missing. Installing the
 * font later makes the same node render correctly, with no re-import.
 */

import { TEXT_LETTER_SPACING_BOUNDS, LINE_HEIGHT_RATIO } from "../editor/scene_model_core.js";
import { BUNDLED_FONTS } from "../editor/font_loader.js";

const WEIGHT_KEYWORDS = [
  [/extra\s*-?\s*bold|ultra\s*-?\s*bold/i, "800"],
  [/extra\s*-?\s*light|ultra\s*-?\s*light/i, "200"],
  [/semi\s*-?\s*bold|demi\s*-?\s*bold/i, "600"],
  [/black|heavy/i, "900"],
  [/thin|hairline/i, "100"],
  [/light/i, "300"],
  [/medium/i, "500"],
  [/bold/i, "700"],
  [/regular|normal|book|roman/i, "normal"],
];

const ALIGNMENTS = { LEFT: "left", CENTER: "center", RIGHT: "right", JUSTIFIED: "left" };

/** Weight the editor stores for a Figma style name ("Bold", "Semibold Italic", ...). */
export function weightOfStyle(style) {
  const match = WEIGHT_KEYWORDS.find(([pattern]) => pattern.test(style));
  return match ? match[1] : "normal";
}

/**
 * The font stack a node carries. Bundled families keep their own stack, so they
 * load; any other family is named in quotes and falls back to the system face
 * until it is installed.
 */
export function fontStackOf(family) {
  const bundled = BUNDLED_FONTS.find((font) => font.family === family);
  if (bundled) return bundled.stack;
  return `'${family.replace(/'/g, "")}', sans-serif`;
}

function lineHeightRatio(lineHeight, fontSize) {
  if (!lineHeight || lineHeight.units === "AUTO") return LINE_HEIGHT_RATIO;
  const value = Number(lineHeight.value);
  if (!Number.isFinite(value) || value <= 0) return LINE_HEIGHT_RATIO;
  if (lineHeight.units === "PERCENT") return value / 100;
  return fontSize > 0 ? value / fontSize : LINE_HEIGHT_RATIO;
}

function letterSpacingPx(letterSpacing, fontSize) {
  const value = Number(letterSpacing?.value);
  if (!Number.isFinite(value)) return 0;
  const px = letterSpacing.units === "PERCENT" ? (value / 100) * fontSize : value;
  return Math.min(TEXT_LETTER_SPACING_BOUNDS.max, Math.max(TEXT_LETTER_SPACING_BOUNDS.min, px));
}

/**
 * Editor text fields for one Figma TEXT record: family, weight, italic, size,
 * alignment, line height, letter spacing and the wrapping box width.
 *
 * `figmaFont` keeps the original family and style name, so the properties panel
 * and the missing-font report can refer to what the designer chose.
 */
export function textStyleOf(raw, fontSize) {
  const fontName = raw.fontName && typeof raw.fontName === "object" ? raw.fontName : {};
  const family = typeof fontName.family === "string" && fontName.family ? fontName.family : "Inter";
  const style = typeof fontName.style === "string" ? fontName.style : "Regular";
  const autoResize = raw.textAutoResize;
  return {
    fontFamily: fontStackOf(family),
    fontWeight: weightOfStyle(style),
    italic: /italic|oblique/i.test(style),
    align: ALIGNMENTS[raw.textAlignHorizontal] ?? "left",
    lineHeight: lineHeightRatio(raw.lineHeight, fontSize),
    letterSpacing: letterSpacingPx(raw.letterSpacing, fontSize),
    // Fixed-width text wraps at its frame; auto-width text sizes to its lines.
    boxWidth: autoResize === "WIDTH_AND_HEIGHT" || autoResize === undefined ? 0 : Math.max(1, Number(raw.size?.x) || 0),
    figmaFont: { family, style },
  };
}
