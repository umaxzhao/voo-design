import {
  HANDLE,
  NODE_TYPE,
  isValidConnection,
  nodeHasPort,
} from "../nodes/types.js";

/** Why a connection was refused, checked in this priority order. */
export const CONNECTION_REJECTION = {
  PORT_MISMATCH: "portMismatch",
  MISSING_NODE: "missingNode",
  DUPLICATE: "duplicate",
  CYCLE: "cycle",
};

/**
 * Like canAddConnection but explains the refusal.
 *
 * Reasons are checked in a stable order: handle/type mismatch first, then
 * missing endpoints, then duplicates, then cycles. Kept in one place so the
 * canvas toast and any agent tool report the same wording.
 *
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function canAddConnectionWithReason(connection, nodes, edges) {
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);

  if (!isValidConnection(connection, sourceNode, targetNode)) {
    return { ok: false, reason: CONNECTION_REJECTION.PORT_MISMATCH };
  }
  if (!sourceNode || !targetNode) {
    return { ok: false, reason: CONNECTION_REJECTION.MISSING_NODE };
  }
  // Only output containers can consume 3D assets; Design and Clip cannot
  // decode GLB despite sharing the generic MEDIA input with Group and Batch.
  const is3D =
    connection.sourceHandle === HANDLE.MODEL_3D ||
    (sourceNode?.type === NODE_TYPE.PREVIEW &&
      sourceNode?.data?.mediaType === "model3d");
  if (
    is3D &&
    ![NODE_TYPE.GROUP, NODE_TYPE.BATCH].includes(targetNode.type)
  ) {
    return { ok: false, reason: CONNECTION_REJECTION.PORT_MISMATCH };
  }
  if (
    !nodeHasPort(sourceNode, "source", connection.sourceHandle) ||
    !nodeHasPort(targetNode, "target", connection.targetHandle)
  ) {
    return { ok: false, reason: CONNECTION_REJECTION.PORT_MISMATCH };
  }

  const duplicate = edges.some(
    (edge) =>
      edge.source === connection.source &&
      edge.sourceHandle === connection.sourceHandle &&
      edge.target === connection.target &&
      edge.targetHandle === connection.targetHandle,
  );
  if (duplicate) return { ok: false, reason: CONNECTION_REJECTION.DUPLICATE };

  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => adjacency.get(edge.source)?.push(edge.target));

  const pending = [connection.target];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === connection.source) {
      return { ok: false, reason: CONNECTION_REJECTION.CYCLE };
    }
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return { ok: true };
}

/** Rejects duplicate links and links that would close a directed cycle. */
export function canAddConnection(connection, nodes, edges) {
  return canAddConnectionWithReason(connection, nodes, edges).ok;
}

/**
 * Kahn's algorithm. Returns the execution order plus a cycle flag, because a
 * cyclic graph must be refused rather than half-run.
 */
export function topoSort(nodes, edges) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const adjacency = new Map(nodes.map((node) => [node.id, []]));

  edges.forEach((edge) => {
    if (!indegree.has(edge.target) || !adjacency.has(edge.source)) return;
    indegree.set(edge.target, indegree.get(edge.target) + 1);
    adjacency.get(edge.source).push(edge.target);
  });

  const queue = nodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id);
  const order = [];

  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    adjacency.get(id).forEach((next) => {
      const remaining = indegree.get(next) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    });
  }

  return { order, hasCycle: order.length !== nodes.length };
}
