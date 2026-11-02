/**
 * Shared design-quality token contract for the design-quality agent modules.
 * Pure data + pure math; no DOM, no editor imports.
 */

export const DESIGN_TOKENS = Object.freeze({
  spacing: Object.freeze([0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 128]),
  typeScale: Object.freeze([12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72]),
  radii: Object.freeze({
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  }),
  shadows: Object.freeze({
    sm: Object.freeze({
      css: "0 1px 2px rgba(0,0,0,0.18)",
      x: 0,
      y: 1,
      blur: 2,
      spread: 0,
      color: "rgba(0,0,0,0.18)",
    }),
    md: Object.freeze({
      css: "0 2px 8px rgba(0,0,0,0.16)",
      x: 0,
      y: 2,
      blur: 8,
      spread: 0,
      color: "rgba(0,0,0,0.16)",
    }),
    lg: Object.freeze({
      css: "0 12px 32px rgba(0,0,0,0.20)",
      x: 0,
      y: 12,
      blur: 32,
      spread: 0,
      color: "rgba(0,0,0,0.20)",
    }),
  }),
  palettes: Object.freeze({
    light: mkPalette(
      "#FFFFFF",
      "#FFFFFF",
      "#F5F6F8",
      "#E3E5EB",
      "#16181D",
      "#5C6370",
      "#2563EB",
      "#FFFFFF",
      "#16A34A",
      "#D97706",
      "#DC2626",
    ),
    dark: mkPalette(
      "#0B0B0F",
      "#15151B",
      "#1D1D25",
      "rgba(255,255,255,0.10)",
      "#F2F3F5",
      "#9AA0AA",
      "#4F7CFF",
      "#FFFFFF",
      "#4ADE80",
      "#FBBF24",
      "#F87171",
    ),
  }),
});

function mkPalette(bg, surface, surfaceAlt, border, text, textMuted, accent, accentText, success, warning, danger) {
  return Object.freeze({
    bg,
    surface,
    surfaceAlt,
    border,
    text,
    textMuted,
    accent,
    accentText,
    success,
    warning,
    danger,
  });
}

/** Rounds a value to the nearest multiple of `step` (default 4, the grid step). */
export function snapToGrid(v, step = 4) {
  const n = Number(v);
  const s = Number(step) > 0 ? Number(step) : 4;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / s) * s;
}

/** Nearest heading/text size in DESIGN_TOKENS.typeScale for an arbitrary px value. */
export function nearestTypeSize(px) {
  const n = Number(px);
  if (!Number.isFinite(n)) return DESIGN_TOKENS.typeScale[0];
  let best = DESIGN_TOKENS.typeScale[0];
  let bestDiff = Math.abs(n - best);
  for (const size of DESIGN_TOKENS.typeScale) {
    const diff = Math.abs(n - size);
    if (diff < bestDiff) {
      best = size;
      bestDiff = diff;
    }
  }
  return best;
}

/**
 * Extracts [r, g, b] (0..255) from "#rgb", "#rrggbb", "rgba(..)", or "rgb(..)".
 * 8-digit hex ignores alpha for luminance purposes. Returns null when unparsable.
 */
function colorChannels(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("#")) {
    const hex = raw.slice(1).replace(/[^0-9a-fA-F]/g, "");
    const body = hex.slice(0, 6);
    if (body.length === 3) {
      return [
        parseInt(`${body[0]}${body[0]}`, 16),
        parseInt(`${body[1]}${body[1]}`, 16),
        parseInt(`${body[2]}${body[2]}`, 16),
      ];
    }
    if (body.length >= 6) {
      return [
        parseInt(body.slice(0, 2), 16),
        parseInt(body.slice(2, 4), 16),
        parseInt(body.slice(4, 6), 16),
      ];
    }
    return null;
  }
  if (/^(rgb|rgba)/i.test(raw)) {
    const nums = raw.match(/[\d.]+/g);
    if (!nums || nums.length < 3) return null;
    return [Number(nums[0]), Number(nums[1]), Number(nums[2])].map((c) =>
      Math.max(0, Math.min(255, Math.round(c))),
    );
  }
  const named = { black: "#000000", white: "#ffffff" };
  if (named[raw.toLowerCase()]) return colorChannels(named[raw.toLowerCase()]);
  return null;
}

/** WCAG relative luminance of a css color string. */
function relativeLuminance(color) {
  const channels = colorChannels(color);
  if (!channels) return null;
  const [r, g, b] = channels.map((c) => {
    const s = Math.max(0, Math.min(1, c / 255));
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two css colors; 0 when either color is unreadable. */
export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  if (la == null || lb == null) return 0;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
