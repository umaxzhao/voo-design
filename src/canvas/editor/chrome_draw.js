// Top-level stage paint loop coordinating page background, nodes, and chrome passes.

import {
  NODE_KIND,
  effectivePage,
  isGroupNode,
  isHiddenByGroup,
  isInsideBooleanGroup,
} from "./scene_model.js";
import { nodeAABB } from "./scene_geometry_bounds.js";
import {
  cullMarginWorld,
  cullableNodeIds,
  isBoxOffscreen,
  nodeVisualAABB,
  visibleNodeIds,
  visibleWorldRect,
} from "./viewport_culling.js";
import {
  PAGE_BACKGROUND,
  drawNode,
  drawPenOverlay,
  drawPenSelectionTint,
  getCheckerboardSource,
} from "./render_nodes.js";
import { drawAdjustmentLayer, drawClippingChain } from "./chrome_layers.js";
import { drawRegions } from "./chrome_regions.js";
import { drawSelection, drawSelectionSet } from "./chrome_selection.js";
import {
  drawCrop,
  drawGuides,
  drawMarquee,
  drawSelectionTransformBox,
  drawTextDraftRect,
} from "./chrome_stage_overlays.js";
import {
  drawLasso,
  drawMagneticLasso,
  drawPixelSelection,
  drawPolygonDraft,
} from "./chrome_pixel_selection.js";
import {
  drawBitmapPreview,
  drawGesturePathPreview,
  drawPatchDraft,
  drawRemoveStroke,
} from "./chrome_retouch.js";
import { drawCloneAnchor, drawClonePreview } from "./chrome_clone.js";

/**
 * Paints one frame.
 *
 * `bitmapOf(node)` returns the decoded image for an image node, or undefined
 * while it is still loading — a missing bitmap simply skips that node rather
 * than aborting the frame.
 *
 * `includeRegions` is false for the export pass: reference regions describe the
 * picture to a model, so painting them into it would turn an instruction into
 * artwork the model then reproduces.
 *
 * `pageBackground` is false for the export pass too: the white sheet is stage
 * dressing, and baking it in would turn every cutout/erasure back into white.
 *
 * `bypassAdjustments` is the hold-to-compare preview: image nodes draw with
 * identity adjustments. Preview-only — the export pass never sets it.
 */
export function draw(
  ctx,
  {
    doc,
    viewport,
    dpr,
    selectionRect,
    selectionNode = null,
    selectionSet = null,
    marqueeRect = null,
    textDraftRect = null,
    gradientAdjusting = false,
    selectionHandles = true,
    showCornerRadius = false,
    warpTool = null,
    selectedPuppetPin = null,
    cropRect,
    hiddenNodeId,
    hiddenLabelId,
    lasso = null,
    pixelSelection = null,
    polygonDraft = null,
    magneticLassoDraft = null,
    antsOffset = 0,
    removeStroke = null,
    patchDraft = null,
    gesturePreview = null,
    bitmapPreview = null,
    clonePreview = null,
    cloneSource = null,
    guides = [],
    grid = null,
    selectionTransformBox = null,
    includeRegions = true,
    pageBackground = true,
    paintNodeIds = null,
    bypassAdjustments = false,
    bitmapOf,
    maskOf,
    videoFrameOf = null,
    penDraft = null,
    penEdit = null,
    penEditNode = null,
    penInsertPreview = null,
    glRenderer = null,
    fullResolution = false,
    docVersion = 0,
    spatialIndex = null,
    // Skip off-screen nodes. Only the on-screen stage asks for it: exports and
    // mask sources paint the whole page and must not lose any node.
    cullOffscreen = false,
    // Stage-only too: exports must paint every node exactly, never a blit.
    layerCache = null,
  },
) {
  // The camera metadata rides even when no GL renderer was found: the CPU
  // adjustment path schedules its pixel work at target resolution through
  // the same numbers (exports and mask sources arrive with fullResolution,
  // which collapses that target back to natural pixels).
  const gpu = { renderer: glRenderer, viewport, dpr, fullResolution };
  const { canvas } = ctx;
  // A non-destructive crop makes the crop rect the visible page: the sheet,
  // the clip and the adjustment planes all use it, while the original canvas
  // and its nodes stay in the document.
  const page = effectivePage(doc);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

  // The page and everything on it, clipped to the document bounds.
  ctx.save();
  ctx.translate(viewport.panX, viewport.panY);
  ctx.scale(viewport.zoom, viewport.zoom);
  ctx.beginPath();
  ctx.rect(page.x, page.y, page.width, page.height);
  ctx.clip();

  if (pageBackground) {
    if (doc.backgroundColor && doc.backgroundColor !== "transparent") {
      ctx.fillStyle = doc.backgroundColor;
      ctx.fillRect(page.x, page.y, page.width, page.height);
    } else {
      // A transparent backdrop reads as a checkerboard on screen. Exports only
      // set pageBackground for blend-mode documents, so this pattern never
      // leaks into a PNG — eraser/cutout pixels stay transparent there.
      const source = getCheckerboardSource();
      if (source) {
        ctx.fillStyle = ctx.createPattern(source, "repeat");
        ctx.fillRect(page.x, page.y, page.width, page.height);
      } else {
        ctx.fillStyle = PAGE_BACKGROUND;
        ctx.fillRect(page.x, page.y, page.width, page.height);
      }
    }
  } else if (doc.backgroundColor && doc.backgroundColor !== "transparent") {
    ctx.fillStyle = doc.backgroundColor;
    ctx.fillRect(page.x, page.y, page.width, page.height);
  }

  const culledIds = cullOffscreen ? cullableNodeIds(doc) : null;
  const visibleRect = culledIds
    ? visibleWorldRect(
        viewport,
        canvas.width / dpr,
        canvas.height / dpr,
        cullMarginWorld(doc, viewport.zoom, dpr),
      )
    : null;
  const activeSpatialIndex =
    cullOffscreen ? (spatialIndex ?? doc.spatialIndex ?? doc._spatialIndex ?? null) : null;
  const visibleSet =
    activeSpatialIndex && visibleRect
      ? visibleNodeIds(doc, visibleRect, activeSpatialIndex)
      : null;
  const stageCache = cullOffscreen ? layerCache : null;
  stageCache?.beginFrame(ctx);

  for (let i = 0; i < doc.nodes.length; i += 1) {
    const node = doc.nodes[i];
    if (paintNodeIds && !paintNodeIds.has(node.id)) continue;
    if (node.id === hiddenNodeId) continue;
    if (visibleSet && !visibleSet.has(node.id)) continue;
    if (
      !visibleSet &&
      culledIds?.has(node.id) &&
      isBoxOffscreen(nodeVisualAABB(node), visibleRect)
    )
      continue;
    // A hidden folder hides everything inside it, and the folder row itself
    // is chrome — it never paints.
    // A child inside a boolean group is painted composited by the boolean group itself.
    if (
      isGroupNode(node) ||
      isHiddenByGroup(doc, node) ||
      isInsideBooleanGroup(doc, node)
    )
      continue;
    // A mask base only clips the layers above it (Figma masks): it paints nothing
    // itself, and its shape becomes the alpha of its clipping chain below.
    if (node.maskBase) continue;
    // A clipped layer is painted as part of its clipping chain: the chain is
    // collected below and drawn in one pass, so the loop skips every member.
    if (node.clipTo) {
      drawClippingChain(ctx, doc, i, node.clipTo, {
        hiddenNodeId,
        docVersion,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        fullResolution,
        bitmapOf,
        maskOf,
        gpu,
        bypassAdjustments,
      });
      // Advance past every layer in the chain.
      while (
        i + 1 < doc.nodes.length &&
        doc.nodes[i + 1].clipTo === node.clipTo
      ) {
        i += 1;
      }
      continue;
    }
    if (node.kind === NODE_KIND.ADJUSTMENT) {
      if (bypassAdjustments || !node.adjustments || node.visible === false)
        continue;
      drawAdjustmentLayer(ctx, doc, node, i, {
        hiddenNodeId,
        docVersion,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        fullResolution,
        bitmapOf,
        maskOf,
        bypassAdjustments,
      });
      continue;
    }
    const renderState = {
      docVersion,
      // Nodes are painted bottom-up. The revision plus their position makes a
      // custom blend tile depend on exactly the backdrop generation beneath it.
      backdropGeneration: `${docVersion}:${i}`,
      outputKey: `${canvas.width}x${canvas.height}|${fullResolution ? 1 : 0}`,
      selectionTransform: selectionTransformBox,
      videoFrameOf,
    };
    const paintNode = (target) =>
      drawNode(target, node, bitmapOf, maskOf, gpu, bypassAdjustments, renderState);
    if (!stageCache?.paint(ctx, node, paintNode)) paintNode(ctx);
  }

  if (penDraft || penEdit) {
    drawPenOverlay(ctx, penDraft, penEdit, penEditNode, penInsertPreview);
  }
  // A selected pen path re-strokes its own outline in green, so the user can
  // tell the line itself is selected — not just its bounding box. The node
  // being anchor-edited is already painted that green by the overlay.
  if (selectionSet) {
    for (const selectedNode of selectionSet) {
      if (penEditNode && selectedNode.id === penEditNode.id) continue;
      drawPenSelectionTint(ctx, selectedNode);
    }
  }

  // View-only grid overlay (never exported): hairline columns and rows in
  // document space, drawn over nodes so it serves as an active alignment aid.
  const isGridEnabled = Boolean(
    grid && (grid.enabled || grid.visible) && grid.size > 0,
  );
  if (isGridEnabled) {
    const gridSize = grid.size || 32;
    ctx.save();
    ctx.lineWidth = 1 / viewport.zoom;
    ctx.beginPath();
    const startX = page.x - (page.x % gridSize);
    for (let x = startX; x <= page.x + page.width; x += gridSize) {
      ctx.moveTo(x, page.y);
      ctx.lineTo(x, page.y + page.height);
    }
    const startY = page.y - (page.y % gridSize);
    for (let y = startY; y <= page.y + page.height; y += gridSize) {
      ctx.moveTo(page.x, y);
      ctx.lineTo(page.x + page.width, y);
    }
    // Dual stroke: subtle dark hairline for bright/white backgrounds,
    // plus mint hairline for dark backgrounds, visible at all contrasts.
    ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
    ctx.stroke();
    ctx.strokeStyle = "rgba(178, 255, 214, 0.32)";
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  if (includeRegions) drawRegions(ctx, doc, viewport, hiddenLabelId);

  if (cropRect) drawCrop(ctx, cropRect, doc, viewport);
  else if (selectionSet) drawSelectionSet(ctx, selectionSet, viewport);
  else if (selectionRect)
    drawSelection(
      ctx,
      selectionRect,
      viewport,
      selectionHandles,
      selectionNode,
      showCornerRadius,
      warpTool,
      gradientAdjusting,
      selectedPuppetPin,
    );

  if (marqueeRect) drawMarquee(ctx, marqueeRect, viewport);

  if (textDraftRect) drawTextDraftRect(ctx, textDraftRect, viewport);

  if (lasso) drawLasso(ctx, lasso, viewport);

  if (polygonDraft) drawPolygonDraft(ctx, polygonDraft, viewport);

  if (magneticLassoDraft) drawMagneticLasso(ctx, magneticLassoDraft, viewport);

  // Above the lasso and below the guides: the ants describe what is selected
  // now, while a lasso in progress is still a gesture.  When the selection
  // transform box is active the box itself represents the selection visually,
  // so suppress the ants to avoid a confusing "two outlines" overlap.
  if (selectionTransformBox) {
    drawSelectionTransformBox(ctx, selectionTransformBox, viewport);
  } else if (pixelSelection) {
    drawPixelSelection(ctx, pixelSelection, viewport, antsOffset);
  }

  if (removeStroke) drawRemoveStroke(ctx, removeStroke, viewport);

  if (patchDraft)
    drawPatchDraft(
      ctx,
      patchDraft,
      viewport,
      antsOffset,
      doc,
      bitmapOf,
      maskOf,
    );

  if (gesturePreview) drawGesturePathPreview(ctx, gesturePreview, viewport);
  if (bitmapPreview) drawBitmapPreview(ctx, bitmapPreview, doc);

  if (clonePreview) {
    drawClonePreview(ctx, clonePreview, cloneSource, bitmapOf, doc, viewport);
  } else if (cloneSource?.point) {
    // Draw source anchor marker even when cursor is off canvas
    drawCloneAnchor(ctx, cloneSource, viewport);
  }

  if (guides && guides.length > 0) drawGuides(ctx, guides, viewport, dpr);

  ctx.restore();
}
