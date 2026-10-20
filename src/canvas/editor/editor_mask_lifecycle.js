/**
 * Per-node matte lifecycle: live canvases, persistence queues, and node mutations.
 * Extracted from editor_mask.js.
 */

import { decodeBlobToBitmap } from "./bitmap_cache.js";
import { renderTransformed } from "./bitmap_transform.js";
import * as ops from "./doc_ops.js";
import { findNode, NODE_KIND } from "./scene_model.js";
import { putImage } from "../store/db.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import {
  emitPersistenceAlert,
  isQuotaExceededError,
} from "./editor_persist_events.js";
import { normalizeImageCrop } from "./image_layer_crop.js";

export function createMaskLifecycle({
  getDoc,
  setDoc,
  cache,
  isDisposed,
  invalidateMatte,
  releaseMatte,
  deleteImage = async () => {},
  beginMaskEdit = () => false,
  onClearMask = () => {},
}) {
  /**
   * Mutable matte canvases, one per masked image node.
   *
   * The persisted matte (IndexedDB blob, decoded by the cache) is copied into
   * a canvas the first time it is needed; mask-brush strokes paint into that
   * canvas and the renderer composites from it live. The entry is rebuilt
   * whenever the node's `maskId` changes — which is exactly what undo/redo
   * does, since each finished stroke persists a fresh matte blob.
   */
  const maskCanvases = new Map();

  function maskCanvasOf(node) {
    if (!node || node.kind !== NODE_KIND.IMAGE) return null;
    const entry = maskCanvases.get(node.id);
    if (entry && entry.maskId === (node.maskId ?? null)) return entry.canvas;
    const canvas = document.createElement("canvas");
    if (node.maskId) {
      const bitmap = cache.getMask(node);
      if (!bitmap) return null;
      canvas.width = bitmap.naturalWidth ?? bitmap.width;
      canvas.height = bitmap.naturalHeight ?? bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
    } else {
      // No matte yet: start from a fully opaque canvas at the bitmap's
      // natural size, so the first eraser or lasso touch has coverage to
      // remove.
      const bitmap = cache.get(node);
      if (!bitmap) return null;
      canvas.width = bitmap.naturalWidth ?? bitmap.width;
      canvas.height = bitmap.naturalHeight ?? bitmap.height;
      const maskCtx = canvas.getContext("2d");
      maskCtx.fillStyle = "#ffffff";
      maskCtx.fillRect(0, 0, canvas.width, canvas.height);
    }
    maskCanvases.set(node.id, {
      canvas,
      maskId: node.maskId ?? null,
      version: 0,
      persistedVersion: 0,
    });
    return canvas;
  }

  /** Drops the live canvas, releasing its GPU texture if one was uploaded. */
  function dropMaskCanvas(id) {
    const entry = maskCanvases.get(id);
    if (!entry) return;
    releaseMatte?.(entry.canvas);
    maskCanvases.delete(id);
  }

  /**
   * Persist queues, one per node.
   *
   * `toBlob`/`putImage`/`decodeBlob` are all async, so a naive persist races
   * the next stroke: paints landing mid-await would end up neither in the
   * blob nor flagged for a later one. Instead every edit bumps `version`, and
   * persists run strictly one-after-another per node — a persist that comes
   * back to find `version` moved simply runs again. The commit step also
   * refuses to write when the document was swapped underneath it (undo/redo
   * during the await), so an abandoned stroke never resurrects.
   */
  const maskQueues = new Map();

  function markMaskDirty(nodeId) {
    const entry = maskCanvases.get(nodeId);
    if (!entry) return;
    entry.version += 1;
    // The matte's pixels changed while its canvas identity stayed the same —
    // the renderer's caches (CPU composite and GPU texture) have to be told
    // explicitly.
    invalidateMatte?.(entry.canvas);
  }

  /** True when at least one mask canvas has strokes not yet persisted. */
  function hasDirtyMasks() {
    for (const entry of maskCanvases.values()) {
      if (entry.version !== entry.persistedVersion) return true;
    }
    return false;
  }

  /**
   * What the renderer draws with: the live matte canvas while it still backs
   * the node's current `maskId`; the decoded matte otherwise.
   *
   * The identity check matters right after undo/redo and after a
   * background-removal matte lands: both swap the node's `maskId` without
   * touching the live canvas, and compositing from the stale canvas would
   * show — and export — a matte the document no longer references.
   */
  function maskSourceOf(node) {
    const entry = maskCanvases.get(node.id);
    if (entry && entry.maskId === (node.maskId ?? null)) return entry.canvas;
    return cache.getMask(node);
  }

  /**
   * Attaches an alpha matte to an image node.
   *
   * The matte blob is persisted under its own id first, so the node survives a
   * reload exactly like an inserted picture does; the decoded bitmap is primed
   * into the cache so the very next frame already draws masked. Any queued
   * stroke persist for the node is awaited first, so a matte arriving late
   * (the background-removal trip takes minutes) cannot be overwritten by a
   * stale stroke finishing afterwards.
   */
  async function applyMask(id, blob) {
    const node = findNode(getDoc(), id);
    if (!node || node.kind !== NODE_KIND.IMAGE) return false;
    if (isDisposed()) return false;
    await (maskQueues.get(id) ?? Promise.resolve());
    dropMaskCanvas(id);
    const maskId = `mask-${crypto.randomUUID()}`;
    let bitmap = await decodeBlobToBitmap(blob);
    if (isDisposed() || findNode(getDoc(), id) !== node) return false;

    if (node.crop) {
      const sourceBitmap = cache.get(node);
      if (sourceBitmap) {
        const sourceWidth = sourceBitmap.naturalWidth ?? sourceBitmap.width;
        const sourceHeight = sourceBitmap.naturalHeight ?? sourceBitmap.height;
        const crop = normalizeImageCrop(node, sourceWidth, sourceHeight);
        if (
          (bitmap.width !== sourceWidth || bitmap.height !== sourceHeight) &&
          bitmap.width === crop.width &&
          bitmap.height === crop.height
        ) {
          const canvas =
            typeof OffscreenCanvas === "function"
              ? new OffscreenCanvas(sourceWidth, sourceHeight)
              : document.createElement("canvas");
          canvas.width = sourceWidth;
          canvas.height = sourceHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(bitmap, crop.x, crop.y);
            const fullBlob = canvas.convertToBlob
              ? await canvas.convertToBlob({ type: "image/png" })
              : await new Promise((resolve) =>
                  canvas.toBlob(resolve, "image/png"),
                );
            if (fullBlob) {
              blob = fullBlob;
              bitmap = await decodeBlobToBitmap(fullBlob);
            }
          }
        }
      }
    }

    // Decode and commit guards run before persistence so cancellation cannot
    // create an unreachable IndexedDB blob.
    await putImage(maskId, blob);
    cache.putMask(maskId, bitmap);
    commitEditorDocument(
      "editor.mask.change",
      setDoc,
      ops.updateNode(getDoc(), id, { maskId }),
    );
    return true;
  }

  /** Drops the matte; the original bitmap was never touched, so nothing is lost. */
  function clearMask(id) {
    if (!findNode(getDoc(), id)?.maskId) return;
    dropMaskCanvas(id);
    onClearMask(id);
    commitEditorDocument(
      "editor.mask.change",
      setDoc,
      ops.updateNode(getDoc(), id, { maskId: null }),
    );
  }

  /**
   * Bakes a rotation/mirror into the node's matte.
   *
   * The engine runs the node's bitmap through the same `renderTransformed`
   * helper, so matte and pixels always agree. The transformed canvas is
   * rendered off to the side and persisted first; the live entry is swapped
   * only once the new matte blob is safely in the store, so a failure
   * anywhere in the await chain leaves the node exactly as it was.
   *
   * Returns the new maskId WITHOUT writing the document — the caller folds it
   * into its own setDoc alongside the new imageId, which is what keeps the
   * whole transform a single history entry. The superseded matte blob stays
   * in the store for undo to reference, like every matte blob before it.
   */
  async function transformMask(id, kind) {
    await (maskQueues.get(id) ?? Promise.resolve());
    const node = findNode(getDoc(), id);
    if (!node || node.kind !== NODE_KIND.IMAGE || !node.maskId) return null;
    if (isDisposed()) return null;
    const canvas = maskCanvasOf(node);
    if (!canvas) return null;
    const entry = maskCanvases.get(id);

    const transformed = renderTransformed(canvas, kind);
    const blob = await new Promise((resolve) =>
      transformed.toBlob(resolve, "image/png"),
    );
    if (!blob) return null;
    const maskId = `mask-${crypto.randomUUID()}`;
    await putImage(maskId, blob);
    let bitmap;
    try {
      bitmap = await decodeBlobToBitmap(blob);
    } catch (error) {
      await deleteImage(maskId);
      throw error;
    }
    if (isDisposed()) {
      await deleteImage(maskId);
      cache.delete(maskId);
      return null;
    }
    cache.putMask(maskId, bitmap);

    releaseMatte?.(entry.canvas);
    entry.canvas = transformed;
    entry.maskId = maskId;
    // The pixels changed together with the canvas identity, so the version
    // bump doubles as the dirty flag — already persisted, nothing to flush.
    entry.version += 1;
    entry.persistedVersion = entry.version;
    invalidateMatte?.(transformed);
    return maskId;
  }

  /**
   * Immediately creates and attaches a blank white alpha mask to an image layer (Photoshop-style).
   */
  async function createEmptyMask(id) {
    const node = findNode(getDoc(), id);
    if (!node || node.kind !== NODE_KIND.IMAGE) return false;
    if (node.maskId) {
      beginMaskEdit(id);
      return true;
    }
    const canvas = maskCanvasOf(node);
    if (!canvas) return false;
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return false;
    const maskId = `mask-${crypto.randomUUID()}`;
    await putImage(maskId, blob);
    const bitmap = await decodeBlobToBitmap(blob);
    if (isDisposed()) return false;
    cache.putMask(maskId, bitmap);
    const entry = maskCanvases.get(id);
    if (entry) {
      entry.maskId = maskId;
      entry.version = 0;
      entry.persistedVersion = 0;
    }
    commitEditorDocument(
      "editor.mask.change",
      setDoc,
      ops.updateNode(getDoc(), id, { maskId }),
    );
    beginMaskEdit(id);
    return true;
  }

  /**
   * One persist pass for a node: snapshot the live matte canvas into a new
   * blob and swap the node's `maskId` to it — one history entry per edit, so
   * undo/redo of mask changes rides the same document snapshots as everything
   * else. Runs only through `queueMaskPersist`, never concurrently.
   *
   * The cache is primed with a freshly decoded copy: handing it the live
   * canvas would let later edits mutate what an undo expects to find
   * unchanged. Superseded matte blobs are deliberately NOT deleted here —
   * undo history still references them for the rest of the session; the
   * shared pruner reclaims them once the document moves on.
   */
  async function persistMaskOnce(nodeId) {
    const entry = maskCanvases.get(nodeId);
    if (!entry || entry.version === entry.persistedVersion) return;
    const node = findNode(getDoc(), nodeId);
    if (!node) return;
    const startVersion = entry.version;
    const baseMaskId = node.maskId ?? null;

    const blob = await new Promise((resolve) =>
      entry.canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return;
    const maskId = `mask-${crypto.randomUUID()}`;
    await putImage(maskId, blob);
    const bitmap = await decodeBlobToBitmap(blob);
    if (isDisposed()) return;
    cache.putMask(maskId, bitmap);
    entry.persistedVersion = startVersion;

    // Commit only if the document still sits on the matte this persist
    // started from — an undo/redo during the await swapped it, and writing
    // now would resurrect the reverted stroke as a new history entry.
    if ((findNode(getDoc(), nodeId)?.maskId ?? null) === baseMaskId) {
      entry.maskId = maskId;
      commitEditorDocument(
        "editor.mask.change",
        setDoc,
        ops.updateNode(getDoc(), nodeId, { maskId }),
      );
    }

    // Strokes painted during the awaits are not in this blob; go again.
    if (entry.version > entry.persistedVersion) {
      await persistMaskOnce(nodeId);
    }
  }

  /** Serialises matte persistence per node; safe to fire and forget. */
  function queueMaskPersist(nodeId) {
    const previous = maskQueues.get(nodeId) ?? Promise.resolve();
    const next = previous
      .then(() => persistMaskOnce(nodeId))
      .catch((error) => {
        // The queue must survive a failed write (later strokes keep trying),
        // but the user has to see it: quota exhaustion silently loses pixels.
        emitPersistenceAlert({
          type: isQuotaExceededError(error) ? "persist-quota" : "persist-failed",
          source: "mask",
          nodeId,
        });
        console.warn("mask persist failed", error);
      });
    maskQueues.set(nodeId, next);
    return next;
  }

  /**
   * Resolves once every queued matte persist has finished. A failed persist
   * leaves its matte dirty, so re-queue those nodes and make a save a real retry.
   */
  async function flushMasks() {
    await Promise.all([...maskQueues.values()]);
    const retries = [];
    for (const [nodeId, entry] of maskCanvases) {
      if (entry.version !== entry.persistedVersion) retries.push(queueMaskPersist(nodeId));
    }
    await Promise.all(retries);
  }

  return {
    maskCanvases,
    maskCanvasOf,
    dropMaskCanvas,
    markMaskDirty,
    hasDirtyMasks,
    maskSourceOf,
    applyMask,
    clearMask,
    transformMask,
    createEmptyMask,
    queueMaskPersist,
    flushMasks,
    onNodeRemoved(id) {
      dropMaskCanvas(id);
      maskQueues.delete(id);
    },
    clear() {
      maskCanvases.clear();
    },
  };
}
