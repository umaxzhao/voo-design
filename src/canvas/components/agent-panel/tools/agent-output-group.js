import { NODE_TYPE } from "../../../nodes/node_enums.js";

export function resolveAgentOutputGroup(store, agentNodeId) {
  if (!agentNodeId) return null;
  const agent = store.nodes?.find(
    (node) => node.id === agentNodeId && node.type === NODE_TYPE.AGENT,
  );
  const groupId = agent?.data?.outputGroupId;
  if (!groupId) return null;
  const group = store.nodes?.find(
    (node) => node.id === groupId && node.type === NODE_TYPE.GROUP,
  );
  return group ? group.id : null;
}

/** Adopt only freshly created artifacts into the bound Agent output Group. */
export function adoptIntoAgentGroup(store, agentNodeId, nodeIds) {
  const groupId = resolveAgentOutputGroup(store, agentNodeId);
  if (!groupId) return [];
  const byId = new Map((store.nodes ?? []).map((node) => [node.id, node]));
  const adoptable = (nodeIds ?? []).filter((id) => {
    if (!id || id === groupId || id === agentNodeId) return false;
    const node = byId.get(id);
    return (
      node && node.type !== NODE_TYPE.GROUP && node.type !== NODE_TYPE.AGENT
    );
  });
  if (
    adoptable.length === 0 ||
    typeof store.applyGroupMutation !== "function"
  ) {
    return [];
  }
  const applied = store.applyGroupMutation({
    groupId,
    additions: adoptable.map((existingNodeId) => ({ existingNodeId })),
  });
  return applied ? adoptable : [];
}
