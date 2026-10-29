import { normalizeAutoLayout } from "../editor/scene_auto_layout.js";

/** Translate the agent's enabled/alignment aliases into the scene layout model. */
export function resolveAgentAutoLayout(node, config) {
  if (!config.enabled) return null;
  const current = normalizeAutoLayout(node.autoLayout) ?? (node.autoLayout && typeof node.autoLayout === "object" ? node.autoLayout : null);
  const next = { direction: "horizontal", ...current, ...config };
  if (config.padding && typeof config.padding === "object") {
    next.padding = { ...(current?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }), ...config.padding };
  }
  if (config.alignment === "space-between" && config.justifyContent === undefined) next.justifyContent = "space-between";
  else if (config.alignment !== undefined && config.alignItems === undefined) next.alignItems = config.alignment;
  delete next.alignment;
  return next;
}
