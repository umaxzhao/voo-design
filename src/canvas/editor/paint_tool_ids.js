/** Tools whose pointer path paints pixels onto the selected image layer. */

import { TOOL } from "./tool_ids.js";

export const PAINT_TOOLS = Object.freeze(
  new Set([
    TOOL.BRUSH,
    TOOL.ERASER,
    TOOL.HEALING, // spot / patch / clone / AI repair all write pixels
    TOOL.BLUR,
    TOOL.SHARPEN,
    TOOL.SMUDGE,
    TOOL.DODGE,
    TOOL.BURN,
    TOOL.SPONGE,
    TOOL.FILL,
  ]),
);

export function isPaintTool(tool) {
  return PAINT_TOOLS.has(tool);
}
