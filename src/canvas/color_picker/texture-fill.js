import { isCssGradient } from "./gradient_fill.js";

/** Portable image paints: deterministic SVG tiles use the existing bitmap compositor. */
const PREFIX = "data:image/svg+xml,";
const MARKER = "data-voo-texture";
export const TEXTURE_PATTERNS = ["dots", "lines", "grid"];
export function normalizeTexture(options = {}) {
  return {
    pattern: TEXTURE_PATTERNS.includes(options.pattern) ? options.pattern : "dots",
    color: /^#[0-9a-f]{6}$/i.test(options.color ?? "") ? options.color : "#757575",
    scale: Math.max(25, Math.min(400, Number.isFinite(Number(options.scale)) ? Number(options.scale) : 100))
  };
}
export function formatTextureFill(options) {
  const texture = normalizeTexture(options);
  const size = 16 * texture.scale / 100;
  const stroke = Math.max(1, size / 16);
  const motif = texture.pattern === "dots" ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 8}" fill="${texture.color}"/>` : `<path d="${texture.pattern === "grid" ? `M0 0H${size}M0 0V${size}` : `M${-size / 2} ${size / 2}L${size / 2} ${-size / 2}M0 ${size}L${size} 0M${size / 2} ${size * 1.5}L${size * 1.5} ${size / 2}`}" stroke="${texture.color}" stroke-width="${stroke}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" ${MARKER}="${encodeURIComponent(JSON.stringify(texture))}">${motif}</svg>`;
  return PREFIX + encodeURIComponent(svg);
}

/** Non-texture and malformed imported image URLs are not interpreted as settings. */
export function parseTextureFill(value) {
  if (typeof value !== "string" || !value.startsWith(PREFIX) || !value.includes(MARKER)) return null;
  try {
    const svg = decodeURIComponent(value.slice(PREFIX.length));
    const metadata = svg.match(/data-voo-texture="([^"]+)"/)?.[1];
    return metadata ? normalizeTexture(JSON.parse(decodeURIComponent(metadata))) : null;
  } catch {
    return null;
  }
}
export function isImageFill(value) {
  return typeof value === "string" && /^(?:blob:|data:image\/|https?:|file:)/i.test(value);
}
export function fillTypeOf(fill) {
  if (parseTextureFill(fill)) return "texture";
  if (isImageFill(fill)) return "image";
  return isCssGradient(fill) ? "gradient" : "solid";
}
