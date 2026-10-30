import { resolvePaintStyle } from "./render-paint-style.js";
export { isImagePaint, resolvePaintStyle } from "./render-paint-style.js";
import { ellipseArcPath, hasEllipseArc } from "./ellipse_arc.js";
// Paint style resolution (solid/gradient/image) and basic shape (rect, ellipse) rendering.

import {
  STROKE_ALIGN,
  STROKE_JOIN,
  dashPatternFor,
  effectiveStrokeAlign,
  effectiveStrokeCap,
  normalizeStrokeProps,
} from "./stroke_style.js";
import { resolveCornerRadii } from "./scene_model_core.js";


export function roundRectPath(ctx, x, y, w, h, r) {
  const radii = resolveCornerRadii(r, w, h);
  if (radii.tl <= 0 && radii.tr <= 0 && radii.br <= 0 && radii.bl <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(
      x,
      y,
      w,
      h,
      radii.isUniform ? radii.uniformRadius : radii.asArray,
    );
    return;
  }
  if (radii.isUniform) {
    const rad = radii.uniformRadius;
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
    return;
  }
  const { tl, tr, br, bl } = radii;
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr > 0) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  if (br > 0) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  if (bl > 0) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

export function strokeRoundRect(ctx, x, y, w, h, r) {
  const radii = resolveCornerRadii(r, w, h);
  if (radii.tl <= 0 && radii.tr <= 0 && radii.br <= 0 && radii.bl <= 0) {
    ctx.strokeRect(x, y, w, h);
    return;
  }
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, radii);
  ctx.stroke();
}

export function fillRoundRect(ctx, x, y, w, h, r) {
  const radii = resolveCornerRadii(r, w, h);
  if (radii.tl <= 0 && radii.tr <= 0 && radii.br <= 0 && radii.bl <= 0) {
    ctx.fillRect(x, y, w, h);
    return;
  }
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, radii);
  ctx.fill();
}

/**
 * An ellipse inscribed in the node's box.
 *
 * Same paint convention as the rect: an optional fill, then the stroke inset
 * by half its width so it sits inside the box instead of straddling it.
 * Exported for the renderer unit tests; drawNode is the real caller.
 */
export function drawEllipseNode(ctx, node) {
  if (hasEllipseArc(node)) {
    const path = new Path2D(ellipseArcPath(node));
    ctx.save();
    ctx.translate(node.x, node.y);
    if (node.fill && node.fill !== "transparent") {
      ctx.fillStyle = resolvePaintStyle(ctx, node.fill, 0, 0, node.width, node.height, node.fillOpacity ?? 1);
      ctx.fill(path, "evenodd");
    }
    if (node.stroke && node.strokeWidth) {
      ctx.strokeStyle = resolvePaintStyle(ctx, node.stroke, 0, 0, node.width, node.height, node.strokeOpacity ?? 1);
      ctx.lineWidth = node.strokeWidth;
      ctx.setLineDash(dashPatternFor(normalizeStrokeProps(node).dash, node.strokeWidth));
      ctx.stroke(path);
    }
    ctx.restore();
    return;
  }
  const centreX = node.x + node.width / 2;
  const centreY = node.y + node.height / 2;
  const fillAlpha = node.fillOpacity ?? 1;
  const strokeAlpha = node.strokeOpacity ?? 1;
  if (node.fill && node.fill !== "transparent" && fillAlpha > 0) {
    ctx.fillStyle = resolvePaintStyle(
      ctx,
      node.fill,
      node.x,
      node.y,
      node.width,
      node.height,
      fillAlpha,
    );
    ctx.beginPath();
    ctx.ellipse(
      centreX,
      centreY,
      node.width / 2,
      node.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  if (!node.strokeWidth || strokeAlpha <= 0 || !node.stroke) return;
  const style = normalizeStrokeProps(node);
  const strokeAlign = node?.strokeAlign ?? STROKE_ALIGN.INSIDE;
  const align = effectiveStrokeAlign(strokeAlign, true);
  ctx.save();
  ctx.strokeStyle = resolvePaintStyle(
    ctx,
    node.stroke,
    node.x,
    node.y,
    node.width,
    node.height,
    strokeAlpha,
  );
  ctx.lineWidth = node.strokeWidth;
  ctx.lineCap = effectiveStrokeCap(style.cap, style.dash);
  ctx.lineJoin = style.join;
  ctx.miterLimit = style.miterLimit;
  ctx.setLineDash(dashPatternFor(style.dash, node.strokeWidth));

  let rx = node.width / 2;
  let ry = node.height / 2;
  if (align === STROKE_ALIGN.INSIDE) {
    rx = Math.max(0, node.width - node.strokeWidth) / 2;
    ry = Math.max(0, node.height - node.strokeWidth) / 2;
  } else if (align === STROKE_ALIGN.OUTSIDE) {
    rx = (node.width + node.strokeWidth) / 2;
    ry = (node.height + node.strokeWidth) / 2;
  }
  ctx.beginPath();
  ctx.ellipse(
    centreX,
    centreY,
    rx,
    ry,
    0,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  ctx.restore();
}

/**
 * Clip to the enabled stroke sides. A subset of sides strokes the same rounded
 * rectangle through side bands, so joins/corners stay consistent; an undefined
 * or all-true mask draws the normal full outline.
 */
export function clipStrokeSides(ctx, node, sx, sy, sw, sh) {
  const sides = node?.strokeSides;
  if (!sides || (sides.top !== false && sides.right !== false && sides.bottom !== false && sides.left !== false)) {
    return false;
  }
  const line = Math.max(1, node.strokeWidth ?? 1);
  const reach = line * 2;
  const x = sx - reach;
  const y = sy - reach;
  const w = sw + reach * 2;
  const h = sh + reach * 2;
  ctx.beginPath();
  if (sides.top !== false) ctx.rect(x, y, w, reach * 2);
  if (sides.right !== false) ctx.rect(x + w - reach * 2, y, reach * 2, h);
  if (sides.bottom !== false) ctx.rect(x, y + h - reach * 2, w, reach * 2);
  if (sides.left !== false) ctx.rect(x, y, reach * 2, h);
  ctx.clip();
  return true;
}

export function drawRectNode(ctx, node) {
  const radii = resolveCornerRadii(node.cornerRadius, node.width, node.height);
  const fillAlpha = node.fillOpacity ?? 1;
  const strokeAlpha = node.strokeOpacity ?? 1;
  if (node.fill && node.fill !== "transparent" && fillAlpha > 0) {
    ctx.fillStyle = resolvePaintStyle(
      ctx,
      node.fill,
      node.x,
      node.y,
      node.width,
      node.height,
      fillAlpha,
    );
    fillRoundRect(ctx, node.x, node.y, node.width, node.height, radii);
  }
  if (!node.strokeWidth || strokeAlpha <= 0 || !node.stroke) return;
  const style = normalizeStrokeProps(node);
  const strokeAlign = node?.strokeAlign ?? STROKE_ALIGN.INSIDE;
  const strokeJoin = node?.strokeJoin ?? STROKE_JOIN.MITER;
  const align = effectiveStrokeAlign(strokeAlign, true);
  ctx.save();
  ctx.strokeStyle = resolvePaintStyle(
    ctx,
    node.stroke,
    node.x,
    node.y,
    node.width,
    node.height,
    strokeAlpha,
  );
  ctx.lineWidth = node.strokeWidth;
  ctx.lineCap = effectiveStrokeCap(style.cap, style.dash);
  ctx.lineJoin = strokeJoin;
  ctx.miterLimit = style.miterLimit;
  ctx.setLineDash(dashPatternFor(style.dash, node.strokeWidth));

  let sx = node.x;
  let sy = node.y;
  let sw = node.width;
  let sh = node.height;
  let sr = radii.isUniform ? radii.uniformRadius : radii;

  if (align === STROKE_ALIGN.INSIDE) {
    const half = node.strokeWidth / 2;
    sx += half;
    sy += half;
    sw = Math.max(0, node.width - node.strokeWidth);
    sh = Math.max(0, node.height - node.strokeWidth);
    sr = radii.isUniform
      ? Math.max(0, radii.uniformRadius - half)
      : {
          tl: Math.max(0, radii.tl - half),
          tr: Math.max(0, radii.tr - half),
          br: Math.max(0, radii.br - half),
          bl: Math.max(0, radii.bl - half),
        };
  } else if (align === STROKE_ALIGN.OUTSIDE) {
    const half = node.strokeWidth / 2;
    sx -= half;
    sy -= half;
    sw = node.width + node.strokeWidth;
    sh = node.height + node.strokeWidth;
    sr = radii.isUniform
      ? (radii.uniformRadius > 0 ? radii.uniformRadius + half : 0)
      : {
          tl: radii.tl > 0 ? radii.tl + half : 0,
          tr: radii.tr > 0 ? radii.tr + half : 0,
          br: radii.br > 0 ? radii.br + half : 0,
          bl: radii.bl > 0 ? radii.bl + half : 0,
        };
  }

  clipStrokeSides(ctx, node, sx, sy, sw, sh);
  const hasAnyRadius =
    typeof sr === "number"
      ? sr > 0
      : sr.tl > 0 || sr.tr > 0 || sr.br > 0 || sr.bl > 0;
  if (hasAnyRadius) {
    strokeRoundRect(ctx, sx, sy, sw, sh, sr);
  } else {
    ctx.strokeRect(sx, sy, sw, sh);
  }
  ctx.restore();
}
