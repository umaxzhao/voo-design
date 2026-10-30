import { drawNode } from "./render_nodes.js";
import { paintedNodeBounds } from "./painted-node-bounds.js";
import { needsSvgRaster } from "./svg-raster-support.js";
import { escapeXml, number } from "./editor_svg_xml.js";

/** Bake only affected artwork; ordinary paths and text remain editable SVG elements. */
export function createSvgRasterResolver({
  bitmapOf,
  maskOf
}) {
  return node => {
    if (!needsSvgRaster(node)) return null;
    const bounds = paintedNodeBounds(node);
    const x = Math.floor(bounds.x),
      y = Math.floor(bounds.y);
    const width = Math.max(1, Math.ceil(bounds.x + bounds.width) - x);
    const height = Math.max(1, Math.ceil(bounds.y + bounds.height) - y);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("SVG_RASTER_CONTEXT_UNAVAILABLE");
      context.translate(-x, -y);
      // Layer blending belongs to the parent SVG, not an empty offscreen backdrop.
      drawNode(context, {
        ...node,
        blendMode: "source-over"
      }, bitmapOf, maskOf, null, false);
      const blend = node.blendMode && node.blendMode !== "source-over" ? ` style="mix-blend-mode:${escapeXml(node.blendMode)}"` : "";
      return `<image data-voo-raster="true" href="${canvas.toDataURL("image/png")}" x="${number(x)}" y="${number(y)}" width="${number(width)}" height="${number(height)}"${blend}/>`;
    } finally {
      canvas.width = canvas.height = 0;
    }
  };
}
