// Real-time clone stamp cursor preview, anchor marker, and live painted strokes.

/**
 * Cached offscreen canvas used for live clone stamp stroke rendering.
 */
let cloneMaskCanvas = null;
let cloneMaskCtx = null;

export function getCloneMaskCanvas(width, height) {
  if (!cloneMaskCanvas) {
    cloneMaskCanvas =
      typeof document !== "undefined" ? document.createElement("canvas") : null;
    cloneMaskCtx = cloneMaskCanvas ? cloneMaskCanvas.getContext("2d") : null;
  }
  if (
    cloneMaskCanvas &&
    (cloneMaskCanvas.width !== width || cloneMaskCanvas.height !== height)
  ) {
    cloneMaskCanvas.width = width;
    cloneMaskCanvas.height = height;
  }
  return { canvas: cloneMaskCanvas, ctx: cloneMaskCtx };
}

/**
 * Draws the Photoshop-style live Clone Stamp preview and live brushed strokes:
 * Displays the real-time sampled image content directly under the brush as the user paints!
 */
export function drawClonePreview(
  ctx,
  preview,
  cloneSource,
  bitmapOf,
  doc,
  viewport,
) {
  if (!preview?.cursor) return;
  const {
    cursor,
    size = 24,
    opacity = 1,
    nodeId,
    points,
    sourceAnchor,
    targetAnchor,
    sourcePoint,
    showSourceCircle = false,
  } = preview;
  const radius = (size / 2) * viewport.zoom;
  const cx = cursor.x * viewport.zoom + viewport.panX;
  const cy = cursor.y * viewport.zoom + viewport.panY;

  ctx.save();

  // 1. Draw sampled texture along live stroke or inside cursor circle
  const sourceNodeId = cloneSource?.nodeId || nodeId;
  const sourceNode = doc?.nodes?.find((n) => n.id === sourceNodeId);
  const bitmap = sourceNode ? bitmapOf?.(sourceNode) : null;

  let offsetDocX = 0;
  let offsetDocY = 0;
  if (sourcePoint) {
    offsetDocX = cursor.x - sourcePoint.x;
    offsetDocY = cursor.y - sourcePoint.y;
  } else if (sourceAnchor && targetAnchor) {
    offsetDocX = targetAnchor.x - sourceAnchor.x;
    offsetDocY = targetAnchor.y - sourceAnchor.y;
  }

  if (bitmap && sourceNode && sourcePoint) {
    const nodeScreenX =
      (sourceNode.x + offsetDocX) * viewport.zoom + viewport.panX;
    const nodeScreenY =
      (sourceNode.y + offsetDocY) * viewport.zoom + viewport.panY;
    const nodeScreenW = sourceNode.width * viewport.zoom;
    const nodeScreenH = sourceNode.height * viewport.zoom;

    if (Array.isArray(points) && points.length > 0) {
      // LIVE STAMPED STROKE: Paint real cloned image pixels along the entire stroke path in real time
      const w = ctx.canvas?.width || 0;
      const h = ctx.canvas?.height || 0;
      if (w > 0 && h > 0) {
        const { canvas: maskCanvas, ctx: maskCtx } = getCloneMaskCanvas(w, h);
        if (maskCanvas && maskCtx) {
          maskCtx.clearRect(0, 0, w, h);

          // Draw the brush stroke footprint onto the mask canvas
          maskCtx.beginPath();
          points.forEach((p, idx) => {
            const sx = p.x * viewport.zoom + viewport.panX;
            const sy = p.y * viewport.zoom + viewport.panY;
            if (idx === 0) maskCtx.moveTo(sx, sy);
            else maskCtx.lineTo(sx, sy);
          });
          maskCtx.lineWidth = Math.max(1, size * viewport.zoom);
          maskCtx.lineCap = "round";
          maskCtx.lineJoin = "round";
          maskCtx.strokeStyle = "#ffffff";
          maskCtx.stroke();

          // Fill circle caps at each sampled vertex for solid coverage
          maskCtx.fillStyle = "#ffffff";
          for (const p of points) {
            const sx = p.x * viewport.zoom + viewport.panX;
            const sy = p.y * viewport.zoom + viewport.panY;
            maskCtx.beginPath();
            maskCtx.arc(sx, sy, radius, 0, Math.PI * 2);
            maskCtx.fill();
          }

          // Composite the offset sampled bitmap into the brush stroke mask
          maskCtx.globalCompositeOperation = "source-in";
          maskCtx.drawImage(
            bitmap,
            nodeScreenX,
            nodeScreenY,
            nodeScreenW,
            nodeScreenH,
          );
          maskCtx.globalCompositeOperation = "source-over";

          // Stamp the live painted stroke onto the main canvas with configured opacity
          ctx.save();
          ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
          ctx.drawImage(maskCanvas, 0, 0);
          ctx.restore();
        }
      }
    } else {
      // Hover preview inside circular cursor
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = Math.min(1, Math.max(0.2, opacity * 0.85));
      ctx.drawImage(bitmap, nodeScreenX, nodeScreenY, nodeScreenW, nodeScreenH);
      ctx.restore();
    }
  }

  // 2. Outer cursor circle ring (dual contrast black & white)
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1, radius), 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1, radius), 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
  ctx.stroke();

  // Center crosshair in cursor circle
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy);
  ctx.lineTo(cx + 5, cy);
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx, cy + 5);
  ctx.setLineDash([]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - 3, cy);
  ctx.lineTo(cx + 3, cy);
  ctx.moveTo(cx, cy - 3);
  ctx.lineTo(cx, cy + 3);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
  ctx.stroke();

  // 3. If source anchor exists, draw reference source crosshair anchor marker on the image
  const anchorMarker = sourceAnchor
    ? { ...cloneSource, point: sourceAnchor }
    : cloneSource;
  if (anchorMarker?.point) {
    drawCloneAnchor(ctx, anchorMarker, viewport);
  }

  ctx.restore();

  if (showSourceCircle && cloneSource?.point) {
    drawCloneSourceCircle(ctx, cloneSource.point, size, viewport);
  }
}

export function drawCloneSourceCircle(ctx, point, size, viewport) {
  if (!point) return;
  const x = point.x * viewport.zoom + viewport.panX;
  const y = point.y * viewport.zoom + viewport.panY;
  const radius = (size / 2) * viewport.zoom;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws the high-visibility Photoshop-style crosshair anchor marker
 * for Clone Stamp sampling point. Clean crosshair with dual contrast.
 */
export function drawCloneAnchor(ctx, cloneSource, viewport) {
  if (!cloneSource?.point) return;
  const sx = cloneSource.point.x * viewport.zoom + viewport.panX;
  const sy = cloneSource.point.y * viewport.zoom + viewport.panY;

  ctx.save();
  const len = 9;

  // Outer dark stroke for contrast on bright surfaces
  ctx.beginPath();
  ctx.moveTo(sx - len, sy);
  ctx.lineTo(sx + len, sy);
  ctx.moveTo(sx, sy - len);
  ctx.lineTo(sx, sy + len);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Inner white stroke for contrast on dark surfaces
  ctx.beginPath();
  ctx.moveTo(sx - len + 1, sy);
  ctx.lineTo(sx + len - 1, sy);
  ctx.moveTo(sx, sy - len + 1);
  ctx.lineTo(sx, sy + len - 1);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}
