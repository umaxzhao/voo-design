/**
 * Repair tools, clone stamp state, object strokes, and selection effects controller.
 *
 * Extracted from editor_engine.js to isolate repair tool gestures, previews,
 * and clipboard coordination.
 */

import {
  DEFAULT_REMOVE_BRUSH_SIZE,
  REMOVE_BRUSH_MAX,
  REMOVE_BRUSH_MIN,
} from "./editor_constants.js";
import { createRepairTools } from "./editor_repair_tools.js";
import { createSelectionEffects } from "./editor_selection_effects.js";
import { createClipboard } from "./editor_clipboard.js";
import { serialiseDocument } from "./scene_model.js";

export function createEngineRepairController({
  getDoc,
  setDoc,
  cache,
  selection,
  selectNode,
  selectMany,
  getSelectedGroup,
  selectGroup,
  removeIds,
  maskTools,
  exporter,
  bitmapWriter,
  selectionController,
  getColor,
  getBackgroundColor,
  getGradientToolState = null,
  sourceWorkflowNodeId,
  onGeneratedOutput,
  isDisposed,
  requestRender,
  notify,
  getAiRepairDownload,
  setAiRepairDownload,
  getViewportCenter,
}) {
  let removeBrushSize = DEFAULT_REMOVE_BRUSH_SIZE;
  let removeStroke = null;
  let pendingObjectStroke = null;
  let patchDraft = null;
  let cloneSource = null;
  let cloneAligned = false;
  let clonePreview = null;
  let gesturePreview = null;
  let bitmapPreview = null;

  const repairTools = createRepairTools({
    getDoc,
    cache,
    getPixelSelection: selectionController.getPixelSelection,
    getAiRepairDownload,
    getSourceSnapshot: () => serialiseDocument(getDoc()),
    onGeneratedOutput,
    setAiRepairDownload,
    setBitmapPreview: (next) => {
      bitmapPreview = next;
    },
    replaceNodeBitmap: bitmapWriter.replaceNodeBitmap,
    sourceWorkflowNodeId,
    isDisposed,
    requestRender,
    notify,
  });

  const selectionEffects = createSelectionEffects({
    getDoc,
    setDoc,
    cache,
    maskTools,
    getColor,
    getBackgroundColor,
    getGradientToolState,
    getWandComposite: selectionController.getWandComposite,
    selection,
    getPixelSelection: selectionController.getPixelSelection,
    setPixelSelection: selectionController.setPixelSelection,
    clearPixelSelection: selectionController.clearPixelSelection,
    select: selectNode,
    replaceNodeBitmap: bitmapWriter.replaceNodeBitmap,
    syncAnts: selectionController.syncAnts,
    requestRender,
    notify,
  });

  const clipboard = createClipboard({
    getDoc,
    setDoc,
    selection,
    selectMany,
    select: selectNode,
    getSelectedGroup,
    selectGroup,
    cache,
    removeIds,
    getPixelSelection: selectionController.getPixelSelection,
    layerFromSelection: selectionEffects.layerFromSelection,
    extractSelectionImageNode: selectionEffects.extractSelectionImageNode,
    deleteSelectionPixels: selectionEffects.deleteSelectionPixels,
    exportSelectionPng: exporter.exportSelectionPng,
    maskTools,
    getViewportCenter,
  });

  return {
    getRemoveBrushSize: () => removeBrushSize,
    setRemoveBrushSize(size) {
      const next = Math.max(
        REMOVE_BRUSH_MIN,
        Math.min(REMOVE_BRUSH_MAX, Math.round(size)),
      );
      if (next === removeBrushSize) return;
      removeBrushSize = next;
      notify();
    },
    getRemoveStroke: () => removeStroke,
    setRemoveStroke(next) {
      removeStroke = next ?? null;
      requestRender();
    },
    getPendingObjectStroke: () => pendingObjectStroke,
    setPendingObjectStroke(next) {
      pendingObjectStroke = next ?? null;
      notify();
    },
    clearPendingObjectStroke() {
      if (!pendingObjectStroke) return;
      pendingObjectStroke = null;
      notify();
    },
    getPatchDraft: () => patchDraft,
    setPatchDraft(next) {
      patchDraft = next ?? null;
      requestRender();
      notify();
    },
    clearPatchDraft() {
      if (!patchDraft) return;
      patchDraft = null;
      requestRender();
      notify();
    },
    getCloneSource: () => cloneSource,
    setCloneSource(next) {
      cloneSource = next ?? null;
      requestRender();
      notify();
    },
    getCloneAligned: () => cloneAligned,
    setCloneAligned(next) {
      cloneAligned = Boolean(next);
      if (cloneSource && cloneSource.offset) {
        cloneSource = { nodeId: cloneSource.nodeId, point: cloneSource.point };
      }
      notify();
    },
    getClonePreview: () => clonePreview,
    setClonePreview(next) {
      clonePreview = next ?? null;
      requestRender();
    },
    getGesturePreview: () => gesturePreview,
    setGesturePreview(next) {
      gesturePreview = next ?? null;
      requestRender();
    },
    getBitmapPreview: () => bitmapPreview,
    async applyBitmapPreview() {
      const pending = bitmapPreview;
      if (!pending?.nodeId || !pending.dataUrl) return false;
      const applied = await bitmapWriter.replaceNodeBitmap(
        pending.nodeId,
        pending.dataUrl,
      );
      if (applied) {
        bitmapPreview = null;
        requestRender();
        notify();
      }
      return applied;
    },

    ...repairTools,
    ...selectionEffects,
    ...clipboard,
  };
}
