import { hexToRgb } from "../color_picker/color_math.js";

/** Choose initial ink for solid Frame surfaces; explicit/programmatic fills win. */
export function textCreationFill(doc, frame) {
  const visited = new Set();
  let background = doc.backgroundColor;
  while (frame && !visited.has(frame.id)) {
    visited.add(frame.id);
    if (frame.fillHidden !== true && (frame.fillOpacity ?? 1) === 1 && (frame.opacity ?? 1) === 1) {
      const rgb = hexToRgb(typeof frame.fill === "string" ? frame.fill : "");
      if (rgb && (frame.fill.length !== 9 || frame.fill.slice(-2).toLowerCase() === "ff")) {
        background = frame.fill;
        break;
      }
    }
    frame = doc.nodes.find(node => node.id === frame.parentId);
  }
  const rgb = hexToRgb(typeof background === "string" ? background : "");
  if (!rgb) return "#ffffff";
  const linear = channel => channel / 255 <= 0.04045 ? channel / 3294.6 : ((channel / 255 + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
  // Black and white have equal WCAG contrast at sqrt(0.0525) - 0.05.
  return luminance > Math.sqrt(0.0525) - 0.05 ? "#000000" : "#ffffff";
}
