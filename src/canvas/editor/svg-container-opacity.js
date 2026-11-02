import { containerBlendMode } from "./container-opacity.js";
import { BLEND_MODES } from "./scene_model_core.js";
import { isCustomBlendMode } from "./blend_math.js";

/** SVG supports CSS blend modes; unsupported PSD math must never export as normal. */
export function svgContainerBlend(container) {
  const mode = containerBlendMode(container);
  if (mode === "source-over") return "";
  if (isCustomBlendMode(mode) || !BLEND_MODES.includes(mode)) {
    throw new Error(`svg-unsupported-isolated-blend:${mode}`);
  }
  return ` style="mix-blend-mode:${mode}"`;
}
