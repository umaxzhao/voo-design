const exclusions = new WeakMap();

export function workflowRetentionExclusion(nodes) {
  return exclusions.get(nodes);
}

/**
 * Blobs referenced by undo/redo remain owned until those entries are evicted.
 * Passing only live nodes to orphan pruning can restore a shot's IDs on undo
 * after its image bytes have already been permanently deleted from IndexedDB.
 */
export function workflowAssetRetentionNodes(state, { excludeWorkflowId } = {}) {
  const nodes = new Set();
  const visited = new Set();
  const addNodes = (items) => {
    if (!Array.isArray(items)) return;
    for (const node of items) {
      if (node && typeof node === "object") nodes.add(node);
    }
  };
  const visitSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== "object" || visited.has(snapshot))
      return;
    visited.add(snapshot);
    if (excludeWorkflowId && snapshot.workflowId === excludeWorkflowId) return;
    addNodes(snapshot.nodes);
    // A redo entry stores the original undo entry under `entry`; its `after`
    // snapshot owns assets added by the action, even when currently undone.
    visitSnapshot(snapshot.entry);
    visitSnapshot(snapshot.before);
    visitSnapshot(snapshot.after);
  };
  const visitHistory = (history) => {
    for (const key of ["undoStack", "redoStack"]) {
      if (Array.isArray(history?.[key])) history[key].forEach(visitSnapshot);
    }
  };
  if (!excludeWorkflowId || state?.workflowId !== excludeWorkflowId) {
    addNodes(state?.nodes);
    visitHistory(state);
  }
  // Switching workflows caches their still-reachable history in this map.
  for (const [workflowId, history] of Object.entries(
    state?.workflowHistories ?? {},
  )) {
    // The active workflow's cached copy predates its current edits/evictions;
    // its live stacks above are authoritative, otherwise old assets leak.
    if (workflowId !== excludeWorkflowId && workflowId !== state?.workflowId) {
      visitHistory(history);
    }
  }
  const result = [...nodes];
  if (excludeWorkflowId) exclusions.set(result, excludeWorkflowId);
  return result;
}
