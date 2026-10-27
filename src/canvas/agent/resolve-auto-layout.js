/** Translate the agent's enabled/alignment aliases into the scene layout model. */
export function resolveAgentAutoLayout(node, config) {
  if (!config.enabled) return null;
  const next = { direction: "horizontal", ...node.autoLayout, ...config };
  if (config.alignment === "space-between") next.justifyContent = "space-between";
  else if (config.alignment !== undefined) next.alignItems = config.alignment;
  delete next.alignment;
  return next;
}
