// Retouching overlays for remove brush, patch draft preview, and gesture paths.

import { NODE_KIND } from "./scene_model.js";
import { drawNode } from "./render_nodes.js";

/**
 * The Remove brush's band, while it is being laid down.
 *
 * Stroked at the brush's real width with round caps, so what is highlighted is
 * exactly the area that will be sent away to be painted back in — the only
 * feedback there is between letting go and the fill arriving.
 */
export function drawRemoveStroke(ctx, stroke, viewport) {
  const points = stroke?.points;
  if (!points?.length) return;
  ctx.save();
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    const screenX = x * viewport.zoom + viewport.panX;
    const screenY = y * viewport.zoom + viewport.panY;
    if (index === 0) ctx.moveTo(screenX, screenY);
    else ctx.lineTo(screenX, screenY);
  });
  if (stroke.closed && points.length > 2) {
    ctx.closePath();
    ctx.fillStyle = "rgba(229, 178, 255, 0.2)";
    ctx.fill();
  }
  ctx.lineWidth = Math.max(1, stroke.size * viewport.zoom);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(stroke.closed ? [4, 4] : []);
  ctx.strokeStyle = "rgba(229, 178, 255, 0.75)";
  ctx.stroke();
  // A tap leaves no segment to stroke, so give it the brush's own footprint.
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(
      points[0][0] * viewport.zoom + viewport.panX,
      points[0][1] * viewport.zoom + viewport.panY,
      Math.max(0.5, (stroke.size * viewport.zoom) / 2),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "rgba(229, 178, 255, 0.45)";
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draws the active Photoshop-style Patch Selection and dragged reference target.
 */
export function drawPatchPreview(ctx, patch, viewport, doc, bitmapOf, maskOf) {
  const dx = patch?.offset?.dx || 0;
  const dy = patch?.offset?.dy || 0;
  if (!doc || (dx === 0 && dy === 0) || typeof bitmapOf !== "function") return;

  const node = doc.nodes?.find((candidate) => candidate.id === patch.nodeId);
  if (!node || node.kind !== NODE_KIND.IMAGE || !bitmapOf(node)) return;
  const points = patch.points;
  if (!Array.isArray(points) || points.length < 3) return;

  // The source region is the destination contour translated by the drag
  // vector. Rendering the whole layer translated back by that vector keeps
  // image scaling, opacity, masks and node transforms identical to the real
  // layer; the clip limits it to the selected A region.
  ctx.save();
  ctx.translate(viewport.panX, viewport.panY);
  ctx.scale(viewport.zoom, viewport.zoom);
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.translate(-dx, -dy);
  drawNode(ctx, node, bitmapOf, maskOf);
  ctx.restore();
}

export function drawBitmapPreview(ctx, preview, doc) {
  if (!preview?.bitmap || !preview?.nodeId) return;
  const node = doc?.nodes?.find((candidate) => candidate.id === preview.nodeId);
  if (!node) return;
  ctx.save();
  ctx.globalAlpha = preview.opacity ?? 1;
  ctx.drawImage(preview.bitmap, node.x, node.y, node.width, node.height);
  ctx.restore();
}

export function drawGesturePathPreview(ctx, preview, viewport) {
  const path = preview?.path;
  const points = preview?.points;
  if (!points && (!path?.start || !Array.isArray(path.segments))) return;
  ctx.save();
  ctx.strokeStyle = preview?.color ?? "#00aaff";
  ctx.lineWidth = (preview?.width ?? 2) / viewport.zoom;
  ctx.setLineDash([(preview?.dash ?? 6) / viewport.zoom, 4 / viewport.zoom]);
  ctx.beginPath();
  if (Array.isArray(points)) {
    if (points.length === 0) {
      ctx.restore();
      return;
    }
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
  } else {
    ctx.moveTo(path.start.x, path.start.y);
    for (const segment of path.segments) {
      if (!segment?.c1 || !segment?.c2 || !segment?.end) continue;
      ctx.bezierCurveTo(
        segment.c1.x,
        segment.c1.y,
        segment.c2.x,
        segment.c2.y,
        segment.end.x,
        segment.end.y,
      );
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawPatchDraft(
  ctx,
  patch,
  viewport,
  antsOffset,
  doc,
  bitmapOf,
  maskOf,
) {
  const points = patch?.points;
  if (!points || points.length < 3) return;

  drawPatchPreview(ctx, patch, viewport, doc, bitmapOf, maskOf);

  ctx.save();

  // 1. Draw destination region (marching-ants / dotted outline)
  ctx.beginPath();
  points.forEach((pt, idx) => {
    const sx = pt.x * viewport.zoom + viewport.panX;
    const sy = pt.y * viewport.zoom + viewport.panY;
    if (idx === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(229, 178, 255, 0.15)";
  ctx.fill();

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ffffff";
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -antsOffset;
  ctx.stroke();

  ctx.strokeStyle = "#000000";
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -antsOffset + 4;
  ctx.stroke();

  // 2. If dragging to sample from another location, draw the reference sample indicator
  const dx = patch.offset?.dx || 0;
  const dy = patch.offset?.dy || 0;
  if (dx !== 0 || dy !== 0) {
    ctx.beginPath();
    points.forEach((pt, idx) => {
      const sx = (pt.x + dx) * viewport.zoom + viewport.panX;
      const sy = (pt.y + dy) * viewport.zoom + viewport.panY;
      if (idx === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fill();

    ctx.strokeStyle = "#00ffff";
    ctx.setLineDash([3, 3]);
    ctx.stroke();

    // Connecting dashed line between destination centroid and source centroid
    const centerDstX =
      (points.reduce((acc, p) => acc + p.x, 0) / points.length) *
        viewport.zoom +
      viewport.panX;
    const centerDstY =
      (points.reduce((acc, p) => acc + p.y, 0) / points.length) *
        viewport.zoom +
      viewport.panY;
    const centerSrcX = centerDstX + dx * viewport.zoom;
    const centerSrcY = centerDstY + dy * viewport.zoom;

    ctx.beginPath();
    ctx.moveTo(centerDstX, centerDstY);
    ctx.lineTo(centerSrcX, centerSrcY);
    ctx.strokeStyle = "rgba(0, 255, 255, 0.6)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
  }

  ctx.restore();
}
