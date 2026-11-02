/**
 * Draws a video layer's current frame into its box. Until the first frame is
 * decoded (or if the clip failed) a neutral placeholder keeps the layer visible.
 */

const PLACEHOLDER_FILL = "#1a1a1a";

export function drawVideoNode(ctx, node, frame) {
  const { x, y, width, height } = node;
  if (frame && frame.readyState >= 2) {
    ctx.drawImage(frame, x, y, width, height);
    return;
  }
  ctx.fillStyle = PLACEHOLDER_FILL;
  ctx.fillRect(x, y, width, height);
}
