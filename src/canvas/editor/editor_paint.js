/**
 * Pixel painting: the brush and the eraser as bitmap work, Photoshop-style.
 *
 * The brush stamps soft dabs into a raster paint layer — an image node
 * flagged `paint`, born the size of the first dab and grown as strokes reach
 * past its box — instead of recording a vector path: once a stroke lands it
 * is pixels, exactly like painting on a layer in Photoshop, and the layer's
 * bounds always hug what was painted. The eraser is the same pipeline with
 * `destination-out`, rubbed into whatever image node sits under the pointer;
 * erasing a paint layer's pixels away trims its box to what remains.
 *
 * The lifecycle mirrors the matte editing in `editor_mask.js`: every painted
 * node owns a live canvas the renderer composites from frame to frame, and a
 * serialised per-node persist queue snapshots it into IndexedDB — one new
 * blob per finished stroke, so undo/redo of pixel work rides the same
 * document history as everything else.
 *
 * The module never touches the engine's internals directly: the document is
 * read through `getDoc()` and written through `setDoc()`, so the engine stays
 * the single owner of the write path (history, measuring, rendering).
 */

import { findNode, NODE_KIND } from "./scene_model.js";
import {
  lockedStampPixel,
  resolvePaintTarget,
} from "./editor_paint_target.js";
import { createEmptyPaintLayer } from "./editor_paint_layer.js";
import { createPaintPersistence } from "./editor_paint_persist.js";
import { createPaintStroke } from "./editor_paint_stroke.js";

export { resolvePaintTarget, lockedStampPixel };

export function createPaintTools({
  getDoc,
  setDoc,
  cache,
  select,
  selection,
  requestRender,
  isDisposed,
  invalidateBitmap,
  setDraftRender = () => {},
  releaseBitmap,
  getPixelSelection = () => null,
}) {
  /**
   * Mutable paint canvases, one per painted image node. The entry is rebuilt
   * whenever the node's `imageId` no longer matches — which is exactly what
   * undo/redo does, since each finished stroke persists a fresh bitmap blob.
   */
  const paintCanvases = new Map();

  /** Drops the live canvas, releasing its GPU texture if one was uploaded. */
  function dropPaintCanvas(id) {
    const entry = paintCanvases.get(id);
    if (!entry) return;
    releaseBitmap?.(entry.canvas);
    paintCanvases.delete(id);
  }

  function paintCanvasOf(node) {
    if (!node || node.kind !== NODE_KIND.IMAGE) return null;
    const entry = paintCanvases.get(node.id);
    if (entry && entry.imageId === (node.imageId ?? null)) return entry.canvas;
    const bitmap = cache.get(node);
    if (!bitmap) return null;
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.naturalWidth ?? bitmap.width;
    canvas.height = bitmap.naturalHeight ?? bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    if (entry) releaseBitmap?.(entry.canvas);
    paintCanvases.set(node.id, {
      canvas,
      imageId: node.imageId ?? null,
      version: 0,
      persistedVersion: 0,
    });
    return canvas;
  }

  /**
   * What the renderer draws with: the live paint canvas while it still backs
   * the node's current `imageId`; the decoded bitmap otherwise. Same identity
   * rule as the matte's `maskSourceOf` — undo swaps the id, and compositing
   * from the stale canvas would show pixels the document no longer references.
   */
  function bitmapSourceOf(node) {
    const entry = paintCanvases.get(node.id);
    if (entry && entry.imageId === (node.imageId ?? null)) return entry.canvas;
    return cache.get(node);
  }

  const persistence = createPaintPersistence({
    getDoc,
    setDoc,
    cache,
    isDisposed,
    invalidateBitmap,
    paintCanvases,
  });

  const stroke = createPaintStroke({
    getDoc,
    setDoc,
    select,
    selection,
    setDraftRender,
    requestRender,
    paintCanvases,
    paintCanvasOf,
    releaseBitmap,
    markPaintDirty: persistence.markPaintDirty,
    queuePaintPersist: persistence.queuePaintPersist,
    getPixelSelection,
  });

  const layerContext = {
    getDoc,
    setDoc,
    select,
    paintCanvases,
    queuePaintPersist: persistence.queuePaintPersist,
  };

  return {
    // Engine-core hooks.
    bitmapSourceOf,
    hasDirtyPaints: persistence.hasDirtyPaints,
    flushPaints: persistence.flushPaints,
    /** Drops every trace of a node the document no longer contains. */
    onNodeRemoved(id) {
      dropPaintCanvas(id);
      persistence.paintQueues.delete(id);
      stroke.clearPaintEditIfNode(id);
    },
    /** A restored document makes every live canvas potentially stale. */
    onDocRestored() {
      const doc = getDoc();
      for (const id of [...paintCanvases.keys()]) {
        if (!findNode(doc, id)) dropPaintCanvas(id);
      }
      stroke.resetPaintEdit();
    },
    clear() {
      paintCanvases.clear();
    },

    // Public engine api.
    api: {
      beginPaintStroke: stroke.beginPaintStroke,
      paintStrokeTo: stroke.paintStrokeTo,
      finishPaintStroke: stroke.finishPaintStroke,
      flushPaints: persistence.flushPaints,
      isPaintOpaqueAt: stroke.isPaintOpaqueAt,
      createEmptyPaintLayer: (name = null) =>
        createEmptyPaintLayer(layerContext, name),
      getPaintEdit: stroke.getPaintEdit,
    },
  };
}
