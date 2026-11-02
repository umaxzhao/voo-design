import { roundRectPath } from "./render_basic_shapes.js";
import { applyNodeTransform } from "./render_custom_blend.js";

function applyFrameClips(ctx, frames) {
  const world = ctx.getTransform();
  for (const frame of frames) {
    applyNodeTransform(ctx, frame);
    ctx.beginPath();
    roundRectPath(ctx, frame.x, frame.y, frame.width, frame.height, frame.cornerRadius ?? 0);
    ctx.clip();
    ctx.setTransform(world);
  }
}

/** Clips persist in device space while child coordinates remain world based. */
export function withFrameClips(ctx, frames, paint) {
  if (!frames.length) return paint(ctx);
  ctx.save();
  try {
    applyFrameClips(ctx, frames);
    return paint(ctx);
  } finally {
    ctx.restore();
  }
}

/** Share ancestor clips only across consecutive paints on the same context. */
export function createFrameClipRun(ctx) {
  let active = [];
  const close = () => {
    if (active.length) ctx.restore();
    active = [];
  };
  return {
    use(frames) {
      if (active.length === frames.length && active.every((frame, i) => frame === frames[i])) return;
      close();
      if (!frames.length) return;
      ctx.save();
      try { applyFrameClips(ctx, frames); }
      catch (error) { ctx.restore(); throw error; }
      active = frames;
    },
    close,
  };
}
