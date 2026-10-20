// Transform tool overlay chrome for perspective, mesh distort, and puppet warp.

import { nodeCorners } from "./scene_geometry.js";
import { readNodeTransform } from "./scene_state_contract.js";
import { warpPointTransformed } from "./render_nodes.js";
import { docToScreenPoint } from "./chrome_coords.js";

/** Perspective corners render only while the perspective tool is armed. */
export function drawPerspectiveWarpChrome(ctx, node, viewport) {
  // Control points are node-local ratios; mapping them through the node's
  // transform keeps the quad glued to the picture when it is moved,
  // scaled or rotated — the same host-local convention regions use.
  const perspective = readNodeTransform(node).corners;
  const corners =
    perspective && perspective.length === 4
      ? perspective.map((c) => warpPointTransformed(node, c))
      : nodeCorners(node);
  ctx.save();
  ctx.strokeStyle = "#b2ffd6";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  corners.forEach((c, idx) => {
    const sc = docToScreenPoint(c, viewport);
    if (idx === 0) ctx.moveTo(sc.x, sc.y);
    else ctx.lineTo(sc.x, sc.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // 4 Perspective corner control points (blue/green circles)
  corners.forEach((c) => {
    const sc = docToScreenPoint(c, viewport);
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  });
}

/** The mesh grid renders only while mesh-warp or distort is armed. */
export function drawDistortMeshChrome(ctx, node, viewport) {
  const meshTransform = node
    ? readNodeTransform(node)
    : { kind: "none", mesh: null };
  if (
    !meshTransform.mesh ||
    !Array.isArray(meshTransform.mesh.points)
  ) {
    return;
  }

  const cols = meshTransform.mesh.cols || 3;
  const rows = meshTransform.mesh.rows || 3;
  const pts = meshTransform.mesh.points.map((p) =>
    warpPointTransformed(node, p),
  );

  ctx.save();
  ctx.strokeStyle = "rgba(178, 255, 214, 0.75)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);

  const isPhotoshopWarp = cols === 3 && rows === 3 && pts.length === 16;

  if (isPhotoshopWarp) {
    // 1. Draw smooth cubic Bézier curves along each horizontal row
    for (let r = 0; r <= rows; r++) {
      const p0 = docToScreenPoint(pts[r * 4 + 0], viewport);
      const p1 = docToScreenPoint(pts[r * 4 + 1], viewport);
      const p2 = docToScreenPoint(pts[r * 4 + 2], viewport);
      const p3 = docToScreenPoint(pts[r * 4 + 3], viewport);

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      ctx.stroke();
    }

    // 2. Draw smooth cubic Bézier curves along each vertical column
    for (let c = 0; c <= cols; c++) {
      const p0 = docToScreenPoint(pts[0 * 4 + c], viewport);
      const p1 = docToScreenPoint(pts[1 * 4 + c], viewport);
      const p2 = docToScreenPoint(pts[2 * 4 + c], viewport);
      const p3 = docToScreenPoint(pts[3 * 4 + c], viewport);

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      ctx.stroke();
    }

    // 3. Draw tangent handle arm lines from 4 main corners to their neighboring handles (Photoshop style)
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(16, 185, 129, 0.5)";
    ctx.lineWidth = 1;

    const cornerHandlePairs = [
      [0, 1],
      [0, 4], // TL corner to right & bottom handles
      [3, 2],
      [3, 7], // TR corner to left & bottom handles
      [12, 8],
      [12, 13], // BL corner to top & right handles
      [15, 11],
      [15, 14], // BR corner to top & left handles
    ];

    for (const [fromIdx, toIdx] of cornerHandlePairs) {
      const fromPt = docToScreenPoint(pts[fromIdx], viewport);
      const toPt = docToScreenPoint(pts[toIdx], viewport);
      ctx.beginPath();
      ctx.moveTo(fromPt.x, fromPt.y);
      ctx.lineTo(toPt.x, toPt.y);
      ctx.stroke();
    }
  } else {
    // Standard discrete mesh lines
    // Draw horizontal grid lines
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      for (let c = 0; c <= cols; c++) {
        const pt = pts[r * (cols + 1) + c];
        const sc = docToScreenPoint(pt, viewport);
        if (c === 0) ctx.moveTo(sc.x, sc.y);
        else ctx.lineTo(sc.x, sc.y);
      }
      ctx.stroke();
    }
    // Draw vertical grid lines
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      for (let r = 0; r <= rows; r++) {
        const pt = pts[r * (cols + 1) + c];
        const sc = docToScreenPoint(pt, viewport);
        if (r === 0) ctx.moveTo(sc.x, sc.y);
        else ctx.lineTo(sc.x, sc.y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();

  // Draw interactive mesh vertex dots for distort tool
  pts.forEach((pt, index) => {
    const sc = docToScreenPoint(pt, viewport);
    const isCorner =
      isPhotoshopWarp &&
      (index === 0 || index === 3 || index === 12 || index === 15);
    const isInterior =
      isPhotoshopWarp &&
      (index === 5 || index === 6 || index === 9 || index === 10);

    ctx.beginPath();
    ctx.arc(sc.x, sc.y, isCorner ? 5.5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = isCorner ? "#ffffff" : isInterior ? "#b2ffd6" : "#ffffff";
    ctx.fill();
    ctx.strokeStyle = isCorner ? "#10b981" : "#10b981";
    ctx.lineWidth = isCorner ? 2 : 1.5;
    ctx.stroke();
  });
}

/** Puppet warp handles and displacement bones. */
export function drawPuppetWarpChrome(ctx, node, viewport, selectedPuppetPin) {
  const puppetPins = node ? readNodeTransform(node).pins : null;
  if (!Array.isArray(puppetPins)) return;

  ctx.save();
  const pins = puppetPins;

  // 1. Draw individual displacement bone/dotted line from rest anchor to moved position for each displaced pin
  for (const pin of pins) {
    const restX = pin.restX ?? pin.x;
    const restY = pin.restY ?? pin.y;
    const isDisplaced = Math.hypot(pin.x - restX, pin.y - restY) > 0.002;
    if (!isDisplaced) continue;

    const restScreen = docToScreenPoint(
      warpPointTransformed(node, { x: restX, y: restY }),
      viewport,
    );
    const currScreen = docToScreenPoint(
      warpPointTransformed(node, pin),
      viewport,
    );

    // Dotted bone connector
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(restScreen.x, restScreen.y);
    ctx.lineTo(currScreen.x, currScreen.y);
    ctx.stroke();

    // Ghost rest base circle at origin
    ctx.beginPath();
    ctx.arc(restScreen.x, restScreen.y, 5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(restScreen.x, restScreen.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fill();
    ctx.restore();
  }

  // 2. Draw clean dual-ring circular pin handles at current position (Affinity style)
  for (const pin of pins) {
    const point = warpPointTransformed(node, pin);
    const screen = docToScreenPoint(point, viewport);
    const isCurrent = pin.id === selectedPuppetPin;
    const radius = isCurrent ? 8 : 6.5;

    // Soft drop shadow for high contrast on any background
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;

    // Outer ring
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isCurrent
      ? "rgba(178, 255, 214, 0.3)"
      : "rgba(24, 24, 27, 0.85)";
    ctx.fill();
    ctx.strokeStyle = isCurrent ? "#a7ffd4" : "#ffffff";
    ctx.lineWidth = isCurrent ? 2.5 : 2;
    ctx.stroke();

    // Reset shadow for crisp inner core
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Inner center dot
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, isCurrent ? 3 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = isCurrent ? "#a7ffd4" : pin.fixed ? "#fbbf24" : "#ffffff";
    ctx.fill();

    // Fixed anchor badge if pin is locked
    if (pin.fixed) {
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}
