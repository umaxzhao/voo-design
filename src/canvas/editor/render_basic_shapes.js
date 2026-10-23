// Paint style resolution (solid/gradient/image) and basic shape (rect, ellipse) rendering.

import { isCssGradient, parseGradient } from "../color_picker/gradient_fill.js";
import { colourWithAlpha } from "./soft_brush.js";
import {
  STROKE_ALIGN,
  STROKE_JOIN,
  dashPatternFor,
  effectiveStrokeAlign,
  effectiveStrokeCap,
  normalizeStrokeProps,
} from "./stroke_style.js";
import { resolveCornerRadii } from "./scene_model_core.js";

/**
 * A fill or stroke value as something Canvas2D can paint with.
 *
 * A plain colour passes straight through. A CSS gradient string — what the
 * colour picker writes into `fill` — becomes a CanvasGradient, parsed by the
 * same `parseGradient` the picker itself uses. Sharing that parser is the
 * point: a second one drifts, and a gradient that reads one way in the picker
 * and another on the canvas is the kind of bug nobody can see until they
 * compare the two side by side.
 *
 * The result is cached per (value, box), because this sits in the per-frame
 * draw path: without it every shape re-parses its gradient string on every
 * frame, at every zoom step and during every drag.
 */
const paintStyleCache = new Map();
const PAINT_STYLE_CACHE_MAX = 256;

function gradientStopColour(stop) {
  const alpha = Math.max(0, Math.min(100, stop.opacity ?? 100)) / 100;
  if (alpha >= 1) return stop.color;
  return colourWithAlpha(stop.color, alpha);
}

function buildCanvasGradient(ctx, parsed, x, y, width, height) {
  const { geometry } = parsed;
  const centreX = x + ((geometry?.centerX ?? 50) / 100) * width;
  const centreY = y + ((geometry?.centerY ?? 50) / 100) * height;

  let gradient;
  if (parsed.type === "linear") {
    // A gradient edited on the canvas carries its direction line (start/end
    // points as percentages of the box); honour it over the stored angle —
    // that is what the endpoint drags write, and the Skia path reads the same
    // fields. Plain angle gradients (no line metadata) keep the old math.
    if (
      geometry?.startX !== undefined &&
      geometry?.startY !== undefined &&
      geometry?.endX !== undefined &&
      geometry?.endY !== undefined
    ) {
      gradient = ctx.createLinearGradient(
        x + (geometry.startX / 100) * width,
        y + (geometry.startY / 100) * height,
        x + (geometry.endX / 100) * width,
        y + (geometry.endY / 100) * height,
      );
    } else {
      // CSS measures the angle clockwise from "up"; the canvas measures from
      // the positive x axis, hence the quarter turn.
      const radians = ((parseFloat(parsed.angle) || 0) - 90) * (Math.PI / 180);
      const reach = Math.hypot(width, height) / 2;
      gradient = ctx.createLinearGradient(
        centreX - Math.cos(radians) * reach,
        centreY - Math.sin(radians) * reach,
        centreX + Math.cos(radians) * reach,
        centreY + Math.sin(radians) * reach,
      );
    }
  } else if (
    parsed.type === "angular" &&
    typeof ctx.createConicGradient === "function"
  ) {
    const radians = (parseFloat(parsed.angle) || 0) * (Math.PI / 180);
    gradient = ctx.createConicGradient(radians, centreX, centreY);
  } else {
    // Radial, and diamond — which Canvas2D has no shader for, so it takes the
    // radial ramp rather than painting nothing.
    const radius = Math.max(
      1,
      Math.max(
        ((geometry?.width ?? 100) / 100) * width,
        ((geometry?.height ?? 100) / 100) * height,
      ) / 2,
    );
    gradient = ctx.createRadialGradient(
      centreX,
      centreY,
      0,
      centreX,
      centreY,
      radius,
    );
  }

  for (const stop of parsed.stops ?? []) {
    const position = Math.max(0, Math.min(1, (stop.position ?? 0) / 100));
    gradient.addColorStop(position, gradientStopColour(stop));
  }
  return gradient;
}

/**
 * Whether a paint string names a picture (a URL) rather than a colour or
 * gradient the canvas can fill with. Image fills on shapes are not drawn by
 * the 2D renderer, and handing a URL to `fillStyle` is a silent no-op that
 * leaves the *previous* fillStyle active — so the renderer must treat them
 * as the absence of a fill, never as a colour.
 */
export function isImagePaint(style) {
  return (
    typeof style === "string" &&
    /^(?:blob:|data:image\/|https?:|file:)/i.test(style)
  );
}

export function resolvePaintStyle(ctx, style, x, y, width, height, alpha = 1) {
  if (typeof style === "object" && style !== null) return style;
  if (typeof style !== "string" || !style || style === "transparent") {
    return "transparent";
  }
  if (!isCssGradient(style)) {
    if (isImagePaint(style)) return "transparent";
    return alpha >= 1 ? style : colourWithAlpha(style, alpha);
  }

  const key = `${style}|${x}|${y}|${width}|${height}|${alpha}`;
  const cached = paintStyleCache.get(key);
  if (cached) {
    // Keep the entry hot: re-inserting moves it to the end of the eviction
    // order, so the shapes actually on screen are the ones that survive.
    paintStyleCache.delete(key);
    paintStyleCache.set(key, cached);
    return cached;
  }

  let resolved;
  try {
    const parsed = parseGradient(style);
    if (alpha < 1 && parsed.stops) {
      parsed.stops = parsed.stops.map((stop) => ({
        ...stop,
        opacity: (stop.opacity ?? 100) * alpha,
      }));
    }
    resolved = buildCanvasGradient(ctx, parsed, x, y, width, height);
  } catch {
    // A gradient string this build cannot read paints as nothing rather than
    // throwing out of the draw loop and taking the whole frame with it.
    return "transparent";
  }

  if (paintStyleCache.size >= PAINT_STYLE_CACHE_MAX) {
    paintStyleCache.delete(paintStyleCache.keys().next().value);
  }
  paintStyleCache.set(key, resolved);
  return resolved;
}

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
