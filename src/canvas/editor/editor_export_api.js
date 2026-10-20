/**
 * Engine-facing export-domain API.
 *
 * Exposes single-node rasterisation, PSD export generation, and quick-mask logic.
 */

import { drawNode } from "./render_nodes.js";
import { nodeAABB } from "./scene_geometry.js";
import { NODE_KIND } from "./scene_model.js";
import { normalizeImageCrop } from "./image_layer_crop.js";

/**
 * Engine-facing export-domain API.
 *
 * This is the first command-domain slice extracted from the createEditor
 * closure. It deliberately receives **live accessors** for state that the
 * engine reassigns (`doc`, `pixelSelection`) rather than value copies, and
 * stable object references for the subsystem handles it delegates to.
 *
 * ctx fields used here:
 * - getDoc(): () => current document (live)
 * - getPixelSelection(): () => current pixel selection (live)
 * - cache: bitmap cache object (stable)
 * - maskTools: mask subsystem (stable; exposes flushMasks/maskSourceOf/quickMaskFromSelection)
 * - paintTools: paint subsystem (stable; exposes flushPaints)
 * - glAdjustments: GPU adjustment renderer handle (stable; nullable)
 */
export function createExportApi({
  getDoc,
  getPixelSelection,
  cache,
  maskTools,
  paintTools,
  glAdjustments,
  renderComposite = null,
}) {
  /**
   * One node rendered on its own at its page size — the raster a PSD layer
   * wants. Adjustments bake into the pixels (which is what the editor shows);
   * a background-removal matte becomes a layer mask.
   */
  function renderNodeImageData(node) {
    if (!node) return null;
    const hasTransform = Boolean(
      node.rotation || node.shear || node.perspectiveQuad,
    );
    const bounds = hasTransform
      ? nodeAABB(node)
      : { x: node.x, y: node.y, width: node.width, height: node.height };
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.translate(-bounds.x, -bounds.y);
    const gpu = glAdjustments
      ? {
          renderer: glAdjustments,
          viewport: { zoom: 1, panX: 0, panY: 0 },
          dpr: 1,
          fullResolution: true,
        }
      : null;
    drawNode(
      ctx,
      { ...node, visible: true, opacity: 1, blendMode: "source-over" },
      (n) => cache.get(n) ?? null,
      (n) => maskTools?.maskSourceOf?.(n) ?? null,
      gpu,
      false,
    );
    const imageData = ctx.getImageData(0, 0, width, height);
    let maskData = null;
    const matte = maskTools?.maskSourceOf?.(node);
    if (matte) {
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext("2d");
      if (maskCtx) {
        if (node.kind === NODE_KIND.IMAGE && node.crop) {
          const sourceWidth = matte.naturalWidth ?? matte.width;
          const sourceHeight = matte.naturalHeight ?? matte.height;
          const crop = normalizeImageCrop(node, sourceWidth, sourceHeight);
          const scaleX = matte.width / sourceWidth;
          const scaleY = matte.height / sourceHeight;
          maskCtx.drawImage(
            matte,
            crop.x * scaleX,
            crop.y * scaleY,
            crop.width * scaleX,
            crop.height * scaleY,
            0,
            0,
            width,
            height,
          );
        } else {
          maskCtx.drawImage(matte, 0, 0, width, height);
        }
        maskData = maskCtx.getImageData(0, 0, width, height);
      }
    }
    return {
      imageData,
      maskData,
      bounds: {
        top: Math.round(bounds.y),
        left: Math.round(bounds.x),
        bottom: Math.round(bounds.y + bounds.height),
        right: Math.round(bounds.x + bounds.width),
      },
    };
  }

  return {
    renderNodeImageData,
    /** The whole document as PSD bytes (ArrayBuffer). */
    async exportPsd() {
      await maskTools.flushMasks();
      await paintTools.flushPaints();
      const { buildPsd, encodePsd } = await import("./psd_export.js");
      const psd = buildPsd({
        doc: getDoc(),
        renderNode: renderNodeImageData,
        // The file's composite image must show the picture, not the bare page
        // colour — reuse the PNG export's whole-page render for it.
        renderComposite: renderComposite
          ? () => {
              const canvas = renderComposite();
              if (!canvas) return null;
              const ctx = canvas.getContext("2d");
              if (!ctx) return null;
              return ctx.getImageData(0, 0, canvas.width, canvas.height);
            }
          : null,
      });
      return encodePsd(psd);
    },
    /**
     * Quick mask: the current marquee / lasso / wand selection becomes an
     * editable matte on the node it was drawn over.
     */
    async quickMaskFromSelection() {
      const selection = getPixelSelection();
      if (!selection?.nodeId || !selection.contours?.length) return false;
      return maskTools.quickMaskFromSelection(
        selection.nodeId,
        selection.contours,
      );
    },
  };
}
