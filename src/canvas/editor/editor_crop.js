/**
 * The crop tool: a rectangle over the page that `applyCrop` keeps as a
 * non-destructive crop rect on the document. Nothing is deleted — the full
 * canvas and every node stay in the document, and the renderer, viewport and
 * exports treat the crop rect as the visible page. Removing the crop (reset
 * or undo) restores the whole picture.
 */

import * as ops from "./doc_ops.js";
import { MIN_DOC_SIZE } from "./scene_model_core.js";
import { effectivePage } from "./scene_model.js";
import {
  clampCropRect,
  straightenCropRect,
} from "./crop_geometry.js";
import {
  applyDestructiveCrop as bakeDestructiveCrop,
  imageNodeCropPlan,
} from "./crop_destructive.js";
import { commitEditorDocument } from "../undo-action-contracts.js";

const NO_IMAGE_LAYER_CROP = Object.freeze({
  begin: () => false,
  cancel: () => {},
  isActive: () => false,
  getRect: () => null,
  getFullBounds: () => null,
  apply: () => false,
  reset: () => null,
  setRect: () => false,
  previewNode: () => null,
});

export function createCrop({
  getDoc,
  setDoc,
  notify,
  requestRender,
  zoomToFit,
  imageLayerCrop = NO_IMAGE_LAYER_CROP,
  cache,
  putImage,
  deleteImage,
  decodeImageSource,
  isDisposed,
}) {
  let cropRect = null;
  /** Aspect ratio to hold while dragging the frame, or null for free. */
  let cropRatio = null;
  /** The crop tool's input mode: "free" | "ratio" | "size". */
  let cropMode = "free";
  /** Fixed-size entry (doc px) used by the "size" mode. */
  let cropSizeW = 0;
  let cropSizeH = 0;
  /** Straighten angle (degrees); driving it recomputes the inscribed crop. */
  let cropAngle = 0;
  /** Arming the tool frames the current page — the existing crop, if any. */
  function beginCrop() {
    const doc = getDoc();
    if (!doc?.width || !doc?.height) return;
    if (imageLayerCrop.begin()) {
      cropRect = imageLayerCrop.getRect();
      if (cropRect) {
        cropSizeW = Math.round(cropRect.width);
        cropSizeH = Math.round(cropRect.height);
      }
      requestRender();
      notify();
      return;
    }
    const page = effectivePage(doc);
    cropRect = { x: page.x, y: page.y, width: page.width, height: page.height };
    if (cropRect) {
      cropSizeW = Math.round(cropRect.width);
      cropSizeH = Math.round(cropRect.height);
    }
    requestRender();
    notify();
  }

  function cancelCrop() {
    cropRect = null;
    cropSizeW = 0;
    cropSizeH = 0;
    cropRatio = null;
    cropMode = "free";
    imageLayerCrop.cancel();
    requestRender();
    notify();
  }

  function applyCrop() {
    if (!cropRect) return false;
    const doc = getDoc();
    const rect = cropRect;
    cropRect = null;
    cropSizeW = 0;
    cropSizeH = 0;
    cropRatio = null;
    cropMode = "free";
    if (imageLayerCrop.isActive()) return imageLayerCrop.apply();
    // A frame that still covers the visible page is a no-op: there is nothing
    // to hide, so nothing is recorded.
    const page = effectivePage(doc);
    if (
      rect.x <= page.x &&
      rect.y <= page.y &&
      rect.x + rect.width >= page.x + page.width &&
      rect.y + rect.height >= page.y + page.height
    ) {
      requestRender();
      notify();
      return false;
    }
    // Non-destructive: the crop rect becomes document state, one history
    // entry, and the original pixels stay untouched underneath.
    commitEditorDocument(
      "editor.crop.change",
      setDoc,
      ops.updateDocument(doc, {
        crop: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      }),
    );
    // Null in shared mode: the free-canvas parent owns the page box and
    // re-lays out from the new effective page on its own.
    zoomToFit?.();
    return true;
  }

  /** Removes the crop and restores the full canvas. */
  function resetCrop() {
    const doc = getDoc();
    const imageReset = imageLayerCrop.reset();
    if (imageReset !== null) {
      if (imageReset) cropRect = null;
      return imageReset;
    }
    if (!doc.crop) return false;
    commitEditorDocument(
      "editor.crop.change",
      setDoc,
      ops.updateDocument(doc, { crop: null }),
    );
    requestRender();
    notify();
    return true;
  }

  /**
   * Clamped to the page or image bounds: a crop frame can never reach outside it.
   * When a ratio is set (1:1, 16:9…) the frame holds it, anchoring on the top-left
   * corner and preferring the drag's width.
   */
  function setCropRect(rect) {
    const doc = getDoc();
    const isImageCrop = imageLayerCrop.isActive();
    const bounds = isImageCrop
      ? imageLayerCrop.getFullBounds()
      : (doc ? effectivePage(doc) : null);
    if (!bounds) return;
    const pageRight = bounds.x + bounds.width;
    const pageBottom = bounds.y + bounds.height;
    let x = Math.max(bounds.x, Math.min(rect.x, pageRight - MIN_DOC_SIZE));
    let y = Math.max(bounds.y, Math.min(rect.y, pageBottom - MIN_DOC_SIZE));
    let width = Math.min(rect.width, pageRight - x);
    let height = Math.min(rect.height, pageBottom - y);
    if (cropMode === "size" && cropSizeW > 0 && cropSizeH > 0) {
      // Fixed-size mode: the box is exactly the entered W×H, anchored at the
      // requested top-left and clamped to the page — so a drag places it but
      // can never change its dimensions.
      x = Math.max(bounds.x, Math.min(rect.x, pageRight - cropSizeW));
      y = Math.max(bounds.y, Math.min(rect.y, pageBottom - cropSizeH));
      width = Math.max(MIN_DOC_SIZE, Math.min(cropSizeW, pageRight - x));
      height = Math.max(MIN_DOC_SIZE, Math.min(cropSizeH, pageBottom - y));
    } else if (cropRatio && cropRatio > 0) {
      let targetHeight = width / cropRatio;
      if (targetHeight > pageBottom - y) {
        // The width would push the frame off the bounds; re-anchor on height.
        height = pageBottom - y;
        width = height * cropRatio;
        if (width > pageRight - x) width = pageRight - x;
      } else {
        height = targetHeight;
      }
      width = Math.max(MIN_DOC_SIZE, width);
      height = Math.max(MIN_DOC_SIZE, height);
    }
    const resolved = { x, y, width, height };
    if (isImageCrop) {
      imageLayerCrop.setRect(resolved);
      cropRect = imageLayerCrop.getRect();
    } else {
      cropRect = resolved;
      requestRender();
    }
  }

  function setCropRatio(ratio) {
    const value = Number(ratio);
    cropRatio = Number.isFinite(value) && value > 0 ? value : null;
    // A positive ratio is a Fixed Ratio selection; clearing it returns to Free.
    cropMode = cropRatio ? "ratio" : "free";
    // Re-apply the ratio to the frame in place.
    if (cropRect) setCropRect(cropRect);
    // Always notify so the panel re-reads the mode/ratio it displays.
    notify();
  }

  /** The visible page or image the crop operates inside (the existing crop, if any). */
  function currentPage() {
    if (imageLayerCrop.isActive()) {
      return imageLayerCrop.getFullBounds();
    }
    const doc = getDoc();
    if (!doc?.width || !doc?.height) return null;
    return effectivePage(doc);
  }

  /**
   * Switches the crop tool's input mode. Entering Fixed Ratio gives a default
   * 1:1 ratio, Fixed Size defaults to the full page or layer; leaving to Free clears the
   * ratio constraint so the frame may be dragged freely again.
   */
  function setCropMode(mode) {
    if (mode === "ratio") {
      cropMode = "ratio";
      if (!cropRatio || cropRatio <= 0) cropRatio = 1;
    } else if (mode === "size") {
      cropMode = "size";
      if (cropSizeW <= 0 || cropSizeH <= 0) {
        if (cropRect) {
          cropSizeW = Math.round(cropRect.width);
          cropSizeH = Math.round(cropRect.height);
        } else {
          const page = currentPage();
          cropSizeW = page ? page.width : MIN_DOC_SIZE;
          cropSizeH = page ? page.height : MIN_DOC_SIZE;
        }
      }
    } else {
      cropMode = "free";
      cropRatio = null;
    }
    // Re-solve the frame so it honours the new mode's constraint in place.
    if (cropRect) {
      if (cropMode === "size" && cropSizeW > 0 && cropSizeH > 0) {
        const page = currentPage();
        if (page) {
          const anchorX = cropRect ? cropRect.x : page.x;
          const anchorY = cropRect ? cropRect.y : page.y;
          setCropRect(
            clampCropRect(
              { x: anchorX, y: anchorY, width: cropSizeW, height: cropSizeH },
              page,
              { minSize: MIN_DOC_SIZE },
            ),
          );
        }
      } else {
        setCropRect(cropRect);
      }
    }
    // Always notify so the panel re-reads the mode/ratio/size state.
    notify();
  }

  /**
   * The fixed-size entry (doc px). A numeric W/H entry re-solves the crop frame
   * to exactly that rectangle via cropRectFromSize; entering a size also arms
   * the Fixed Size mode.
   */
  function setCropSize(width, height) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    cropSizeW = w;
    cropSizeH = h;
    cropMode = "size";
    const page = currentPage();
    if (page) {
      const anchorX = cropRect ? cropRect.x : page.x;
      const anchorY = cropRect ? cropRect.y : page.y;
      setCropRect(
        clampCropRect(
          { x: anchorX, y: anchorY, width: w, height: h },
          page,
          { minSize: MIN_DOC_SIZE },
        ),
      );
    }
    notify();
  }

  /**
   * The "straighten" angle (degrees): maps it to the largest axis-aligned crop
   * still fully inside the page after that rotation (straightenCropRect) and
   * applies it to the frame.
   */
  function setCropAngle(angleDeg) {
    cropAngle = Number(angleDeg) || 0;
    const page = currentPage();
    if (page)
      setCropRect(
        straightenCropRect(page, cropAngle, { minSize: MIN_DOC_SIZE }),
      );
    notify();
  }

  /**
   * The DESTRUCTIVE crop: bakes the rect into the document — the page is
   * resized to the crop, `doc.crop` is cleared, and every node outside the crop
   * is culled and the rest clipped + translated (crop_destructive.js). A single
   * history entry, like applyCrop.
   */
  async function applyDestructiveCrop() {
    if (!cropRect) return false;
    const doc = getDoc();
    const rect = cropRect;
    cropRect = null;
    let next = bakeDestructiveCrop(doc, rect);
    if (next === doc) {
      // A crop that would not shrink the page records nothing.
      requestRender();
      notify();
      return false;
    }
    // Flatten: every surviving image node whose box the bake clipped must
    // swap its bitmap to the crop region, so the composite is not stretched.
    // Done while building `next`, before the ONE setDoc below, so the whole
    // destructive crop is a single history entry (never per-node setDoc).
    const failedNodeIds = new Set();
    const createdImageIds = [];
    const survivors = next.nodes ?? [];
    for (const node of survivors) {
      if (node.kind !== "image") continue;
      let createdImageId = null;
      try {
        const original = doc.nodes.find((entry) => entry.id === node.id);
        const bitmap = original ? cache?.get(original) : null;
        if (!bitmap) {
          const plan = imageNodeCropPlan(original, rect, 1, 1);
          if (plan?.needsClip) failedNodeIds.add(node.id);
          continue;
        }
        const bmpW = bitmap.naturalWidth ?? bitmap.width;
        const bmpH = bitmap.naturalHeight ?? bitmap.height;
        // The crop plan is computed against the ORIGINAL box (pre-clip/translate).
        const plan = imageNodeCropPlan(original, rect, bmpW, bmpH);
        if (!plan || !plan.needsClip) continue;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(plan.sw));
        canvas.height = Math.max(1, Math.round(plan.sh));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          failedNodeIds.add(node.id);
          continue;
        }
        ctx.drawImage(
          bitmap,
          plan.sx,
          plan.sy,
          plan.sw,
          plan.sh,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        const mask = original.maskId
          ? (cache?.getMask?.(original) ??
            cache?.get?.({ imageId: original.maskId }))
          : null;
        if (original.maskId && !mask) {
          failedNodeIds.add(node.id);
          continue;
        }
        if (mask) {
          ctx.save();
          ctx.globalCompositeOperation = "destination-in";
          ctx.drawImage(
            mask,
            plan.sx,
            plan.sy,
            plan.sw,
            plan.sh,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          ctx.restore();
        }
        const dataUrl = canvas.toDataURL("image/png");
        if (typeof dataUrl !== "string" || !dataUrl) {
          failedNodeIds.add(node.id);
          continue;
        }
        const imageId = `img-${crypto.randomUUID()}`;
        const decoded = await decodeImageSource(dataUrl);
        if (!decoded || isDisposed?.()) {
          failedNodeIds.add(node.id);
          continue;
        }
        await putImage(imageId, dataUrl);
        createdImageId = imageId;
        createdImageIds.push(imageId);
        cache.put({ imageId }, decoded);
        node.imageId = imageId;
        node.maskId = null;
      } catch (e) {
        if (createdImageId) {
          await deleteImage(createdImageId);
          cache?.delete(createdImageId);
          createdImageIds.splice(createdImageIds.indexOf(createdImageId), 1);
        }
        failedNodeIds.add(node.id);
        console.warn("destructive crop flatten skipped for a node", e);
      }
    }
    if (isDisposed?.() || getDoc() !== doc) {
      await Promise.all(createdImageIds.map((imageId) => deleteImage(imageId)));
      createdImageIds.forEach((imageId) => cache?.delete(imageId));
      return false;
    }
    if (failedNodeIds.size > 0) {
      next = {
        ...next,
        nodes: next.nodes.filter((node) => !failedNodeIds.has(node.id)),
      };
    }
    commitEditorDocument("editor.crop.change", setDoc, next);
    zoomToFit?.();
    return true;
  }

  return {
    getCropRect: () => cropRect,
    isImageCrop: imageLayerCrop.isActive,
    getCropPreviewNode: imageLayerCrop.previewNode,
    getCropRatio: () => cropRatio,
    getCropMode: () => cropMode,
    getCropSize: () => ({ width: cropSizeW, height: cropSizeH }),
    getCropAngle: () => cropAngle,
    beginCrop,
    cancelCrop,
    applyCrop,
    applyDestructiveCrop,
    resetCrop,
    setCropRect,
    setCropRatio,
    setCropMode,
    setCropSize,
    setCropAngle,
  };
}
