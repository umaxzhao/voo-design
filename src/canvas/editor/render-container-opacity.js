import { containerOpacity, containerBlendMode } from "./container-opacity.js";
import { effectivePage } from "./scene_model.js";
import { isCustomBlendMode } from "./blend_math.js";
import { compositeCustomBlend } from "./render_custom_blend.js";
import { withFrameClips } from "./render-frame-clips.js";

function compositeCustomContainer(ctx, layer, target, opacity, mode) {
  const { width, height } = layer;
  const backdrop = ctx.getImageData(0, 0, width, height);
  const source = target.getImageData(0, 0, width, height);
  for (let i = 3; i < source.data.length; i += 4) source.data[i] *= opacity * ctx.globalAlpha;
  compositeCustomBlend(backdrop, source, mode, width);
  target.putImageData(backdrop, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "copy";
  ctx.drawImage(layer, 0, 0);
}

/** Paint in device-sized space so unbounded scenes, camera pan and zoom agree. */
export function drawContainerOpacity(ctx, container, paint, doc) {
  const opacity = containerOpacity(container);
  if (opacity === 0 || container.visible === false) return;
  const layer = document.createElement("canvas");
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  try {
    const target = layer.getContext("2d");
    if (!target) throw new Error("Container composition requires a Canvas2D context");
    target.setTransform(ctx.getTransform());
    if (doc && !doc.isCanvasRoot) {
      withFrameClips(target, [{ ...effectivePage(doc), cornerRadius: doc.cornerRadius ?? 0 }], () => paint(target));
    } else paint(target);
    ctx.save();
    try {
      // The ancestor clip remains in device space across this transform reset.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const mode = containerBlendMode(container);
      if (isCustomBlendMode(mode)) {
        compositeCustomContainer(ctx, layer, target, opacity, mode);
        return;
      }
      ctx.globalCompositeOperation = mode;
      if (ctx.globalCompositeOperation !== mode) throw new Error(`Unsupported container blend mode: ${mode}`);
      ctx.globalAlpha *= opacity;
      ctx.drawImage(layer, 0, 0);
    } finally { ctx.restore(); }
  } finally {
    layer.width = layer.height = 0;
  }
}
