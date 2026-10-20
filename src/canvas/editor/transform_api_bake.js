/**
 * Bitmap transform and layer rasterization API.
 *
 * Implements:
 * 1. 90° rotation and flip baking into image bitmap.
 * 2. Region-scoped bitmap transforms when a marquee pixel selection is active.
 * 3. Layer effect rasterization (mask, warp, perspective, color adjustments).
 * 4. Tracking and flushing in-flight async transform promises.
 */

import {
  renderTransformed,
  transformedSize,
  transformCropRect,
} from "./bitmap_transform.js";
import { selectionCropRect } from "./pixel_selection.js";
import { opaqueBounds, trimmedNodeBox } from "./rasterize_trim.js";
import { NODE_KIND, createImageNode, findNode } from "./scene_model.js";
import { normalizeImageCrop } from "./image_layer_crop.js";
import { combinedBounds, nodeAABB } from "./scene_geometry.js";
import * as ops from "./doc_ops.js";
import {
  drawImageNode,
  drawNode,
  invalidateAdjustmentCache,
} from "./scene_renderer.js";
import { deleteImage, putImage } from "../store/db.js";
import { decodeBlob } from "./bitmap_cache.js";

const RASTERIZABLE_VECTOR_KINDS = new Set([
  NODE_KIND.TEXT,
  NODE_KIND.RECT,
  NODE_KIND.ELLIPSE,
  NODE_KIND.PATH,
  NODE_KIND.BOOLEAN,
  NODE_KIND.GROUP,
]);

function groupDescendants(doc, groupId) {
  const descendants = [];
  const pending = [groupId];
  while (pending.length > 0) {
    const parentId = pending.pop();
    for (const node of doc.nodes) {
      if (node.parentId !== parentId) continue;
      descendants.push(node);
      pending.push(node.id);
    }
  }
  return descendants;
}

function nodeVisualBounds(node) {
  const bounds = nodeAABB(node);
  const stroke = Math.max(
    node.stroke && node.strokeWidth ? node.strokeWidth : 0,
    node.effects?.stroke?.enabled ? node.effects.stroke.width ?? 0 : 0,
  );
  const padding = {
    left: stroke,
    right: stroke,
    top: stroke,
    bottom: stroke,
  };
  const includeShadow = (effect) => {
    if (!effect?.enabled) return;
    const blur = Math.ceil((effect.blur ?? 0) * 2) + (effect.spread ?? 0);
    const offsetX = effect.offsetX ?? 0;
    const offsetY = effect.offsetY ?? 0;
    padding.left = Math.max(padding.left, blur - offsetX);
    padding.right = Math.max(padding.right, blur + offsetX);
    padding.top = Math.max(padding.top, blur - offsetY);
    padding.bottom = Math.max(padding.bottom, blur + offsetY);
  };
  includeShadow(node.shadow);
  includeShadow(node.effects?.shadow);
  includeShadow(node.effects?.glow);

  return {
    x: bounds.x - padding.left,
    y: bounds.y - padding.top,
    width: bounds.width + padding.left + padding.right,
    height: bounds.height + padding.top + padding.bottom,
  };
}

/**
 * Transforms ONLY the marquee-selected region of an image: crop the selection
 * bounds, run the transform on that crop, then paste it back onto a fresh
 * copy of the bitmap centred where the selection was. Used when a pixel
 * selection is active on the layer, so a rotate/flip edits the selected
 * region instead of the whole picture.
 */
export function transformNodeRegionCanvas(
  node,
  bitmap,
  kind,
  selection,
  width,
  height,
) {
  const crop = selectionCropRect(node, selection, width, height, 8);
  if (!crop) return null;
  // Same rename as the selection-repaint path: `selectionCropRect` returns
  // {x, y, width, height}, and everything below works in sx/sy/sw/sh.
  const { x: sx, y: sy, width: sw, height: sh } = crop;
  const source = document.createElement("canvas");
  source.width = sw;
  source.height = sh;
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) return null;
  sourceCtx.drawImage(bitmap, -sx, -sy);
  const transformed = renderTransformed(source, kind);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;
  outCtx.drawImage(bitmap, 0, 0);
  // Rest the transformed crop on the selection's centre so a rotation that
  // swaps the axes still lands on the region rather than the page corner.
  const centreX = sx + sw / 2;
  const centreY = sy + sh / 2;
  outCtx.drawImage(
    transformed,
    Math.round(centreX - transformed.width / 2),
    Math.round(centreY - transformed.height / 2),
  );
  return out;
}

export function createBakeTransformApi({
  getDoc,
  setDoc,
  getPixelSelection,
  cache,
  maskTools,
  glAdjustments,
  requestRender,
  notify,
  trackTransform,
  transformsInFlight,
  activeTransformPromises,
  isDisposed,
  commitTransformChange,
}) {
  /**
   * Bakes a 90° rotation or a mirror into an image node's bitmap.
   */
  async function transformNodeBitmap(nodeId, kind, options = {}) {
    return trackTransform(
      (async () => {
        const node = findNode(getDoc(), nodeId);
        if (!node || node.kind !== NODE_KIND.IMAGE) return false;
        // One transform per node at a time; a second click mid-flight is ignored.
        if (transformsInFlight.has(nodeId)) return false;
        const bitmap = cache.get(node);
        if (!bitmap) return false;

        transformsInFlight.add(nodeId);
        notify();
        // A marquee pixel selection on this layer means the transform should bake
        // ONLY the selected region (crop -> transform -> paste back), not the whole
        // picture — mirroring the marquee-driven fill/repaint tools.
        const currentPixelSelection = getPixelSelection();
        const region =
          currentPixelSelection?.nodeId === nodeId &&
          currentPixelSelection.contours?.length
            ? currentPixelSelection
            : null;
        const width = bitmap.naturalWidth ?? bitmap.width;
        const height = bitmap.naturalHeight ?? bitmap.height;
        try {
          const out = region
            ? transformNodeRegionCanvas(
                node,
                bitmap,
                kind,
                region,
                width,
                height,
              )
            : renderTransformed(bitmap, kind);
          if (!out) return false;
          const blob = await new Promise((resolve) =>
            out.toBlob(resolve, "image/png"),
          );
          if (!blob) return false;
          const imageId = `img-${crypto.randomUUID()}`;
          const newBitmap = await decodeBlob(blob);
          if (isDisposed()) return false;

          const patch = { imageId };
          if (node.maskId) {
            const maskId = await maskTools.transformMask(nodeId, kind);
            if (!maskId) return false;
            patch.maskId = maskId;
          }

          // Commit only if the document still sits on the node this transform
          // started from — an undo/redo during the awaits swapped it, and writing
          // now would resurrect the reverted image as a new history entry.
          const current = findNode(getDoc(), nodeId);
          if (
            !current ||
            (current.imageId ?? null) !== (node.imageId ?? null) ||
            (current.maskId ?? null) !== (node.maskId ?? null)
          ) {
            if (patch.maskId) {
              await deleteImage(patch.maskId);
              cache.delete(patch.maskId);
            }
            return false;
          }

          // Persist only after the async guard confirms this exact source node is
          // still live; an interrupted transform must not leave an orphan blob.
          await putImage(imageId, blob);

          cache.put({ imageId }, newBitmap);
          // The old bitmap's GPU texture and CPU adjustment results are dead now.
          glAdjustments.release(bitmap);
          invalidateAdjustmentCache(bitmap);

          // Rotations swap the axes; mirrors keep the node's box as it was. A
          // region transform leaves the layer box untouched — only its pixels move.
          if (!region) {
            Object.assign(
              patch,
              transformedSize(kind, node.width, node.height),
            );
            if (node.crop) {
              patch.crop = transformCropRect(node.crop, kind, width, height);
            }
          }
          if (options?.commit === false) {
            return { nodeId, patch };
          }
          commitTransformChange(
            setDoc,
            ops.updateNode(getDoc(), nodeId, patch),
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
   * Bakes every live effect on an image layer into its bitmap — the "栅格化"
   * (Rasterize) action.
   */
  async function rasterizeNode(nodeId) {
    return trackTransform(
      (async () => {
        const node = findNode(getDoc(), nodeId);
        if (!node) return false;
        if (node.locked || node.lockImagePixels) return false;
        if (transformsInFlight.has(nodeId)) return false;
        if (node.kind !== NODE_KIND.IMAGE) {
          if (!RASTERIZABLE_VECTOR_KINDS.has(node.kind)) return false;
          const doc = getDoc();
          const descendants =
            node.kind === NODE_KIND.GROUP
              ? groupDescendants(doc, node.id)
              : [];
          if (descendants.some((child) => child.locked)) return false;
          const descendantIds = new Set(descendants.map((child) => child.id));
          const nodesToDraw =
            node.kind === NODE_KIND.GROUP
              ? doc.nodes.filter(
                  (child) =>
                    descendantIds.has(child.id) &&
                    child.kind !== NODE_KIND.GROUP,
                )
              : [node];
          if (nodesToDraw.length === 0) return false;

          const visualBounds = combinedBounds(
            nodesToDraw.map(nodeVisualBounds),
          );
          if (!visualBounds) return false;
          const originX = Math.floor(visualBounds.x);
          const originY = Math.floor(visualBounds.y);
          const canvasWidth = Math.max(
            1,
            Math.ceil(visualBounds.x + visualBounds.width) - originX,
          );
          const canvasHeight = Math.max(
            1,
            Math.ceil(visualBounds.y + visualBounds.height) - originY,
          );

          transformsInFlight.add(nodeId);
          notify();
          try {
            const canvas = document.createElement("canvas");
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) return false;
            ctx.translate(-originX, -originY);
            for (const target of nodesToDraw) {
              drawNode(
                ctx,
                target,
                (candidate) => cache.get(candidate),
                (candidate) => maskTools.maskSourceOf(candidate),
                null,
                false,
              );
            }
            const pixels = ctx.getImageData(0, 0, canvasWidth, canvasHeight).data;
            const bounds = opaqueBounds(pixels, canvasWidth, canvasHeight);
            if (!bounds) return false;
            const output = document.createElement("canvas");
            output.width = bounds.width;
            output.height = bounds.height;
            const outputCtx = output.getContext("2d");
            if (!outputCtx) return false;
            outputCtx.drawImage(canvas, -bounds.x, -bounds.y);
            const blob = await new Promise((resolve) =>
              output.toBlob(resolve, "image/png"),
            );
            if (!blob) return false;
            const imageId = `img-${crypto.randomUUID()}`;
            await putImage(imageId, blob);
            const newBitmap = await decodeBlob(blob);
            if (isDisposed()) return false;
            const current = findNode(getDoc(), nodeId);
            if (!current || current.kind !== node.kind) return false;
            cache.put({ imageId }, newBitmap);

            let next = getDoc();
            for (const child of descendants) {
              next = ops.removeNode(next, child.id);
            }
            const replacement = {
              ...createImageNode({
                x: originX + bounds.x,
                y: originY + bounds.y,
                width: bounds.width,
                height: bounds.height,
                imageId,
                name: node.name ?? null,
              }),
              id: node.id,
              visible: node.visible !== false,
              locked: Boolean(node.locked),
              ...(node.parentId ? { parentId: node.parentId } : {}),
              // Group children are drawn independently, so preserve the
              // container's composite opacity on the resulting image layer.
              opacity:
                node.kind === NODE_KIND.GROUP ? (node.opacity ?? 1) : 1,
            };
            next = ops.updateDocument(next, {
              nodes: next.nodes.map((candidate) =>
                candidate.id === nodeId ? replacement : candidate,
              ),
            });
            commitTransformChange(setDoc, next);
            requestRender();
            notify();
            return true;
          } finally {
            transformsInFlight.delete(nodeId);
            notify();
          }
        }
        const bitmap = cache.get(node);
        if (!bitmap) return false;

        transformsInFlight.add(nodeId);
        notify();
        try {
          const naturalW =
            bitmap.naturalWidth ?? bitmap.width ?? Math.round(node.width);
          const naturalH =
            bitmap.naturalHeight ?? bitmap.height ?? Math.round(node.height);
          const sourceCrop = normalizeImageCrop(node, naturalW, naturalH);
          const targetW = Math.max(1, Math.round(node.crop ? sourceCrop.width : Math.max(node.width, naturalW)));
          const targetH = Math.max(1, Math.round(node.crop ? sourceCrop.height : Math.max(node.height, naturalH)));
          const scaleX = node.width > 0 ? targetW / node.width : 1;
          const scaleY = node.height > 0 ? targetH / node.height : 1;

          const canvas = document.createElement("canvas");
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          if (!ctx) return false;
          // drawImageNode draws in document space (node.x/node.y); translate so the
          // layer's own box lands at (0,0) on the offscreen canvas before reading it,
          // scaled to natural bitmap resolution so baking preserves the source fidelity.
          ctx.save();
          ctx.scale(scaleX, scaleY);
          ctx.translate(-node.x, -node.y);
          drawImageNode(
            ctx,
            node,
            bitmap,
            maskTools.maskSourceOf(node),
            null,
            false,
          );
          ctx.restore();

          // Baking usually leaves empty space behind — a mask keeps a circle out of a
          // rectangle, a warp pulls the picture off an edge — so the layer shrinks to
          // the pixels it kept. A layer that baked down to nothing keeps its box: a
          // zero-size node is not something the user can select or grow back.
          const pixels = ctx.getImageData?.(0, 0, targetW, targetH)?.data;
          const bounds = pixels ? opaqueBounds(pixels, targetW, targetH) : null;
          const trimmed =
            bounds && (bounds.width !== targetW || bounds.height !== targetH);
          let output = canvas;
          if (trimmed) {
            output = document.createElement("canvas");
            output.width = bounds.width;
            output.height = bounds.height;
            const outputCtx = output.getContext("2d");
            if (!outputCtx) return false;
            outputCtx.drawImage(canvas, -bounds.x, -bounds.y);
          }

          const blob = await new Promise((resolve) =>
            output.toBlob(resolve, "image/png"),
          );
          if (!blob) return false;
          const imageId = `img-${crypto.randomUUID()}`;
          await putImage(imageId, blob);
          const newBitmap = await decodeBlob(blob);
          if (isDisposed()) return false;
          // Undo/redo can replace this node while encoding is in flight. A late bake
          // must never reintroduce the bitmap it started from.
          const current = findNode(getDoc(), nodeId);
          if (
            !current ||
            (current.imageId ?? null) !== (node.imageId ?? null) ||
            (current.maskId ?? null) !== (node.maskId ?? null)
          ) {
            return false;
          }
          cache.put({ imageId }, newBitmap);
          // The effects are now baked in; dropping them keeps the node flat.
          const patch = {
            imageId,
            maskId: null,
            warpMesh: null,
            puppetPins: null,
            perspectiveCorners: null,
            adjustments: null,
            ...(trimmed
              ? trimmedNodeBox(node, bounds, {
                  width: targetW,
                  height: targetH,
                })
              : null),
          };
          const updated = ops.updateNode(getDoc(), nodeId, patch);
          const next = {
            ...updated,
            nodes: updated.nodes.map((candidate) => {
              if (candidate.id !== nodeId) return candidate;
              const replacement = { ...candidate };
              delete replacement.crop;
              return replacement;
            }),
          };
          if (next === getDoc()) return false;
          glAdjustments.release(bitmap);
          invalidateAdjustmentCache(bitmap);
          commitTransformChange(setDoc, next);
          requestRender();
          notify();
          return true;
        } finally {
          transformsInFlight.delete(nodeId);
          notify();
        }
      })(),
    );
  }

  return {
    /** Waits for all in-flight rotate/flip/rasterize/selection transforms. */
    async flushTransforms() {
      while (activeTransformPromises.size > 0) {
        await Promise.allSettled([...activeTransformPromises]);
      }
    },

    /** Bakes a 90° rotation or a mirror into an image node's bitmap. */
    transformNodeBitmap,
    /** Bakes the layer's live effects (mask/warp/adjustments) into its bitmap. */
    rasterizeNode,
    /** True while a rotate/flip is being baked for the node. */
    isTransformPending: (id) => transformsInFlight.has(id),
  };
}
