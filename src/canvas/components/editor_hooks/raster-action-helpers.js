import { maskErrorCode } from "../../editor/mask_error.js";
import { PERFORMANCE_TIER } from "../../../shared/performance-tier.js";

/** Pure UI/error helpers remain eager; optional raster implementations do not. */
export function nextRetouchFailure(current, code) {
  return { code, seq: (current?.seq ?? 0) + 1 };
}

export function explicitRouteSelection({
  providerId,
  modelId,
  providerTouched = false,
} = {}) {
  if (!providerTouched || !providerId) return {};
  return { providerId, modelId: modelId ?? null };
}

export function repaintFailureCode(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code.startsWith("localBackend.") && code !== "localBackend.cancelled") {
    return "noRepaintRouteAvailable";
  }
  return maskErrorCode(error);
}

export function editorTierHintKey(tier) {
  if (tier === PERFORMANCE_TIER.MID || tier === PERFORMANCE_TIER.UNKNOWN) {
    return "localBudget.clamped";
  }
  if (tier === PERFORMANCE_TIER.LOW) {
    return "editor.performanceTier.cloudDefault";
  }
  return null;
}
