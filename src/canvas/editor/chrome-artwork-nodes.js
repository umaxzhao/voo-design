import { NODE_KIND, isGroupNode, isHiddenByGroup, isInsideBooleanGroup } from "./scene_model.js";
import { isBoxOffscreen, nodeVisualAABB } from "./viewport_culling.js";
import { drawNode } from "./render_nodes.js";
import { drawAdjustmentLayer, drawClippingChain } from "./chrome_layers.js";
import { createFrameClipContext } from "./frame-clip-context.js";
import { withFrameClips } from "./render-frame-clips.js";

/** Flat paint order is authoritative; ancestry contributes clipping, never reordering. */
export function drawArtworkNodes(ctx, { doc, paintNodeIds, hiddenNodeId, visibleSet,
  culledIds, visibleRect, docVersion, fullResolution, bitmapOf, maskOf, gpu,
  bypassAdjustments, selectionTransformBox, videoFrameOf, stageCache }) {
  const canvas = ctx.canvas;
  const clips = createFrameClipContext(doc.nodes);
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
        hiddenNodeId,
        frameClips: clips,
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
      withFrameClips(ctx, clips.framesOf(node), () => drawAdjustmentLayer(ctx, doc, node, i, {
        hiddenNodeId,
        frameClips: clips,
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
