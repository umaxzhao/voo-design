import { drawCachedStage } from "./stage_picture_cache.js";
import { drawPlainRects, isPlainRectList } from "./render_plain_rects.js";
import { roundRectPath } from "./render_basic_shapes.js";
import { dirtyRectsToDevice, shouldUseDirtyRect } from "./dirty_rect.js";
// Top-level stage paint loop coordinating page background, nodes, and chrome passes.

import {
  effectivePage,
} from "./scene_model.js";
import {
  cullMarginWorld,
  cullableNodeIds,
  visibleNodeIds,
  visibleWorldRect,
} from "./viewport_culling.js";
import {
  PAGE_BACKGROUND,
  drawPenOverlay,
  drawPenSelectionTint,
  getCheckerboardSource,
} from "./render_nodes.js";
import { drawArtworkNodes } from "./chrome-artwork-nodes.js";
import { drawLayoutGrids } from "./chrome_layout_grid.js";
import { drawRegions } from "./chrome_regions.js";
import { drawSelection, drawSelectionSet } from "./chrome_selection.js";
import {
  drawCrop,
  drawGuides,
  drawMarquee,
  drawSelectionTransformBox,
  drawTextDraftRect,
  drawAgentFocusOverlay,
  drawAgentCursorOverlay,
  getAgentFocusNode,
  getAgentCursor,
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
function drawUncached(
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
    selectionPaintOutline = false,
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
    dirtyRects = null,
    artworkOnly = false,
    overlaysOnly = false,
    stageWidth = null,
    stageHeight = null,
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
  const width = stageWidth ?? canvas.width / dpr;
  const height = stageHeight ?? canvas.height / dpr;
  const dirty = dirtyRectsToDevice(dirtyRects, viewport, dpr, width, height);
  const partial = dirtyRects && shouldUseDirtyRect(dirty, width, height, dpr);
  if (!overlaysOnly) {
    if (partial) {
      ctx.beginPath();
      ctx.rect(dirty.x / dpr, dirty.y / dpr, dirty.width / dpr, dirty.height / dpr);
      ctx.clip();
      ctx.clearRect(dirty.x / dpr, dirty.y / dpr, dirty.width / dpr, dirty.height / dpr);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    // Ordinary artboards clip to their bounds; imported canvas roots are unbounded.
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);
    // Artboards clip to their bounds; a frame's corner radius rounds both the
    // clip and its page fill so the canvas artwork matches the DOM frame.
    if (!doc.isCanvasRoot) {
      ctx.beginPath();
      roundRectPath(ctx, page.x, page.y, page.width, page.height, doc.cornerRadius ?? 0);
      ctx.clip();
    }

    if (!doc.isCanvasRoot && pageBackground) {
      ctx.beginPath();
      roundRectPath(ctx, page.x, page.y, page.width, page.height, doc.cornerRadius ?? 0);
      if (doc.backgroundColor && doc.backgroundColor !== "transparent") {
        ctx.fillStyle = doc.backgroundColor;
        ctx.fill();
      } else {
        // A transparent backdrop reads as a checkerboard on screen. Exports only
        // set pageBackground for blend-mode documents, so this pattern never
        // leaks into a PNG — eraser/cutout pixels stay transparent there.
        const source = getCheckerboardSource();
        if (source) {
          ctx.fillStyle = ctx.createPattern(source, "repeat");
          ctx.fill();
        } else {
          ctx.fillStyle = PAGE_BACKGROUND;
          ctx.fill();
        }
      }
    } else if (!doc.isCanvasRoot && doc.backgroundColor && doc.backgroundColor !== "transparent") {
      ctx.fillStyle = doc.backgroundColor;
      ctx.fillRect(page.x, page.y, page.width, page.height);
    }

    const activeSpatialIndex =
      cullOffscreen ? (spatialIndex ?? doc.spatialIndex ?? doc._spatialIndex ?? null) : null;
    const plainDocument = isPlainRectList(doc.nodes);
    const culledIds = cullOffscreen && (!plainDocument || !activeSpatialIndex) ? cullableNodeIds(doc) : null;
    const damageWorld = partial && plainDocument ? {
      minX: (dirty.x / dpr - viewport.panX - 1) / viewport.zoom,
      minY: (dirty.y / dpr - viewport.panY - 1) / viewport.zoom,
      maxX: ((dirty.x + dirty.width) / dpr - viewport.panX + 1) / viewport.zoom,
      maxY: ((dirty.y + dirty.height) / dpr - viewport.panY + 1) / viewport.zoom,
    } : null;
    const visibleRect = cullOffscreen
      ? (damageWorld ?? visibleWorldRect(
          viewport,
          canvas.width / dpr,
          canvas.height / dpr,
          plainDocument ? 2 / viewport.zoom : cullMarginWorld(doc, viewport.zoom, dpr),
        ))
      : null;
    const visibleSet =
      activeSpatialIndex && visibleRect
        ? visibleNodeIds(doc, visibleRect, activeSpatialIndex, plainDocument)
        : null;
    const stageCache = cullOffscreen ? layerCache : null;
    stageCache?.beginFrame(ctx);

    const plainRectsPainted = !stageCache && (!visibleRect || visibleSet) &&
      drawPlainRects(ctx, doc.nodes, { visibleSet, hiddenNodeId, paintNodeIds,
        paintBounds: partial ? {
          x: (dirty.x / dpr - viewport.panX - 1) / viewport.zoom,
          y: (dirty.y / dpr - viewport.panY - 1) / viewport.zoom,
          width: (dirty.width / dpr + 2) / viewport.zoom,
          height: (dirty.height / dpr + 2) / viewport.zoom,
        } : null });
    if (!plainRectsPainted) drawArtworkNodes(ctx, { doc, paintNodeIds, hiddenNodeId,
      visibleSet, culledIds, visibleRect, docVersion, fullResolution, bitmapOf,
      maskOf, gpu, bypassAdjustments, selectionTransformBox, videoFrameOf, stageCache });

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

    // Per-frame layout grids first (below the global pixel grid): they are
    // view-only chrome and clipped to the frame that owns them.
    drawLayoutGrids(ctx, doc, viewport, { hiddenNodeId });

    // View-only grid overlay (never exported): hairline columns and rows in
    // document space, drawn over nodes so it serves as an active alignment aid.
    const isGridEnabled = Boolean(
      grid && grid.enabled !== false && (grid.enabled || grid.visible) && grid.size > 0,
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

  }
  if (artworkOnly) { ctx.restore(); return; }

  if (includeRegions && !isPlainRectList(doc.nodes)) drawRegions(ctx, doc, viewport, hiddenLabelId);

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
      selectionPaintOutline,
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

  const focus = getAgentFocusNode();
  if (focus) drawAgentFocusOverlay(ctx, focus, viewport);

  const agentCursor = getAgentCursor();
  if (agentCursor) drawAgentCursorOverlay(ctx, agentCursor, viewport);

  ctx.restore();
}

export function draw(ctx, options) {
  return drawCachedStage(ctx, options, drawUncached);
}
