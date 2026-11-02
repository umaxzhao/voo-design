/** Paint canvas dirty tracking, blob persistence, and commit queueing. */

import { decodeBlob } from "./bitmap_cache.js";
import * as ops from "./doc_ops.js";
import { findNode } from "./scene_model.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import { putImage } from "../store/db.js";
import {
  emitPersistenceAlert,
  isQuotaExceededError,
} from "./editor_persist_events.js";

export function createPaintPersistence({
  getDoc,
  setDoc,
  cache,
  isDisposed,
  invalidateBitmap,
  paintCanvases,
}) {
  function markPaintDirty(nodeId) {
    const entry = paintCanvases.get(nodeId);
    if (!entry) return;
    entry.version += 1;
    // The bitmap's pixels changed while its canvas identity stayed the same —
    // the renderer's caches (CPU adjustments and GPU texture) have to be told.
    invalidateBitmap?.(entry.canvas);
  }

  /** True when at least one paint canvas has strokes not yet persisted. */
  function hasDirtyPaints() {
    for (const entry of paintCanvases.values()) {
      if (entry.version !== entry.persistedVersion) return true;
    }
    return false;
  }

  /**
   * Persist queues, one per node — the mask module's reasoning verbatim:
   * `toBlob`/`putImage`/`decodeBlob` are all async, so persists run strictly
   * one-after-another per node, a persist that comes back to find `version`
   * moved runs again, and the commit step refuses to write when the document
   * was swapped underneath it (undo/redo during the await).
   */
  const paintQueues = new Map();

  /**
   * One persist pass: snapshot the live canvas into a new blob and swap the
   * node's `imageId` to it — one history entry per stroke. The cache is primed
   * with a freshly decoded copy: handing it the live canvas would let later
   * strokes mutate what an undo expects to find unchanged. Superseded blobs
   * stay in the store for undo to reference; the shared pruner reclaims them.
   */
  async function persistPaintOnce(nodeId) {
    const entry = paintCanvases.get(nodeId);
    if (!entry || entry.version === entry.persistedVersion) return;
    const node = findNode(getDoc(), nodeId);
    if (!node) return;
    const startVersion = entry.version;
    const baseImageId = node.imageId ?? null;

    const blob = await new Promise((resolve) =>
      entry.canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return;
    const imageId = `paint-${crypto.randomUUID()}`;
    await putImage(imageId, blob);
    const bitmap = await decodeBlob(blob);
    if (isDisposed()) return;
    cache.put({ imageId }, bitmap);
    entry.persistedVersion = startVersion;

    if ((findNode(getDoc(), nodeId)?.imageId ?? null) === baseImageId) {
      entry.imageId = imageId;
      commitEditorDocument(
        "editor.paint.change",
        setDoc,
        ops.updateNode(getDoc(), nodeId, { imageId }),
      );
    }

    // Strokes painted during the awaits are not in this blob; go again.
    if (entry.version > entry.persistedVersion) {
      await persistPaintOnce(nodeId);
    }
  }

  /** Serialises bitmap persistence per node; safe to fire and forget. */
  function queuePaintPersist(nodeId) {
    const previous = paintQueues.get(nodeId) ?? Promise.resolve();
    const next = previous
      .then(() => persistPaintOnce(nodeId))
      .catch((error) => {
        // Mirror of the mask queue: the chain survives, but a lost paint
        // stroke — above all a quota failure — surfaces to the UI.
        emitPersistenceAlert({
          type: isQuotaExceededError(error) ? "persist-quota" : "persist-failed",
          source: "paint",
          nodeId,
        });
        console.warn("paint persist failed", error);
      });
    paintQueues.set(nodeId, next);
    return next;
  }

  /**
   * Resolves once every queued bitmap persist has finished. A persist that
   * failed earlier leaves its canvas dirty, and nothing else retries it until
   * the next stroke, so each save re-queues dirty nodes. A retry that still
   * fails is reported by the queue alert and by the caller's
   * `hasUnpersistedPixels` check instead of replaying the old failure forever.
   */
  async function flushPaints() {
    await Promise.all([...paintQueues.values()]);
    const retries = [];
    for (const [nodeId, entry] of paintCanvases) {
      if (entry.version !== entry.persistedVersion) retries.push(queuePaintPersist(nodeId));
    }
    await Promise.all(retries);
  }

  return {
    markPaintDirty,
    hasDirtyPaints,
    persistPaintOnce,
    queuePaintPersist,
    flushPaints,
    paintQueues,
  };
}
