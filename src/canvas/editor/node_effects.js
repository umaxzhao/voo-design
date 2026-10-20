/**
 * Node-level effects — drop shadow, outer glow, colour overlay, stroke,
 * bevel/emboss — painted in `drawNode` (scene_renderer.js).
 *
 * The shadow and glow render behind the node as separate silhouette passes so
 * each can carry its own blur/offset/colour; the body is then painted clean on
 * top with the node's blend mode, so a translucent body never double-blends.
 * Colour overlay re-tints the body through its own alpha; the stroke rings
 * the silhouette; bevel overlays the body last, clipped to the node's outline.
 */

import {
  buildInnerGlow,
  buildInnerShadow,
  buildSatin,
  buildStrokeRing,
} from "./stroke_filter.js";

const effectBitmapCache = new WeakMap();

function effectCacheKey(node, kind, effect) {
  return `${kind}|${node.version ?? ""}|${node.imageId ?? ""}|${node.maskId ?? ""}|${node.width}x${node.height}|${JSON.stringify(effect)}`;
}

/** #rrggbb to [r, g, b] bytes. */
function hexToRgb(hex) {
  const h =
    typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

/**
 * Renders an effect whose shape is a per-pixel alpha map of the node's
 * silhouette: re-paint the body to an offscreen canvas the size of the node's
 * box, derive the map from its alpha, colour it, and draw it back over the
 * body at the effect's opacity.
 */
function paintAlphaMap(
  ctx,
  node,
  paintBody,
  buildMap,
  color,
  opacity,
  cacheKey,
) {
  if (!(opacity > 0)) return;
  const width = node.width;
  const height = node.height;
  if (!(width > 0) || !(height > 0)) return;

  const cached = effectBitmapCache.get(node)?.get(cacheKey);
  if (cached) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = opacity;
    ctx.drawImage(cached, node.x, node.y, width, height);
    ctx.restore();
    return;
  }

  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.ceil(width));
  off.height = Math.max(1, Math.ceil(height));
  const octx = off.getContext("2d");
  octx.save();
  octx.translate(-node.x, -node.y);
  paintBody(octx);
  octx.restore();

  const pixels = octx.getImageData(0, 0, off.width, off.height);
  const alpha = new Uint8Array(off.width * off.height);
  for (let i = 0; i < alpha.length; i += 1) {
    alpha[i] = pixels.data[i * 4 + 3];
  }
  const map = buildMap(alpha, off.width, off.height);
  if (!map) return;

  const mapCanvas = document.createElement("canvas");
  mapCanvas.width = off.width;
  mapCanvas.height = off.height;
  const mctx = mapCanvas.getContext("2d");
  const image = mctx.createImageData(off.width, off.height);
  const [cr, cg, cb] = hexToRgb(color);
  for (let i = 0; i < map.length; i += 1) {
    image.data[i * 4] = cr;
    image.data[i * 4 + 1] = cg;
    image.data[i * 4 + 2] = cb;
    image.data[i * 4 + 3] = map[i];
  }
  mctx.putImageData(image, 0, 0);
  let entries = effectBitmapCache.get(node);
  if (!entries) {
    entries = new Map();
    effectBitmapCache.set(node, entries);
  }
  entries.clear();
  entries.set(cacheKey, mapCanvas);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = opacity;
  ctx.drawImage(mapCanvas, node.x, node.y, width, height);
  ctx.restore();
}

/**
 * Inner shadow: the silhouette's own cast inside its edge, offset by the
 * light direction and blurred. The band where the shifted silhouette no
 * longer covers the shape is the shadow.
 */
export function drawInnerShadowOverlay(ctx, node, effect, paintBody) {
  paintAlphaMap(
    ctx,
    node,
    paintBody,
    (alpha, width, height) =>
      buildInnerShadow(
        alpha,
        width,
        height,
        effect.offsetX ?? 0,
        effect.offsetY ?? 0,
        effect.blur ?? 8,
      ),
    effect.color,
    (effect.opacity ?? 100) / 100,
    effectCacheKey(node, "innerShadow", effect),
  );
}

/** Inner glow: a soft halo hugging the inside of the silhouette edge. */
export function drawInnerGlowOverlay(ctx, node, effect, paintBody) {
  paintAlphaMap(
    ctx,
    node,
    paintBody,
    (alpha, width, height) =>
      buildInnerGlow(alpha, width, height, effect.size ?? 8, effect.blur ?? 8),
    effect.color,
    (effect.opacity ?? 100) / 100,
    effectCacheKey(node, "innerGlow", effect),
  );
}

/** Satin: the sheen ripple from the silhouette offset against itself. */
export function drawSatinOverlay(ctx, node, effect, paintBody) {
  const radians = ((effect.angle ?? 120) * Math.PI) / 180;
  const distance = effect.distance ?? 5;
  paintAlphaMap(
    ctx,
    node,
    paintBody,
    (alpha, width, height) =>
      buildSatin(
        alpha,
        width,
        height,
        Math.round(Math.cos(radians) * distance),
        Math.round(Math.sin(radians) * distance),
        effect.blur ?? 8,
        effect.invert === true,
      ),
    effect.color,
    (effect.opacity ?? 100) / 100,
    effectCacheKey(node, "satin", effect),
  );
}

/**
 * Gradient overlay: a linear gradient painted over the body through its own
 * alpha (`source-atop`), at an angle (0° = gradient running upward) and
 * opacity. Drawn after the body so the gradient covers it.
 */
export function drawGradientOverlayEffect(ctx, node, effect) {
  const opacity = (effect.opacity ?? 100) / 100;
  const stops = effect.stops;
  if (!(opacity > 0) || !Array.isArray(stops) || stops.length < 2) return;
  const width = node.width;
  const height = node.height;
  if (!(width > 0) || !(height > 0)) return;

  const angleRad = ((effect.angle ?? 90) * Math.PI) / 180;
  const dx = Math.sin(angleRad);
  const dy = -Math.cos(angleRad);
  const cx = node.x + width / 2;
  const cy = node.y + height / 2;
  const len = Math.hypot(width, height);
  const fromX = cx - dx * len;
  const fromY = cy - dy * len;
  const toX = cx + dx * len;
  const toY = cy + dy * len;

  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = opacity;
  const gradient = ctx.createLinearGradient(fromX, fromY, toX, toY);
  for (const stop of stops) {
    gradient.addColorStop(Math.max(0, Math.min(1, stop.location)), stop.color);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(node.x, node.y, width, height);
  ctx.restore();
}

export {
  nodeOutlinePath,
  booleanSourceBoxPath,
  paintShadowBehind,
  drawBevelOverlay,
} from "./node_effects_shadow.js";

/**
 * Colour overlay (Photoshop's solid fill): paints the fill colour over the
 * node's own pixels where they have alpha, at the fill's opacity. `source-
 * atop` keeps the body's silhouette while re-colouring it — the shape stays,
 * the paint becomes the colour. Drawn after the body so the tint covers it.
 */
export function drawColorOverlay(ctx, node, fill) {
  const opacity = (fill.opacity ?? 100) / 100;
  if (!(opacity > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = opacity;
  ctx.fillStyle = fill.color;
  ctx.fillRect(node.x, node.y, node.width, node.height);
  ctx.restore();
}

/**
 * Stroke overlay: rings the node's silhouette with the stroke colour at the
 * stroke width, inside / centered on / outside the edge. The body is
 * re-painted to an offscreen canvas the size of the node's box, its alpha is
 * the shape, and the ring band is computed from the dilated/eroded alpha
 * (stroke_filter.js). Painted over the body, so the ring reads as an outline
 * on top of the node's own paint.
 */
export function drawStrokeOverlay(ctx, node, stroke, paintBody) {
  const opacity = (stroke.opacity ?? 100) / 100;
  const strokeWidth = stroke.width ?? 2;
  const width = node.width;
  const height = node.height;
  if (!(opacity > 0) || !(strokeWidth > 0) || !(width > 0) || !(height > 0))
    return;

  paintAlphaMap(
    ctx,
    node,
    paintBody,
    (alpha, mapWidth, mapHeight) =>
      buildStrokeRing(
        alpha,
        mapWidth,
        mapHeight,
        strokeWidth,
        stroke.position ?? "center",
      ),
    stroke.color,
    opacity,
    effectCacheKey(node, "stroke", stroke),
  );
}

