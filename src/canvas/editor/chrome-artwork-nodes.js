import { applyContainerMask } from "./render-container-mask.js";
import { NODE_KIND, isGroupNode, isHiddenByGroup, isInsideBooleanGroup } from "./scene_model.js";
import { isBoxOffscreen, nodeVisualAABB } from "./viewport_culling.js";
import { drawNode } from "./render_nodes.js";
import { clearAdjustmentLayerFailure, drawAdjustmentLayer, drawClippingChain, reportAdjustmentLayerFailure } from "./chrome_layers.js";
import { createFrameClipContext } from "./frame-clip-context.js";
import { withFrameClips } from "./render-frame-clips.js";
import { createContainerOpacityPlan, containerPaintNode } from "./container-opacity.js";
import { drawContainerOpacity } from "./render-container-opacity.js";
import { drawIsolatedAdjustment } from "./render-isolated-adjustment.js";

/** Opaque scenes stay flat; isolated subtrees preserve their member paint order. */
export function drawArtworkNodes(ctx, { doc, paintNodeIds, hiddenNodeId, visibleSet,
  culledIds, visibleRect, docVersion, fullResolution, bitmapOf, maskOf, gpu,
  bypassAdjustments, selectionTransformBox, videoFrameOf, stageCache,
  paintNodes = doc.nodes, isolatedContainers = new Set(), opacityPlan = createContainerOpacityPlan(doc.nodes) }) {
  const canvas = ctx.canvas;
  const clips = createFrameClipContext(doc.nodes);
  const entries = opacityPlan.entries(paintNodes, isolatedContainers);
  const allowedNodeIds = new Set(paintNodes.map(node => node.id));
  const paintScopeKey = paintNodes === doc.nodes ? "all" : JSON.stringify(paintNodes.map(node => node.id));
  for (let position = 0; position < entries.length; position += 1) {
    const entry = entries[position];
    if (entry.container) {
      const isolated = new Set([...isolatedContainers, entry.container.id]);
      drawContainerOpacity(ctx, entry.container, (target) => {
        drawArtworkNodes(target, {
          doc, paintNodeIds, hiddenNodeId, visibleSet, culledIds, visibleRect, docVersion,
          fullResolution, bitmapOf, maskOf, gpu, bypassAdjustments, selectionTransformBox,
          videoFrameOf, stageCache: null, paintNodes: entry.nodes,
          isolatedContainers: isolated, opacityPlan,
        });
        if (entry.container.clipTo) applyContainerMask(target, entry.container, {
          doc, isolatedContainers: isolated, opacityPlan, frameClips: clips,
          bitmapOf, maskOf, gpu, bypassAdjustments, docVersion,
        });
      }, doc);
      continue;
    }
    const node = containerPaintNode(entry.node, isolatedContainers);
    const i = opacityPlan.positionOf(entry.node);
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
    // Free-canvas root frames own their paint just like nested frames.
    // Fixed-page artboard containers are represented by their child document.
    const paintedFrame = Boolean(node.isFrame && (node.parentId || doc.isCanvasRoot));
    if (
      (isGroupNode(node) && !paintedFrame) ||
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
        opacityPlan, allowedNodeIds, paintScopeKey,
        hiddenNodeId,
        frameClips: clips,
        paintNodes,
        isolatedContainers,
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
      while (position + 1 < entries.length && entries[position + 1].node?.clipTo === node.clipTo) {
        position += 1;
      }
      continue;
    }
    if (node.kind === NODE_KIND.ADJUSTMENT) {
      if (bypassAdjustments || !node.adjustments || node.visible === false)
        continue;
      if (isolatedContainers.size) {
        try {
          drawIsolatedAdjustment(ctx, node, doc, clips.framesOf(node), maskOf);
          clearAdjustmentLayerFailure(doc, node.id);
        }
        catch (error) { reportAdjustmentLayerFailure(doc, node.id, error); }
        continue;
      }
      withFrameClips(ctx, clips.framesOf(node), () => drawAdjustmentLayer(ctx, doc, node, i, {
        hiddenNodeId,
        frameClips: clips,
        paintNodes,
        isolatedContainers,
        docVersion,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        fullResolution,
        bitmapOf,
        maskOf,
        bypassAdjustments,
      }));
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
      withFrameClips(target, clips.framesOf(node), () =>
        drawNode(target, node, bitmapOf, maskOf, gpu, bypassAdjustments, renderState));
    // A parent's clip can change without replacing the child object. Its
    // cached bitmap key must not retain pixels from a different ancestor.
    if (clips.framesOf(node).length || !stageCache?.paint(ctx, node, paintNode)) paintNode(ctx);
  }
}
