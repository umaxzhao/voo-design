/**
 * Shadow, glow, and bevel outline rendering for node effects.
 *
 * Extracted from node_effects.js to keep both modules under 400 lines.
 */

import { resolveCornerRadii } from "./scene_model_core.js";

/**
 * Builds a Path2D for the node's silhouette, in document space.
 *
 * Returns null when the node has no usable closed outline (a lone tap, an
 * open stroke) — effects then fall back to the node's box.
 */
export function nodeOutlinePath(ctx, node) {
  const path = new Path2D();
  const width = node.width;
  const height = node.height;
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  switch (node.kind) {
    case "rect": {
      const radii = resolveCornerRadii(node.cornerRadius, width, height);
      const hasAny = radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0;
      if (!hasAny) {
        path.rect(x, y, width, height);
      } else if (radii.isUniform) {
        const radius = radii.uniformRadius;
        if (typeof path.roundRect === "function") {
          path.roundRect(x, y, width, height, radius);
        } else {
          path.moveTo(x + radius, y);
          path.arcTo(x + width, y, x + width, y + height, radius);
          path.arcTo(x + width, y + height, x, y + height, radius);
          path.arcTo(x, y + height, x, y, radius);
          path.arcTo(x, y, x + width, y, radius);
          path.closePath();
        }
      } else if (typeof path.roundRect === "function") {
        path.roundRect(x, y, width, height, radii.asArray);
      } else {
        const { tl, tr, br, bl } = radii;
        path.moveTo(x + tl, y);
        path.lineTo(x + width - tr, y);
        if (tr > 0) path.arcTo(x + width, y, x + width, y + tr, tr);
        path.lineTo(x + width, y + height - br);
        if (br > 0) path.arcTo(x + width, y + height, x + width - br, y + height, br);
        path.lineTo(x + bl, y + height);
        if (bl > 0) path.arcTo(x, y + height, x, y + height - bl, bl);
        path.lineTo(x, y + tl);
        if (tl > 0) path.arcTo(x, y, x + tl, y, tl);
        path.closePath();
      }
      return path;
    }
    case "ellipse": {
      path.ellipse(
        x + width / 2,
        y + height / 2,
        width / 2,
        height / 2,
        0,
        0,
        Math.PI * 2,
      );
      return path;
    }
    case "path":
    case "pen": {
      const points = node.points;
      if (!Array.isArray(points) || points.length === 0) return null;
      const scaleX = node.baseWidth ? width / node.baseWidth : 1;
      const scaleY = node.baseHeight ? height / node.baseHeight : 1;
      const P = (point, offset) => ({
        x: (point.x + (offset ? offset[0] : 0)) * scaleX,
        y: (point.y + (offset ? offset[1] : 0)) * scaleY,
      });
      if (node.kind === "pen") {
        const closed = points[points.length - 1]?.close === true;
        if (!closed && points.length < 2) return null;
        const first = P(points[0]);
        path.moveTo(first.x, first.y);
        for (let index = 1; index < points.length; index += 1) {
          const from = points[index - 1];
          const to = points[index];
          if (from.out || to.in) {
            const c1 = P(from, from.out);
            const c2 = P(to, to.in);
            const end = P(to);
            path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
          } else {
            const end = P(to);
            path.lineTo(end.x, end.y);
          }
        }
        if (closed) path.closePath();
        return path;
      }
      // A stroked brush path has no closed outline to clip or fill; effects
      // fall back to the node's box so the shadow still reads.
      return null;
    }
    case "boolean": {
      const sources = node.sources ?? [];
      if (sources.length === 0) return null;
      for (const source of sources) {
        const sub = booleanSourceBoxPath(source, 0, 0);
        if (sub) path.addPath(sub);
      }
      return path;
    }
    case "image":
    case "text":
      // Images and text have complex silhouettes: return null to let
      // paintShadowBehind paint the real body (glyphs / bitmap pixels) with shadow.
      return null;
    default:
  }
}

/** One boolean source as a path, offset into the node's document space. */
export function booleanSourceBoxPath(source, nodeX, nodeY) {
  const path = new Path2D();
  const x = nodeX + (source.x ?? 0);
  const y = nodeY + (source.y ?? 0);
  const width = source.w ?? source.width ?? 0;
  const height = source.h ?? source.height ?? 0;
  if (source.type === "ellipse") {
    path.ellipse(
      x + width / 2,
      y + height / 2,
      width / 2,
      height / 2,
      0,
      0,
      Math.PI * 2,
    );
  } else {
    path.rect(x, y, width, height);
  }
  return path;
}

/**
 * Paints a drop-shadow or glow silhouette behind the node.
 *
 * `effect` is either a shadow `{ color, blur, offsetX, offsetY, opacity }` or a
 * glow `{ color, blur, spread, opacity }`; `paintBody` draws the node's own
 * content. The silhouette is filled with the effect colour at its opacity so
 * the shadow reads even when the body is empty; the real body overpaints it.
 */
export function paintShadowBehind(ctx, node, effect, paintBody) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = effect.color;
  ctx.shadowBlur = effect.blur;
  ctx.shadowOffsetX = effect.offsetX ?? 0;
  ctx.shadowOffsetY = effect.offsetY ?? 0;

  const outline = nodeOutlinePath(ctx, node);
  const alpha = (effect.opacity ?? 100) / 100;
  if (outline) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = effect.color;
    ctx.fill(outline);
    // Spread grows the silhouette outward by the same amount on every side: a
    // stroke of twice the spread in the shadow colour, joined round.
    const spread = effect.spread ?? 0;
    if (spread > 0) {
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = spread * 2;
      ctx.lineJoin = "round";
      ctx.stroke(outline);
    }
  } else {
    // Fall back to painting the body itself with the shadow attached — the
    // only way to shadow content with no closed outline.
    ctx.globalAlpha = alpha;
    paintBody();
  }
  ctx.restore();
}

export { drawBevelOverlay } from "./node-effects-bevel.js";
