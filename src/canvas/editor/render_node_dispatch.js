// Top-level per-node render dispatch, layer effects stack execution, and blend mode orchestration.

import {
  DEFAULT_BLEND_MODE,
  NODE_KIND,
} from "./scene_model.js";
import { isCustomBlendMode } from "./blend_math.js";
import {
  paintShadowBehind,
  drawBevelOverlay,
  drawColorOverlay,
  drawGradientOverlayEffect,
  drawInnerGlowOverlay,
  drawInnerShadowOverlay,
  drawSatinOverlay,
  drawStrokeOverlay,
} from "./node_effects.js";
import { drawImageNode } from "./render_image_node.js";
import { drawRectNode, drawEllipseNode } from "./render_basic_shapes.js";
import { drawPathNode } from "./render_path_node.js";
import { drawPenNode } from "./render_pen_node.js";
import { drawBooleanNode } from "./render_boolean_node.js";
import { drawTextNode } from "./render_text_node.js";
import {
  applyNodeTransform,
  drawCustomBlendNode,
} from "./render_custom_blend.js";

export function drawNode(
  ctx,
  node,
  bitmapOf,
  maskOf,
  gpu,
  bypassAdjustments,
  renderState = null,
) {
  if (!node.visible) return;
  const effects = node.effects;
  const hasShadow = Boolean(effects?.shadow?.enabled);
  const hasGlow = Boolean(effects?.glow?.enabled);
  const hasInnerShadow = Boolean(effects?.innerShadow?.enabled);
  const hasInnerGlow = Boolean(effects?.innerGlow?.enabled);
  const hasSatin = Boolean(effects?.satin?.enabled);
  const hasGradientOverlay = Boolean(effects?.gradientOverlay?.enabled);
  const hasBevel = Boolean(effects?.bevel?.enabled);
  const hasFill = Boolean(effects?.fill?.enabled);
  const hasStroke = Boolean(effects?.stroke?.enabled);

  const paintBody = (targetCtx = ctx) => {
    targetCtx.globalAlpha = node.opacity ?? 1;
    switch (node.kind) {
      case NODE_KIND.IMAGE:
        drawImageNode(
          targetCtx,
          node,
          bitmapOf(node),
          maskOf?.(node),
          gpu,
          bypassAdjustments,
          renderState,
        );
        break;
      case NODE_KIND.VIDEO:
      case NODE_KIND.MODEL_3D: {
        const frame = bitmapOf(node);
        if (frame) targetCtx.drawImage(frame, node.x, node.y, node.width, node.height);
        break;
      }
      case NODE_KIND.RECT:
        drawRectNode(targetCtx, node);
        break;
      case NODE_KIND.ELLIPSE:
        drawEllipseNode(targetCtx, node);
        break;
      case NODE_KIND.PATH:
        if (node.pen === true) drawPenNode(targetCtx, node);
        else drawPathNode(targetCtx, node, renderState);
        break;
      case NODE_KIND.BOOLEAN:
        drawBooleanNode(targetCtx, node, renderState);
        break;
      case NODE_KIND.TEXT:
        drawTextNode(targetCtx, node);
        break;
      default:
        break;
    }
  };

  ctx.save();
  // A PSD-only blend mode (dissolve, linear burn, …) has no canvas GCO
  // equivalent: the node composites per-pixel through blend_math.js. The
  // offscreen pass applies its own transform, so nothing below runs for it.
  if (isCustomBlendMode(node.blendMode)) {
    drawCustomBlendNode(ctx, node, paintBody, renderState);
    ctx.restore();
    return;
  }
  // Blend modes composite against everything already painted — the page
  // backdrop included — and the save/restore pair keeps them per-node.
  ctx.globalCompositeOperation = node.blendMode ?? DEFAULT_BLEND_MODE;
  applyNodeTransform(ctx, node);

  // Shadow and glow paint behind the body, each as its own silhouette pass;
  // the body then paints clean on top with the node's blend mode.
  if (hasShadow && effects.shadow) {
    paintShadowBehind(ctx, node, effects.shadow, paintBody);
  }
  if (hasGlow && effects.glow) {
    paintShadowBehind(ctx, node, effects.glow, paintBody);
  }
  if (hasShadow || hasGlow) {
    ctx.save();
    ctx.globalCompositeOperation = node.blendMode ?? DEFAULT_BLEND_MODE;
    paintBody();
    ctx.restore();
  } else {
    paintBody();
  }

  if (hasInnerShadow && effects.innerShadow) {
    // The inner shadow and inner glow sit under the colour overlay in
    // Photoshop's layer-style stack (bevel, stroke, inner shadow, inner
    // glow, satin, colour overlay, …).
    drawInnerShadowOverlay(ctx, node, effects.innerShadow, paintBody);
  }
  if (hasInnerGlow && effects.innerGlow) {
    drawInnerGlowOverlay(ctx, node, effects.innerGlow, paintBody);
  }
  if (hasSatin && effects.satin) {
    drawSatinOverlay(ctx, node, effects.satin, paintBody);
  }
  if (hasGradientOverlay && effects.gradientOverlay) {
    drawGradientOverlayEffect(ctx, node, effects.gradientOverlay);
  }
  if (hasFill && effects.fill) {
    // Colour overlay re-tints the body through its own alpha, keeping the
    // silhouette; painted after the body, before the bevel rim.
    drawColorOverlay(ctx, node, effects.fill);
  }
  if (hasStroke && effects.stroke) {
    // The stroke rings the silhouette on top of the body; the top of
    // Photoshop's layer-style stack sits the bevel above it, so the bevel
    // draws last.
    drawStrokeOverlay(ctx, node, effects.stroke, paintBody);
  }
  if (hasBevel && effects.bevel) {
    drawBevelOverlay(ctx, node, effects.bevel);
  }
  ctx.restore();
}
