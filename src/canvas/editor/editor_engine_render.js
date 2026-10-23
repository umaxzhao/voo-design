/**
 * Canvas stage rendering dispatcher.
 *
 * Extracted from editor_engine.js to isolate per-frame draw option construction
 * and devicePixelRatio / draft rendering coordination.
 */

import {
  findNode,
  isGroupNode,
  isRegionNode,
  NODE_KIND,
  nodeRect,
} from "./scene_model.js";
import { nodeAABB } from "./scene_geometry.js";
import { draw, resizeCanvas } from "./scene_renderer.js";
import { TOOL } from "./editor_constants.js";
import * as ops from "./doc_ops.js";

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
}) {
  const dpr = draftRender ? 1 : window.devicePixelRatio || 1;
  const width = stageWidth || stage.clientWidth;
  const height = stageHeight || stage.clientHeight;
  resizeCanvas(canvas, width, height, dpr);
  const selectedId = selection.getId();
  const selectedNode = selectedContainer ?? (selectedId ? findNode(doc, selectedId) : null);
  const hideSelection =
    tool === TOOL.BRUSH ||
    tool === TOOL.ERASER ||
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
  draw(ctx, {
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
      !annotations.getEditingTextId() &&
      tool !== TOOL.RECT &&
      tool !== TOOL.ELLIPSE &&
      tool !== TOOL.ARROW &&
      tool !== TOOL.PERSPECTIVE &&
      tool !== TOOL.DISTORT &&
      tool !== TOOL.PUPPET_WARP,
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
  });

  return dpr;
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
  const paintNodeIds = new Set(nodeIds);
  // Backdrop effects and clipping chains must not pull lower runs above a 3D layer.
  const passNodes = doc.nodes
    .filter(
      (node) =>
        paintNodeIds.has(node.id) ||
        isGroupNode(node) ||
        node.kind === NODE_KIND.BOOLEAN,
    )
    .map((node) =>
      node.kind === NODE_KIND.BOOLEAN && !paintNodeIds.has(node.id)
        ? { ...node, visible: false }
        : node,
    );
  draw(ctx, {
    doc: { ...doc, nodes: passNodes, backgroundColor: "transparent" },
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
