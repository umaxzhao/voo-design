/**
 * Region masks and annotated layer exports for image editor.
 */

import { getRegionColor } from "./scene_model_core.js";
import {
  effectivePage,
  NODE_KIND,
} from "./scene_model.js";
import { regionOutlineInDoc } from "./doc_ops.js";

export function createRegionExport({ getDoc, exportPngCanvas, exportNodePng }) {
  /**
   * Renders whatever a rectangle covers, flattened, at page resolution.
   *
   * A region can name something no single layer holds — a face made of a photo
   * and two marks over it, or a corner of the arrangement. Exporting the
   * composite inside the box captures what the user actually sees there,
   * which is what they meant to point at.
   *
   * When the document is cropped, the rendered page canvas has its top-left
   * shifted to effectivePage(doc). Translate the rectangle's document
   * coordinates by the cropped page origin so sampling aligns exactly with
   * what the cropped page displays. Any part of the rectangle outside the
   * cropped page remains transparent.
   */
  function exportRectPng(rect, scale = 1) {
    const doc = getDoc();
    const page = effectivePage(doc);
    const pageCanvas = exportPngCanvas(scale);
    if (!pageCanvas) return null;
    const rx = rect?.x ?? 0;
    const ry = rect?.y ?? 0;
    const rw = rect?.width ?? 0;
    const rh = rect?.height ?? 0;
    const width = Math.max(1, Math.round(rw * scale));
    const height = Math.max(1, Math.round(rh * scale));
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const outputCtx = output.getContext("2d");
    if (!outputCtx) return null;
    const dx = Math.round((page.x - rx) * scale);
    const dy = Math.round((page.y - ry) * scale);
    outputCtx.drawImage(pageCanvas, dx, dy);
    return output.toDataURL("image/png");
  }

  /**
   * Every annotated image layer, rendered on its own.
   *
   * An annotation is the opt-in: describing a layer says "send this to the
   * model, and here is what it is". Layers left undescribed stay local, which
   * keeps a working document full of scratch layers from being uploaded
   * wholesale.
   *
   * Rendered from the original bitmap, like exportNodePng — the model should
   * see the picture, not the picture as currently scaled on the page.
   */
  function exportAnnotatedLayers() {
    const doc = getDoc();
    const described = (node) => {
      const source = node.kind === NODE_KIND.REGION ? node.label : node.prompt;
      return typeof source === "string" ? source.trim() : "";
    };

    return doc.nodes
      .filter((node) => {
        if (!described(node)) return false;
        // A picture is sent as itself; a region is sent as whatever it covers,
        // which may be several layers together — a face made of a photo and
        // the marks drawn over it is one thing to the reader, and one
        // reference to the model.
        return node.kind === NODE_KIND.IMAGE || node.kind === NODE_KIND.REGION;
      })
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((node) => {
        const dataUrl =
          node.kind === NODE_KIND.REGION
            ? exportRectPng(node)
            : exportNodePng(node.id);
        return dataUrl ? { prompt: described(node), dataUrl } : null;
      })
      .filter(Boolean);
  }

  /**
   * Renders a 1:1 multi-color semantic segmentation map for all regions.
   * Background is pure black #000000 (or transparent), and each region is
   * filled with its assigned high-contrast semantic color.
   */
  function exportRegionMaskCanvas({ background = "#000000" } = {}) {
    const doc = getDoc();
    const regions = doc.nodes.filter(
      (node) => node.kind === NODE_KIND.REGION && node.visible !== false,
    );
    const output = document.createElement("canvas");
    output.width = doc.width;
    output.height = doc.height;
    const ctx = output.getContext("2d");
    if (!ctx) return output;

    if (background && background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, doc.width, doc.height);
    }

    regions.forEach((region, index) => {
      const outline = regionOutlineInDoc(doc, region);
      if (!outline || !outline.points || outline.points.length === 0) return;
      const color = region.color || getRegionColor(index).hex;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(outline.points[0].x, outline.points[0].y);
      for (let i = 1; i < outline.points.length; i += 1) {
        ctx.lineTo(outline.points[i].x, outline.points[i].y);
      }
      ctx.closePath();
      ctx.fill();
    });

    return output;
  }

  function exportRegionMaskPng(options) {
    return exportRegionMaskCanvas(options)?.toDataURL("image/png") ?? null;
  }

  return {
    exportRectPng,
    exportAnnotatedLayers,
    exportRegionMaskCanvas,
    exportRegionMaskPng,
  };
}
