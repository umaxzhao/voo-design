import { paintedNodeBounds } from "./painted-node-bounds.js";
import { isCustomBlendMode } from "./blend_math.js";
const INNER_STYLES = ["innerShadow", "innerGlow", "satin", "gradientOverlay", "fill", "stroke", "bevel"];
const paintNodes = new WeakMap();
export function isolatedStyleNode(node) {
  let paint = paintNodes.get(node);
  if (!paint) {
    paint = {
      ...node,
      opacity: 1,
      blendMode: "source-over"
    };
    paintNodes.set(node, paint);
  }
  return paint;
}
export function needsStyleIsolation(node, state) {
  return !state?.isolatedStyle && !isCustomBlendMode(node.blendMode) && !(node.backgroundBlur > 0) && !node.effects?.glass?.enabled && INNER_STYLES.some(kind => node.effects?.[kind]?.enabled);
}

/** Inner styles operate on the layer's alpha, never the already painted page. */
export function drawIsolatedStyle(ctx, node, paint) {
  const matrix = ctx.getTransform();
  const bounds = paintedNodeBounds(node);
  const points = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y], [bounds.x, bounds.y + bounds.height], [bounds.x + bounds.width, bounds.y + bounds.height]].map(([x, y]) => ({
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f
  }));
  const left = Math.max(0, Math.floor(Math.min(...points.map(p => p.x))));
  const top = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))));
  const right = Math.min(ctx.canvas.width, Math.ceil(Math.max(...points.map(p => p.x))));
  const bottom = Math.min(ctx.canvas.height, Math.ceil(Math.max(...points.map(p => p.y))));
  if (right <= left || bottom <= top) return;
  const surface = document.createElement("canvas");
  surface.width = right - left;
  surface.height = bottom - top;
  try {
    const context = surface.getContext("2d");
    if (!context) throw new Error("STYLE_CANVAS_UNAVAILABLE");
    context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e - left, matrix.f - top);
    paint(context);
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = node.blendMode ?? "source-over";
      ctx.globalAlpha = node.opacity ?? 1;
      ctx.drawImage(surface, left, top);
    } finally {
      ctx.restore();
    }
  } finally {
    surface.width = surface.height = 0;
  }
}
