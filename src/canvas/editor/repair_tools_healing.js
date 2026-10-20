/**
 * Healing and clone stamp tools: Patch Tool (Poisson blending) and Clone Stamp.
 *
 * Extracted from editor_repair_tools.js to keep both modules under 400 lines.
 */
import { findNode, NODE_KIND } from "./scene_model.js";
import { clipMaskToSelection, selectionCoverage } from "./pixel_selection.js";
import { decodeImageSource } from "./bitmap_cache.js";
import { toNodeLocal, toNodeLocalDelta } from "./scene_geometry.js";

export function createRepairHealingTools({
  getDoc,
  cache,
  getPixelSelection,
  replaceNodeBitmap,
  setBitmapPreview,
  isDisposed,
  requestRender,
  notify,
}) {
  /**
   * Pure local Photoshop-style Patch Tool blending:
   * Takes the selected patch contour (docPoints), computes texture difference from (dx, dy)
   * reference location, and blends seamlessly.
   */
  async function patchBlendStroke(nodeId, docPoints, dx, dy) {
    const doc = getDoc();
    const node = findNode(doc, nodeId);
    if (!node || node.kind !== NODE_KIND.IMAGE) return false;
    const bitmap = cache.get(node);
    if (!bitmap) return false;

    const bWidth = bitmap.naturalWidth ?? bitmap.width;
    const bHeight = bitmap.naturalHeight ?? bitmap.height;
    if (!bWidth || !bHeight) return false;

    const scaleX = bWidth / (node.width || bWidth);
    const scaleY = bHeight / (node.height || bHeight);

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = bWidth;
    srcCanvas.height = bHeight;
    const srcCtx = srcCanvas.getContext("2d");
    srcCtx.drawImage(bitmap, 0, 0);

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = bWidth;
    maskCanvas.height = bHeight;
    const maskCtx = maskCanvas.getContext("2d");
    maskCtx.fillStyle = "#ffffff";
    maskCtx.strokeStyle = "#ffffff";
    maskCtx.lineWidth = 2;

    const localPoints = docPoints.map((pt) => {
      const local = toNodeLocal(node, pt);
      return {
        x: (local.x / (node.width || bWidth)) * bWidth,
        y: (local.y / (node.height || bHeight)) * bHeight,
      };
    });

    if (localPoints.length < 3) return false;

    maskCtx.beginPath();
    localPoints.forEach((pt, idx) => {
      if (idx === 0) maskCtx.moveTo(pt.x, pt.y);
      else maskCtx.lineTo(pt.x, pt.y);
    });
    maskCtx.closePath();
    maskCtx.fill();
    maskCtx.stroke();

    // An active selection is a hard boundary, so the patch is cut back to it.
    // Intersecting the mask is enough on its own: patchBlendImage only touches
    // the pixels the mask marks.
    const clipped = clipMaskToSelection(
      getPixelSelection(),
      maskCtx,
      node,
      scaleX,
      scaleY,
    );

    const { patchBlendImage, anyMaskedPixel } =
      await import("./local_inpaint.js");
    // A patch drawn wholly outside the selection now marks nothing. Saying so
    // beats handing patchBlendImage an empty mask: it would return the picture
    // unchanged and still cost the user an undo step that does nothing.
    if (clipped) {
      const marked = maskCtx.getImageData?.(0, 0, bWidth, bHeight)?.data;
      if (marked && !anyMaskedPixel(marked)) return false;
    }
    const localDelta = toNodeLocalDelta(node, { x: dx, y: dy });
    const patchDx = (localDelta.x / (node.width || bWidth)) * bWidth;
    const patchDy = (localDelta.y / (node.height || bHeight)) * bHeight;
    const patchedDataUrl = patchBlendImage(
      srcCanvas,
      maskCanvas,
      patchDx,
      patchDy,
    );
    if (!patchedDataUrl) return false;

    return await replaceNodeBitmap(nodeId, patchedDataUrl);
  }

  /**
   * Pure local Clone Stamp Tool (仿制图章):
   * Paints pixels from sourceAnchor + (point - targetAnchor) into target layer with brush softness.
   */
  async function cloneStampStroke(
    nodeId,
    docPoints,
    sourceAnchor,
    targetAnchor,
    diameter = 24,
    hardness = 0.5,
    opacity = 1,
    { persist = true } = {},
  ) {
    const doc = getDoc();
    const node = findNode(doc, nodeId);
    if (!node || node.kind !== NODE_KIND.IMAGE) return false;
    const bitmap = cache.get(node);
    if (!bitmap) return false;

    const bWidth = bitmap.naturalWidth ?? bitmap.width;
    const bHeight = bitmap.naturalHeight ?? bitmap.height;
    if (!bWidth || !bHeight) return false;

    const scaleX = bWidth / (node.width || bWidth);
    const scaleY = bHeight / (node.height || bHeight);

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = bWidth;
    srcCanvas.height = bHeight;
    const srcCtx = srcCanvas.getContext("2d");
    srcCtx.drawImage(bitmap, 0, 0);

    const localPoints = docPoints.map((pt) => {
      const local = toNodeLocal(node, pt);
      return {
        x: (local.x / (node.width || bWidth)) * bWidth,
        y: (local.y / (node.height || bHeight)) * bHeight,
      };
    });

    const localSource = toNodeLocal(node, sourceAnchor);
    const localTarget = toNodeLocal(node, targetAnchor);
    const dx =
      ((localSource.x - localTarget.x) / (node.width || bWidth)) * bWidth;
    const dy =
      ((localSource.y - localTarget.y) / (node.height || bHeight)) * bHeight;

    // The stamp writes into an ImageData, which a 2D clip cannot reach, so the
    // selection goes in as per-pixel coverage and gates each dab instead.
    const coverage = selectionCoverage(
      getPixelSelection(),
      node,
      bWidth,
      bHeight,
      scaleX,
      scaleY,
    );

    const { cloneStampImage } = await import("./local_inpaint.js");
    const stampedDataUrl = cloneStampImage(
      srcCanvas,
      localPoints,
      dx,
      dy,
      diameter * scaleX,
      hardness,
      opacity,
      coverage,
    );
    if (!stampedDataUrl) return false;

    // Bitmap preview: compute once, show a draft overlay, and do NOT write an
    // imageId/history entry. The caller confirms later with applyBitmapPreview.
    if (!persist) {
      const previewBitmap = await decodeImageSource(stampedDataUrl);
      if (!previewBitmap || isDisposed()) return false;
      setBitmapPreview({
        nodeId,
        dataUrl: stampedDataUrl,
        bitmap: previewBitmap,
        width: previewBitmap.width ?? previewBitmap.naturalWidth,
        height: previewBitmap.height ?? previewBitmap.naturalHeight,
      });
      requestRender();
      notify();
      return { preview: true, dataUrl: stampedDataUrl };
    }

    return await replaceNodeBitmap(nodeId, stampedDataUrl);
  }

  return {
    patchBlendStroke,
    cloneStampStroke,
  };
}
