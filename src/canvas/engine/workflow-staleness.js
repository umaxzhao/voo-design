import { generationOrder, isRunnableNode } from "./graph_run.js";
import { RUN_STATUS } from "../nodes/types.js";
import { createInputSignatureReader } from "./workflow-input-signature.js";

export { createInputSignatureReader };

/** Includes new, failed, and legacy untracked nodes so no result is silently trusted. */
export function nodesNeedingRun(nodes, edges) {
  const runnable = nodes.filter(isRunnableNode);
  const knownIds = new Set(nodes.map((node) => node.id));
  // An invalid graph cannot prove any result current. Let the normal runner
  // report the graph error without crashing the menu while it is open.
  if (
    edges.some(
      (edge) => !knownIds.has(edge.source) || !knownIds.has(edge.target),
    ) ||
    generationOrder(nodes, edges).hasCycle
  ) {
    return runnable.map((node) => node.id);
  }
  const readSignature = createInputSignatureReader(nodes, edges);
  return runnable
    .filter(
      (node) =>
        node.data?.status !== RUN_STATUS.SUCCESS ||
        node.data?.inputSignature !== readSignature(node.id),
    )
    .map((node) => node.id);
}
