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
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(screen.x, screen.y, screen.width, screen.height);
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
 * eight resize handles, and a rotation grip above the top edge.
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

  // Eight resize handles, square like the object-selection handles.
  const size = 7 / viewport.zoom;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1 / viewport.zoom;
  const points = [
    [rect.x, rect.y],
    [cx, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, cy],
    [rect.x + rect.width, rect.y + rect.height],
    [cx, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
    [rect.x, cy],
  ];
  for (const [hx, hy] of points) {
    ctx.fillRect(hx - size / 2, hy - size / 2, size, size);
    ctx.strokeRect(hx - size / 2, hy - size / 2, size, size);
  }
  ctx.restore();
}

/** Draws alignment snapping guide lines (vertical & horizontal). */
export function drawGuides(ctx, guides, viewport, dpr) {
  if (!guides || guides.length === 0) return;
  const { canvas } = ctx;
  // The canvas backing store is sized at the render dpr (1 during a draft
  // stroke), so the logical extent must divide by that — not the display's.
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;

  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  for (const guide of guides) {
    ctx.beginPath();
    if (guide.type === "v") {
      const screenX =
        Math.round(guide.pos * viewport.zoom + viewport.panX) + 0.5;
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, height);
    } else if (guide.type === "h") {
      const screenY =
        Math.round(guide.pos * viewport.zoom + viewport.panY) + 0.5;
      ctx.moveTo(0, screenY);
      ctx.lineTo(width, screenY);
    }
    ctx.stroke();
  }
  ctx.restore();
}
