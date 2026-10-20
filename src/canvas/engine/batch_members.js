/**
 * Membership resolution for the Batch node.
 *
 * A Batch node is an orchestrator, not a generator: it produces no asset of
 * its own. Everything wired into its input is a job it runs, one after
 * another, so the user does not have to trigger each node by hand.
 *
 * Pure and framework-free so `tests/` can drive it without a canvas.
 */

import { RUN_STATUS } from "../nodes/node_enums.js";
import { isRunnableNode } from "./graph_run.js";
import { topoSort } from "./graph_connections.js";

/**
 * The runnable nodes wired into a Batch node's input, in execution order.
 *
 * Order comes from the graph's own topological sort rather than from the
 * order edges happen to be stored in: if one member feeds another, running
 * them out of order would feed the second one stale input.
 *
 * Non-runnable sources (a plain prompt node used as context, a gallery) are
 * dropped — they are not jobs. Duplicate edges collapse to one member, so
 * wiring a node in twice does not generate it twice.
 *
 * @param {string} batchNodeId
 * @param {Array} nodes live graph nodes
 * @param {Array} edges live graph edges
 * @returns {string[]} member node ids in execution order
 */
export function collectBatchMembers(batchNodeId, nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const wired = new Set();
  for (const edge of edges) {
    if (edge.target !== batchNodeId) continue;
    const source = byId.get(edge.source);
    // A Batch node inside a Batch node would re-enter the run recursively.
    if (!source || source.id === batchNodeId) continue;
    if (!isRunnableNode(source)) continue;
    wired.add(source.id);
  }
  if (wired.size === 0) return [];

  // A self-loop is never a meaningful connection, but it reads as a cycle to
  // topoSort — one stray self-edge anywhere on the canvas would otherwise make
  // every batch silently empty. Real multi-node cycles are still detected.
  const nonSelfEdges = edges.filter((edge) => edge.source !== edge.target);
  const { order, hasCycle } = topoSort(nodes, nonSelfEdges);
  if (hasCycle) return [];

  const topoMembers = order.filter((id) => wired.has(id));
  const batchNode = byId.get(batchNodeId);
  const customOrder = Array.isArray(batchNode?.data?.memberOrder)
    ? batchNode.data.memberOrder
    : [];

  if (customOrder.length === 0) {
    return topoMembers;
  }

  // Build dependency subgraph between wired members to ensure that any topological
  // dependency (e.g. member u -> member v) is strictly respected, while for any
  // independent members, the user's customOrder is strictly honored.
  const adjacency = new Map();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of nonSelfEdges) {
    // Edges into the batch orchestrator itself are orchestration triggers, not data dependencies
    if (edge.target === batchNodeId) continue;
    if (adjacency.has(edge.source)) {
      adjacency.get(edge.source).push(edge.target);
    }
  }

  function hasPath(startId, targetId) {
    const visited = new Set();
    const queue = [startId];
    visited.add(startId);
    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr === targetId) return true;
      for (const next of adjacency.get(curr) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return false;
  }

  const memberInDegree = new Map();
  const memberDependents = new Map();
  for (const id of wired) {
    memberInDegree.set(id, 0);
    memberDependents.set(id, []);
  }

  const wiredList = Array.from(wired);
  for (let i = 0; i < wiredList.length; i += 1) {
    for (let j = 0; j < wiredList.length; j += 1) {
      if (i === j) continue;
      const u = wiredList[i];
      const v = wiredList[j];
      if (hasPath(u, v)) {
        memberDependents.get(u).push(v);
        memberInDegree.set(v, memberInDegree.get(v) + 1);
      }
    }
  }

  // Priority ranking: customOrder first, then remaining topoMembers
  const validCustom = customOrder.filter((id) => wired.has(id));
  const rankMap = new Map();
  validCustom.forEach((id, idx) => {
    if (!rankMap.has(id)) {
      rankMap.set(id, idx);
    }
  });
  topoMembers.forEach((id) => {
    if (!rankMap.has(id)) {
      rankMap.set(id, validCustom.length + rankMap.size);
    }
  });

  const ready = [];
  for (const [id, deg] of memberInDegree.entries()) {
    if (deg === 0) ready.push(id);
  }

  const result = [];
  while (ready.length > 0) {
    ready.sort((a, b) => (rankMap.get(a) ?? 0) - (rankMap.get(b) ?? 0));
    const next = ready.shift();
    result.push(next);
    for (const dep of memberDependents.get(next) || []) {
      const newDeg = memberInDegree.get(dep) - 1;
      memberInDegree.set(dep, newDeg);
      if (newDeg === 0) {
        ready.push(dep);
      }
    }
  }

  if (result.length !== topoMembers.length) {
    return topoMembers;
  }

  return result;
}

/**
 * Progress of a batch run, derived from the live run state.
 *
 * Nothing is stored on the node: the run state machine already knows which
 * node is executing and each member carries its own status, so a second copy
 * of that on the Batch node could only drift out of sync with it.
 *
 * @param {string[]} memberIds
 * @param {Array} nodes live graph nodes
 * @param {string|null} activeNodeId the run's currently executing node
 * @returns {{total: number, done: number, failed: number, position: number|null}}
 *   `position` is the 1-based index of the running member, or null when the
 *   batch is not the thing currently running.
 */
export function batchProgress(memberIds, nodes, activeNodeId) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let done = 0;
  let failed = 0;
  for (const id of memberIds) {
    const status = byId.get(id)?.data?.status;
    if (status === RUN_STATUS.SUCCESS) done += 1;
    else if (status === RUN_STATUS.ERROR) failed += 1;
  }
  const activeIndex = activeNodeId ? memberIds.indexOf(activeNodeId) : -1;
  return {
    total: memberIds.length,
    done,
    failed,
    position: activeIndex >= 0 ? activeIndex + 1 : null,
  };
}
