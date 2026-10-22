/**
 * The image editor engine facade.
 * Coordinates subsystems, renders frames, and exposes the public editor API.
 */

import { createBitmapCache } from "./bitmap_cache.js";
import { attachSpatialIndex, syncSpatialIndex } from "./viewport_culling.js";
import { createLayerCache } from "./layer_cache.js";
import {
  createEditorHost,
  createNullEditorHost,
} from "../../shared/editor-host-contract.js";
import {
  acquireAdjustmentRenderer,
  releaseAdjustmentRenderer,
} from "./gl_adjustments.js";
import { createHistory } from "./editor_history.js";
import { createSelection } from "./editor_selection.js";
import { sampleRegionColours } from "./region_colours.js";
import { attachPointerHandlers } from "./editor_pointer.js";
import { createViewport } from "./editor_viewport.js";
import {
  resolveEffectiveNode,
  invalidateBitmapAlphaBounds,
} from "./image_alpha_bounds.js";
import {
  createDocument,
  DEFAULT_PAGE_BACKGROUND,
  findNode,
  NODE_KIND,
  promptLayersOf,
  regionsOf,
  serialiseDocument,
} from "./scene_model.js";
import {
  reversePenPoints,
  toggleClosePenPoints,
  joinPenNodes,
  joinMultiplePenNodes,
  smoothPenPoints,
  simplifyPenPoints,
} from "./scene_model_paths.js";
import * as ops from "./doc_ops.js";
import {
  adjustmentLayerFailure,
  releaseImagePyramid,
  invalidateAdjustmentCache,
  invalidateBitmapComposite,
  invalidateImagePyramid,
} from "./scene_renderer.js";
import {
  commitEditorAction,
  commitEditorDocument,
  currentEditorHistoryLabel,
} from "../undo-action-contracts.js";
import {
  renderEngineLayerPass,
  renderEngineStage,
} from "./editor_engine_render.js";
import { assembleEngineControllers } from "./editor_engine_assembly.js";
import { createVideoLayerRuntime } from "./video-layer-runtime.js";
import {
  createEngineHistoryState,
  HISTORY_TOOL_NAMES,
} from "./editor_engine_history_state.js";
import {
  addLinearArrayModifier,
  updateLinearArrayModifier,
  removeLinearArrayModifier,
} from "./doc-ops-linear-array.js";
import {
  addGridArrayModifier,
  updateGridArrayModifier,
  removeGridArrayModifier,
} from "./doc-ops-grid-array.js";
import {
  addCircularArrayModifier,
  updateCircularArrayModifier,
  removeCircularArrayModifier,
} from "./doc-ops-circular-array.js";

export { pngDataUrlToBlob } from "./editor_clipboard.js";
export { PUPPET_MESH_SPAN } from "./editor_engine_warp.js";

export function createEditor({
  canvas,
  stage,
  onChange,
  cameraMode = "page",
  sourceWorkflowNodeId = null,
  host = null,
  onGeneratedOutput = null,
  getFitInsets = null,
}) {
  const hostAdapter = host ? createEditorHost(host) : createNullEditorHost();
  const ctx = canvas.getContext("2d");
  let doc = createDocument(1024, 1024, DEFAULT_PAGE_BACKGROUND);
  let docVersion = 0;
  let renderVersion = 0;
  let draftRender = false;
  let renderedDpr = 1;
  let selectedPuppetPinId = null;
  let hoveredNodeId = null;
  let marqueeRect = null;
  let textDraftRect = null;
  let gradientAdjusting = null;
  let bypassAdjustments = false;
  let frame = 0;
  let notifyFrame = 0;
  let disposed = false;
  let mixedLayerMode = false;
  const renderListeners = new Set();

  const history = createHistory(100);
  const selection = createSelection({
    onChange: (ids) => {
      history.updateCurrentSelection(ids);
    },
  });
  const glAdjustments = acquireAdjustmentRenderer();
  const cache = createBitmapCache({
    onEvict: (image) => {
      glAdjustments?.release?.(image);
    },
  });
  const videoLayers = createVideoLayerRuntime(
    () => requestRender(),
    (nodeId, error) => console.error(`Video layer ${nodeId} failed`, error),
  );
  const getDoc = () => doc;
  const isDisposed = () => disposed;
  // The document is replaced on every edit (setDoc), never mutated, so its
  // serialised form is reused until the object changes. Dirty checks run on
  // every view change, and serialising the whole page each time made zoom and
  // pan expensive on large documents.
  let snapshotCache = { doc: null, text: null };
  const snapshotDoc = () => {
    if (snapshotCache.doc !== doc) {
      snapshotCache = { doc, text: JSON.stringify(serialiseDocument(doc)) };
    }
    return snapshotCache.text;
  };
  let appliedSnapshot = snapshotDoc();

  const viewportTools = createViewport({
    stage,
    getDoc,
    notify: () => notify(),
    requestRender: () => requestRender(),
    getFitInsets,
  });

  let cachedStageWidth = stage?.clientWidth ?? 0;
  let cachedStageHeight = stage?.clientHeight ?? 0;
  let paintSourceAccessor = null;
  let maskSourceAccessor = null;

  const getEffectiveNode = (node) =>
    resolveEffectiveNode(node, {
      cache,
      paintSourceOf: paintSourceAccessor,
      maskSourceOf: maskSourceAccessor,
    });

  function releaseNodeTextures(node) {
    if (!node) return;
    const bmp = cache.get(node);
    const paintBmp = paintSourceAccessor?.(node);
    const mask = maskSourceAccessor?.(node);
    releaseImagePyramid(bmp, glAdjustments);
    if (paintBmp && paintBmp !== bmp)
      releaseImagePyramid(paintBmp, glAdjustments);
    if (mask) releaseImagePyramid(mask, glAdjustments);
    glAdjustments.release(bmp);
    glAdjustments.release(paintBmp);
    glAdjustments.release(mask);
  }

  function invalidateBitmap(source) {
    if (!source) return;
    source.__warpTextureVersion = (source.__warpTextureVersion ?? 0) + 1;
    invalidateAdjustmentCache(source);
    invalidateBitmapComposite(source);
    invalidateBitmapAlphaBounds(source);
    invalidateImagePyramid(source);
    glAdjustments.invalidateMatte(source);
    renderVersion += 1;
  }

  let ctrl;
  const historyState = createEngineHistoryState({
    getDoc,
    setDoc,
    getPixelSelection: () => ctrl?.selectionController?.getPixelSelection?.(),
    setPixelSelectionInternal: (sel) =>
      ctrl?.selectionController?.setPixelSelectionInternal?.(sel),
    selection,
    history,
    cache,
    getMaskTools: () => ctrl?.maskTools,
    getPaintTools: () => ctrl?.paintTools,
    getPenTools: () => ctrl?.penTools,
    getTextTools: () => ctrl?.annotations,
    syncAnts: () => ctrl?.selectionController?.syncAnts?.(),
    getIsolationGroupId: () => ctrl?.nodesController?.getIsolationGroupId?.(),
    setIsolationGroupId: (id) =>
      ctrl?.nodesController?.setIsolationGroupId?.(id),
    // History restore drops an in-flight selection transform: its box refers to
    // the pre-undo pixels. The controller has no separate clear method, so this
    // goes through the public setter (the extra render is harmless).
    clearSelectionTransform: () =>
      ctrl?.selectionController?.setSelectionTransform?.(null),
  });

  function setDoc(next, { commit = true, name = null, preview = false } = {}) {
    if (preview) {
      doc = next;
      docVersion += 1;
      requestRender();
      return;
    }
    doc = ctrl.initController.measureTextNodes(next);
    docVersion += 1;
    ctrl.initController.queueFontLoads(doc);
    const currentIds = selection.getIds();
    if (currentIds.length > 0) {
      const validIds = currentIds.filter((id) => Boolean(findNode(doc, id)));
      if (validIds.length !== currentIds.length) {
        selection.selectNodes(validIds);
      }
    }
    if (commit) {
      commitEditorAction("editor.document.set", () =>
        history.push(
          historyState.snapshotState(),
          name ??
            currentEditorHistoryLabel() ??
            HISTORY_TOOL_NAMES[ctrl.toolsController.getTool()] ??
            null,
        ),
      );
    }
    historyState.refreshBitmapCachePins();
    requestRender();
    notify();
  }

  ctrl = assembleEngineControllers({
    ctx,
    getDoc,
    setDoc,
    snapshotDoc,
    snapshotState: historyState.snapshotState,
    restore: historyState.restore,
    getAppliedSnapshot: () => appliedSnapshot,
    setAppliedSnapshot: (next) => {
      appliedSnapshot = next;
    },
    incDocVersion: () => {
      docVersion += 1;
    },
    requestRender: () => requestRender(),
    notify: () => notify(),
    selection,
    history,
    cache,
    glAdjustments,
    viewportTools,
    getViewportCenter: () => {
      if (!stage.clientWidth || !stage.clientHeight) return null;
      const bounds = stage.getBoundingClientRect();
      return viewportTools.toDocPoint(
        bounds.left + stage.clientWidth / 2,
        bounds.top + stage.clientHeight / 2,
      );
    },
    hostAdapter,
    cameraMode,
    isDisposed,
    sourceWorkflowNodeId,
    onGeneratedOutput,
    getRenderedDpr: () => renderedDpr,
    getEffectiveNode,
    releaseNodeTextures,
    getSelectedPuppetPin: () => selectedPuppetPinId,
    setSelectedPuppetPin: (next) => {
      selectedPuppetPinId = next ?? null;
    },
    invalidateBitmap,
    setDraftRender: (on) => {
      if (draftRender === on) return;
      draftRender = on;
      requestRender();
    },
    getEngine: () => api,
  });

  paintSourceAccessor = ctrl.paintTools.bitmapSourceOf;
  maskSourceAccessor = ctrl.maskTools.maskSourceOf;

  const layerCache = createLayerCache();
  let cachedSpatialIndex = null;
  let cachedSpatialIndexDoc = null;
  function getSpatialIndex(currentDoc) {
    if (cachedSpatialIndex && cachedSpatialIndexDoc === currentDoc) {
      return cachedSpatialIndex;
    }
    // The index is updated in place, so it no longer describes the previous
    // document: detach it there before handing it to the new one.
    if (cachedSpatialIndexDoc && cachedSpatialIndexDoc.spatialIndex === cachedSpatialIndex) {
      attachSpatialIndex(cachedSpatialIndexDoc, null);
    }
    cachedSpatialIndex = syncSpatialIndex(cachedSpatialIndex, currentDoc.nodes);
    cachedSpatialIndexDoc = currentDoc;
    attachSpatialIndex(currentDoc, cachedSpatialIndex);
    return cachedSpatialIndex;
  }

  function render() {
    const evaluatedDoc = getDoc();
    const videoIds = new Set();
    for (const node of evaluatedDoc.nodes) {
      if (node.kind !== NODE_KIND.VIDEO) continue;
      videoIds.add(node.id);
      videoLayers.ensure(node);
    }
    videoLayers.prune(videoIds);
    renderedDpr = renderEngineStage({
      ctx,
      canvas,
      stage,
      stageWidth: cachedStageWidth || stage.clientWidth,
      stageHeight: cachedStageHeight || stage.clientHeight,
      doc: evaluatedDoc,
      viewportTools,
      selection,
      tool: ctrl.toolsController.getTool(),
      healingMode: ctrl.toolsController.getHealingMode(),
      selectedPuppetPinId,
      hoveredNodeId,
      marqueeRect,
      textDraftRect,
      gradientAdjusting,
      crop: ctrl.crop,
      annotations: ctrl.annotations,
      maskTools: ctrl.maskTools,
      paintTools: ctrl.paintTools,
      penTools: ctrl.penTools,
      glAdjustments,
      videoFrameOf: videoLayers.frame,
      pixelSelection: ctrl.selectionController.getPixelSelection(),
      polygonDraft: ctrl.selectionController.getPolygonDraft(),
      magneticLassoDraft: ctrl.selectionController.getMagneticLassoDraft(),
      antsOffset: ctrl.selectionController.getAntsOffset(),
      removeStroke: ctrl.repairController.getRemoveStroke(),
      patchDraft: ctrl.repairController.getPatchDraft(),
      gesturePreview: ctrl.repairController.getGesturePreview(),
      bitmapPreview: ctrl.repairController.getBitmapPreview(),
      clonePreview: ctrl.repairController.getClonePreview(),
      cloneSource: ctrl.repairController.getCloneSource(),
      guides: ctrl.documentController.getGuides(),
      grid: ctrl.documentController.getGrid(),
      selectionTransform: ctrl.selectionController.getSelectionTransform(),
      bypassAdjustments,
      docVersion,
      renderVersion,
      draftRender,
      getEffectiveNode,
      mixedLayerMode,
      spatialIndex: getSpatialIndex(evaluatedDoc),
      // Off until it measures faster: in Chrome, blitting 400 cached shadow
      // surfaces during a pan was slower than painting the shadows directly.
      layerCache: null,
    });
    for (const listener of renderListeners) listener();
  }

  function requestRender() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function notify() {
    if (notifyFrame) return;
    notifyFrame = requestAnimationFrame(() => {
      notifyFrame = 0;
      renderVersion += 1;
      onChange?.();
    });
  }

  const api = {
    get sourceWorkflowNodeId() {
      return sourceWorkflowNodeId;
    },
    getDocument: getDoc,
    getZoom: viewportTools.getZoom,
    getViewport: viewportTools.getViewport,
    getCropRect: ctrl.crop.getCropRect,
    getEditingTextId: ctrl.annotations.getEditingTextId,
    getEditingRegionId: ctrl.annotations.getEditingRegionId,
    getPromptLayers: () => promptLayersOf(doc),
    getRegions() {
      const regions = regionsOf(doc);
      if (regions.length === 0) return regions;
      const artwork = ctrl.exporter.exportPngCanvas?.();
      if (!artwork) return regions;
      return regions.map((region) => {
        if (region.intent === "clear") return region;
        const colours = sampleRegionColours(artwork, region);
        return colours.length > 0 ? { ...region, colours } : region;
      });
    },
    toDocPoint: viewportTools.toDocPoint,
    open: ctrl.initController.open,
    setDoc,
    serialise: () => serialiseDocument(doc),

    // Modifiers API
    addLinearArrayModifier: (params, options) =>
      addLinearArrayModifier({ getDocument: getDoc, setDoc }, params, options),
    updateLinearArrayModifier: (modifierId, patch, options) =>
      updateLinearArrayModifier(
        { getDocument: getDoc, setDoc },
        modifierId,
        patch,
        options,
      ),
    removeLinearArrayModifier: (modifierId, options) =>
      removeLinearArrayModifier(
        { getDocument: getDoc, setDoc },
        modifierId,
        options,
      ),
    addCircularArrayModifier: (params, options) =>
      addCircularArrayModifier(
        { getDocument: getDoc, setDoc },
        params,
        options,
      ),
    updateCircularArrayModifier: (modifierId, patch, options) =>
      updateCircularArrayModifier(
        { getDocument: getDoc, setDoc },
        modifierId,
        patch,
        options,
      ),
    removeCircularArrayModifier: (modifierId, options) =>
      removeCircularArrayModifier(
        { getDocument: getDoc, setDoc },
        modifierId,
        options,
      ),
    addGridArrayModifier: (params, options) =>
      addGridArrayModifier({ getDocument: getDoc, setDoc }, params, options),
    updateGridArrayModifier: (modifierId, patch, options) =>
      updateGridArrayModifier(
        { getDocument: getDoc, setDoc },
        modifierId,
        patch,
        options,
      ),
    removeGridArrayModifier: (modifierId, options) =>
      removeGridArrayModifier(
        { getDocument: getDoc, setDoc },
        modifierId,
        options,
      ),

    // Subsystem spreads
    ...ctrl.documentController,
    ...ctrl.selectionController,
    ...ctrl.nodesController,
    updateNodes: (updates, options) =>
      ctrl.nodesController.updateNodes(updates, options),
    updateNode: (id, patch, options) =>
      ctrl.nodesController.updateNodes([{ id, ...patch }], options),
    getNode: (id) => getDoc()?.nodes?.find((n) => n.id === id) ?? null,
    getDoc: () => getDoc(),
    getSelectedIds: () =>
      ctrl.selectionController.getSelectedIds?.() ??
      (ctrl.selectionController.getSelectedId?.()
        ? [ctrl.selectionController.getSelectedId()]
        : []),
    getSelectedId: () => ctrl.selectionController.getSelectedId?.(),
    commitEditorDocument: (options) =>
      ctrl.documentController.commitEditorDocument?.(options),
    zoomToFit: () => viewportTools.zoomToFit?.(),
    zoomToHundred: () => viewportTools.zoomToHundred?.(),
    zoomIn: () => viewportTools.zoomIn?.(),
    zoomOut: () => viewportTools.zoomOut?.(),
    getSpatialIndex: () => getSpatialIndex(getDoc()),
    nodeAtPoint: (point, options = {}) =>
      ctrl.nodesController.nodeAtPoint(point, {
        zoom: viewportTools.getZoom(),
        spatialIndex: getSpatialIndex(getDoc()),
        ...options,
      }),
    ...ctrl.toolsController,
    ...ctrl.brushController,
    ...ctrl.historyApi,
    ...ctrl.transformApi,
    ...ctrl.repairController,
    ...ctrl.bitmapWriter,
    ...ctrl.exporter,
    ...ctrl.exportApi,
    ...ctrl.maskTools.api,
    ...ctrl.paintTools.api,
    ...ctrl.penTools.api,
    ...ctrl.annotations.api,
    ...ctrl.sampler,

    // Pen aliases
    getPenDraft: () => ctrl.penTools.api.getDraft(),
    get penEdit() {
      return ctrl.penTools.api.getEdit();
    },
    setPenAnchorType(mode) {
      ctrl.penTools.api.setAnchorType(mode);
      notify();
    },
    getPenAnchorType: () => ctrl.penTools.api.getAnchorType(),
    setPenMode(mode) {
      ctrl.penTools.api.setPenMode(mode);
      notify();
    },
    getPenMode: () => ctrl.penTools.api.getPenMode(),
    setPenSubTool(t) {
      ctrl.penTools.api.setPenSubTool(t);
      notify();
    },
    getPenSubTool: () => ctrl.penTools.api.getPenSubTool(),
    reverseSelectedPath() {
      if (ctrl.penTools.api.isEditing?.()) {
        return ctrl.penTools.api.reverseActivePath?.() ?? false;
      }
      const selectedIds = selection.getIds();
      if (selectedIds.length !== 1) return false;
      const node = findNode(doc, selectedIds[0]);
      if (!node || node.kind !== NODE_KIND.PATH || !node.points?.length) return false;
      const reversed = reversePenPoints(node.points);
      const updated = { ...node, points: reversed };
      commitEditorDocument(
        "editor.pen.change",
        setDoc,
        ops.updateNode(doc, node.id, updated),
      );
      requestRender();
      notify();
      return true;
    },
    toggleCloseSelectedPath() {
      if (ctrl.penTools.api.isEditing?.()) {
        return ctrl.penTools.api.toggleCloseActivePath?.() ?? false;
      }
      const selectedIds = selection.getIds();
      if (selectedIds.length !== 1) return false;
      const node = findNode(doc, selectedIds[0]);
      if (!node || node.kind !== NODE_KIND.PATH || !node.points?.length) return false;
      const toggled = toggleClosePenPoints(node.points);
      const updated = { ...node, points: toggled };
      commitEditorDocument(
        "editor.pen.change",
        setDoc,
        ops.updateNode(doc, node.id, updated),
      );
      requestRender();
      notify();
      return true;
    },
    joinSelectedPaths() {
      const selectedIds = selection.getIds();
      if (selectedIds.length < 2) return false;
      const pathNodes = selectedIds
        .map((id) => findNode(doc, id))
        .filter((n) => n && n.kind === NODE_KIND.PATH && n.points?.length);
      if (pathNodes.length < 2) return false;

      const joinedNode =
        pathNodes.length === 2
          ? joinPenNodes(pathNodes[0], pathNodes[1])
          : joinMultiplePenNodes(pathNodes);
      if (!joinedNode) return false;

      const droppedIds = new Set(pathNodes.map((n) => n.id));
      let nextNodes = doc.nodes.filter((n) => !droppedIds.has(n.id));
      nextNodes.push(joinedNode);
      commitEditorDocument(
        "editor.pen.change",
        setDoc,
        ops.withNodes(doc, nextNodes),
      );
      ctrl.nodesController.select(joinedNode.id);
      requestRender();
      notify();
      return true;
    },
    smoothSelectedPath(indices = null) {
      if (ctrl.penTools.api.isEditing?.()) {
        return ctrl.penTools.api.smoothActivePath?.(indices) ?? false;
      }
      const selectedIds = selection.getIds();
      if (selectedIds.length !== 1) return false;
      const node = findNode(doc, selectedIds[0]);
      if (!node || node.kind !== NODE_KIND.PATH || !node.points?.length) return false;
      const smoothed = smoothPenPoints(node.points, indices);
      const updated = { ...node, points: smoothed };
      commitEditorDocument(
        "editor.pen.change",
        setDoc,
        ops.updateNode(doc, node.id, updated),
      );
      requestRender();
      notify();
      return true;
    },
    breakSelectedPathAtAnchor() {
      if (ctrl.penTools.api.isEditing?.()) {
        return ctrl.penTools.api.breakActiveCurve?.() ?? false;
      }
      return false;
    },
    simplifySelectedPath(tolerance = 1.0) {
      if (ctrl.penTools.api.isEditing?.()) {
        return ctrl.penTools.api.simplifyActivePath?.(tolerance) ?? false;
      }
      const selectedIds = selection.getIds();
      if (selectedIds.length !== 1) return false;
      const node = findNode(doc, selectedIds[0]);
      if (!node || node.kind !== NODE_KIND.PATH || !node.points?.length) return false;
      const simplified = simplifyPenPoints(node.points, tolerance);
      if (simplified.length === node.points.length) return false;
      const updated = { ...node, points: simplified };
      commitEditorDocument(
        "editor.pen.change",
        setDoc,
        ops.updateNode(doc, node.id, updated),
      );
      requestRender();
      notify();
      return true;
    },
    async flushMasks() {
      await ctrl.maskTools.flushMasks();
      await ctrl.paintTools.flushPaints();
    },

    // Viewport & overlay controls
    zoomToFit: viewportTools.zoomToFit,
    zoomToSelection: (nodes) =>
      viewportTools.zoomToSelection(nodes ?? selection.getSelectedNodes()),
    zoomAt: viewportTools.zoomAt,
    zoomStep: viewportTools.zoomStep,
    zoomToHundred: viewportTools.zoomToHundred,
    panBy: viewportTools.panBy,
    setViewport: viewportTools.setViewport,
    requestRender,
    setMixedLayerMode(next) {
      if (mixedLayerMode === Boolean(next)) return;
      mixedLayerMode = Boolean(next);
      requestRender();
    },
    renderLayerPass(targetCanvas, nodeIds) {
      renderEngineLayerPass({
        targetCanvas,
        stage,
        nodeIds,
        doc: getDoc(),
        viewport: viewportTools.getViewport(),
        dpr: renderedDpr,
        paintTools: ctrl.paintTools,
        maskTools: ctrl.maskTools,
        glAdjustments,
        bypassAdjustments,
        docVersion,
        renderVersion,
      });
    },
    subscribeRender(listener) {
      renderListeners.add(listener);
      return () => renderListeners.delete(listener);
    },
    setBypassAdjustments(next) {
      const value = Boolean(next);
      if (value === bypassAdjustments) return;
      bypassAdjustments = value;
      requestRender();
    },
    setMarquee(next) {
      marqueeRect = next;
      requestRender();
    },
    setTextDraftRect(rect) {
      textDraftRect = rect ? { ...rect } : null;
      requestRender();
    },
    setGradientAdjusting(val) {
      gradientAdjusting = Boolean(val);
      requestRender();
    },
    getSelectedPuppetPin: () => selectedPuppetPinId,
    setSelectedPuppetPin(next) {
      selectedPuppetPinId = next ?? null;
      requestRender();
    },
    setHoveredNode(id) {
      if (hoveredNodeId === id) return;
      hoveredNodeId = id;
      requestRender();
    },

    // Node reads
    getEffectiveNode,
    getNodeBitmap: (node) =>
      node ? (cache.get(node)) : undefined,
    getNodeMask: (node) =>
      node
        ? ctrl.maskTools.maskSourceOf(node) || cache.getMask(node)
        : undefined,
    getAdjustmentLayerFailure: (nodeId) => adjustmentLayerFailure(doc, nodeId),
    getHost: () => hostAdapter,
  };

  for (const k of [
    "DROPPER_SAMPLE_RADII",
    "activeTransformPromises",
    "clickUnitOf",
    "compositedPixelAt",
    "extractSelectionImageNode",
    "getAntsOffset",
    "getBitmapPreview",
    "getGesturePreview",
    "getMagneticLasso",
    "removeIds",
    "selectionUnits",
    "setAiRepairDownload",
    "setIsolationGroupId",
    "setPixelSelectionInternal",
    "setPolygonDraft",
    "syncAnts",
    "trackTransform",
    "transformsInFlight",
    "unitSelectionIds",
  ])
    delete api[k];

  let lastStageWidth = stage.clientWidth;
  let lastStageHeight = stage.clientHeight;
  const detachPointer = attachPointerHandlers({
    stage,
    canvas,
    api,
    cameraMode,
  });
  const observer = new ResizeObserver(() => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (
      cameraMode !== "shared" &&
      w > 0 &&
      h > 0 &&
      (cachedStageWidth === 0 || cachedStageHeight === 0)
    ) {
      viewportTools.zoomToFit();
    }
    cachedStageWidth = w;
    cachedStageHeight = h;
    lastStageWidth = w;
    lastStageHeight = h;
    requestRender();
  });
  observer.observe(stage);
  requestRender();

  api.dispose = () => {
    disposed = true;
    renderListeners.clear();
    
    if (frame) cancelAnimationFrame(frame);
    if (notifyFrame) cancelAnimationFrame(notifyFrame);
    ctrl.selectionController.dispose();
    observer.disconnect();
    detachPointer();
    for (const node of doc.nodes) {
      glAdjustments.release(cache.get(node));
      glAdjustments.release(ctrl.paintTools.bitmapSourceOf(node));
      glAdjustments.release(ctrl.maskTools.maskSourceOf(node));
    }
    ctrl.maskTools.clear();
    ctrl.paintTools.clear();
    ctrl.penTools.clear();
    cache.dispose();
    layerCache.dispose();
    videoLayers.dispose();
    releaseAdjustmentRenderer();
  };

  return api;
}
