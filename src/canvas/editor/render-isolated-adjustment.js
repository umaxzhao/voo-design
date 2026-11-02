import { applyAdjustmentsToCanvas } from "./cpu_adjustments.js";
import { blendPixel, isCustomBlendMode } from "./blend_math.js";
import { withFrameClips } from "./render-frame-clips.js";

function surface(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Isolated adjustments require a Canvas2D context");
  return { canvas, ctx };
}

function nativeBlend(original, adjusted, mode, width, height) {
  const dst = surface(width, height), src = surface(width, height);
  try {
    const opaque = (pixels, target) => {
      const image = target.createImageData(width, height);
      image.data.set(pixels);
      for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
      target.putImageData(image, 0, 0);
    };
    opaque(original, dst.ctx); opaque(adjusted, src.ctx);
    dst.ctx.globalCompositeOperation = mode;
    dst.ctx.drawImage(src.canvas, 0, 0);
    return dst.ctx.getImageData(0, 0, width, height).data;
  } finally { dst.canvas.width = src.canvas.width = 0; }
}

/** Filter the isolated backdrop, then interpolate premultiplied pixels once. */
export function drawIsolatedAdjustment(ctx, node, doc, frames, maskOf) {
  const width = ctx.canvas.width, height = ctx.canvas.height;
  const original = ctx.getImageData(0, 0, width, height);
  const filtered = surface(width, height);
  let matte = null;
  try {
    filtered.ctx.putImageData(original, 0, 0);
    applyAdjustmentsToCanvas(filtered.canvas, node.adjustments);
    const filteredPixels = filtered.ctx.getImageData(0, 0, width, height).data;
    let adjusted = filteredPixels;
    const mode = node.blendMode ?? "source-over";
    const custom = isCustomBlendMode(mode);
    if (!custom && mode !== "normal" && mode !== "source-over") {
      adjusted = nativeBlend(original.data, adjusted, mode, width, height);
    }
    const selectionMask = node.maskId ? maskOf?.(node) : null;
    let weights = null;
    if (frames.length || selectionMask) {
      matte = surface(width, height);
      const world = ctx.getTransform();
      matte.ctx.setTransform(world);
      withFrameClips(matte.ctx, frames, () => {
        matte.ctx.setTransform(1, 0, 0, 1, 0, 0);
        matte.ctx.fillStyle = "#ffffff";
        matte.ctx.fillRect(0, 0, width, height);
        if (selectionMask) {
          matte.ctx.setTransform(world);
          matte.ctx.globalCompositeOperation = "destination-in";
          matte.ctx.drawImage(selectionMask, 0, 0, doc.width, doc.height);
        }
      });
      weights = matte.ctx.getImageData(0, 0, width, height).data;
    }
    const opacity = Math.max(0, Math.min(1, node.opacity ?? 1));
    for (let i = 0; i < original.data.length; i += 4) {
      const beforeAlpha = original.data[i + 3] / 255;
      const filteredAlpha = filteredPixels[i + 3] / 255;
      if (!beforeAlpha && !filteredAlpha) continue;
      const mix = opacity * (weights ? weights[i + 3] / 255 : 1);
      const alpha = beforeAlpha * (1 - mix) + filteredAlpha * mix;
      let colour = null;
      if (custom && beforeAlpha) {
        const pixel = (data) => ({ r: data[i] / 255, g: data[i + 1] / 255, b: data[i + 2] / 255, a: 1 });
        colour = blendPixel(mode, pixel(original.data), pixel(adjusted), (i / 4) % width, Math.floor(i / 4 / width));
      }
      for (let channel = 0; channel < 3; channel += 1) {
        const value = colour ? [colour.r, colour.g, colour.b][channel] * 255
          : beforeAlpha ? adjusted[i + channel] : filteredPixels[i + channel];
        original.data[i + channel] = alpha ?
          (original.data[i + channel] * beforeAlpha * (1 - mix) + value * filteredAlpha * mix) / alpha : 0;
      }
      original.data[i + 3] = alpha * 255;
    }
    ctx.putImageData(original, 0, 0);
  } finally {
    filtered.canvas.width = filtered.canvas.height = 0;
    if (matte) matte.canvas.width = matte.canvas.height = 0;
  }
}
