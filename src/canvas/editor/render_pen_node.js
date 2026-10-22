// Vector pen bezier paths, variable-width ribbons, and selection tints.

import { NODE_KIND } from "./scene_model.js";
import {
  STROKE_ALIGN,
  buildStrokeRibbon,
  dashPatternFor,
  effectiveStrokeAlign,
  effectiveStrokeCap,
  normalizeStrokeProps,
} from "./stroke_style.js";
import { resolvePaintStyle } from "./render_basic_shapes.js";
import { arrowheadGeometry } from "./shape_geometry.js";
import { arrowheadSize } from "./render_path_node.js";

/**
 * A pen node's outline as a Path2D in doc space: anchors joined by cubic
 * curves driven by each anchor's in/out handles, a segment with no handles
 * being a straight line. Shared by the fill/stroke pass and by the selection
 * tint, which re-strokes the same outline in green.
 */
// Outlines are rebuilt only when the anchors or the box they are scaled into
// change. Pan and zoom reuse the cached Path2D, which is what a pen node draws.
const outlineCache = new WeakMap();

export function penOutlinePath(node) {
  const points = node.points;
  if (!points || points.length === 0) return new Path2D();
  const signature = `${node.x},${node.y},${node.width},${node.height},${node.baseWidth},${node.baseHeight}`;
  const cached = outlineCache.get(points);
  if (cached && cached.signature === signature) return cached.path;
  const path = buildPenOutline(node);
  outlineCache.set(points, { signature, path });
  return path;
}

function buildPenOutline(node) {
  const points = node.points;

  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const P = (anchor, offset) => ({
    x: node.x + (anchor.x + (offset ? offset[0] : 0)) * scaleX,
    y: node.y + (anchor.y + (offset ? offset[1] : 0)) * scaleY,
  });

  const outline = new Path2D();
  let contourStart = 0;

  while (contourStart < points.length) {
    const firstAnchor = points[contourStart];
    const firstPt = P(firstAnchor);
    outline.moveTo(firstPt.x, firstPt.y);

    if (firstAnchor.close && contourStart === points.length - 1) {
      outline.closePath();
      break;
    }

    let i = contourStart + 1;
    while (i < points.length) {
      const from = points[i - 1];
      const to = points[i];
      if (from.out || to.in) {
        const c1 = P(from, from.out) ?? P(from);
        const c2 = P(to, to.in) ?? P(to);
        const end = P(to);
        outline.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
      } else {
        const end = P(to);
        outline.lineTo(end.x, end.y);
      }

      if (to.close) {
        if (to.out || firstAnchor.in) {
          const c1 = P(to, to.out) ?? P(to);
          const c2 = P(firstAnchor, firstAnchor.in) ?? P(firstAnchor);
          const end = P(firstAnchor);
          outline.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
        }
        outline.closePath();
        i += 1;
        break;
      }
      i += 1;
    }

    contourStart = i;
  }

  return outline;
}

/**
 * Re-strokes a selected pen path's outline in the edit green, so the user can
 * tell the line itself is selected rather than just seeing its bounding box.
 * Called in doc space; the edit-mode overlay already paints the same green,
 * so the caller skips the node being edited.
 */
export function drawPenSelectionTint(ctx, node) {
  if (node.kind !== NODE_KIND.PATH || node.pen !== true) return;
  if (!node.points?.length) return;
  ctx.save();
  ctx.strokeStyle = "#b2ffd6";
  ctx.lineWidth = Math.max(1, node.strokeWidth ?? 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(penOutlinePath(node));
  ctx.restore();
}

function drawPenArrowhead(ctx, node, points, index, direction = 1) {
  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const P = (anchor, offset) => ({
    x: node.x + (anchor.x + (offset ? offset[0] : 0)) * scaleX,
    y: node.y + (anchor.y + (offset ? offset[1] : 0)) * scaleY,
  });

  const tipAnchor = points[index];
  const neighborIndex = index - direction;
  const neighborAnchor = points[neighborIndex];
  const tip = P(tipAnchor);
  const neighbor = P(neighborAnchor);

  let controlPt;
  if (direction === 1) {
    if (tipAnchor.in && (tipAnchor.in[0] !== 0 || tipAnchor.in[1] !== 0)) {
      controlPt = P(tipAnchor, tipAnchor.in);
    } else if (
      neighborAnchor.out &&
      (neighborAnchor.out[0] !== 0 || neighborAnchor.out[1] !== 0)
    ) {
      controlPt = P(neighborAnchor, neighborAnchor.out);
    } else {
      controlPt = neighbor;
    }
  } else {
    if (tipAnchor.out && (tipAnchor.out[0] !== 0 || tipAnchor.out[1] !== 0)) {
      controlPt = P(tipAnchor, tipAnchor.out);
    } else if (
      neighborAnchor.in &&
      (neighborAnchor.in[0] !== 0 || neighborAnchor.in[1] !== 0)
    ) {
      controlPt = P(neighborAnchor, neighborAnchor.in);
    } else {
      controlPt = neighbor;
    }
  }

  const dx = tip.x - controlPt.x;
  const dy = tip.y - controlPt.y;
  const angle =
    Math.hypot(dx, dy) > 1e-6
      ? Math.atan2(dy, dx)
      : Math.atan2(tip.y - neighbor.y, tip.x - neighbor.x);
  const geometry = arrowheadGeometry(
    tip,
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
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(barb1.x, barb1.y);
    ctx.moveTo(tip.x, tip.y);
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

/**
 * Draws a pen (bezier) path: anchors joined by cubic curves driven by each
 * anchor's in/out handles. A segment with no handles is a straight line, and
 * a path whose final anchor carries `close` closes the outline and fills it.
 *
 * Cap, join, dash, miter limit and alignment come from the node's stroke
 * fields (normalised by stroke_style.js). Inside/outside alignment strokes at
 * twice the width behind a clip — inside clips to the outline, outside to its
 * evenodd inverse — the same trick the Skia painter uses.
 */
export function drawPenNode(ctx, node) {
  const points = node.points;
  if (points.length === 0) return;
  const closed = points[points.length - 1]?.close === true;
  const outline = penOutlinePath(node);

  // Closed outlines fill first, then stroke over the seam.
  const fillAlpha = node.fillOpacity ?? 1;
  const strokeAlpha = node.strokeOpacity ?? 1;
  const fill =
    node.fill && node.fill !== "transparent" && fillAlpha > 0
      ? node.fill
      : null;
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
    ctx.fill(outline, node.fillRule ?? "evenodd");
  }
  if (strokeAlpha > 0 && node.strokeWidth) {
    const style = normalizeStrokeProps(node);
    // A variable-width profile strokes as a triangulated ribbon (canvas2d has
    // no variable-width stroke); cap/join/dash/align do not apply to it, the
    // same restriction Figma imposes.
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
      if (node.arrow && points.length >= 2) {
        drawPenArrowhead(ctx, node, points, points.length - 1, 1);
        if (node.arrowStart) drawPenArrowhead(ctx, node, points, 0, -1);
      }
      return;
    }
    const align = effectiveStrokeAlign(style.align, closed);
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
    ctx.setLineDash(dashPatternFor(style.dash, node.strokeWidth));
    if (align === STROKE_ALIGN.INSIDE) {
      ctx.clip(outline);
    } else if (align === STROKE_ALIGN.OUTSIDE) {
      const clipPath = new Path2D();
      clipPath.rect(-1e7, -1e7, 2e7, 2e7);
      clipPath.addPath(outline);
      ctx.clip(clipPath, "evenodd");
    }
    ctx.stroke(outline);
    ctx.restore();

    if (node.arrow && points.length >= 2) {
      drawPenArrowhead(ctx, node, points, points.length - 1, 1);
      if (node.arrowStart) drawPenArrowhead(ctx, node, points, 0, -1);
    }
  }
}

