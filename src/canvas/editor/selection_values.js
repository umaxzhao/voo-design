/**
 * Multi-selection property helpers (ROADMAP 1.9, common-properties).
 *
 * With several layers selected, a property panel field should show the value
 * every selected node shares, and an edit should reach every node that would
 * change. Pure so the rules are unit-testable without the engine.
 */

/** Sentinel for a field whose value differs across the selection. */
export const MIXED = Symbol("mixed");

function equalish(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (a && b && typeof a === "object" && typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * The value every selected node shares for `key`, or MIXED when they differ
 * (or when the selection is empty).
 *
 * @param {Array<object>} nodes selected node objects
 * @param {string} key a node property (e.g. "x", "rotation")
 * @param {unknown} defaultValue effective value for an omitted property
 * @returns {unknown | typeof MIXED}
 */
export function commonValue(nodes, key, defaultValue = undefined) {
  if (!Array.isArray(nodes) || nodes.length === 0) return MIXED;
  const valueOf = (node) => defaultValue === undefined
    ? node?.[key]
    : node?.[key] ?? defaultValue;
  const first = valueOf(nodes[0]);
  for (const node of nodes) {
    if (!equalish(valueOf(node), first)) return MIXED;
  }
  return first;
}

/**
 * The ids of the selected nodes whose `key` differs from `value` — i.e. the
 * nodes an edit must actually touch.
 */
export function nodesToPatch(nodes, key, value) {
  return nodes
    .filter((node) => !equalish(node?.[key], value))
    .map((node) => node.id);
}
