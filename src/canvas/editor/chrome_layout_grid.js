/**
 * Stage chrome: draws every frame's enabled layout grid.
 *
 * Like rulers and guides this is view-only chrome — exports and raster
 * previews never receive it, and it is clipped to the frame that owns it.
 */

import { gridColour, layoutGridGeometry } from "./layout_grid.js";
import { isHiddenByGroup } from "./scene_model.js";

function nodeGridBox(node) {
  const width = Number(node?.width);
  const height = Number(node?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    x: Number(node.x) || 0,
    y: Number(node.y) || 0,
    width,
    height,
  };
}

export function drawLayoutGrids(ctx, doc, viewport, { hiddenNodeId = null } = {}) {
  const nodes = doc?.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return;
  const zoom = viewport?.zoom || 1;

  for (const node of nodes) {
    if (!node || node.id === hiddenNodeId) continue;
    if (node.visible === false || node.layoutGrid?.enabled === false) continue;
    if (!node.layoutGrid || isHiddenByGroup(doc, node)) continue;
    const box = nodeGridBox(node);
    if (!box) continue;
    const geometry = layoutGridGeometry(box, node.layoutGrid);
    if (!geometry.bands.length && !geometry.lines.length) continue;

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.width, box.height);
    ctx.clip();

    if (geometry.bands.length) {
      ctx.fillStyle = gridColour(geometry.colour, geometry.opacity);
      for (const band of geometry.bands) {
        ctx.fillRect(band.x, band.y, band.width, band.height);
      }
    }

    if (geometry.lines.length) {
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of geometry.lines) {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.strokeStyle = gridColour(geometry.colour, 0.3);
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
    }
    ctx.restore();
  }
}
