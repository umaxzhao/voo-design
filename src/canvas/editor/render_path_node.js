// Freehand path and soft-brush stroke rendering with arrowhead adornments.

import { drawSoftPathNode } from "./soft_brush.js";
import {
  getRenderCache,
  renderSignature,
  setRenderCache,
} from "./render_cache.js";
import { arrowheadGeometry } from "./shape_geometry.js";
import { resolvePaintStyle } from "./render_basic_shapes.js";
import {
  STROKE_ALIGN,
  buildStrokeRibbon,
  dashPatternFor,
  effectiveStrokeAlign,
  effectiveStrokeCap,
  normalizeStrokeProps,
} from "./stroke_style.js";

/**
 * Arrowhead barb length: an explicit `arrowSize` wins; otherwise 2.5 widths,
 * floored at 8 doc px so even a hairline arrow still reads as an arrow.
 */
export function arrowheadSize(strokeWidth, arrowSize) {
  if (Number.isFinite(arrowSize) && arrowSize > 0) return arrowSize;
  return Math.max(8, strokeWidth * 2.5);
}

/**
 * The two barb end points of an arrowhead: `tip` is where the head points and
 * `angle` the direction of travel (the last segment's). Each barb leaves the
 * tip at ±25° off the reverse direction — the open "lines" head of
 * `arrowheadGeometry`, kept as its own export for existing callers.
 */
export function arrowheadPoints(tip, angle, size) {
  return arrowheadGeometry(tip, angle, size).barbs;
}

/**
 * One arrowhead at a stroke's end point. `index` is which point the head sits
 * on (last for the end, first for a double-headed arrow) and `direction` the
 * segment step towards the body. The shape comes from `node.arrowCap`: the
 * default open barbs stroke with the node's own style and round caps so the
 * head reads as part of the shaft; the closed shapes (triangle, circle,
 * diamond) fill with the stroke colour, the way Figma's filled caps do.
 */
function drawArrowhead(ctx, node, at, index, direction = 1) {
  const [tipX, tipY] = at(index);
  const [prevX, prevY] = at(index - direction);
  const angle = Math.atan2(tipY - prevY, tipX - prevX);
  const geometry = arrowheadGeometry(
    { x: tipX, y: tipY },
    angle,
    arrowheadSize(node.strokeWidth, node.arrowSize),
    node.arrowCap,
  );
  if (geometry.kind === "lines") {
    const [barb1, barb2] = geometry.barbs;
    ctx.strokeStyle = node.stroke;
    ctx.lineWidth = node.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(barb1.x, barb1.y);
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(barb2.x, barb2.y);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = node.stroke;
  ctx.beginPath();
  if (geometry.kind === "circle") {
    ctx.arc(
      geometry.center.x,
      geometry.center.y,
      geometry.radius,
      0,
      Math.PI * 2,
    );
  } else {
    ctx.moveTo(geometry.points[0].x, geometry.points[0].y);
    for (const point of geometry.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
  }
  ctx.fill();
}

function drawCachedSoftPathNode(ctx, node, at, scaleX, scaleY, renderState) {
  const transform = ctx.getTransform?.();
  if (!renderState || !transform || typeof document === "undefined") {
    drawSoftPathNode(ctx, node, at, scaleX, scaleY);
    return;
  }
  const pad = Math.max((node.strokeWidth ?? 1) * Math.max(scaleX, scaleY), 32);
  let minX = node.x ?? 0;
  let minY = node.y ?? 0;
  let maxX = (node.x ?? 0) + (node.width ?? 0);
  let maxY = (node.y ?? 0) + (node.height ?? 0);
  if (node.points?.length) {
    for (let i = 0; i < node.points.length; i += 1) {
      const [px, py] = at(i);
      if (i === 0 && !node.width && !node.height) {
        minX = px;
        maxX = px;
        minY = py;
        maxY = py;
      } else {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }
  }
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ].map((point) => transform.transformPoint(point));
  const left = Math.min(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const right = Math.max(...corners.map((point) => point.x));
  const bottom = Math.max(...corners.map((point) => point.y));
  const x = Math.floor(left);
  const y = Math.floor(top);
  const width = Math.max(1, Math.ceil(right) - x);
  const height = Math.max(1, Math.ceil(bottom) - y);
  const key = `${renderState.docVersion}|${node.id ?? "path"}|${renderSignature(node)}|${width}x${height}|${transform.a},${transform.b},${transform.c},${transform.d}|${left - x},${top - y}|${renderState.outputKey}`;
  let cached = getRenderCache("softPath", key);
  if (!cached) {
    cached = document.createElement("canvas");
    cached.width = width;
    cached.height = height;
    const cachedCtx = cached.getContext("2d");
    if (!cachedCtx) {
      drawSoftPathNode(ctx, node, at, scaleX, scaleY);
      return;
    }
    // x/y are output-pixel bounds. Subtract them from the matrix translation
    // directly so zoom and rotation do not transform the cache-local offset.
    cachedCtx.setTransform(
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      transform.e - x,
      transform.f - y,
    );
    drawSoftPathNode(cachedCtx, node, at, scaleX, scaleY);
    setRenderCache("softPath", key, cached);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(cached, x, y);
  ctx.restore();
}

/**
 * Draws a sampled stroke as a smooth curve.
 *
 * Consecutive sample midpoints become quadratic control points, which removes
 * the polyline faceting a raw `lineTo` chain shows at high zoom.
 *
 * Exported for the renderer unit tests; drawNode is the real caller.
 */
export function drawPathNode(ctx, node, renderState = null) {
  const points = node.points;
  if (points.length === 0) return;

  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const at = (index) => [
    node.x + points[index][0] * scaleX,
    node.y + points[index][1] * scaleY,
    points[index][2] ?? 0.5,
  ];

  const hasPressure = points.some(
    (pt) => typeof pt[2] === "number" && pt[2] !== 0.5,
  );
  if (node.poly) {
    // A polygon/star: straight segments through every vertex, closed. No
    // midpoint smoothing — the corners are the shape. Fill first when set,
    // then the stroke on top (the shape tools draw fill-only, width 0).
    const fillAlpha = node.fillOpacity ?? 1;
    const strokeAlpha = node.strokeOpacity ?? 1;
    const fill =
      node.fill && node.fill !== "transparent" && fillAlpha > 0
        ? node.fill
        : null;

    ctx.beginPath();
    const [startX, startY] = at(0);
    ctx.moveTo(startX, startY);
    for (let index = 1; index < points.length; index += 1) {
      const [x, y] = at(index);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = resolvePaintStyle(
        ctx,
        fill,
        node.x,
        node.y,
        node.width,
        node.height,
        fillAlpha,
      );
      ctx.fill();
    }
    if (node.strokeWidth > 0 && node.stroke && strokeAlpha > 0) {
      const style = normalizeStrokeProps(node);
      const align = effectiveStrokeAlign(style.align, true);
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
      ctx.lineWidth =
        align === STROKE_ALIGN.CENTER ? node.strokeWidth : node.strokeWidth * 2;
      ctx.lineCap = effectiveStrokeCap(style.cap, style.dash);
      ctx.lineJoin = style.join;
      ctx.miterLimit = style.miterLimit;
      if (typeof ctx.setLineDash === "function") {
        ctx.setLineDash(dashPatternFor(style.dash, node.strokeWidth));
      }

      if (align === STROKE_ALIGN.CENTER) {
        ctx.stroke();
      } else if (typeof Path2D !== "undefined") {
        const outline = new Path2D();
        outline.moveTo(startX, startY);
        for (let index = 1; index < points.length; index += 1) {
          const [x, y] = at(index);
          outline.lineTo(x, y);
        }
        outline.closePath();
        if (align === STROKE_ALIGN.INSIDE) {
          ctx.clip(outline);
        } else if (align === STROKE_ALIGN.OUTSIDE) {
          const clipPath = new Path2D();
          clipPath.rect(-1e7, -1e7, 2e7, 2e7);
          clipPath.addPath(outline);
          ctx.clip(clipPath, "evenodd");
        }
        ctx.stroke(outline);
      } else {
        ctx.stroke();
      }
      ctx.restore();
    }
  } else if ((node.hardness ?? 1) < 1 || hasPressure) {
    // Soft brush (or hard brush with pressure): stamps instead of a stroked
    // curve. Missing hardness predates the field and means fully hard, the
    // stroked path below — kept byte-identical.
    drawCachedSoftPathNode(ctx, node, at, scaleX, scaleY, renderState);
  } else if (points.length === 1) {
    // A tap still deserves a dot.
    const [x, y] = at(0);
    ctx.beginPath();
    ctx.arc(x, y, node.strokeWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = node.stroke;
    ctx.fill();
  } else {
    const strokeAlpha = node.strokeOpacity ?? 1;
    if (node.strokeWidth > 0 && node.stroke && strokeAlpha > 0) {
      const style = normalizeStrokeProps(node);
      const ribbon = buildStrokeRibbon(node, style.profile);
      if (ribbon) {
        ctx.fillStyle = resolvePaintStyle(
          ctx,
          node.stroke,
          node.x,
          node.y,
          node.width,
          node.height,
          strokeAlpha,
        );
        ctx.beginPath();
        ctx.moveTo(ribbon[0][0], ribbon[0][1]);
        for (let i = 1; i < ribbon.length; i += 1)
          ctx.lineTo(ribbon[i][0], ribbon[i][1]);
        ctx.closePath();
        ctx.fill();
      } else {
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
        if (typeof ctx.setLineDash === "function") {
          ctx.setLineDash(dashPatternFor(style.dash, node.strokeWidth));
        }
        ctx.beginPath();
        const [startX, startY] = at(0);
        ctx.moveTo(startX, startY);
        for (let index = 1; index < points.length - 1; index += 1) {
          const [x, y] = at(index);
          const [nextX, nextY] = at(index + 1);
          ctx.quadraticCurveTo(x, y, (x + nextX) / 2, (y + nextY) / 2);
        }
        const [lastX, lastY] = at(points.length - 1);
        ctx.lineTo(lastX, lastY);
        ctx.stroke();
      }
    }
  }

  // The arrowhead rides whatever body the stroke got, always as the plain
  // solid stroke — a soft brush's feathered barbs read as a smudge.
  if (node.arrow && points.length >= 2) {
    drawArrowhead(ctx, node, at, points.length - 1);
    if (node.arrowStart) drawArrowhead(ctx, node, at, 0, -1);
  }
}
