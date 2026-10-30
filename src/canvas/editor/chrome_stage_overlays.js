// Stage overlays for crop, marquee, text draft, selection transform, and alignment guides.

import { effectivePage } from "./scene_model.js";
import { SELECTION_COLOR } from "./render_nodes.js";
import { docToScreenRect } from "./chrome_coords.js";
import { drawSelection } from "./chrome_selection.js";

/** Dims everything outside the crop rectangle and outlines it. */
export function drawCrop(ctx, cropRect, doc, viewport) {
  const page = docToScreenRect(effectivePage(doc), viewport);
  const screen = docToScreenRect(cropRect, viewport);

  ctx.save();
  ctx.beginPath();
  ctx.rect(page.x, page.y, page.width, page.height);
  ctx.rect(screen.x, screen.y, screen.width, screen.height);
  // Even-odd leaves the crop rectangle unpainted, so only the outside dims.
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fill("evenodd");
  ctx.restore();

  ctx.save();
  // A thin solid rule just inside the crop edge; the outside stays flat dim.
  ctx.strokeStyle = "#b2ffd6";
  ctx.lineWidth = 1;
  ctx.strokeRect(screen.x + 0.5, screen.y + 0.5, screen.width - 1, screen.height - 1);
  ctx.restore();

  // Rule-of-thirds grid: two vertical and two horizontal guides at the 1/3
  // marks, drawn inside the crop frame while it is being composed. Faint so
  // the picture stays the focus; only while a crop is armed (drawCrop is
  // stage chrome, never part of an export).
  if (screen.width > 24 && screen.height > 24) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let third = 1; third <= 2; third += 1) {
      const gx = screen.x + (screen.width * third) / 3;
      ctx.moveTo(gx, screen.y);
      ctx.lineTo(gx, screen.y + screen.height);
      const gy = screen.y + (screen.height * third) / 3;
      ctx.moveTo(screen.x, gy);
      ctx.lineTo(screen.x + screen.width, gy);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawSelection(ctx, cropRect, viewport, true);
}

/** The rubber-band box of a marquee drag, in screen space. */
export function drawMarquee(ctx, rect, viewport) {
  const box = docToScreenRect(rect, viewport);
  ctx.save();
  ctx.fillStyle = `${SELECTION_COLOR}1a`;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

/**
 * The dashed preview of a text-box drag, in screen space.
 *
 * The box the user is drawing is not a document node yet — it becomes one only
 * when they start typing — so the chrome shows it as the marquee shows its
 * rect: a hairline dashed outline over a faint fill. The dash is what
 * separates "still drawing" from "committed text", Figma's distinction.
 */
export function drawTextDraftRect(ctx, rect, viewport) {
  const box = docToScreenRect(rect, viewport);
  if (box.width <= 0 || box.height <= 0) return;
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.width, box.height);
  ctx.restore();
}

/**
 * The transform-selection chrome: a dashed box for the dragged target rect,
 * four corner resize handles, and a rotation grip above the top edge.
 */
export function drawSelectionTransformBox(ctx, box, viewport) {
  const { rotation = 0, rect = box } = box ?? {};
  if (!rect) return;
  ctx.save();
  ctx.translate(viewport.panX, viewport.panY);
  ctx.scale(viewport.zoom, viewport.zoom);

  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  // Real-time live pixel preview of transformed selection while dragging
  if (box.extractedCanvas && box.initialRect && box.node) {
    const { initialRect, node } = box;
    const oldCx = initialRect.x + initialRect.width / 2;
    const oldCy = initialRect.y + initialRect.height / 2;
    const sX = rect.width / Math.max(initialRect.width, 1);
    const sY = rect.height / Math.max(initialRect.height, 1);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.scale(sX, sY);
    ctx.translate(-oldCx, -oldCy);
    ctx.drawImage(
      box.extractedCanvas,
      0,
      0,
      box.extractedCanvas.width,
      box.extractedCanvas.height,
      node.x,
      node.y,
      node.width,
      node.height,
    );
    ctx.restore();
  }

  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.translate(-cx, -cy);

  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1 / viewport.zoom;
  ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.setLineDash([]);

  // Rotation grip: a small line above the top edge with a dot.
  const gripY = rect.y - 24 / viewport.zoom;
  ctx.beginPath();
  ctx.moveTo(cx, rect.y);
  ctx.lineTo(cx, gripY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, gripY - 6 / viewport.zoom, 5 / viewport.zoom, 0, Math.PI * 2);
  ctx.fillStyle = SELECTION_COLOR;
  ctx.fill();

  // Four corner handles, matching object-selection chrome.
  const size = 7 / viewport.zoom;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1 / viewport.zoom;
  const points = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ];
  for (const [hx, hy] of points) {
    ctx.fillRect(hx - size / 2, hy - size / 2, size, size);
    ctx.strokeRect(hx - size / 2, hy - size / 2, size, size);
  }
  ctx.restore();
}

export const SPACING_GUIDE_COLOR = "#e056fd";
export const GAP_GUIDE_COLOR = SPACING_GUIDE_COLOR;

/**
 * Draws a single smart spacing gap guide with perpendicular tick marks and measurement pill badges.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} guide Gap guide object (type: "gap", "gap_h", or "gap_v")
 * @param {Object} viewport Canvas viewport { zoom, panX, panY }
 */
export function drawGapGuide(ctx, guide, viewport) {
  drawGapGuides(ctx, [guide], viewport);
}

/**
 * Draws smart spacing gap guides with perpendicular tick marks and measurement pill badges.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Object>|Object} gapGuides Array of gap guide objects (or single guide)
 * @param {Object} viewport Canvas viewport { zoom, panX, panY }
 */
export function drawGapGuides(ctx, gapGuides, viewport) {
  if (!ctx || !gapGuides) return;
  const list = Array.isArray(gapGuides) ? gapGuides : [gapGuides];
  if (list.length === 0) return;

  const zoom = viewport?.zoom ?? 1;
  const panX = viewport?.panX ?? 0;
  const panY = viewport?.panY ?? 0;
  const tickLength = 4; // 4px each side = 8px perpendicular tick

  const fillRoundRect = (rx, ry, rw, rh, radius) => {
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(rx, ry, rw, rh, radius);
      ctx.fill();
    } else {
      ctx.fillRect(rx, ry, rw, rh);
    }
  };

  const drawSpanH = (start, end, cross, spanLabel) => {
    const sX1 = Math.round(start * zoom + panX) + 0.5;
    const sX2 = Math.round(end * zoom + panX) + 0.5;
    const sY = Math.round(cross * zoom + panY) + 0.5;

    // 1. Magenta hairline & end tick marks
    ctx.beginPath();
    ctx.strokeStyle = SPACING_GUIDE_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.moveTo(sX1, sY);
    ctx.lineTo(sX2, sY);

    // 8px perpendicular ticks at both endpoints
    ctx.moveTo(sX1, sY - tickLength);
    ctx.lineTo(sX1, sY + tickLength);
    ctx.moveTo(sX2, sY - tickLength);
    ctx.lineTo(sX2, sY + tickLength);
    ctx.stroke();

    // 2. Centered measurement pill badge
    const midX = (sX1 + sX2) / 2;
    let textWidth = 24;
    if (typeof ctx.measureText === "function") {
      const metrics = ctx.measureText(spanLabel);
      if (metrics && typeof metrics.width === "number") textWidth = metrics.width;
    }
    const pillWidth = Math.max(24, textWidth + 8);
    const pillHeight = 16;
    const pillX = midX - pillWidth / 2;
    let pillY = sY - pillHeight / 2;

    if (Math.abs(sX2 - sX1) < pillWidth + 4) {
      pillY = sY - pillHeight - 3;
    }

    ctx.fillStyle = SPACING_GUIDE_COLOR;
    fillRoundRect(pillX, pillY, pillWidth, pillHeight, 3);

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(spanLabel, midX, pillY + pillHeight / 2);
  };

  const drawSpanV = (start, end, cross, spanLabel) => {
    const sY1 = Math.round(start * zoom + panY) + 0.5;
    const sY2 = Math.round(end * zoom + panY) + 0.5;
    const sX = Math.round(cross * zoom + panX) + 0.5;

    // 1. Magenta hairline & end tick marks
    ctx.beginPath();
    ctx.strokeStyle = SPACING_GUIDE_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.moveTo(sX, sY1);
    ctx.lineTo(sX, sY2);

    // 8px perpendicular ticks at both endpoints
    ctx.moveTo(sX - tickLength, sY1);
    ctx.lineTo(sX + tickLength, sY1);
    ctx.moveTo(sX - tickLength, sY2);
    ctx.lineTo(sX + tickLength, sY2);
    ctx.stroke();

    // 2. Centered measurement pill badge
    const midY = (sY1 + sY2) / 2;
    let textWidth = 24;
    if (typeof ctx.measureText === "function") {
      const metrics = ctx.measureText(spanLabel);
      if (metrics && typeof metrics.width === "number") textWidth = metrics.width;
    }
    const pillWidth = Math.max(24, textWidth + 8);
    const pillHeight = 16;
    let pillX = sX - pillWidth / 2;
    const pillY = midY - pillHeight / 2;

    if (Math.abs(sY2 - sY1) < pillHeight + 4) {
      pillX = sX + 6;
    }

    ctx.fillStyle = SPACING_GUIDE_COLOR;
    fillRoundRect(pillX, pillY, pillWidth, pillHeight, 3);

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(spanLabel, pillX + pillWidth / 2, midY);
  };

  ctx.save();
  ctx.font = "bold 10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  const hasSpecificGaps = list.some(
    (g) => g.type === "gap_h" || g.type === "gap_v",
  );

  for (const guide of list) {
    if (!guide) continue;
    if (guide.type === "gap" && hasSpecificGaps) continue;

    const gapValue = guide.gap ?? 0;
    const label = guide.label || `${Math.round(gapValue)}px`;

    if (guide.type === "gap_h") {
      const start = Math.min(guide.x1, guide.x2);
      const end = Math.max(guide.x1, guide.x2);
      drawSpanH(start, end, guide.y, label);
    } else if (guide.type === "gap_v") {
      const start = Math.min(guide.y1, guide.y2);
      const end = Math.max(guide.y1, guide.y2);
      drawSpanV(start, end, guide.x, label);
    } else if (guide.type === "gap") {
      const isV = guide.axis === "v" || guide.axis === "y";
      if (Array.isArray(guide.spans)) {
        for (const span of guide.spans) {
          const spanGap = span.gap ?? guide.gap ?? Math.abs(span.end - span.start);
          const spanText = span.label || `${Math.round(spanGap)}px`;
          if (isV) {
            drawSpanV(Math.min(span.start, span.end), Math.max(span.start, span.end), span.cross, spanText);
          } else {
            drawSpanH(Math.min(span.start, span.end), Math.max(span.start, span.end), span.cross, spanText);
          }
        }
      }
    }
  }

  ctx.restore();
}

/** Draws alignment snapping guide lines (vertical & horizontal) and smart spacing gap guides. */
export function drawGuides(ctx, guides, viewport, dpr = 1) {
  if (!guides || guides.length === 0) return;
  const { canvas } = ctx;
  // The canvas backing store is sized at the render dpr (1 during a draft
  // stroke), so the logical extent must divide by that — not the display's.
  const width = canvas ? canvas.width / dpr : 1000;
  const height = canvas ? canvas.height / dpr : 800;

  const standardGuides = [];
  const gapGuides = [];

  for (const guide of guides) {
    if (guide.type === "v" || guide.type === "h") {
      standardGuides.push(guide);
    } else if (
      guide.type === "gap_h" ||
      guide.type === "gap_v" ||
      guide.type === "gap"
    ) {
      gapGuides.push(guide);
    }
  }

  // 1. Draw standard alignment guides (cyan / selection color)
  if (standardGuides.length > 0) {
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    for (const guide of standardGuides) {
      ctx.beginPath();
      if (guide.type === "v") {
        const screenX =
          Math.round(guide.pos * viewport.zoom + viewport.panX) + 0.5;
        // Segment-bounded guides between aligned objects; full height otherwise.
        const top =
          guide.startY !== undefined
            ? Math.round(guide.startY * viewport.zoom + viewport.panY)
            : 0;
        const bottom =
          guide.endY !== undefined
            ? Math.round(guide.endY * viewport.zoom + viewport.panY)
            : height;
        ctx.moveTo(screenX, Math.max(0, top));
        ctx.lineTo(screenX, Math.min(height, bottom));
      } else if (guide.type === "h") {
        const screenY =
          Math.round(guide.pos * viewport.zoom + viewport.panY) + 0.5;
        const left =
          guide.startX !== undefined
            ? Math.round(guide.startX * viewport.zoom + viewport.panX)
            : 0;
        const right =
          guide.endX !== undefined
            ? Math.round(guide.endX * viewport.zoom + viewport.panX)
            : width;
        ctx.moveTo(Math.max(0, left), screenY);
        ctx.lineTo(Math.min(width, right), screenY);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Draw smart spacing gap guides (magenta hairline + ticks + pill badge)
  if (gapGuides.length > 0) {
    drawGapGuides(ctx, gapGuides, viewport);
  }
}

// ---------------------------------------------------------------------------
// Agent Visual Feedback Overlays (Focus Ring & Status Pills)
// ---------------------------------------------------------------------------

let currentAgentFocus = null;
let agentFocusTimeout = null;

let currentAgentCursor = null;
let agentCursorTimeout = null;
let cursorRenderX = null;
let cursorRenderY = null;
const cursorParticles = [];

export function setAgentCursor({ x, y, label = "Agent", active = true, durationMs = 3000 } = {}) {
  if (!active || x == null || y == null) {
    currentAgentCursor = null;
    cursorRenderX = null;
    cursorRenderY = null;
    cursorParticles.length = 0;
    return;
  }
  const targetX = Number(x) || 0;
  const targetY = Number(y) || 0;
  if (cursorRenderX === null || cursorRenderY === null) {
    cursorRenderX = targetX;
    cursorRenderY = targetY;
  }
  currentAgentCursor = {
    x: targetX,
    y: targetY,
    label: String(label || "Agent"),
    timestamp: Date.now(),
  };
  if (agentCursorTimeout) clearTimeout(agentCursorTimeout);
  if (typeof window !== "undefined") {
    agentCursorTimeout = setTimeout(() => {
      currentAgentCursor = null;
      cursorRenderX = null;
      cursorRenderY = null;
      cursorParticles.length = 0;
      window.__vooEditor?.requestRender?.();
    }, durationMs);
    window.__vooEditor?.requestRender?.();
  }
}

export function getAgentCursor() {
  return currentAgentCursor;
}

export function clearAgentCursor() {
  currentAgentCursor = null;
  cursorRenderX = null;
  cursorRenderY = null;
  cursorParticles.length = 0;
  if (agentCursorTimeout) clearTimeout(agentCursorTimeout);
}

export function setAgentFocusNode(node, status = "AI: Mutating") {
  if (!node) {
    currentAgentFocus = null;
    return;
  }
  currentAgentFocus = {
    layerId: node.id,
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? 100,
    height: node.height ?? 100,
    status,
    timestamp: Date.now(),
  };

  setAgentCursor({
    x: (node.x ?? 0) + (node.width ?? 100) / 2,
    y: node.y ?? 0,
    label: status.replace(/^AI:\s*/, "") || "Agent",
    active: true,
  });

  if (agentFocusTimeout) clearTimeout(agentFocusTimeout);
  if (typeof window !== "undefined") {
    agentFocusTimeout = setTimeout(() => {
      currentAgentFocus = null;
      window.__vooEditor?.requestRender?.();
    }, 2500);
    window.__vooEditor?.requestRender?.();
  }
}

export function getAgentFocusNode() {
  return currentAgentFocus;
}

export function clearAgentFocusNode() {
  currentAgentFocus = null;
  if (agentFocusTimeout) clearTimeout(agentFocusTimeout);
}

/**
 * Draws a subtle mint accent (#a7ffd4) focus ring and status pill over the targeted layer.
 */
/**
 * Draws a futuristic Google Stitch-style holographic focus frame, laser scan, and status pill over the targeted layer.
 */
export function drawAgentFocusOverlay(ctx, focus, viewport) {
  if (!focus || !viewport) return;

  const { zoom, panX, panY } = viewport;
  const screenX = focus.x * zoom + panX;
  const screenY = focus.y * zoom + panY;
  const screenW = focus.width * zoom;
  const screenH = focus.height * zoom;

  ctx.save();
  const now = Date.now();

  // 1. Iridescent Stitch glowing perimeter
  const grad = ctx.createLinearGradient(screenX, screenY, screenX + screenW, screenY + screenH);
  grad.addColorStop(0, "rgba(99, 102, 241, 0.85)"); // Indigo
  grad.addColorStop(0.33, "rgba(168, 85, 247, 0.85)"); // Electric Violet
  grad.addColorStop(0.66, "rgba(6, 182, 212, 0.85)"); // Neon Cyan
  grad.addColorStop(1, "rgba(16, 185, 129, 0.85)"); // Mint

  const offset = (now % 3000) / 3000;
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.lineDashOffset = -offset * 28;
  ctx.strokeRect(screenX - 2, screenY - 2, screenW + 4, screenH + 4);

  // 2. High-precision corner HUD brackets ⌜ ⌝ ⌞ ⌟
  const cornerLen = Math.min(16, Math.max(8, Math.min(screenW, screenH) / 4));
  ctx.setLineDash([]);
  ctx.strokeStyle = "#00f0ff";
  ctx.lineWidth = 2.5;

  // Top-left
  ctx.beginPath();
  ctx.moveTo(screenX - 4, screenY - 4 + cornerLen);
  ctx.lineTo(screenX - 4, screenY - 4);
  ctx.lineTo(screenX - 4 + cornerLen, screenY - 4);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(screenX + screenW + 4 - cornerLen, screenY - 4);
  ctx.lineTo(screenX + screenW + 4, screenY - 4);
  ctx.lineTo(screenX + screenW + 4, screenY - 4 + cornerLen);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(screenX - 4, screenY + screenH + 4 - cornerLen);
  ctx.lineTo(screenX - 4, screenY + screenH + 4);
  ctx.lineTo(screenX - 4 + cornerLen, screenY + screenH + 4);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(screenX + screenW + 4 - cornerLen, screenY + screenH + 4);
  ctx.lineTo(screenX + screenW + 4, screenY + screenH + 4);
  ctx.lineTo(screenX + screenW + 4, screenY + screenH + 4 - cornerLen);
  ctx.stroke();

  // 3. Sweeping holographic laser scan beam
  if (screenH > 10) {
    const scanProgress = (now % 2200) / 2200;
    const scanY = screenY + scanProgress * screenH;
    const laserGrad = ctx.createLinearGradient(screenX, scanY, screenX + screenW, scanY);
    laserGrad.addColorStop(0, "rgba(0, 240, 255, 0)");
    laserGrad.addColorStop(0.2, "rgba(168, 85, 247, 0.4)");
    laserGrad.addColorStop(0.5, "rgba(0, 240, 255, 0.85)");
    laserGrad.addColorStop(0.8, "rgba(168, 85, 247, 0.4)");
    laserGrad.addColorStop(1, "rgba(0, 240, 255, 0)");
    ctx.fillStyle = laserGrad;
    ctx.fillRect(screenX, scanY - 1.5, screenW, 3);
  }

  // 4. Status feedback pill above the node with Stitch iridescent glow
  if (focus.status) {
    ctx.font = "600 11px sans-serif";
    const text = `✦ ${focus.status}`;
    const textMetrics = ctx.measureText(text);
    const pillW = textMetrics.width + 20;
    const pillH = 22;
    const pillX = screenX + (screenW - pillW) / 2;
    const pillY = Math.max(8, screenY - pillH - 8);

    ctx.fillStyle = "rgba(10, 15, 26, 0.95)";
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 6);
    ctx.fill();

    ctx.strokeStyle = "rgba(0, 240, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#a7ffd4";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, pillX + pillW / 2, pillY + pillH / 2);
  }

  if (typeof window !== "undefined") {
    requestAnimationFrame(() => window.__vooEditor?.requestRender?.());
  }

  ctx.restore();
}

/**
 * Draws the real-time agent cursor, particle trail, and status label on the canvas.
 */
export function drawAgentCursorOverlay(ctx, cursor, viewport) {
  if (!cursor || !viewport) return;
  const { zoom, panX, panY } = viewport;

  if (cursorRenderX === null) cursorRenderX = cursor.x;
  if (cursorRenderY === null) cursorRenderY = cursor.y;

  const dx = cursor.x - cursorRenderX;
  const dy = cursor.y - cursorRenderY;
  const dist = Math.hypot(dx, dy);

  if (dist > 0.5) {
    cursorRenderX += dx * 0.35;
    cursorRenderY += dy * 0.35;
  } else {
    cursorRenderX = cursor.x;
    cursorRenderY = cursor.y;
  }

  const screenX = cursorRenderX * zoom + panX;
  const screenY = cursorRenderY * zoom + panY;

  ctx.save();
  const now = Date.now();

  // Stardust Particle Trail
  if (dist > 1.2 && cursorParticles.length < 24) {
    cursorParticles.push({
      x: screenX + (Math.random() - 0.5) * 6,
      y: screenY + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6 - 0.4,
      size: 1.5 + Math.random() * 2,
      life: 1.0,
      hue: Math.random() > 0.5 ? "#00f0ff" : "#a855f7",
    });
  }

  for (let i = cursorParticles.length - 1; i >= 0; i--) {
    const p = cursorParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.035;
    if (p.life <= 0) {
      cursorParticles.splice(i, 1);
      continue;
    }
    ctx.fillStyle = p.hue === "#00f0ff"
      ? `rgba(0, 240, 255, ${p.life * 0.8})`
      : `rgba(168, 85, 247, ${p.life * 0.8})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }

  // Thinking pulse wave
  const pulsePhase = (now % 1200) / 1200;
  const pulseRadius = 6 + pulsePhase * 16;
  const pulseAlpha = Math.max(0, 0.5 * (1 - pulsePhase));

  ctx.strokeStyle = `rgba(0, 240, 255, ${pulseAlpha})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(screenX, screenY, pulseRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 1. Sleek mint cursor arrow
  ctx.fillStyle = "#a7ffd4";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(screenX, screenY);
  ctx.lineTo(screenX, screenY + 14);
  ctx.lineTo(screenX + 4, screenY + 11);
  ctx.lineTo(screenX + 8, screenY + 18);
  ctx.lineTo(screenX + 11, screenY + 16);
  ctx.lineTo(screenX + 7, screenY + 10);
  ctx.lineTo(screenX + 12, screenY + 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 2. Name badge beside the cursor with glowing indicator dot
  if (cursor.label) {
    ctx.font = "600 11px sans-serif";
    const text = `✦ ${cursor.label}`;
    const textW = ctx.measureText(text).width;
    const labelW = textW + 24;
    const labelH = 22;
    const labelX = screenX + 14;
    const labelY = screenY + 10;

    ctx.fillStyle = "rgba(10, 15, 26, 0.95)";
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, labelW, labelH, 6);
    ctx.fill();

    ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pulsing active dot
    const dotAlpha = 0.5 + Math.sin(now / 150) * 0.4;
    ctx.fillStyle = `rgba(0, 240, 255, ${dotAlpha})`;
    ctx.beginPath();
    ctx.arc(labelX + 8, labelY + labelH / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#a7ffd4";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, labelX + 16, labelY + labelH / 2);
  }

  if (typeof window !== "undefined" && (dist > 0.5 || cursorParticles.length > 0)) {
    requestAnimationFrame(() => window.__vooEditor?.requestRender?.());
  }

  ctx.restore();
}
