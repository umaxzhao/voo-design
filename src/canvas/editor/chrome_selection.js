// Stage selection outlines, bounding handles, and gradient control overlays.

import { REGION_COLOR } from "./scene_model_core.js";
import { NODE_KIND } from "./scene_model.js";
import {
  combinedBounds,
  handlePoints,
  nodeAABB,
  nodeCorners,
  rectCornerRadiusHandles,
  selectionHandlePoints,
} from "./scene_geometry.js";
import { isCssGradient, parseGradient } from "../color_picker/gradient_fill.js";
import { isBoxlessNode } from "./scene-media.js";
import { absolutePathEndpoints, isEndpointEditable } from "./shape_geometry.js";
import { HANDLE_SIZE, SELECTION_COLOR } from "./render_nodes.js";
import { docToScreenPoint, docToScreenRect } from "./chrome_coords.js";
import {
  drawDistortMeshChrome,
  drawPerspectiveWarpChrome,
  drawPuppetWarpChrome,
} from "./chrome_warp.js";

/**
 * Figma's selection chrome, measured in screen pixels: a 2px frame, four 8×8
 * corner handles in a 1px ring, and a W × H chip below the box. Nothing casts a
 * shadow — the frame already separates the node from the artwork, and a drop
 * shadow under every handle reads as four smudges along the corners rather than
 * four grab targets.
 *
 * The frame is drawn at twice the handle's ring weight on purpose: the ring has
 * to stay legible at 8px, and the heavier frame is what makes the selection
 * read at a glance on a busy canvas without the handles having to grow.
 */
const FRAME_WIDTH = 2;
const HANDLE_RING_WIDTH = 1;
const CHROME_FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const SIZE_LABEL_FONT_SIZE = 11;
const SIZE_LABEL_HEIGHT = 18;
const SIZE_LABEL_PADDING_X = 5;
const SIZE_LABEL_GAP = 6;
const SIZE_LABEL_RADIUS = 2;
const SIZE_LABEL_TEXT = "#111111";

/**
 * A crisp frame of `FRAME_WIDTH`.
 *
 * A stroke straddles the path it is given, so the path sits half a width inside
 * the box and the rect loses a full width. Offsetting by 0.5 would smear a 2px
 * stroke across three pixel rows; insetting by a whole pixel keeps both edges on
 * a pixel boundary at any zoom.
 */
function strokeCrispRect(ctx, x, y, width, height) {
  const left = Math.round(x) + FRAME_WIDTH / 2;
  const top = Math.round(y) + FRAME_WIDTH / 2;
  const right = Math.round(x + width);
  const bottom = Math.round(y + height);
  ctx.strokeRect(
    left,
    top,
    right - left - FRAME_WIDTH,
    bottom - top - FRAME_WIDTH,
  );
}

/**
 * A box corner moved onto the frame's centreline.
 *
 * `strokeCrispRect` insets the stroke path by half the frame width so the
 * 2px frame's outer edge lands exactly on the box, which puts its centreline
 * a pixel inside the corner. A handle centred on the raw corner would hang a
 * pixel outboard of the frame it belongs to, and every corner reads visibly
 * off-centre. Rounding before the inset keeps the handle on a pixel boundary.
 */
function frameCentre(point) {
  return {
    x: Math.round(point.x) + FRAME_WIDTH / 2,
    y: Math.round(point.y) + FRAME_WIDTH / 2,
  };
}

/** One resize handle: a white square inside a selection-coloured ring. */
function paintHandle(ctx, point, color, size = HANDLE_SIZE) {
  const half = size / 2;
  const px = Math.round(point.x);
  const py = Math.round(point.y);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(px - half + 0.5, py - half + 0.5, size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = HANDLE_RING_WIDTH;
  ctx.strokeRect(px - half + 0.5, py - half + 0.5, size, size);
}

/**
 * The W × H chip centred under the selection.
 *
 * Light ground, near-black text: the chip floats on top of the artwork, so it
 * has to stay legible against whatever is underneath, and a light ground keeps
 * the frame's colour as the only saturated thing on the node. A region carries
 * its own colour onto the chip, the same way it does onto its frame.
 */
function paintSizeLabel(ctx, box, text, color) {
  // A context without text metrics cannot size a chip; the frame and handles
  // are the part that carries the selection, so the chip is simply skipped.
  if (
    typeof ctx.measureText !== "function" ||
    typeof ctx.fillText !== "function"
  ) {
    return;
  }
  // A stub or partially-implemented surface can expose measureText yet hand
  // back nothing usable. Measured before the save so an unmeasurable chip
  // leaves the context untouched rather than stranding a restore.
  const textWidth = ctx.measureText(text)?.width;
  if (!Number.isFinite(textWidth)) return;
  const width = textWidth + SIZE_LABEL_PADDING_X * 2;

  ctx.save();
  ctx.font = `500 ${SIZE_LABEL_FONT_SIZE}px ${CHROME_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const left = Math.round(box.x + box.width / 2 - width / 2);
  const top = Math.round(box.y + box.height + SIZE_LABEL_GAP);
  ctx.fillStyle = color;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(left, top, width, SIZE_LABEL_HEIGHT, SIZE_LABEL_RADIUS);
    ctx.fill();
  } else {
    ctx.fillRect(left, top, width, SIZE_LABEL_HEIGHT);
  }
  ctx.fillStyle = SIZE_LABEL_TEXT;
  ctx.fillText(text, left + width / 2, top + SIZE_LABEL_HEIGHT / 2);
  ctx.restore();
}

/** The node's own size, which is what the chip reports — not the rotated box. */
function sizeLabelText(node, rect) {
  const width = node?.width ?? rect.width;
  const height = node?.height ?? rect.height;
  return `${Math.round(width)} × ${Math.round(height)}`;
}

/**
 * Draws the selection outline and resize handles for an object or a region.
 *
 * Screen space, not document space: the frame must stay 2px and the handles
 * 8x8 at any zoom, exactly like Figma and Photoshop. The transform is
 * carried in the viewport argument instead of ctx.setTransform so handles do
 * not blur or scale up.
 */
export function drawSelection(
  ctx,
  rect,
  viewport,
  withHandles,
  node = null,
  showCornerRadius = false,
  warpTool = null,
  gradientAdjusting = false,
  selectedPuppetPin = null,
) {
  // A boxless layer (audio) has nothing to outline and no handles to grab.
  if (isBoxlessNode(node)) return;
  const isRegion = node?.kind === NODE_KIND.REGION;
  const strokeColor = isRegion ? node.color || REGION_COLOR : SELECTION_COLOR;
  // A rotated or sheared node needs its true outline rather than the axis-
  // aligned box; the flag decides which path below draws.
  const rotated = Boolean(node && ((node.rotation ?? 0) || (node.shear ?? 0)));

  // Only while a gradient control is actually being dragged does the box
  // step aside — the gradient controls are the adjust surface, and the box
  // would sit on top of the handles the user is dragging. Any other time the
  // box stays, so the select tool reads exactly like it does on every other
  // node.
  if (node && isCssGradient(node.fill) && gradientAdjusting) {
    drawGradientOverlay(ctx, node, viewport);
    return;
  }

  // An endpoint-editable stroke (a line or an arrow) shows its own path and
  // two endpoint handles instead of the 8-handle bbox — the box would promise
  // a resize the endpoint handles replace (Figma's line editing). A rotated
  // or sheared stroke fails isEndpointEditable and keeps the normal chrome.
  if (node && isEndpointEditable(node)) {
    const screenEndpoints = absolutePathEndpoints(node).map((endpoint) =>
      docToScreenPoint(endpoint, viewport),
    );
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = FRAME_WIDTH;
    ctx.beginPath();
    screenEndpoints.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    // Stroked along the path, so its centreline is the path: the endpoint
    // handles centre on the raw point, with no frame inset to compensate for.
    if (withHandles) {
      screenEndpoints.forEach((point) => paintHandle(ctx, point, strokeColor));
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = FRAME_WIDTH;

  let screenHandles;
  if (rotated) {
    ctx.beginPath();
    nodeCorners(node).forEach((corner, index) => {
      const screen = docToScreenPoint(corner, viewport);
      if (index === 0) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
    });
    ctx.closePath();
    ctx.stroke();
    // The rotated frame is stroked *along* the true outline, so its centreline
    // is the node's own edge — the handle centres on the raw corner.
    screenHandles = selectionHandlePoints(node).map((point) =>
      docToScreenPoint(point, viewport),
    );
  } else {
    const screen = docToScreenRect(rect, viewport);
    strokeCrispRect(ctx, screen.x, screen.y, screen.width, screen.height);
    // Same inset the frame got, so handle and frame share a centreline.
    screenHandles = handlePoints(screen).map(frameCentre);
  }

  if (withHandles) {
    screenHandles.forEach((point) => paintHandle(ctx, point, strokeColor));

    // The size chip belongs to the transform box, so it rides the same frame:
    // it appears exactly when the handles that resize the node do.
    paintSizeLabel(
      ctx,
      docToScreenRect(rect, viewport),
      sizeLabelText(node, rect),
      strokeColor,
    );

    // Render Figma-style inner corner radius dot handles for RECT nodes when hovered
    if (node && node.kind === NODE_KIND.RECT && showCornerRadius) {
      const radiusHandles = rectCornerRadiusHandles(node).map((point) =>
        docToScreenPoint(point, viewport),
      );
      for (const pt of radiusHandles) {
        ctx.beginPath();
        if (typeof ctx.arc === "function") {
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        }
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = FRAME_WIDTH;
        ctx.stroke();
      }
    }
  }

  // Perspective corners render only while the perspective tool is armed:
  // a stored grid from an earlier session must not show as a second,
  // confusing transform overlay when another tool is active.
  if (node && warpTool === "perspective") {
    drawPerspectiveWarpChrome(ctx, node, viewport);
  }

  // The mesh grid renders only while mesh-warp or distort is armed, for the
  // same reason as the perspective corners: one transform overlay at a time.
  if (warpTool === "distort") {
    drawDistortMeshChrome(ctx, node, viewport);
  }

  if (node && warpTool === "puppet_warp") {
    drawPuppetWarpChrome(ctx, node, viewport, selectedPuppetPin);
  }

  // Draw gradient control vector line and stop points if node fill is a gradient
  // (reached via the early return above — this guard keeps the overlay off
  // nodes whose fill is not a gradient, e.g. when drawSelection is reused).
  if (node && isCssGradient(node.fill)) {
    drawGradientOverlay(ctx, node, viewport);
  }
  ctx.restore();
}

/** Draws the gradient direction line and color stop control handles overlay on a node */
export function drawGradientOverlay(ctx, node, viewport) {
  const parsed = parseGradient(node.fill);
  if (!parsed || parsed.type === "solid") return;

  const geom = parsed.geometry || {};
  const startX = node.x + ((geom.startX ?? 0) / 100) * node.width;
  const startY = node.y + ((geom.startY ?? 0) / 100) * node.height;
  const endX = node.x + ((geom.endX ?? 100) / 100) * node.width;
  const endY = node.y + ((geom.endY ?? 100) / 100) * node.height;

  const pStart = docToScreenPoint({ x: startX, y: startY }, viewport);
  const pEnd = docToScreenPoint({ x: endX, y: endY }, viewport);

  ctx.save();
  // Draw connecting gradient line
  ctx.beginPath();
  ctx.moveTo(pStart.x, pStart.y);
  ctx.lineTo(pEnd.x, pEnd.y);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Draw gradient stop handles along the vector line
  const stops = parsed.stops || [];
  for (const stop of stops) {
    const posRatio = (stop.position ?? 0) / 100;
    const sx = pStart.x + (pEnd.x - pStart.x) * posRatio;
    const sy = pStart.y + (pEnd.y - pStart.y) * posRatio;

    // Drop shadow circle
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fill();

    // Color fill circle
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fillStyle = stop.color || "#ffffff";
    ctx.fill();

    // White outline
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

  // The endpoints read differently from the stops: hollow rings, so the two
  // grab targets (drag the line end, drag a stop) are visually distinct.
  for (const point of [pStart, pEnd]) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    // The design system's mint — the UI has no blue, and the ring matches the
    // selection chrome the gradient controls replace.
    ctx.strokeStyle = "#a7ffd4";
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The set of picked nodes: a thin outline around each, and a dashed box with
 * corner resize handles around the combined bounds to scale the set as a whole.
 */
export function drawSelectionSet(ctx, nodes, viewport) {
  const boxed = (nodes ?? []).filter((node) => !isBoxlessNode(node));
  if (boxed.length === 0) return;

  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = FRAME_WIDTH;

  for (const node of boxed) {
    const box = docToScreenRect(nodeAABB(node), viewport);
    strokeCrispRect(ctx, box.x, box.y, box.width, box.height);
  }

  const combined = combinedBounds(boxed.map((node) => nodeAABB(node)));
  if (combined) {
    const box = docToScreenRect(combined, viewport);
    ctx.setLineDash([5, 4]);
    strokeCrispRect(ctx, box.x, box.y, box.width, box.height);

    // Corner handles on the combined box, matching the single-node chrome —
    // and on the frame's centreline, same as the axis-aligned case.
    ctx.setLineDash([]);
    handlePoints(box).forEach((point) =>
      paintHandle(ctx, frameCentre(point), SELECTION_COLOR),
    );
  }

  ctx.restore();
}
