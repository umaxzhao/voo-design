/**
 * Colour-model conversions for the picker's model dropdown. Every model maps
 * to and from a 6-digit hex string, so the wheel (HSV), the hex field and the
 * channel inputs always describe the same colour.
 */

import { hexToRgb, rgbToHex } from "./color_math.js";

/** Dropdown order follows Figma's colour picker. */
export const COLOUR_MODELS = ["RGB", "HEX", "CSS", "HSL", "HSB"];

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/** rgb (0-255) to hsl (h 0-360, s/l 0-100), rounded to whole numbers. */
export function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }
  return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** hsl (h 0-360, s/l 0-100) to rgb (0-255). */
export function hslToRgb({ h, s, l }) {
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const hue = ((h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = ln - chroma / 2;
  const sector = Math.floor(hue / 60);
  const [r1, g1, b1] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][sector % 6];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** `rgb(r, g, b)` text for the CSS model; null when the hex is unreadable. */
export function formatCssColour(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : "";
}

/** A CSS channel token: "50%" scales against `scale`, bare numbers pass through. */
function channelValue(token, scale) {
  const num = Number.parseFloat(token);
  if (!Number.isFinite(num)) return null;
  return token.trim().endsWith("%") ? (num / 100) * scale : num;
}

/**
 * Parses what the CSS field accepts: #rgb / #rrggbb, rgb()/rgba(), hsl()/hsla()
 * with comma or space separators. Alpha is ignored (opacity has its own field).
 * Returns an upper-case 6-digit hex, or null when the text is not a colour.
 */
export function parseCssColour(text) {
  const raw = String(text ?? "").trim();
  if (/^#?[0-9a-f]{3}$|^#?[0-9a-f]{6}$/i.test(raw)) {
    const rgb = hexToRgb(raw);
    return rgb ? rgbToHex(rgb) : null;
  }
  const match = /^(rgba?|hsla?)\(\s*([^)]+)\)$/i.exec(raw);
  if (!match) return null;
  const parts = match[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  if (match[1].toLowerCase().startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map((p) => channelValue(p, 255));
    if ([r, g, b].some((n) => n === null)) return null;
    return rgbToHex({ r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) });
  }
  const h = channelValue(parts[0], 360);
  const s = channelValue(parts[1], 100);
  const l = channelValue(parts[2], 100);
  if ([h, s, l].some((n) => n === null)) return null;
  return rgbToHex(hslToRgb({ h, s, l }));
}
