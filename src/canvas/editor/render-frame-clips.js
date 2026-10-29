import { roundRectPath } from "./render_basic_shapes.js";
import { applyNodeTransform } from "./render_custom_blend.js";

/** Clips persist in device space while child coordinates remain world based. */
export function withFrameClips(ctx, frames, paint) {
  if (!frames.length) return paint(ctx);
  ctx.save();
  try {
    const world = ctx.getTransform();
    for (const frame of frames) {
      applyNodeTransform(ctx, frame);
      ctx.beginPath();
      roundRectPath(ctx, frame.x, frame.y, frame.width, frame.height, frame.cornerRadius ?? 0);
      ctx.clip();
      ctx.setTransform(world);
    }
    return paint(ctx);
  } finally {
    ctx.restore();
  }
}
