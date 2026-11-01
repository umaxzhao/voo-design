import { importedTextCache } from "./imported-text-cache.js";
import { resolvePaintStyle } from "./render-paint-style.js";

// A history-shared cache record owns one parsed path. Weak keys release paths
// when the document and its retained history no longer reference that record.
const paths = new WeakMap();

export function paintImportedText(ctx, node) {
  const cache = importedTextCache(node);
  if (!cache || typeof Path2D === "undefined") return false;
  let path = paths.get(cache);
  if (!path) {
    path = new Path2D(cache.path);
    paths.set(cache, path);
  }
  ctx.save();
  const shadow = node.shadow?.enabled ? node.shadow : null;
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }
  const style = paint => resolvePaintStyle(ctx, paint, node.x, node.y,
    node.width, node.height, node.fillOpacity ?? 1);
  ctx.fillStyle = style(node.fill);
  if (node.stroke && node.strokeWidth > 0) {
    ctx.strokeStyle = resolvePaintStyle(ctx, node.stroke, node.x, node.y,
      node.width, node.height, node.strokeOpacity ?? 1);
    ctx.lineWidth = node.strokeWidth;
    ctx.lineJoin = "round";
  }
  ctx.translate(node.x, node.y);
  ctx.scale(node.width / cache.width, node.height / cache.height);
  if (node.stroke && node.strokeWidth > 0) ctx.stroke(path);
  ctx.fill(path);
  ctx.restore();
  return true;
}
