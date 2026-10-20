// Screen-space dashed region annotations and label chips.

import {
  REGION_COLOR,
  getRegionColor,
} from "./scene_model_core.js";
import {
  effectivePage,
  isRegionNode,
  regionParts,
} from "./scene_model.js";
import { regionHost, regionOutlineInDoc } from "./doc_ops.js";
import { docToScreenPoint, docToScreenRect } from "./chrome_coords.js";

const REGION_LABEL_FONT_SIZE = 11;
const REGION_LABEL_PADDING_X = 6;
const REGION_LABEL_HEIGHT = 18;
const CHROME_FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/**
 * Draws one region: a dashed violet outline with a label chip.
 *
 * Screen space, not document space — the frame must stay one hairline wide and
 * the label legible whether the user is at 10% or 400%, exactly like the
 * selection chrome. `outline` is the region mapped into document space through
 * its host image's transform, so a rotated picture rotates the annotation with
 * it; a freehand region is its point chain, a box region its four corners.
 */
export function drawRegion(
  ctx,
  region,
  outline,
  viewport,
  withLabel,
  colorHex = REGION_COLOR,
) {
  const screen = outline.points.map((point) =>
    docToScreenPoint(point, viewport),
  );

  ctx.save();
  ctx.fillStyle = `${colorHex}26`;
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(screen[0].x, screen[0].y);
  for (let index = 1; index < screen.length; index += 1) {
    ctx.lineTo(screen[index].x, screen[index].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Only the name goes on the canvas. The detail under it can run to several
  // lines, and a chip that grew with it would cover the artwork it describes;
  // the dot is what says there is more to read.
  const { name, detail } = regionParts(region.label);
  if (!withLabel || !name) return;
  const chipText = detail.length > 0 ? `${name} ·` : name;
  const box = docToScreenRect(outline.box, viewport);

  ctx.save();
  ctx.font = `500 ${REGION_LABEL_FONT_SIZE}px ${CHROME_FONT_FAMILY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const width = ctx.measureText(chipText).width + REGION_LABEL_PADDING_X * 2;
  // Above the frame by default; tucked inside when the box is against the top
  // of the page, so a chip is never clipped away.
  const above = box.y - REGION_LABEL_HEIGHT - 2;
  const top = above >= 0 ? above : box.y + 2;

  ctx.fillStyle = colorHex;
  ctx.fillRect(box.x, top, width, REGION_LABEL_HEIGHT);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(
    chipText,
    box.x + REGION_LABEL_PADDING_X,
    top + REGION_LABEL_HEIGHT / 2,
  );
  ctx.restore();
}

/** Paints the region plane on top of the artwork, clipped to the page. */
export function drawRegions(ctx, doc, viewport, hiddenLabelId) {
  const regions = doc.nodes.filter(isRegionNode);
  if (regions.length === 0) return;

  const page = docToScreenRect(effectivePage(doc), viewport);
  ctx.save();
  ctx.beginPath();
  ctx.rect(page.x, page.y, page.width, page.height);
  ctx.clip();
  regions.forEach((region, index) => {
    // A region rides its host image: a hidden picture hides its annotations
    // with it, and a deleted host leaves nothing to draw.
    // Also respects the region layer's own visibility toggle (visible: false).
    if (region.visible === false) return;
    const host = regionHost(doc, region);
    if (!host || host.visible === false) return;
    const outline = regionOutlineInDoc(doc, region);
    if (!outline) return;
    const color = region.color || getRegionColor(index).hex;
    drawRegion(
      ctx,
      region,
      outline,
      viewport,
      region.id !== hiddenLabelId,
      color,
    );
  });
  ctx.restore();
}
