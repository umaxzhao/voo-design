import { draw } from "./scene_renderer.js";
import { effectivePage } from "./scene_model_geometry.js";
import { hasBlendModes } from "./scene_model_core.js";
import { exportPageBackground } from "./editor_export_bounds.js";
import { escapeXml, number } from "./editor_svg_xml.js";

/** Composite only the supplied scene, so selection exports never leak other layers. */
export function createSvgSceneRasterResolver({
  bitmapOf,
  maskOf
}) {
  return (doc, {
    transparent
  }) => {
    const page = effectivePage(doc);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(page.width));
    canvas.height = Math.max(1, Math.round(page.height));
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("SVG_RASTER_CONTEXT_UNAVAILABLE");
      draw(context, {
        doc,
        viewport: {
          zoom: 1,
          panX: -page.x,
          panY: -page.y
        },
        dpr: 1,
        includeRegions: false,
        // A transparent selection has no sheet; checkerboard is editor chrome.
        pageBackground: doc.backgroundColor !== "transparent" && exportPageBackground(transparent, hasBlendModes(doc)),
        bitmapOf,
        maskOf,
        fullResolution: true
      });
      return `<image data-voo-raster="scene" href="${escapeXml(canvas.toDataURL("image/png"))}" x="${number(page.x)}" y="${number(page.y)}" width="${number(page.width)}" height="${number(page.height)}"/>`;
    } finally {
      canvas.width = canvas.height = 0;
    }
  };
}
