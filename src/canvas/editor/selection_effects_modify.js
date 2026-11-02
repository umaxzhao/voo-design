/**
 * Selection modification effects: delete selection pixels and layer-via-copy.
 */

import {
  createImageNode,
  findNode,
  NODE_KIND,
} from "./scene_model.js";
import { blurMask, contoursToMask } from "./pixel_selection.js";
import { putImage } from "../store/db.js";
import { decodeImageSource } from "./bitmap_cache.js";
import * as ops from "./doc_ops.js";

export function createSelectionModifyEffects({
  getDoc,
  cache,
  maskTools,
  selection,
  getPixelSelection,
  setPixelSelection,
  clearPixelSelection,
  select,
  replaceNodeBitmap,
  syncAnts,
  requestRender,
  notify,
  commitSelectionEffect,
}) {
  /**
   * Cuts the selected pixels out of the layer itself.
   *
   * Destructive on purpose: this rewrites the layer's bitmap rather than
   * hiding pixels behind a mask, because a marquee delete is expected to
   * remove image data, not to add a mask the user then has to reason about.
   * Undo still covers it — replaceNodeBitmap commits a document write.
   *
   * The selection is document geometry and the bitmap is the layer's own
   * pixels, so the rings are rebased on the way in. Node rotation is not
   * accounted for, the same simplification regions make.
   */
  async function deleteSelectionPixels() {
    const doc = getDoc();
    const current = getPixelSelection();
    if (!current?.nodeId || !current.contours?.length) return false;
    const node = findNode(doc, current.nodeId);
    if (!node || node.kind !== NODE_KIND.IMAGE) return false;
    // A fully locked or pixel-locked layer refuses to change its bitmap.
    if (node.locked || node.lockImagePixels) return false;
    const bitmap = cache.get(node);
    if (!bitmap) return false;

    const width = bitmap.naturalWidth ?? bitmap.width;
    const height = bitmap.naturalHeight ?? bitmap.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(bitmap, 0, 0);

    const scaleX = width / (node.width || width);
    const scaleY = height / (node.height || height);
    // A feathered selection deletes with its softened alpha map (Photoshop's
    // feathered delete): the erased edge falls off instead of clipping hard.
    const alphaMap =
      current.feather > 0
        ? blurMask(
            contoursToMask(current.contours, node, width, height),
            width,
            height,
            current.feather,
          )
        : null;
    if (alphaMap) {
      const image = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < alphaMap.length; i += 1) {
        image.data[i * 4 + 3] = Math.round(
          image.data[i * 4 + 3] * (1 - alphaMap[i]),
        );
      }
      ctx.putImageData(image, 0, 0);
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      for (const ring of current.contours) {
        ring.forEach(([x, y], index) => {
          const pixelX = (x - node.x) * scaleX;
          const pixelY = (y - node.y) * scaleY;
          if (index === 0) ctx.moveTo(pixelX, pixelY);
          else ctx.lineTo(pixelX, pixelY);
        });
        ctx.closePath();
      }
      ctx.fill();
    }

    // Compute non-transparent pixel bounds to auto-trim the bounding box
    const { data: pixelData } = ctx.getImageData(0, 0, width, height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (pixelData[(y * width + x) * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    let finalCanvas = canvas;
    let patchBounds = null;
    let cropOffset = { x: 0, y: 0 };

    if (
      maxX >= 0 &&
      !(minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1)
    ) {
      const croppedWidth = maxX - minX + 1;
      const croppedHeight = maxY - minY + 1;
      const croppedCanvas = document.createElement("canvas");
      croppedCanvas.width = croppedWidth;
      croppedCanvas.height = croppedHeight;
      croppedCanvas.getContext("2d").drawImage(canvas, -minX, -minY);
      finalCanvas = croppedCanvas;
      cropOffset = { x: minX, y: minY };
      patchBounds = {
        x: node.x + minX / scaleX,
        y: node.y + minY / scaleY,
        width: croppedWidth / scaleX,
        height: croppedHeight / scaleY,
      };
    }

    // If the node has an active Mask, also erase the selection area and crop matching
    let nextMaskId = node.maskId ?? null;
    if (node.maskId) {
      const maskCanvas = maskTools.maskSourceOf(node);
      if (maskCanvas) {
        const mWidth = maskCanvas.width;
        const mHeight = maskCanvas.height;
        const mScaleX = mWidth / (node.width || mWidth);
        const mScaleY = mHeight / (node.height || mHeight);

        const newMaskCanvas = document.createElement("canvas");
        newMaskCanvas.width = mWidth;
        newMaskCanvas.height = mHeight;
        const mCtx = newMaskCanvas.getContext("2d");
        if (mCtx) {
          mCtx.drawImage(maskCanvas, 0, 0);
          mCtx.globalCompositeOperation = "destination-out";
          mCtx.beginPath();
          for (const ring of current.contours) {
            ring.forEach(([x, y], index) => {
              const pixelX = (x - node.x) * mScaleX;
              const pixelY = (y - node.y) * mScaleY;
              if (index === 0) mCtx.moveTo(pixelX, pixelY);
              else mCtx.lineTo(pixelX, pixelY);
            });
            mCtx.closePath();
          }
          mCtx.fill();

          let finalMaskCanvas = newMaskCanvas;
          if (patchBounds) {
            const mCropX = (cropOffset.x / width) * mWidth;
            const mCropY = (cropOffset.y / height) * mHeight;
            const mCropW = (finalCanvas.width / width) * mWidth;
            const mCropH = (finalCanvas.height / height) * mHeight;
            const croppedMaskCanvas = document.createElement("canvas");
            croppedMaskCanvas.width = mCropW;
            croppedMaskCanvas.height = mCropH;
            croppedMaskCanvas
              .getContext("2d")
              .drawImage(newMaskCanvas, -mCropX, -mCropY);
            finalMaskCanvas = croppedMaskCanvas;
          }

          const maskBlob = await new Promise((resolve) =>
            finalMaskCanvas.toBlob(resolve, "image/png"),
          );
          if (maskBlob) {
            const newMaskId = `mask-${crypto.randomUUID()}`;
            await putImage(newMaskId, maskBlob);
            const decodedMask = await decodeImageSource(
              finalMaskCanvas.toDataURL("image/png"),
            );
            if (decodedMask) {
              cache.putMask(newMaskId, decodedMask);
              nextMaskId = newMaskId;
            }
          }
        }
      }
    }

    const replaced = await replaceNodeBitmap(
      current.nodeId,
      finalCanvas.toDataURL("image/png"),
      { maskId: nextMaskId, patch: patchBounds },
    );
    if (replaced) {
      setPixelSelection(null);
      syncAnts();
      requestRender();
      notify();
    }
    return replaced;
  }

  /**
   * Copies the selected pixels out of the layer into a brand-new image node
   * beside it (Photoshop's Layer via Copy, ⌘J): the original layer is left
   * untouched, and the copy is auto-trimmed to the selection's bounds.
   */
  async function extractSelectionImageNode(current = getPixelSelection()) {
    const doc = getDoc();
    const contours = current?.contours;
    if (!contours?.length) return null;
    const targetNodeId =
      current?.nodeId ||
      selection.getIds()[0] ||
      doc.nodes.find((n) => n.kind === NODE_KIND.IMAGE)?.id;
    if (!targetNodeId) return null;
    const node = findNode(doc, targetNodeId);
    if (!node || node.kind !== NODE_KIND.IMAGE) return null;
    const bitmap = cache.get(node);
    if (!bitmap) return null;
    const width = bitmap.naturalWidth ?? bitmap.width;
    const height = bitmap.naturalHeight ?? bitmap.height;
    if (!(width > 0) || !(height > 0)) return null;
    const scaleX = width / (node.width || width);
    const scaleY = height / (node.height || height);

    // Copy the layer, then keep only the selection's pixels with smooth anti-aliased edge falloff.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const featherRadius = current.feather > 0 ? current.feather : 0.6;
    const alphaMap = blurMask(
      contoursToMask(contours, node, width, height),
      width,
      height,
      featherRadius,
    );
    if (alphaMap) {
      const image = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < alphaMap.length; i += 1) {
        image.data[i * 4 + 3] = Math.round(image.data[i * 4 + 3] * alphaMap[i]);
      }
      ctx.putImageData(image, 0, 0);
    }

    // Trim to the non-transparent bounds so the new node hugs the copy.
    const { data } = ctx.getImageData(0, 0, width, height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const cropped = document.createElement("canvas");
    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    cropped.width = cropWidth;
    cropped.height = cropHeight;
    cropped.getContext("2d").drawImage(canvas, -minX, -minY);

    const blob = await new Promise((resolve) =>
      cropped.toBlob(resolve, "image/png"),
    );
    if (!blob) return null;
    const imageId = `img-${crypto.randomUUID()}`;
    await putImage(imageId, blob);

    const newNode = createImageNode({
      x: node.x + minX / scaleX,
      y: node.y + minY / scaleY,
      width: cropWidth / scaleX,
      height: cropHeight / scaleY,
      imageId,
    });
    return { newNode, blob, node, cropWidth, cropHeight, scaleX, scaleY };
  }

  async function layerFromSelection() {
    const extracted = await extractSelectionImageNode(getPixelSelection());
    if (!extracted?.newNode) return false;
    const { newNode } = extracted;
    // In-place creation: place duplicate exactly on top of original selection
    commitSelectionEffect(ops.addNode(getDoc(), newNode));
    clearPixelSelection();
    select(newNode.id);
    requestRender();
    notify();
    return true;
  }

  return {
    deleteSelectionPixels,
    extractSelectionImageNode,
    layerFromSelection,
  };
}
