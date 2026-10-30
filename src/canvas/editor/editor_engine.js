import { wasmEngineEnabled, loadEditorWasmIndex } from '../../engine-wasm/editor-index.js';
import { validateDesignTokens } from "./design_tokens.js";
import { documentRenderListener } from "./render_notifications.js";
import { releaseStagePictureCache, cancelStagePictureRefinement } from "./stage_picture_cache.js";
import { TOOL } from "./editor_constants.js";
import { previewDirtyRect } from "./preview_dirty_rect.js";
import { unionRect } from "./dirty_rect.js";
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
  renderEngineArtwork,
  renderEngineLayerPass,
  renderEngineStage,
  renderEngineChrome,
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
  let stagePaintingEnabled = true;
  let chromeRenderOptions = null;
  // Tool-panel edits update a node on every pointer tick; coalesce those into
  // one history entry instead of letting the default commit-per-update model
  // flood undo with one entry per tick.
  let toolCommitTimer = null;
  const renderListeners = new Set();

  const history = createHistory();
  const selection = createSelection({
    onChange: (ids) => {
      history.updateCurrentSelection(ids);
    },
  });
  const glAdjustments = acquireAdjustmentRenderer();
  const cache = createBitmapCache({
    onEvict: (image) => {
      releaseImagePyramid(image, glAdjustments);
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
    hasDomOverlay: () => Boolean(ctrl?.annotations?.getEditingTextId?.() ||
      ctrl?.annotations?.getEditingRegionId?.()),
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
    getSelectedGroupId: () => ctrl?.nodesController?.getSelectedGroup?.()?.id ?? null,
    restoreSelectionUnit: (ids, groupId) => {
      if (groupId) ctrl?.nodesController?.selectGroup(groupId);
      else ctrl?.nodesController?.selectExactly(ids);
    },
    // History restore drops an in-flight selection transform: its box refers to
    // the pre-undo pixels. The controller has no separate clear method, so this
    // goes through the public setter (the extra render is harmless).
    clearSelectionTransform: () =>
      ctrl?.selectionController?.setSelectionTransform?.(null),
  });

  let previewDirty = null;
  let previewViewport = null;
  let previewRenderVersion = -1;
  let previewSelection = null;
  let previewCanRepaint = true;
  let previewStageSize = null;
  let previewDpr = null;
  function setDoc(next, { commit = true, name = null, preview = false } = {}) {
    if (preview) {
      const region = previewDirtyRect(doc, next, viewportTools.getZoom());
      if (!previewDirty) {
        previewViewport = viewportTools.getViewport();
        previewRenderVersion = renderVersion;
        previewSelection = selection.getIds().join("\0");
        previewDpr = draftRender ? 1 : window.devicePixelRatio || 1;
        previewStageSize = `${cachedStageWidth}:${cachedStageHeight}`;
      }
      if (!region) previewCanRepaint = false;
      previewDirty = unionRect(previewDirty, region);
      doc = next;
      docVersion += 1;
      requestRender();
      return;
    }
    previewDirty = null;
    previewCanRepaint = false;
    doc = ctrl.initController.measureTextNodes(next);
    docVersion += 1;
    ctrl.initController.queueFontLoads(doc);
    const currentIds = selection.getIds();
    if (currentIds.length > 0) {
      const validIds = currentIds.filter((id) => Boolean(findNode(doc, id)));
      if (validIds.length !== currentIds.length) {
        // Pruning belongs to the new document. Do not rewrite the previous
        // history entry's selection before pushing this mutation's snapshot.
        history.mute(() => selection.selectNodes(validIds));
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
  let wasmIndex = null;
  if (wasmEngineEnabled()) {
    loadEditorWasmIndex().then(index => {
      if (disposed) { index.free(); return; }
      wasmIndex = index;
      cachedSpatialIndexDoc = null;
      requestRender();
    }).catch(error => console.warn('WASM engine unavailable; using JS spatial index', error));
  }
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
    cachedSpatialIndex = wasmIndex ? wasmIndex.sync(currentDoc.nodes) : syncSpatialIndex(cachedSpatialIndex, currentDoc.nodes);
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
      paintStage: stagePaintingEnabled,
      ctx,
      canvas,
      stage,
      stageWidth: cachedStageWidth || stage.clientWidth,
      stageHeight: cachedStageHeight || stage.clientHeight,
      doc: evaluatedDoc,
      viewportTools,
      requestRender,
      onRenderOptions: (options) => { chromeRenderOptions = options; },
      selection,
      selectedContainer: ctrl.nodesController?.getSelectedGroup?.() ?? null,
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
      // Shared-workspace chrome paints no artwork; pointer hit tests build the index lazily.
      spatialIndex: stagePaintingEnabled ? getSpatialIndex(evaluatedDoc) : null,
      previewMotion: !!previewDirty,
      dirtyRects: previewCanRepaint &&
        previewDpr === (draftRender ? 1 : window.devicePixelRatio || 1) &&
        previewStageSize === `${cachedStageWidth}:${cachedStageHeight}` &&
        previewViewport === viewportTools.getViewport() &&
        previewRenderVersion === renderVersion &&
        previewSelection === selection.getIds().join("\0") &&
        selection.getIds().length <= 1 && !mixedLayerMode &&
        !marqueeRect && !textDraftRect && !hoveredNodeId &&
        ctrl.toolsController.getTool() === TOOL.SELECT
        ? previewDirty : null,
      // Off until it measures faster: in Chrome, blitting 400 cached shadow
      // surfaces during a pan was slower than painting the shadows directly.
      layerCache: null,
    });
    previewDirty = null;
    previewViewport = null;
    previewCanRepaint = true;
    for (const listener of renderListeners) listener();
  }

  function requestRender() {
    cancelStagePictureRefinement(ctx);
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function notify() {
    if (disposed || notifyFrame) return;
    notifyFrame = requestAnimationFrame(() => {
      notifyFrame = 0;
      renderVersion += 1;
      onChange?.();
    });
  }

  const api = {
    getWasmEngineStatus: () => wasmIndex ? "ready" : "inactive",
    get sourceWorkflowNodeId() {
      return sourceWorkflowNodeId;
    },
    getDocument: getDoc,
    // `designSystemId` records which registry system the applied copy came from;
    // omit it to keep the current id, pass null to clear it.
    setDesignSystem({ designTokens, designMd, designSystemId }) {
      validateDesignTokens(designTokens);
      const next = { ...getDoc(), designTokens: JSON.parse(JSON.stringify(designTokens)), designMd: String(designMd ?? '') };
      if (designSystemId === null) delete next.designSystemId;
      else if (typeof designSystemId === 'string') next.designSystemId = designSystemId;
      setDoc(next, { name: 'Update design system' });
    },
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
    /** Update a node without committing; commit once after the burst ends. */
    updateNodeCoalesced: (id, patch, options = {}) => {
      ctrl.nodesController.updateNodes([{ id, ...patch }], {
        ...options,
        commit: false,
      });
      if (toolCommitTimer) clearTimeout(toolCommitTimer);
      toolCommitTimer = setTimeout(() => {
        toolCommitTimer = null;
        ctrl.historyApi.commit?.("editor.tool.update");
      }, 250);
    },
    getNode: (id) => getDoc()?.nodes?.find((n) => n.id === id) ?? null,
    getDoc: () => getDoc(),
    // Selection state lives in the nodes controller; the selection controller
    // only owns pixel selections, so it must not shadow these readers.
    getSelectedIds: () =>
      ctrl.nodesController.getSelectedIds?.() ??
      ctrl.selectionController.getSelectedIds?.() ??
      [],
    getSelectedId: () =>
      ctrl.nodesController.getSelectedId?.() ??
      ctrl.selectionController.getSelectedId?.(),
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
    ...ctrl.styleController,
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
    renderChrome(targetCanvas, viewport, width, height) {
      renderEngineChrome(targetCanvas, chromeRenderOptions, viewport, width, height);
    },
    setMixedLayerMode(next) {
      if (mixedLayerMode === Boolean(next)) return;
      mixedLayerMode = Boolean(next);
      requestRender();
    },
    setStagePaintingEnabled(enabled) {
      if (stagePaintingEnabled === enabled) return;
      stagePaintingEnabled = enabled;
      requestRender();
    },
    prepareCanvasReadback() {
      // Sampling is synchronous: a queued repaint or a previously hidden stage
      // must not return pixels from the document before the last mutation.
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      const wasPaintingEnabled = stagePaintingEnabled;
      stagePaintingEnabled = true;
      try {
        render();
        // The free workspace owns a detached measurement canvas; its readback
        // must exclude selection handles, hover controls, guides and grids.
        // Keep the full surface so spatial effects retain their neighbourhood.
        if (getDoc().isCanvasRoot && !canvas.isConnected) {
          api.renderLayerPass(canvas, getDoc().nodes.map(node => node.id));
        }
      } finally { stagePaintingEnabled = wasPaintingEnabled; }
    },
    renderLayerPass(targetCanvas, nodeIds, surface = {}) {
      renderEngineLayerPass({
        targetCanvas,
        stage,
        nodeIds,
        doc: getDoc(),
        viewport: surface.viewport ?? viewportTools.getViewport(),
        stageWidth: surface.stageWidth,
        stageHeight: surface.stageHeight,
        dpr: renderedDpr,
        paintTools: ctrl.paintTools,
        maskTools: ctrl.maskTools,
        glAdjustments,
        bypassAdjustments,
        docVersion,
        renderVersion,
      });
    },
    renderArtwork(targetCanvas) {
      renderEngineArtwork(targetCanvas, chromeRenderOptions);
    },
    subscribeRender(listener, { documentOnly = false } = {}) {
      const callback = documentOnly ? documentRenderListener(getDoc, listener) : listener;
      renderListeners.add(callback);
      return () => renderListeners.delete(callback);
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
    wasmIndex?.free();
    disposed = true;
    viewportTools.dispose();
    releaseStagePictureCache(ctx);
    renderListeners.clear();

    if (frame) cancelAnimationFrame(frame);
    if (notifyFrame) cancelAnimationFrame(notifyFrame);
    if (toolCommitTimer) clearTimeout(toolCommitTimer);
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
