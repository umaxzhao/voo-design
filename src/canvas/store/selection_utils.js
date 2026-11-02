/**
 * Selection flag application that keeps untouched node references stable.
 *
 * `selectNode` used to spread every node on every click, so ReactFlow re-ran
 * its diff against N freshly-built objects and the panel re-rendered for
 * nodes whose `selected` never changed. Only nodes whose flag actually flips
 * get a new reference (ROADMAP 4.9).
 *
 * Pure so the rule is unit-testable without the store.
 *
 * @param {Array<object>} nodes
 * @param {string} nodeId the node to select
 * @param {boolean} additive keep existing selections (shift-click)
 * @returns {Array<object>} the same array when nothing changed, otherwise a
 *   new array with only the changed nodes rebuilt
 */
export function applySelection(nodes, nodeId, additive) {
  let changed = false;
  const next = nodes.map((node) => {
    const selected = node.id === nodeId || (additive && Boolean(node.selected));
    if (node.selected === selected) return node;
    changed = true;
    return { ...node, selected };
  });
  return changed ? next : nodes;
}
