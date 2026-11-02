/**
 * Bitmap write-back for image nodes.
 *
 * Every AI/local repair path (pixel-selection fill, outpaint, inpaint,
 * patch, clone stamp) ends by swapping a node's bitmap for a freshly
 * generated one. The generation round trip takes seconds, so the shared
 * concern here is the "document moved on while we were waiting" guard:
 * refuse the write if the node's `imageId` no longer matches what the
 * request started from, or if the editor was disposed in the meantime.
 */
import { findNode, NODE_KIND } from "./scene_model.js";
import { decodeImageSource } from "./bitmap_cache.js";
import {
  ensureImagePyramid,
  invalidateAdjustmentCache,
  releaseImagePyramid,
} from "./scene_renderer.js";
import { putImage } from "../store/db.js";
import * as ops from "./doc_ops.js";
import { commitEditorDocument } from "../undo-action-contracts.js";

export function createBitmapWriter({
  getDoc,
  setDoc,
  cache,
  glAdjustments,
  isDisposed,
  notify,
}) {
  const transformsInFlight = new Set();
  const activeTransformPromises = new Set();

  function trackTransform(promise) {
    activeTransformPromises.add(promise);
    promise.finally(() => {
      activeTransformPromises.delete(promise);
    });
    return promise;
  }

  /**
   * Swaps an image layer's pixels for new ones, keeping its place on the page.
   *
   * What a repaint lands in. The node's box is left alone deliberately: the
   * layer was arranged where it is, and a replacement that resized itself
   * would undo that arrangement to gain nothing — the picture is drawn into
   * the same rectangle either way.
   *
   * Preserve the editable matte unless the caller explicitly replaces it.
   */
  async function replaceNodeBitmap(
    nodeId,
    dataUrl,
    { maskId, patch, shouldApply, resetCrop = false } = {},
  ) {
    return trackTransform(
      (async () => {
        const node = findNode(getDoc(), nodeId);
        if (!node || node.kind !== NODE_KIND.IMAGE) return false;
        if (shouldApply && !shouldApply()) return false;
        if (transformsInFlight.has(nodeId)) return false;

        transformsInFlight.add(nodeId);
        notify();
        try {
          const bitmap = await decodeImageSource(dataUrl);
          if (isDisposed() || !bitmap) return false;
          const blob = await (await fetch(dataUrl)).blob();
          const imageId = `img-${crypto.randomUUID()}`;

          // The document may have moved on during the request — a repaint takes
          // seconds, and writing over whatever is there now would be a surprise.
          const current = findNode(getDoc(), nodeId);
          if (
            !current ||
            (current.imageId ?? null) !== (node.imageId ?? null)
          ) {
            return false;
          }
          if (isDisposed()) return false;
          if (shouldApply && !shouldApply()) return false;
          // No blob is written until the moving-target guard has passed.
          await putImage(imageId, blob);

          // Persisting can yield to a mask edit, undo, cancellation or page close.
          // Agent edits revalidate their captured target immediately before commit.
          if (isDisposed() || (shouldApply && !shouldApply())) return false;

          const previous = cache.get(node);
          cache.put({ imageId }, bitmap);
          ensureImagePyramid(bitmap);
          if (previous) {
            glAdjustments.release(previous);
            invalidateAdjustmentCache(previous);
            releaseImagePyramid(previous, glAdjustments);
          }
          const targetMaskId =
            maskId !== undefined
              ? maskId
              : (findNode(getDoc(), nodeId)?.maskId ?? null);
          const updated = ops.updateNode(getDoc(), nodeId, {
            imageId,
            maskId: targetMaskId,
            reducedPreview: false,
            ...(patch || {}),
          });
          const next = resetCrop
            ? {
                ...updated,
                nodes: updated.nodes.map((candidate) => {
                  if (candidate.id !== nodeId) return candidate;
                  const replacement = { ...candidate };
                  delete replacement.crop;
                  return replacement;
                }),
              }
            : updated;
          commitEditorDocument(
            "editor.bitmap.replace",
            setDoc,
            next,
          );
          return true;
        } finally {
          transformsInFlight.delete(nodeId);
          notify();
        }
      })(),
    );
  }

  /**
   * Outpaint write-back: swaps in the extended bitmap and grows the node's box
   * according to the precomputed scene patch. The same patch is consumed by
   * the Group materialiser, so bounds and document growth have one owner.
   */
  async function outpaintNodeBitmap(nodeId, dataUrl, scenePatch) {
    return trackTransform(
      (async () => {
        const node = findNode(getDoc(), nodeId);
        if (!node || node.kind !== NODE_KIND.IMAGE) return false;
        const { nodeRect, documentGrowth } = scenePatch ?? {};
        if (
          !nodeRect ||
          nodeRect.width <= 0 ||
          nodeRect.height <= 0 ||
          !documentGrowth
        ) {
          return false;
        }
        if (transformsInFlight.has(nodeId)) return false;

        transformsInFlight.add(nodeId);
        notify();
        try {
          const bitmap = await decodeImageSource(dataUrl);
          if (isDisposed() || !bitmap) return false;
          const blob = await (await fetch(dataUrl)).blob();
          const imageId = `img-${crypto.randomUUID()}`;

          // Same moving-target guard as replaceNodeBitmap: the generation round
          // trip takes seconds, and the document may have moved on.
          const current = findNode(getDoc(), nodeId);
          if (
            !current ||
            (current.imageId ?? null) !== (node.imageId ?? null)
          ) {
            return false;
          }
          if (isDisposed()) return false;
          await putImage(imageId, blob);

          const previous = cache.get(node);
          cache.put({ imageId }, bitmap);
          ensureImagePyramid(bitmap);
          if (previous) {
            glAdjustments.release(previous);
            invalidateAdjustmentCache(previous);
            releaseImagePyramid(previous, glAdjustments);
          }

          let next = getDoc();
          if (
            documentGrowth.width !== next.width ||
            documentGrowth.height !== next.height
          ) {
            next = {
              ...next,
              width: documentGrowth.width,
              height: documentGrowth.height,
            };
          }
          if (documentGrowth.shiftX || documentGrowth.shiftY) {
            next = {
              ...next,
              nodes: next.nodes.map((item) =>
                item.id === nodeId
                  ? item
                  : {
                      ...item,
                      x: item.x + documentGrowth.shiftX,
                      y: item.y + documentGrowth.shiftY,
                    },
              ),
            };
          }
          commitEditorDocument(
            "editor.bitmap.outpaint",
            setDoc,
            ops.updateNode(next, nodeId, {
              imageId,
              reducedPreview: false,
              ...nodeRect,
            }),
          );
          return true;
        } finally {
          transformsInFlight.delete(nodeId);
          notify();
        }
      })(),
    );
  }

  return {
    transformsInFlight,
    activeTransformPromises,
    trackTransform,
    replaceNodeBitmap,
    outpaintNodeBitmap,
  };
}
