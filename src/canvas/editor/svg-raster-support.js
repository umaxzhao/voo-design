import { factorIsSet } from "./skia_adjustment_support.js";
import { isDeformed } from "./scene_state_contract.js";
import { isHiddenByGroup, NODE_KIND } from "./scene_model.js";

/** Backdrop reads must see preceding layers, rather than an empty node buffer. */
export function requiresSvgSceneRaster(doc) {
  return (doc.nodes ?? []).some(node => node.visible !== false &&
    !isHiddenByGroup(doc, node) && (node.backgroundBlur > 0 ||
      node.effects?.glass?.enabled || node.kind === NODE_KIND.ADJUSTMENT));
}

/** SVG has no native equivalent for the editor's pixel kernels and layer styles. */
export function needsSvgRaster(node) {
  const adjustments = node.adjustments ?? {};
  const activeAdjustment = Object.keys(adjustments)
    .filter(key => key !== "liveFilters")
    .some(key => factorIsSet(adjustments, key));
  return Object.values(node.effects ?? {}).some(effect => effect?.enabled) ||
    activeAdjustment ||
    adjustments.liveFilters?.some(filter => filter.enabled !== false) ||
    isDeformed(node) || node.layerBlur > 0 || node.noise?.opacity > 0;
}
