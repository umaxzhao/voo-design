/**
 * Editor subsystem and controller wiring assembler.
 *
 * Extracted from editor_engine.js to isolate factory instantiation and mutual callback bindings.
 */

import { createCrop } from "./editor_crop.js";
import { createImageLayerCrop } from "./image_layer_crop.js";
import { createAnnotations } from "./editor_annotations.js";
import { createMaskTools } from "./editor_mask.js";
import { createPaintTools } from "./editor_paint.js";
import { createPenTools } from "./editor_pen.js";
import { createExport, createExportApi } from "./editor_export.js";
import { createBitmapWriter } from "./editor_bitmap_write.js";
import { createHistoryApi } from "./editor_history_api.js";
import { createTransformApi } from "./editor_transform_api.js";
import { createEngineDocumentController } from "./editor_engine_document.js";
import { createEngineSelectionController } from "./editor_engine_selection.js";
import { createEngineSampler } from "./editor_engine_sampling.js";
import { sampleFreeCanvas } from "./free-canvas-sample.js";
import { createEngineInitController } from "./editor_engine_init.js";
import { createEngineNodesController } from "./editor_engine_nodes.js";
import { createEngineBrushController } from "./editor_engine_brush.js";
import { createEngineToolsController } from "./editor_engine_tools.js";
import { createEngineRepairController } from "./editor_engine_repair_state.js";
import { createEngineStyleController } from "./editor_engine_styles.js";
import { emitLocalStroke } from "../collab/stroke_bus.js";

export function assembleEngineControllers({
  ctx,
  getDoc,
  setDoc,
  snapshotDoc,
  snapshotState,
  restore,
  getAppliedSnapshot,
  setAppliedSnapshot,
  incDocVersion,
  requestRender,
  notify,
  selection,
  history,
  cache,
  glAdjustments,
  viewportTools,
  getViewportCenter,
  hostAdapter,
  cameraMode,
  isDisposed,
  sourceWorkflowNodeId,
  onGeneratedOutput,
  getRenderedDpr,
  getEffectiveNode,
  releaseNodeTextures,
  getSelectedPuppetPin,
  setSelectedPuppetPin,
  invalidateBitmap,
  setDraftRender,
  getEngine,
}) {
  let toolsController;
  let selectionController;
  let nodesController;

  const imageLayerCrop = createImageLayerCrop({
    getDoc,
    setDoc,
    selection,
    cache,
    requestRender,
    notify,
  });
  const crop = createCrop({
    getDoc,
    setDoc,
    viewportTools,
    imageLayerCrop,
    cache,
    cameraMode,
    clearPixelSelection: () => selectionController.clearPixelSelection(),
    requestRender,
    notify,
  });

  const annotations = createAnnotations({
    getDoc,
    setDoc,
    select: (id) => nodesController?.select?.(id),
    selection,
    requestRender,
    notify,
  });

  const maskTools = createMaskTools({
    onStrokeFinished: emitLocalStroke,
    getDoc,
    setDoc,
    cache,
    select: (id) => nodesController?.select?.(id),
    getSelectedId: () => selection.getId(),
    notify,
    requestRender,
    isDisposed,
    invalidateMatte: (source) => invalidateBitmap?.(source),
    setDraftRender,
    releaseMatte: (matte) => glAdjustments.release(matte),
    deleteImage: (nodeId) => nodesController?.removeNode?.(nodeId),
  });

  const paintTools = createPaintTools({
    getDoc,
    setDoc,
    cache,
    select: (id) => nodesController?.select?.(id),
    selection,
    requestRender,
    isDisposed,
    invalidateBitmap: (source) => invalidateBitmap?.(source),
    setDraftRender,
    releaseBitmap: (source) => glAdjustments.release(source),
    getPixelSelection: () => selectionController.getPixelSelection(),
  });

  const penTools = createPenTools({
    getDoc,
    setDoc,
    select: (id) => nodesController?.select?.(id),
    requestRender,
    isDisposed,
    getZoom: () => viewportTools.getViewport().zoom,
    notify,
  });

  const exporter = createExport({
    getDoc,
    cache,
    bitmapSourceOf: (n) => paintTools.bitmapSourceOf(n),
    maskSourceOf: (n) => maskTools.maskSourceOf(n),
    glRenderer: glAdjustments,
  });
  const exportApi = createExportApi({
    getDoc,
    getPixelSelection: () => selectionController.getPixelSelection(),
    cache,
    maskTools,
    paintTools,
    glAdjustments,
    // The PSD composite reuses the PNG export's whole-page render so both
    // exports show the same picture.
    renderComposite: () => exporter.exportPngCanvas(),
  });

  const documentController = createEngineDocumentController({
    getDoc,
    setDoc,
    crop,
    viewportTools,
    cameraMode,
    requestRender,
    notify,
  });

  const bitmapWriter = createBitmapWriter({
    getDoc,
    setDoc,
    cache,
    glAdjustments,
    isDisposed,
    notify,
  });

  const historyApi = createHistoryApi({
    history,
    maskTools,
    paintTools,
    restore,
    snapshotState,
    snapshotDoc,
    getSelectionTransform: () => selectionController?.getSelectionTransform?.(),
    transformsInFlight: bitmapWriter.transformsInFlight,
    getAppliedSnapshot,
    setAppliedSnapshot,
    onCommit: notify,
  });

  selectionController = createEngineSelectionController({
    getDoc,
    setDoc,
    cache,
    maskTools,
    viewportTools,
    historyApi: { commit: (name) => historyApi.commit(name) },
    selection,
    exporter,
    trackTransform: bitmapWriter.trackTransform,
    replaceNodeBitmap: bitmapWriter.replaceNodeBitmap,
    setRegionHint: (next, tone = null) =>
      toolsController?.setRegionHint(next, tone),
    requestRender,
    notify,
  });

  const sampler = createEngineSampler({
    beforeRead: () => getEngine()?.prepareCanvasReadback?.(),
    renderOutsidePixel: (point, radius) => sampleFreeCanvas(getEngine(), point, radius, getRenderedDpr?.() ?? 1),
    ctx,
    getDoc,
    cache,
    viewportTools,
    getRenderedDpr,
    getDropperSampleSize: () => selectionController.getDropperSampleSize(),
    getDropperSource: () => selectionController.getDropperSource(),
    DROPPER_SAMPLE_RADII: selectionController.DROPPER_SAMPLE_RADII,
  });

  const initController = createEngineInitController({
    ctx,
    getDoc,
    setDoc,
    setGuides: documentController.setGuides,
    cache,
    hostAdapter,
    viewportTools,
    history,
    snapshotDoc,
    snapshotState,
    getAppliedSnapshot,
    setAppliedSnapshot,
    incDocVersion,
    requestRender,
    notify,
    isDisposed,
    cameraMode,
  });

  nodesController = createEngineNodesController({
    getDoc,
    setDoc,
    selection,
    cache,
    maskTools,
    paintTools,
    penTools,
    releaseNodeTextures,
    getEffectiveNode,
    getPixelSelection: selectionController.getPixelSelection,
    clearPixelSelection: selectionController.clearPixelSelection,
    setTool: (next) => toolsController.setTool(next),
    requestRender,
    notify,
    onSelectionUnitChange: groupId => history.updateCurrentSelection(selection.getIds(), groupId),
  });

  const styleController = createEngineStyleController({
    getDoc,
    setDoc,
    selection,
    selectMany: nodesController.selectMany,
    notify,
    requestRender,
  });

  const brushController = createEngineBrushController({
    getDoc,
    setDoc,
    getSelectedId: () => selection.getId(),
    selectMany: nodesController.selectMany,
    requestRender,
    notify,
  });

  toolsController = createEngineToolsController({
    getDoc,
    setDoc,
    selection,
    selectNode: nodesController.select,
    crop,
    maskTools,
    annotations,
    penTools,
    selectionController,
    paintTools,
    onLeavePatch: () => {
      repairController?.clearPatchDraft?.();
      requestRender();
    },
    notify,
  });

  const repairController = createEngineRepairController({
    getDoc,
    setDoc,
    cache,
    selection,
    imageLayerCrop,
    selectNode: nodesController.select,
    selectMany: nodesController.selectMany,
    getSelectedGroup: nodesController.getSelectedGroup,
    selectGroup: nodesController.selectGroup,
    removeIds: nodesController.removeIds,
    maskTools,
    exporter,
    bitmapWriter,
    selectionController,
    getColor: brushController.getColor,
    getToolBackgroundColor: brushController.getToolBackgroundColor,
    setToolBackgroundColor: brushController.setToolBackgroundColor,
    getBackgroundColor: documentController.getBackgroundColor,
    getGradientToolState: brushController.getGradientToolState,
    getShapeStrokeColor: brushController.getShapeStrokeColor,
    setShapeStrokeColor: brushController.setShapeStrokeColor,
    getStrokeWidth: brushController.getStrokeWidth,
    setStrokeWidth: brushController.setStrokeWidth,
    getShapeStrokeDash: brushController.getShapeStrokeDash,
    setShapeStrokeDash: brushController.setShapeStrokeDash,
    getArrowEnd: brushController.getArrowEnd,
    setArrowEnd: brushController.setArrowEnd,
    getShapeOpacity: brushController.getShapeOpacity,
    setShapeOpacity: brushController.setShapeOpacity,
    getFillOpacity: brushController.getFillOpacity,
    getGradientOpacity: brushController.getGradientOpacity,
    setFillOpacity: brushController.setFillOpacity,
    setGradientOpacity: brushController.setGradientOpacity,
    sourceWorkflowNodeId,
    onGeneratedOutput,
    isDisposed,
    requestRender,
    notify,
    getAiRepairDownload: toolsController.getAiRepairDownload,
    setAiRepairDownload: toolsController.setAiRepairDownload,
    getViewportCenter,
  });

  const transformApi = createTransformApi({
    getDoc,
    setDoc,
    getPixelSelection: selectionController.getPixelSelection,
    setPixelSelection: selectionController.setPixelSelection,
    getSelectionTransform: selectionController.getSelectionTransform,
    setSelectionTransform: selectionController.setSelectionTransform,
    getSelectedId: () => selection.getId(),
    getSelectedIds: () => selection.getIds(),
    getSelectedPuppetPin,
    setSelectedPuppetPin,
    setRegionHint: (next, tone = null) =>
      toolsController.setRegionHint(next, tone),
    cache,
    maskTools,
    glAdjustments,
    syncAnts: selectionController.syncAnts,
    requestRender,
    notify,
    cancelPolygonLasso: selectionController.cancelPolygonLasso,
    trackTransform: bitmapWriter.trackTransform,
    transformsInFlight: bitmapWriter.transformsInFlight,
    activeTransformPromises: bitmapWriter.activeTransformPromises,
    replaceNodeBitmap: bitmapWriter.replaceNodeBitmap,
    isDisposed,
    getTransformNodeBitmap: () => getEngine?.()?.transformNodeBitmap,
  });

  return {
    crop,
    annotations,
    maskTools,
    paintTools,
    penTools,
    exporter,
    exportApi,
    documentController,
    bitmapWriter,
    historyApi,
    selectionController,
    sampler,
    initController,
    nodesController,
    brushController,
    toolsController,
    repairController,
    styleController,
    transformApi,
  };
}
