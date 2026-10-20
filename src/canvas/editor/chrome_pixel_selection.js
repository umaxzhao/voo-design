// Pixel selection marching ants, lasso, polygonal lasso, and magnetic wire overlays.

import { SELECTION_COLOR } from "./render_nodes.js";

/**
 * Marching ants around the live pixel selection.
 *
 * Drawn as two passes over the same rings — a solid light line, then a dark
 * dashed one on top — which is how the outline stays readable over both a
 * bright and a dark picture without knowing anything about what it crosses.
 * `offset` is advanced by the engine's timer; it is the only thing that moves.
 */
export function drawPixelSelection(ctx, selection, viewport, offset) {
  const rings = selection?.contours;
  if (!rings?.length) return;
  ctx.save();
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach(([x, y], index) => {
      const screenX = x * viewport.zoom + viewport.panX;
      const screenY = y * viewport.zoom + viewport.panY;
      if (index === 0) ctx.moveTo(screenX, screenY);
      else ctx.lineTo(screenX, screenY);
    });
    ctx.closePath();
  }
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -offset;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.stroke();
  ctx.restore();
}

/** Draws the transient Live Wire path and fastening anchors above the image. */
export function drawMagneticLasso(ctx, draft, viewport) {
  if (!draft?.fixedPath?.length) return;
  const drawPath = (points, dashed) => {
    if (!points?.length) return;
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      const screenX = x * viewport.zoom + viewport.panX;
      const screenY = y * viewport.zoom + viewport.panY;
      if (index === 0) ctx.moveTo(screenX, screenY);
      else ctx.lineTo(screenX, screenY);
    });
    ctx.setLineDash(dashed ? [5, 3] : []);
    ctx.stroke();
  };
  ctx.save();
  ctx.strokeStyle = draft.confidence === "low" ? "#f59e0b" : "#E5B2FF";
  ctx.fillStyle = "#E5B2FF";
  ctx.lineWidth = 1.5;
  drawPath(draft.fixedPath, false);
  drawPath(draft.livePath, true);
  ctx.setLineDash([]);
  for (const anchor of draft.renderAnchors ?? []) {
    const [x, y] = anchor.point;
    ctx.beginPath();
    ctx.arc(
      x * viewport.zoom + viewport.panX,
      y * viewport.zoom + viewport.panY,
      anchor.automatic ? 2 : 3.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The lasso polygon, in screen space like the rest of the chrome: a dashed
 * outline over a faint fill. An in-progress drag stays open; a pending one
 * closes back to its start.
 */
export function drawLasso(ctx, lasso, viewport) {
  if (!lasso.points.length) return;
  ctx.save();
  ctx.beginPath();
  lasso.points.forEach(([x, y], index) => {
    const screenX = x * viewport.zoom + viewport.panX;
    const screenY = y * viewport.zoom + viewport.panY;
    if (index === 0) ctx.moveTo(screenX, screenY);
    else ctx.lineTo(screenX, screenY);
  });
  if (lasso.pending) ctx.closePath();
  ctx.fillStyle = "rgba(10, 132, 255, 0.12)";
  ctx.fill();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.restore();
}

/**
 * The polygonal-lasso draft: the vertices clicked so far as a solid outline,
 * the rubber band from the last vertex to the preview endpoint as a dashed
 * one, and a small dot at the first vertex so the closing edge has a target.
 */
export function drawPolygonDraft(ctx, draft, viewport) {
  if (!draft.points.length) return;
  ctx.save();
  ctx.beginPath();
  draft.points.forEach(([x, y], index) => {
    const screenX = x * viewport.zoom + viewport.panX;
    const screenY = y * viewport.zoom + viewport.panY;
    if (index === 0) ctx.moveTo(screenX, screenY);
    else ctx.lineTo(screenX, screenY);
  });
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.stroke();
  // The live edge follows the pointer until Enter or double-click closes it.
  const last = draft.points[draft.points.length - 1];
  const preview = draft.preview ?? last;
  ctx.beginPath();
  ctx.moveTo(
    last[0] * viewport.zoom + viewport.panX,
    last[1] * viewport.zoom + viewport.panY,
  );
  ctx.lineTo(
    preview[0] * viewport.zoom + viewport.panX,
    preview[1] * viewport.zoom + viewport.panY,
  );
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  // The start dot: closing connects the rubber band back here.
  const start = draft.points[0];
  const startScreenX = start[0] * viewport.zoom + viewport.panX;
  const startScreenY = start[1] * viewport.zoom + viewport.panY;
  const isSnapped =
    draft.isSnappedToStart ||
    (draft.points.length >= 3 &&
      draft.preview &&
      Math.hypot(draft.preview[0] - start[0], draft.preview[1] - start[1]) <
        1e-4);

  if (isSnapped) {
    // Glowing magnetic snap ring when endpoint approaches origin
    ctx.beginPath();
    ctx.arc(startScreenX, startScreenY, 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(167, 255, 212, 0.35)";
    ctx.fill();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(startScreenX, startScreenY, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(startScreenX, startScreenY, 3, 0, Math.PI * 2);
    ctx.fillStyle = SELECTION_COLOR;
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.stroke();
  }
  ctx.restore();
}
