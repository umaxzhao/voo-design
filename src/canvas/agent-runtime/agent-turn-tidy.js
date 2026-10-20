/**
 * Auto-align agent-created nodes at turn close.
 *
 * Tidy ONLY the nodes created in this agent turn, placed near where they
 * currently are (or right of the upstream node they connect to), shifting
 * the block so it avoids overlapping existing canvas nodes.
 *
 * @module agent-runtime/agent-turn-tidy
 */

export const NODE_CREATING_TOOLS = new Set([
  "create_node",
  "build_workflow",
  "generate_image",
  "generate_video",
  "generate_layout",
  "instantiate_subgraph",
  "apply_template",
  "create_multi_canvas",
]);

export function extractCreatedNodeIdsFromChangeSet(changeSet) {
  if (!changeSet || changeSet.status === "failed") return [];
  if (!changeSet.toolName || !NODE_CREATING_TOOLS.has(changeSet.toolName)) {
    return [];
  }
  const ids = new Set();
  const res = changeSet.result;
  if (res && typeof res === "object") {
    if (typeof res.nodeId === "string") ids.add(res.nodeId);
    if (Array.isArray(res.nodeIds)) {
      res.nodeIds.forEach((id) => typeof id === "string" && ids.add(id));
    }
    if (Array.isArray(res.createdNodes)) {
      res.createdNodes.forEach((n) => n?.id && ids.add(n.id));
    }
    if (Array.isArray(res.createdNodeIds)) {
      res.createdNodeIds.forEach((id) => typeof id === "string" && ids.add(id));
    }
  }
  if (typeof changeSet.nodeId === "string") {
    ids.add(changeSet.nodeId);
  }
  return [...ids];
}

export function autoTidyTurnCreatedNodes({
  run,
  runStore,
  getStore,
  initialNodeIds,
}) {
  if (!run?.id || !runStore) return { tidied: false, reason: "missing_run" };
  const changeSets = runStore.getRun(run.id)?.changeSets ?? [];

  // If the model already called align_layout in this turn, skip auto-tidy.
  const calledAlignLayout = changeSets.some(
    (cs) => cs.toolName === "align_layout" && cs.status !== "failed",
  );
  if (calledAlignLayout) {
    return { tidied: false, reason: "already_aligned" };
  }

  const initialSet =
    initialNodeIds instanceof Set
      ? initialNodeIds
      : new Set(initialNodeIds || []);

  const store = typeof getStore === "function" ? getStore() : null;
  const hasCanvasNodes = Array.isArray(store?.nodes);
  const currentNodeIds = hasCanvasNodes
    ? new Set(store.nodes.map((n) => n?.id).filter(Boolean))
    : null;

  const createdIds = new Set();
  for (const cs of changeSets) {
    for (const id of extractCreatedNodeIdsFromChangeSet(cs)) {
      if (initialSet.has(id)) continue;
      if (currentNodeIds && !currentNodeIds.has(id)) continue;
      createdIds.add(id);
    }
  }

  if (createdIds.size === 0) {
    return { tidied: false, reason: "no_created_nodes" };
  }

  if (!store || typeof store.alignNodes !== "function") {
    return { tidied: false, reason: "no_store_action" };
  }

  store.alignNodes([...createdIds]);
  return { tidied: true, nodeIds: [...createdIds] };
}
