import { SELECTION_COLOR } from "./render_nodes.js";
import { docToScreenRect } from "./chrome_coords.js";

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

