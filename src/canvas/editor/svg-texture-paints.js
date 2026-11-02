import { parseTextureFill } from "../color_picker/texture-fill.js";
import { escapeXml, number } from "./editor_svg_xml.js";
export const texturePaintKey = (fill, node) => JSON.stringify([fill, node?.id, node?.x ?? 0, node?.y ?? 0]);

/** SVG tiles use the same world-space origin and natural dimensions as Canvas2D. */
export function svgTexturePattern(node, id) {
  const texture = parseTextureFill(node.fill);
  if (!texture) return null;
  const size = texture.scale * 16 / 100;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${number(node.x ?? 0)}" y="${number(node.y ?? 0)}" width="${number(size)}" height="${number(size)}"><image href="${escapeXml(node.fill)}" width="${number(size)}" height="${number(size)}"/></pattern>`;
}
