import { bevelAlphaMap } from "./bevel-alpha.js";
const cache = new WeakMap();
const MAX_EFFECT_DIMENSION = 2048;

/** Raster and vector bodies share the same alpha-aware bevel; transparent pixels stay clear. */
export function drawBevelOverlay(ctx, node, effect, paintBody) {
  if (!effect?.enabled || !(effect.size > 0) || !(effect.depth > 0) || !paintBody) return;
  if (!(node.width > 0) || !(node.height > 0)) return;
  const key = JSON.stringify([node.imageId, node.maskId, node.version, node.width, node.height, effect]);
  let entry = cache.get(node);
  if (entry?.key !== key) {
    const scale = Math.min(1, MAX_EFFECT_DIMENSION / Math.max(node.width, node.height));
    const surface = document.createElement("canvas");
    surface.width = Math.max(1, Math.ceil(node.width * scale));
    surface.height = Math.max(1, Math.ceil(node.height * scale));
    const context = surface.getContext("2d");
    if (!context) throw new Error("BEVEL_CANVAS_UNAVAILABLE");
    context.save();
    context.scale(scale, scale);
    context.translate(-node.x, -node.y);
    paintBody(context);
    context.restore();
    const pixels = context.getImageData(0, 0, surface.width, surface.height);
    const alpha = new Uint8Array(surface.width * surface.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels.data[i * 4 + 3];
    pixels.data.set(bevelAlphaMap(alpha, surface.width, surface.height, {
      ...effect,
      size: effect.size * scale
    }));
    context.putImageData(pixels, 0, 0);
    entry = {
      key,
      surface
    };
    cache.set(node, entry);
  }
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(entry.surface, node.x, node.y, node.width, node.height);
  ctx.restore();
}
