import { readImageRgba } from "./bitmap_pixels.js";
import { computeSaliencyMap, SALIENCY_ANALYSIS_MAX_EDGE } from "../editor/saliency_map.js";
import { suggestOutpaintPlan } from "../editor/outpaint_direction.js";

/** Optional saliency seeding never replaces the established node-frame fallback. */
export function suggestOutpaintPlanForNode(engine, node) {
  const bitmap = engine?.getNodeBitmap?.(node) ?? null;
  if (!bitmap) return null;
  const width = node?.width;
  const height = node?.height;
  if (!(width > 0) || !(height > 0)) return null;
  try {
    const {
      rgba,
      width: analysisWidth,
      height: analysisHeight,
    } = readImageRgba(bitmap, { maxEdge: SALIENCY_ANALYSIS_MAX_EDGE });
    const saliency = computeSaliencyMap({
      rgba,
      width: analysisWidth,
      height: analysisHeight,
    });
    return suggestOutpaintPlan({ saliency, width, height });
  } catch {
    return null;
  }
}

