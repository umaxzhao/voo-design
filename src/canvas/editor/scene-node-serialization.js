import { serializeCanvasNode } from "./canvas-composition-model.js";
import { isDefaultAdjustments, normalizeCornerRadius } from "./scene_model_core.js";

/** Strip session/default fields on a detached record, without deleting live properties. */
export function serializeSceneNode(node) {
  const normalized = serializeCanvasNode(node);
  const { src, adjustments, cornerRadius, ...record } = normalized;
  if (Object.hasOwn(normalized, "src") && !src?.startsWith("blob:")) record.src = src;
  if (Object.hasOwn(normalized, "adjustments") && !isDefaultAdjustments(adjustments)) record.adjustments = adjustments;
  if (Object.hasOwn(normalized, "cornerRadius")) {
    record.cornerRadius = cornerRadius === undefined ? undefined : normalizeCornerRadius(cornerRadius);
  }
  return record;
}
