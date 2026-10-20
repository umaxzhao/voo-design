import { HANDLE, NODE_TYPE } from "../nodes/types.js";
import { generationOrder } from "./graph.js";
import {
  needsStoryboardSheet,
  pendingKeyframes,
  videoClipPlan,
} from "./storyboard_cache.js";
import { usesStoryboardSheet } from "./storyboard_sheet.js";

/**
 * Run-cost estimation for the Ask-before-run confirmation card.
 *
 * The estimate is deliberately a *call count*, not a price: providers meter
 * credits differently and VOO has no metering of its own. Every runnable node
 * is one remote call (image/video generation, API media, AI text); a video
 * result holder runs nothing and costs nothing. `count` on a generate node means several
 * pictures per call, so it is folded in as a note rather than inflating calls.
 */

/** The queue a run request will actually execute, in dependency order. */
export function requestedRunOrder(
  nodes,
  edges,
  { onlyNodeId, onlyNodeIds, startFromNodeId } = {},
) {
  const { order } = generationOrder(nodes, edges);
  if (onlyNodeIds) {
    const requested = new Set(onlyNodeIds);
    return order.filter((id) => requested.has(id));
  }
  if (onlyNodeId) return [onlyNodeId];
  if (startFromNodeId) {
    const index = order.indexOf(startFromNodeId);
    return index >= 0 ? order.slice(index) : order;
  }
  return order;
}

/**
 * Remote calls a storyboard-driven node makes, or null for any other node.
 * A storyboard renders only the keyframes it is missing (plus one split call
 * when it has no shots yet); a video fed by a storyboard renders stale clips.
 */
function storyboardCallCount(node, byId, nodes, edges, runIds) {
  if (node.type === NODE_TYPE.STORYBOARD) {
    const shots = node.data?.shots ?? [];
    if (shots.length === 0) {
      return (
        1 + (node.data?.shotCount ?? 0) + (usesStoryboardSheet(node) ? 1 : 0)
      );
    }
    return (
      pendingKeyframes(node, nodes, edges).length +
      (needsStoryboardSheet(node, nodes, edges) ? 1 : 0)
    );
  }
  if (node.type !== NODE_TYPE.VIDEO) return null;
  const board = edges
    .filter(
      (edge) =>
        edge.target === node.id && edge.targetHandle === HANDLE.STORYBOARD,
    )
    .map((edge) => byId.get(edge.source))
    .find((source) => source?.type === NODE_TYPE.STORYBOARD);
  if (!board) return null;
  if (!board.data?.shots?.length) return board.data?.shotCount || 0;
  const pendingFrames = new Set(
    runIds.has(board.id)
      ? pendingKeyframes(board, nodes, edges).map((shot) => shot.id)
      : [],
  );
  return videoClipPlan(board, node, nodes, edges).filter(
    (entry) => entry.clipIds.length === 0 || pendingFrames.has(entry.shotId),
  ).length;
}

/**
 * Counts the billable remote calls a run will make and which nodes cause them.
 *
 * @param {Array} nodes
 * @param {Array} edges
 * @param {object} [opts] - `onlyNodeId` / `onlyNodeIds` as passed to startRun
 * @returns {{ total: number, nodes: Array<{nodeId, type, count}> }}
 */
export function estimateRunCalls(nodes, edges, opts = {}) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const runOrder = requestedRunOrder(nodes, edges, opts);
  const runIds = new Set(runOrder);
  const billable = [];
  for (const id of runOrder) {
    const node = byId.get(id);
    if (!node || node.type === NODE_TYPE.COMBINE_VIDEO) continue;
    const storyboardCalls = storyboardCallCount(
      node,
      byId,
      nodes,
      edges,
      runIds,
    );
    if (storyboardCalls !== null) {
      // One remote call per shot, so the shots are the calls, not a note.
      for (let index = 0; index < storyboardCalls; index += 1) {
        billable.push({ nodeId: id, type: node.type, count: 1 });
      }
      continue;
    }
    const count = Number.isFinite(node.data?.count) ? node.data.count : 1;
    billable.push({ nodeId: id, type: node.type, count });
  }
  return {
    total: billable.length,
    nodes: billable,
  };
}

/**
 * Whether a run request should stop at a confirmation card first.
 *
 * Ask mode only gates runs that actually bill something; a local-only run
 * (e.g. a video result holder) still executes immediately, and a run already in flight
 * is never double-confirmed.
 */
export function shouldAskBeforeRun({
  askBeforeRun,
  estimateTotal,
  runStatus,
  hasPendingRequest,
}) {
  return (
    !hasPendingRequest &&
    runStatus !== "running" &&
    askBeforeRun === true &&
    estimateTotal > 0
  );
}
