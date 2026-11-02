import { BOOLEAN_OPERATIONS } from "./scene_model_node_builders.js";

/**
 * A stored boolean node, read back safely.
 *
 * Both renderers walk `sources` and switch on each part's `type`, so a stored
 * node whose parts are missing or malformed would reach the draw path and
 * fail there. Anything unusable collapses to an empty source list, which both
 * renderers already treat as nothing to draw.
 */
export function normalizeBooleanNode(node) {
  const sources = Array.isArray(node.sources)
    ? node.sources.filter(
        (source) =>
          source &&
          typeof source.type === "string" &&
          Number.isFinite(source.x) &&
          Number.isFinite(source.y) &&
          Number.isFinite(source.w) &&
          Number.isFinite(source.h),
      )
    : [];
  return {
    operation: BOOLEAN_OPERATIONS.includes(node.operation)
      ? node.operation
      : "union",
    // One part is not a combination; it would paint as itself and read as a
    // boolean node that lost its other half.
    sources: sources.length >= 2 ? sources : [],
  };
}
