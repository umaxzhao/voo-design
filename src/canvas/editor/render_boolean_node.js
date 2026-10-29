/** Native strokes follow the merged Boolean silhouette, including holes. */
import { booleanOutlineNode } from "./boolean-outline.js";
import { penOutlinePath } from "./render_pen_node.js";
import { resolvePaintStyle } from "./render_basic_shapes.js";
import { dashPatternFor, effectiveStrokeCap, normalizeStrokeProps } from "./stroke_style.js";
import { boundsOfPoints } from "./scene_geometry_bounds.js";

export function drawBooleanNode(ctx, node) {
  const merged = booleanOutlineNode(node);
  if (!merged.points.length) return;
  const outline = penOutlinePath(merged);
  const paint = (value, opacity) => resolvePaintStyle(ctx, value,
    node.x, node.y, node.width, node.height, opacity);
  if (node.fill && node.fill !== "transparent" && (node.fillOpacity ?? 1) > 0) {
    ctx.fillStyle = paint(node.fill, node.fillOpacity ?? 1);
    ctx.fill(outline, "evenodd");
  }
  if (node.strokeHidden || !(node.strokeWidth > 0) || !node.stroke ||
    node.stroke === "transparent" || !((node.strokeOpacity ?? 1) > 0)) return;

  const style = normalizeStrokeProps(merged);
  ctx.save();
  ctx.strokeStyle = paint(node.stroke, node.strokeOpacity ?? 1);
  ctx.lineWidth = node.strokeWidth * (style.align === "center" ? 1 : 2);
  ctx.lineCap = effectiveStrokeCap(style.cap, style.dash);
  ctx.lineJoin = style.join;
  ctx.miterLimit = style.miterLimit;
  ctx.setLineDash(dashPatternFor(style.dash, node.strokeWidth));
  if (style.align === "inside") ctx.clip(outline, "evenodd");
  else if (style.align === "outside") {
    // Bound the inverse clip by actual geometry and stroke expansion so it
    // works for distant artwork without an arbitrary fixed world extent.
    const bounds = boundsOfPoints(merged.points.map((point) => [node.x + point.x, node.y + point.y]));
    const pad = node.strokeWidth * Math.max(1, style.miterLimit) + 1;
    const inverse = new Path2D();
    inverse.rect(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);
    inverse.addPath(outline);
    ctx.clip(inverse, "evenodd");
  }
  ctx.stroke(outline);
  ctx.restore();
}
