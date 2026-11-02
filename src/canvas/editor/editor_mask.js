/**
 * Matte editing: the mask brush, the lasso, and the per-node matte lifecycle.
 * Facade coordinating lifecycle, brush, and ops subsystems.
 */

import { createMaskLifecycle } from "./editor_mask_lifecycle.js";
import { createMaskBrush } from "./editor_mask_brush.js";
import { createMaskOps } from "./editor_mask_ops.js";

export function createMaskTools({
  onStrokeFinished,
  getDoc,
  setDoc,
  cache,
  select,
  getSelectedId,
  notify,
  requestRender,
  isDisposed,
  invalidateMatte,
  setDraftRender = () => {},
  releaseMatte,
  deleteImage = async () => {},
}) {
  let maskBrush;
  let maskOps;

  const lifecycle = createMaskLifecycle({
    getDoc,
    setDoc,
    cache,
    isDisposed,
    invalidateMatte,
    releaseMatte,
    deleteImage,
    beginMaskEdit: (id, opts) => maskBrush.beginMaskEdit(id, opts),
    onClearMask: (id) => {
      if (maskBrush.getMaskEdit()?.nodeId === id) {
        maskBrush.endMaskEdit();
      }
    },
  });

  maskBrush = createMaskBrush({
    getDoc,
    maskCanvasOf: lifecycle.maskCanvasOf,
    markMaskDirty: lifecycle.markMaskDirty,
    requestRender,
    notify,
    select,
    getSelectedId,
    setDraftRender,
    onStrokeFinished,
    queueMaskPersist: lifecycle.queueMaskPersist,
  });

  maskOps = createMaskOps({
    getDoc,
    maskCanvasOf: lifecycle.maskCanvasOf,
    markMaskDirty: lifecycle.markMaskDirty,
    requestRender,
    notify,
    select,
    queueMaskPersist: lifecycle.queueMaskPersist,
    beginMaskEdit: (id, opts) => maskBrush.beginMaskEdit(id, opts),
  });

  return {
    // Engine-core hooks.
    maskSourceOf: lifecycle.maskSourceOf,
    hasDirtyMasks: lifecycle.hasDirtyMasks,
    flushMasks: lifecycle.flushMasks,
    /** Drops every trace of a node the document no longer contains. */
    onNodeRemoved(id) {
      lifecycle.onNodeRemoved(id);
      maskBrush.onNodeRemoved(id);
      maskOps.onNodeRemoved(id);
    },
    /** A restored document makes a pending lasso's points stale. */
    onDocRestored() {
      maskOps.onDocRestored();
    },
    clear() {
      lifecycle.clear();
    },

    // Public engine api.
    api: {
      applyMask: lifecycle.applyMask,
      clearMask: lifecycle.clearMask,
      createEmptyMask: lifecycle.createEmptyMask,
      transformMask: lifecycle.transformMask,
      featherMask: maskOps.featherMask,
      invertMask: maskOps.invertMask,
      refineMask: maskOps.refineMask,
      quickMaskFromSelection: maskOps.quickMaskFromSelection,
      beginMaskEdit: maskBrush.beginMaskEdit,
      endMaskEdit: maskBrush.endMaskEdit,
      beginMaskStroke: maskBrush.beginMaskStroke,
      paintMaskStroke: maskBrush.paintMaskStroke,
      finishMaskStroke: maskBrush.finishMaskStroke,
      replayMaskStroke: maskBrush.replayMaskStroke,
      flushMasks: lifecycle.flushMasks,
      getMaskEdit: maskBrush.getMaskEdit,
      startLasso: maskOps.startLasso,
      addLassoPoint: maskOps.addLassoPoint,
      finishLasso: maskOps.finishLasso,
      cancelLasso: maskOps.cancelLasso,
      applyLasso: maskOps.applyLasso,
      getLasso: maskOps.getLasso,
      setMaskMode: maskBrush.setMaskMode,
      setMaskBrushSize: maskBrush.setMaskBrushSize,
    },
  };
}
