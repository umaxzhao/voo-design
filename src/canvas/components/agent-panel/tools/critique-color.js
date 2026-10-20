// Color parsing and WCAG contrast seam.
/** Parse hex, rgb, or named color into RGB components. */
export function parseRgb(colorStr) {
  if (!colorStr || typeof colorStr !== "string") return null;
  const str = colorStr.trim().toLowerCase();
  if (str === "transparent") return null;
  if (str === "white") return { r: 255, g: 255, b: 255 };
  if (str === "black") return { r: 0, g: 0, b: 0 };
  if (str === "gray" || str === "grey") return { r: 128, g: 128, b: 128 };

  if (str.startsWith("#")) {
    const hex = str.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }

  const rgbMatch = str.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: Math.min(255, Math.max(0, parseInt(rgbMatch[1], 10))),
      g: Math.min(255, Math.max(0, parseInt(rgbMatch[2], 10))),
      b: Math.min(255, Math.max(0, parseInt(rgbMatch[3], 10))),
    };
  }
  return null;
}

/** Compute relative luminance according to WCAG 2.1. */
export function getRelativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map((val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Compute WCAG 2.1 contrast ratio between two colors. */
export function getContrastRatio(rgb1, rgb2) {
  const l1 = getRelativeLuminance(rgb1);
  const l2 = getRelativeLuminance(rgb2);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}
