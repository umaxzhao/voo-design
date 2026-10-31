import { luminanceToAlpha } from "./mask-alpha.js";
import { isHiddenByGroup } from "./scene_model.js";
import { drawNode } from "./render_nodes.js";
import { withFrameClips } from "./render-frame-clips.js";
import { containerMaskNode } from "./container-opacity.js";

/** Mask the completed subtree, never just the Frame surface beneath its children. */
export function applyContainerMask(ctx, container, options, seen = new Set()) {
  const { doc, isolatedContainers, opacityPlan, frameClips, bitmapOf, maskOf,
    gpu, bypassAdjustments, docVersion } = options;
  const base = opacityPlan.nodeOf(container.clipTo);
  const canvas = document.createElement("canvas");
  canvas.width = ctx.canvas.width; canvas.height = ctx.canvas.height;
  try {
    const mask = canvas.getContext("2d");
    if (!mask) throw new Error("Container masking requires a Canvas2D context");
    mask.setTransform(ctx.getTransform());
    if (base && !seen.has(base.id) && base.visible !== false && !isHiddenByGroup(doc, base)) {
      seen.add(base.id);
      const paint = containerMaskNode(base, isolatedContainers, opacityPlan);
      withFrameClips(mask, frameClips.framesOf(base), () => drawNode(mask, paint,
        bitmapOf, maskOf, gpu, bypassAdjustments, { docVersion, outputKey: `${canvas.width}x${canvas.height}|container-mask` }));
      if (base.maskType === "luminance") {
        const image = mask.getImageData(0, 0, canvas.width, canvas.height);
        luminanceToAlpha(image.data);
        mask.putImageData(image, 0, 0);
      }
      if (base.clipTo) applyContainerMask(mask, base, options, seen);
    }
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(canvas, 0, 0);
    } finally { ctx.restore(); }
  } finally { canvas.width = canvas.height = 0; }
}
