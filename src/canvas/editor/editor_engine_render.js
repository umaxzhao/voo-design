/**
 * Canvas stage rendering dispatcher.
 *
 * Extracted from editor_engine.js to isolate per-frame draw option construction
 * and devicePixelRatio / draft rendering coordination.
 */

import {
  findNode,
  isRegionNode,
  NODE_KIND,
  nodeRect,
} from "./scene_model.js";
import { nodeAABB } from "./scene_geometry.js";
import { draw, resizeCanvas } from "./scene_renderer.js";
import { TOOL } from "./editor_constants.js";
import { isPaintTool } from "./paint_tool_ids.js";
import * as ops from "./doc_ops.js";
import { layerPassDocument } from "./layer-pass-document.js";

export function renderEngineStage({
  ctx,
  canvas,
  stage,
  stageWidth = null,
  stageHeight = null,
  doc,
  viewportTools,
  selection,
  selectedContainer = null,
  tool,
  healingMode,
  selectedPuppetPinId,
  hoveredNodeId,
  marqueeRect,
  textDraftRect,
  gradientAdjusting,
  crop,
  annotations,
  maskTools,
  paintTools,
  penTools,
  glAdjustments,
  pixelSelection,
  polygonDraft,
  magneticLassoDraft,
  antsOffset,
  removeStroke,
  patchDraft,
  gesturePreview,
  bitmapPreview,
  clonePreview,
  cloneSource,
  guides,
  grid,
  selectionTransform,
  bypassAdjustments,
  docVersion,
  renderVersion,
  draftRender,
  getEffectiveNode,
  videoFrameOf = null,
  mixedLayerMode = false,
  spatialIndex = null,
  layerCache = null,
  dirtyRects = null,
  previewMotion = false,
  requestRender = null,
  onRenderOptions = null,
  paintStage = true,
}) {
  const dpr = draftRender ? 1 : window.devicePixelRatio || 1;
  const width = stageWidth || stage.clientWidth;
  const height = stageHeight || stage.clientHeight;
  if (paintStage) resizeCanvas(canvas, width, height, dpr);
  const selectedId = selection.getId();
  const selectedNode = selectedContainer ?? (selectedId ? findNode(doc, selectedId) : null);
  // A paint tool on one image layer keeps only the faint outline (no handles)
  // so the user still sees the range of the image being painted.
  const paintOutline =
    isPaintTool(tool) &&
    selectedNode?.kind === NODE_KIND.IMAGE &&
    !selectedContainer &&
    selection.getIds().length <= 1;
  const hideSelection =
    ((tool === TOOL.BRUSH || tool === TOOL.ERASER) && !paintOutline) ||
    tool === TOOL.REGION ||
    tool === TOOL.LASSO;
  const selectedIds = selection.getIds();
  const multiple = !selectedContainer && selectedIds.length > 1;
  let selRect = null;
  let selNode = selectedNode;
  const isAdjustmentNode = selectedNode?.kind === NODE_KIND.ADJUSTMENT;

  const penEditId = penTools.api.getEdit()?.nodeId ?? null;
  if (penEditId && selectedId === penEditId) {
    selNode = null;
  }
  if (selectedNode && !hideSelection && !isAdjustmentNode && selNode) {
    if (isRegionNode(selectedNode)) {
      const outline = ops.regionOutlineInDoc(doc, selectedNode);
      if (outline) {
        selRect = outline.box;
        selNode = {
          ...selectedNode,
          x: outline.box.x,
          y: outline.box.y,
          width: outline.box.width,
          height: outline.box.height,
        };
      } else {
        selNode = getEffectiveNode(selectedNode);
        selRect = nodeRect(selNode);
      }
    } else if (
      selectedNode.kind === NODE_KIND.CANVAS_INSTANCE &&
      selectedNode.instance?.layoutMode === "fill"
    ) {
      // Selection chrome follows the full-page surface seen by the user.
      selNode = {
        ...selectedNode,
        x: 0,
        y: 0,
        width: doc.width,
        height: doc.height,
        rotation: 0,
      };
      selRect = nodeAABB(selNode);
    } else {
      selNode = getEffectiveNode(selectedNode);
      selRect = nodeAABB(selNode);
    }
  }

  const cropPreviewNode = crop?.getCropPreviewNode?.();
  const renderDoc = cropPreviewNode
    ? {
        ...doc,
        nodes: doc.nodes.map((node) =>
          node.id === cropPreviewNode.id ? cropPreviewNode : node,
        ),
      }
    : doc;
  const renderOptions = {
    doc: mixedLayerMode ? { ...renderDoc, backgroundColor: "transparent" } : renderDoc,
    viewport: viewportTools.getViewport(),
    dpr,
    cullOffscreen: true,
    spatialIndex,
    layerCache,
    stageWidth: width,
    stageHeight: height,
    dirtyRects,
    previewMotion,
    cameraMoving: viewportTools.isMoving?.() ?? false,
    requestRender,
    pageBackground: !mixedLayerMode,
    paintNodeIds: mixedLayerMode ? new Set() : null,
    selectionRect: selRect,
    selectionNode: hideSelection ? null : selNode,
    warpTool: tool,
    selectedPuppetPin: selectedPuppetPinId,
    selectionSet:
      multiple && !hideSelection
        ? doc.nodes
            .filter(
              (node) => selectedIds.includes(node.id) && node.id !== penEditId,
            )
            .map((node) => getEffectiveNode(node))
        : null,
    marqueeRect,
    textDraftRect,
    gradientAdjusting,
    selectionHandles:
      !hideSelection &&
      !isAdjustmentNode &&
      !multiple &&
      !selectedNode?.locked &&
      !paintOutline &&
      !annotations.getEditingTextId() &&
      tool !== TOOL.RECT &&
      tool !== TOOL.FRAME &&
      tool !== TOOL.ELLIPSE &&
      tool !== TOOL.ARROW &&
      tool !== TOOL.PERSPECTIVE &&
      tool !== TOOL.DISTORT &&
      tool !== TOOL.PUPPET_WARP,
    selectionPaintOutline: paintOutline,
    showCornerRadius: selectedNode?.id === hoveredNodeId,
    cropRect: crop.getCropRect(),
    hiddenNodeId: annotations.getEditingTextId(),
    hiddenLabelId: annotations.getEditingRegionId(),
    lasso: maskTools.api.getLasso(),
    pixelSelection,
    polygonDraft,
    magneticLassoDraft,
    antsOffset,
    removeStroke,
    patchDraft,
    gesturePreview,
    bitmapPreview,
    clonePreview:
      tool === TOOL.HEALING && healingMode === "clone" ? clonePreview : null,
    cloneSource:
      tool === TOOL.HEALING && healingMode === "clone" ? cloneSource : null,
    guides,
    grid,
    selectionTransformBox: selectionTransform,
    bypassAdjustments,
    bitmapOf: (node) =>
      paintTools.bitmapSourceOf(node),
    maskOf: maskTools.maskSourceOf,
    videoFrameOf,
    penDraft: penTools.api.getDraft(),
    penEdit: penTools.api.getEdit(),
    penEditNode: penTools.api.getEdit()
      ? findNode(doc, penTools.api.getEdit().nodeId)
      : null,
    penInsertPreview: penTools.api.insertionPreview(),
    glRenderer: glAdjustments,
    docVersion: `${docVersion}:${renderVersion}`,
  };
  onRenderOptions?.(renderOptions);
  if (paintStage) draw(ctx, renderOptions);

  return dpr;
}

/** Paint live interaction chrome above the shared Skia workspace artwork. */
export function renderEngineChrome(canvas, options, viewport, width, height) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Workspace chrome requires a 2D context");
  const dpr = window.devicePixelRatio || 1;
  resizeCanvas(canvas, width, height, dpr);
  // Overlay-only draws preserve artwork underneath, so clear our separate
  // transparent surface explicitly to remove old selection and gesture trails.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!options) return;
  draw(ctx, {
    ...options,
    viewport,
    dpr,
    stageWidth: width,
    stageHeight: height,
    overlaysOnly: true,
    pageBackground: false,
    dirtyRects: null,
  });
}

/** Paint the complete frame and artwork without duplicating selection chrome. */
export function renderEngineArtwork(canvas, options) {
  if (!options) return;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Artboard artwork requires a 2D context");
  resizeCanvas(canvas, options.stageWidth, options.stageHeight, options.dpr);
  draw(context, { ...options, artworkOnly: true, overlaysOnly: false, dirtyRects: null });
}

/** Paint one contiguous 2D layer run without stage chrome or the page fill. */
export function renderEngineLayerPass({
  targetCanvas,
  stage,
  stageWidth = null,
  stageHeight = null,
  doc,
  nodeIds,
  viewport,
  dpr,
  paintTools,
  maskTools,
  glAdjustments,
  bypassAdjustments,
  docVersion,
  renderVersion,
}) {
  const ctx = targetCanvas.getContext("2d");
  if (!ctx) throw new Error("Mixed layer canvas requires a 2D context");
  const width = stageWidth || stage.clientWidth;
  const height = stageHeight || stage.clientHeight;
  resizeCanvas(targetCanvas, width, height, dpr);
  const pass = layerPassDocument(doc, nodeIds);
  const { paintNodeIds } = pass;
  draw(ctx, {
    doc: pass.doc,
    artworkOnly: true,
    cullOffscreen: true,
    viewport,
    dpr,
    pageBackground: false,
    includeRegions: false,
    paintNodeIds,
    bypassAdjustments,
    bitmapOf: (node) =>
      paintTools.bitmapSourceOf(node),
    maskOf: maskTools.maskSourceOf,
    glRenderer: glAdjustments,
    docVersion: `${docVersion}:${renderVersion}`,
  });
}
