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
import { drawVideoNode } from "./render_video_node.js";
import { isImagePaint, drawRectNode, drawEllipseNode } from "./render_basic_shapes.js";
import { drawPathNode } from "./render_path_node.js";
import { drawPenNode } from "./render_pen_node.js";
import { drawBooleanNode } from "./render_boolean_node.js";
import { drawTextNode } from "./render_text_node.js";
import {
  applyNodeTransform,
  drawCustomBlendNode,
} from "./render_custom_blend.js";
import {
  deviceScaleOf,
  drawBackgroundBlur,
  drawNoiseOverlay,
  drawGlassOverlay,
} from "./render_figma_effects.js";

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

  const paintOne = (targetCtx, node) => {
    if (node.fillHidden) node = { ...node, fillOpacity: 0 };
    const imageFill = isImagePaint(node.fill);
    if (imageFill || (node.imageId && node.kind !== NODE_KIND.IMAGE && node.fill === "transparent")) {
      const bitmap = bitmapOf(imageFill ? { ...node, imageId: undefined, src: node.fill } : node);
      if (!bitmap) return;
      if (node.kind === NODE_KIND.IMAGE) {
        node = { ...node, src: imageFill ? node.fill : node.src };
      } else {
        const pattern = targetCtx.createPattern(bitmap, "no-repeat");
        if (!pattern) return;
        const scale = Math.max(node.width / (bitmap.naturalWidth ?? bitmap.width), node.height / (bitmap.naturalHeight ?? bitmap.height));
        pattern.setTransform(new DOMMatrix().translate(node.x, node.y).scale(scale));
        node = { ...node, fill: pattern, opacity: (node.opacity ?? 1) * (node.fillOpacity ?? 1), fillOpacity: 1 };
      }
    }
    targetCtx.globalAlpha = node.opacity ?? 1;
    switch (node.kind) {
      case NODE_KIND.IMAGE:
        drawImageNode(
          targetCtx,
          node,
          bitmapOf(imageFill ? { ...node, imageId: undefined, src: node.fill } : node),
          maskOf?.(node),
          gpu,
          bypassAdjustments,
          renderState,
        );
        break;
      case NODE_KIND.VIDEO:
        drawVideoNode(targetCtx, node, renderState?.videoFrameOf?.(node));
        break;
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

  const paintBody = (targetCtx = ctx) => {
    const paints = Array.isArray(node.fills) ? node.fills : null;
    if (!paints) {
      targetCtx.save();
      targetCtx.globalCompositeOperation = node.fillBlendMode && node.fillBlendMode !== "source-over"
        ? node.fillBlendMode : targetCtx.globalCompositeOperation;
      paintOne(targetCtx, node);
      targetCtx.restore();
      return;
    }
    for (const paint of paints) {
      if (paint.visible === false) continue;
      targetCtx.save();
      targetCtx.globalCompositeOperation = paint.blendMode ?? "source-over";
      const painted = { ...node, fill: paint.fill, fillOpacity: paint.opacity ?? 1,
        fillHidden: false, strokeHidden: true, imageId: paint.imageId ?? node.imageId };

      paintOne(targetCtx, painted);
      targetCtx.restore();
    }
    if (node.strokeWidth > 0) paintOne(targetCtx, { ...node, fillHidden: true, fillOpacity: 0 });
    // Additional strokes (Figma-style stroke list): the primary stroke above
    // stays the legacy field, extras are painted over it.
    if (Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (!stroke || stroke.visible === false || !(stroke.strokeWidth > 0)) continue;
        paintOne(targetCtx, {
          ...node,
          fillHidden: true,
          fillOpacity: 0,
          stroke: stroke.stroke,
          strokeWidth: stroke.strokeWidth,
          strokeOpacity: stroke.strokeOpacity ?? 1,
          strokeAlign: stroke.strokeAlign ?? node.strokeAlign,
          strokes: null,
        });
      }
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

  // Background blur reads what is already painted under the node, so it runs
  // before the node paints. Layer blur filters everything this node draws.
  const glassBlur = effects?.glass?.enabled ? effects.glass.blur ?? 0 : 0;
  const backdropBlur = Math.max(node.backgroundBlur ?? 0, glassBlur);
  if (backdropBlur > 0) drawBackgroundBlur(ctx, node, backdropBlur);
  if (node.layerBlur > 0) {
    ctx.filter = `blur(${node.layerBlur * deviceScaleOf(ctx)}px)`;
  }

  // Shadow and glow paint behind the body, each as its own silhouette pass;
  // the body then paints clean on top with the node's blend mode.
  // The shadow is part of the layer but sits beneath it, so it composites
  // normally; the layer's blend mode applies to the body alone. Multiplying the
  // silhouette too turned a multiply layer's shadow into a black box.
  if (hasShadow || hasGlow) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    // Under a non-normal blend mode the body multiplies (or screens, …) with
    // whatever lies beneath it, so a shadow under the body would tint the body.
    // Figma shows a drop shadow only outside the shape, so it is knocked out
    // of the box here.
    if (hasShadow && node.blendMode && node.blendMode !== "source-over") {
      const knockout = new Path2D();
      knockout.rect(node.x - 1e6, node.y - 1e6, 2e6, 2e6);
      knockout.rect(node.x, node.y, node.width, node.height);
      ctx.clip(knockout, "evenodd");
    }
    if (hasShadow && effects.shadow) {
      paintShadowBehind(ctx, node, effects.shadow, paintBody);
    }
    if (hasGlow && effects.glow) {
      paintShadowBehind(ctx, node, effects.glow, paintBody);
    }
    ctx.restore();
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
  if (effects?.glass?.enabled) {
    drawGlassOverlay(ctx, node, effects.glass);
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
  if (node.noise?.opacity > 0) {
    drawNoiseOverlay(ctx, node, node.noise);
  }
  ctx.restore();
}
