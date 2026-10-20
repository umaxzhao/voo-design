// Clipping-mask chains and adjustment-layer backdrop compositing passes.

import {
  DEFAULT_BLEND_MODE,
  NODE_KIND,
  isGroupNode,
  isHiddenByGroup,
  isInsideBooleanGroup,
} from "./scene_model.js";
import { drawNode } from "./render_nodes.js";
import { applyAdjustmentsToCanvas } from "./cpu_adjustments.js";
import { buildToneLut } from "./tone_lut.js";

// One latest result per immutable document prevents the 90ms selection timer
// from rebuilding document-sized effect planes. Weak document keys release a
// discarded undo/redo snapshot without manual lifecycle work.
const adjustmentLayerCache = new WeakMap();
const clippingChainCache = new WeakMap();
// Adjustment failures remain visible to the engine/UI without breaking the
// frame. Weak document keys prevent discarded undo snapshots from leaking.
const adjustmentLayerFailures = new WeakMap();

export function adjustmentLayerFailure(doc, nodeId) {
  return adjustmentLayerFailures.get(doc)?.get(nodeId) ?? null;
}

/**
 * Paints one clipping-mask chain (Photoshop's Alt+⌘G).
 *
 * `startIndex` is the first node whose `clipTo` names `baseId`. Every
 * consecutive node pointing at the same base is drawn into an offscreen
 * canvas at document size — each with its own opacity and blend mode, so
 * the chain composites like a stack — and that canvas is then clipped to
 * the base layer's shape (`destination-in` keeps only the pixels inside
 * it) and stamped back onto the page. The base layer itself was already
 * painted by the main loop before the chain started.
 */
export function drawClippingChain(
  ctx,
  doc,
  startIndex,
  baseId,
  {
    hiddenNodeId,
    docVersion,
    canvasWidth,
    canvasHeight,
    fullResolution,
    bitmapOf,
    maskOf,
    gpu,
    bypassAdjustments,
  },
) {
  const base = doc.nodes.find((candidate) => candidate.id === baseId);
  if (!base || base.visible === false) return;

  const chain = [];
  for (let j = startIndex; j < doc.nodes.length; j += 1) {
    const member = doc.nodes[j];
    if (member.clipTo !== baseId) break;
    if (member.id === hiddenNodeId || member.visible === false) continue;
    if (
      isGroupNode(member) ||
      isHiddenByGroup(doc, member) ||
      isInsideBooleanGroup(doc, member)
    )
      continue;
    chain.push(member);
  }
  if (chain.length === 0) return;

  const cacheKey = `${docVersion}|${startIndex}|${baseId}|${doc.width}x${doc.height}|${canvasWidth}x${canvasHeight}|${fullResolution ? 1 : 0}`;
  let chains = clippingChainCache.get(doc);
  const cached = chains?.get(cacheKey);
  if (cached) {
    ctx.drawImage(cached, 0, 0);
    return;
  }

  // The chain paints into its own canvas so the base's alpha can clip it
  // without touching what is already on the page.
  const offCanvas = document.createElement("canvas");
  offCanvas.width = doc.width;
  offCanvas.height = doc.height;
  const offCtx = offCanvas.getContext("2d");
  if (!offCtx) return;
  for (let memberIndex = 0; memberIndex < chain.length; memberIndex += 1) {
    const member = chain[memberIndex];
    if (member.kind === NODE_KIND.ADJUSTMENT) {
      if (member.adjustments)
        applyAdjustmentsToCanvas(offCanvas, member.adjustments);
      continue;
    }
    drawNode(offCtx, member, bitmapOf, maskOf, gpu, bypassAdjustments, {
      docVersion,
      backdropGeneration: `${docVersion}:${startIndex + memberIndex}`,
      outputKey: `${offCanvas.width}x${offCanvas.height}|clip`,
    });
  }

  // The base's painted shape (its alpha) becomes the chain's mask: render
  // it alone, then clip the chain canvas to it (destination-in on the
  // offscreen canvas only, so the page underneath stays untouched).
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = doc.width;
  maskCanvas.height = doc.height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return;
  if (base.kind === NODE_KIND.ADJUSTMENT) {
    if (base.adjustments)
      applyAdjustmentsToCanvas(maskCanvas, base.adjustments);
  } else {
    drawNode(maskCtx, base, bitmapOf, maskOf, gpu, bypassAdjustments, {
      docVersion,
      backdropGeneration: `${docVersion}:mask`,
      outputKey: `${maskCanvas.width}x${maskCanvas.height}|mask`,
    });
  }
  offCtx.save();
  offCtx.globalCompositeOperation = "destination-in";
  offCtx.drawImage(maskCanvas, 0, 0);
  offCtx.restore();

  // Stamp the clipped chain back onto the page as one layer.
  ctx.save();
  ctx.drawImage(offCanvas, 0, 0);
  ctx.restore();
  if (!chains) {
    chains = new Map();
    clippingChainCache.set(doc, chains);
  }
  chains.clear();
  chains.set(cacheKey, offCanvas);
}

/**
 * Filters everything rendered on canvas beneath this adjustment layer.
 */
export function drawAdjustmentLayer(
  ctx,
  doc,
  node,
  nodeIndex,
  {
    hiddenNodeId,
    docVersion,
    canvasWidth,
    canvasHeight,
    fullResolution,
    bitmapOf,
    maskOf,
    bypassAdjustments,
  },
) {
  try {
    adjustmentLayerFailures.get(doc)?.delete(node.id);
    const signature = buildToneLut(node.adjustments).signature;
    const cacheKey = `${docVersion}|${nodeIndex}|${doc.width}x${doc.height}|${canvasWidth}x${canvasHeight}|${fullResolution ? 1 : 0}|${signature}|${node.maskId ?? ""}`;
    let layers = adjustmentLayerCache.get(doc);
    const cached = layers?.get(cacheKey);
    if (cached) {
      ctx.save();
      ctx.globalAlpha = typeof node.opacity === "number" ? node.opacity : 1;
      ctx.globalCompositeOperation = node.blendMode ?? DEFAULT_BLEND_MODE;
      ctx.drawImage(cached, 0, 0, doc.width, doc.height);
      ctx.restore();
      return;
    }
    const offCanvas = document.createElement("canvas");
    offCanvas.width = doc.width;
    offCanvas.height = doc.height;
    const offCtx = offCanvas.getContext("2d");
    if (offCtx) {
      // Render the doc backdrop into the offscreen canvas (preserve transparency when unset/transparent)
      if (doc.backgroundColor && doc.backgroundColor !== "transparent") {
        offCtx.fillStyle = doc.backgroundColor;
        offCtx.fillRect(0, 0, doc.width, doc.height);
      }
      // Render all nodes below this adjustment layer
      const nodeIdx = doc.nodes.indexOf(node);
      for (let i = 0; i < nodeIdx; i++) {
        const prev = doc.nodes[i];
        if (
          prev.id === hiddenNodeId ||
          isGroupNode(prev) ||
          isHiddenByGroup(doc, prev) ||
          isInsideBooleanGroup(doc, prev) ||
          prev.visible === false
        )
          continue;
        if (prev.kind === NODE_KIND.ADJUSTMENT) {
          if (prev.adjustments)
            applyAdjustmentsToCanvas(offCanvas, prev.adjustments);
          continue;
        }
        drawNode(offCtx, prev, bitmapOf, maskOf, null, bypassAdjustments, {
          docVersion,
          backdropGeneration: `${docVersion}:${i}`,
          outputKey: `${offCanvas.width}x${offCanvas.height}|adjustment`,
        });
      }
      applyAdjustmentsToCanvas(offCanvas, node.adjustments);
      // A selection-scoped adjustment layer carries a doc-space matte:
      // keep the adjusted backdrop only where the mask is visible, so
      // everything outside the selection shows the page as it was.
      const adjustmentMask = node.maskId ? maskOf?.(node) : null;
      if (adjustmentMask) {
        offCtx.save();
        offCtx.globalCompositeOperation = "destination-in";
        offCtx.drawImage(
          adjustmentMask,
          0,
          0,
          offCanvas.width,
          offCanvas.height,
        );
        offCtx.restore();
      }
      ctx.save();
      ctx.globalAlpha = typeof node.opacity === "number" ? node.opacity : 1;
      ctx.globalCompositeOperation = node.blendMode ?? DEFAULT_BLEND_MODE;
      ctx.drawImage(offCanvas, 0, 0, doc.width, doc.height);
      ctx.restore();
      if (!layers) {
        layers = new Map();
        adjustmentLayerCache.set(doc, layers);
      }
      layers.clear();
      layers.set(cacheKey, offCanvas);
    }
  } catch (err) {
    let failures = adjustmentLayerFailures.get(doc);
    if (!failures) {
      failures = new Map();
      adjustmentLayerFailures.set(doc, failures);
    }
    if (!failures.has(node.id)) {
      console.warn("Adjustment layer render failed", err);
    }
    failures.set(node.id, err instanceof Error ? err.message : String(err));
  }
}
