// Per-pixel custom blend mode composition and offscreen backdrop caching for PSD blend modes.

import { CUSTOM_BLEND_MODES } from "./blend_math.js";
import { nodeAABB } from "./scene_geometry.js";
import { NODE_KIND } from "./scene_model.js";
import {
  getRenderCache,
  renderSignature,
  setRenderCache,
} from "./render_cache.js";

/**
 * Applies a node's render-time transform (rotation + shear + flip around its box
 * centre) to a context. Shared by the direct draw and the offscreen pass of
 * the per-pixel blend modes.
 */
export function applyNodeTransform(ctx, node) {
  const rotation = node?.rotation ?? 0;
  const shear = node?.shear ?? 0;
  const isImage = node?.kind === NODE_KIND.IMAGE;
  const flipH = !isImage && Boolean(node?.flipH);
  const flipV = !isImage && Boolean(node?.flipV);
  if (!rotation && !shear && !flipH && !flipV) return;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  ctx.translate(cx, cy);
  if (rotation) ctx.rotate((rotation * Math.PI) / 180);
  if (shear) ctx.transform(1, 0, Math.tan((shear * Math.PI) / 180), 1, 0, 0);
  if (flipH || flipV) ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.translate(-cx, -cy);
}

/**
 * Composites a custom-blend-mode source over a backdrop per pixel, writing the
 * result into `backdrop.data` in place.
 *
 * Bit-identical to calling blendPixel once per pixel (the pre-optimization
 * inner loop): same blend-math values, same per-channel source-over
 * compositing, same dissolve dither. It only changes HOW that composition is
 * computed — the mode's blend function is resolved once instead of every
 * pixel, the two per-pixel backdrop/source objects are reused (no per-pixel
 * allocation), the source-over `over()` compositing is inlined instead of
 * allocating an intermediate result object, and pixel coordinates are only
 * derived when the mode actually needs them (dissolve). For every non-dissolve
 * mode the coords are ignored by blendPixel, so skipping them cannot change
 * the result.
 *
 * @param {{data:Uint8ClampedArray}} backdrop the dst ImageData (mutated in place)
 * @param {{data:Uint8ClampedArray}} source the node's own pixels (read only)
 * @param {string} mode a CUSTOM_BLEND_MODES key
 * @param {number} w backdrop width in px (used only by dissolve's coordinate dither)
 */
export function compositeCustomBlend(backdrop, source, mode, w) {
  const data = backdrop.data;
  const sdata = source.data;
  const modeFn = CUSTOM_BLEND_MODES[mode];
  const dst = { r: 0, g: 0, b: 0, a: 0 };
  const src = { r: 0, g: 0, b: 0, a: 0 };
  const dissolveMode = mode === "dissolve";
  for (let i = 0; i < data.length; i += 4) {
    const px = dissolveMode ? (i / 4) % w : 0;
    const py = dissolveMode ? Math.floor(i / 4 / w) : 0;
    dst.r = data[i] / 255;
    dst.g = data[i + 1] / 255;
    dst.b = data[i + 2] / 255;
    dst.a = data[i + 3] / 255;
    src.r = sdata[i] / 255;
    src.g = sdata[i + 1] / 255;
    src.b = sdata[i + 2] / 255;
    src.a = sdata[i + 3] / 255;
    if (dissolveMode) {
      const h = Math.sin(px * 127.1 + py * 311.7) * 43758.5453;
      if (h - Math.floor(h) < src.a) {
        data[i] = src.r * 255;
        data[i + 1] = src.g * 255;
        data[i + 2] = src.b * 255;
        data[i + 3] = 255;
      } else {
        data[i] = dst.r * 255;
        data[i + 1] = dst.g * 255;
        data[i + 2] = dst.b * 255;
        data[i + 3] = dst.a * 255;
      }
      continue;
    }
    const blended = modeFn(dst, src);
    // Same clamp blend_math applies to the composite alpha (`n(src.a + dst.a * (1 - src.a))`).
    const a0 = src.a + dst.a * (1 - src.a);
    const a = a0 > 1 ? 1 : a0 < 0 ? 0 : a0;
    if (a <= 0) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
      continue;
    }
    const inv = 1 - src.a;
    data[i] = ((blended.r * src.a + dst.r * dst.a * inv) / a) * 255;
    data[i + 1] = ((blended.g * src.a + dst.g * dst.a * inv) / a) * 255;
    data[i + 2] = ((blended.b * src.a + dst.b * dst.a * inv) / a) * 255;
    data[i + 3] = a * 255;
  }
}

/**
 * Composites a node whose blend mode has no canvas GCO equivalent (see
 * blend_math.js) per-pixel: the node paints to an offscreen canvas sized to
 * its on-screen box, the backdrop behind it is read from the main canvas,
 * and the two are blended pixel by pixel before being written back.
 *
 * Only runs for the handful of PSD-only modes, so the read-modify-write cost
 * is paid by exactly the layers that need it.
 */
export function drawCustomBlendNode(ctx, node, paintBody, renderState) {
  const transform = ctx.getTransform();
  const box = nodeAABB(node);
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ].map((point) => transform.transformPoint(point));
  const left = Math.min(...corners.map((p) => p.x));
  const top = Math.min(...corners.map((p) => p.y));
  const right = Math.max(...corners.map((p) => p.x));
  const bottom = Math.max(...corners.map((p) => p.y));
  const x = Math.floor(left);
  const y = Math.floor(top);
  const w = Math.max(1, Math.ceil(right) - x);
  const h = Math.max(1, Math.ceil(bottom) - y);

  // `e/f` only contribute their fractional part: integer panning can move the
  // completed pixel tile, while sub-pixel translation changes antialiasing.
  const fractionalOffset = `${left - Math.floor(left)},${top - Math.floor(top)}`;
  const cacheKey = renderState
    ? `${renderState.docVersion}|${renderState.backdropGeneration}|${renderSignature(node)}|${w}x${h}|${transform.a},${transform.b},${transform.c},${transform.d}|${fractionalOffset}|${renderState.outputKey}`
    : null;
  const cached = cacheKey ? getRenderCache("customBlend", cacheKey) : null;
  if (cached) {
    ctx.drawImage(cached, x, y);
    return;
  }

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  octx.setTransform(transform);
  octx.translate(-x, -y);
  applyNodeTransform(octx, node);
  paintBody(octx);

  const backdrop = ctx.getImageData(x, y, w, h);
  const source = octx.getImageData(0, 0, w, h);
  compositeCustomBlend(backdrop, source, node.blendMode, w);
  if (cacheKey) {
    const result = document.createElement("canvas");
    result.width = w;
    result.height = h;
    const resultCtx = result.getContext("2d");
    if (resultCtx) {
      resultCtx.putImageData(backdrop, 0, 0);
      setRenderCache("customBlend", cacheKey, result);
      ctx.drawImage(result, x, y);
      return;
    }
  }
  ctx.putImageData(backdrop, x, y);
}
