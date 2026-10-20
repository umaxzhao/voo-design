import { RPC } from "../../shared/messages.js";
import { EXECUTION_MODE, HANDLE, NODE_TYPE } from "../nodes/node_enums.js";

/** Only executor routes that consume the persisted operation may avoid a new-call gate. */
export function webRecoveryOperation(record, node, nodesById, edges) {
  if (!node || node.data?.executionMode === EXECUTION_MODE.API) return null;
  if (![NODE_TYPE.GENERATE, NODE_TYPE.VIDEO].includes(node.type)) return null;
  // A storyboard dispatches virtual shots before the ordinary video route.
  // Its parent operation cannot authorize fresh calls for those shots.
  if (
    node.type === NODE_TYPE.VIDEO &&
    edges.some(
      (edge) =>
        edge.target === node.id &&
        edge.targetHandle === HANDLE.STORYBOARD &&
        nodesById.get(edge.source)?.type === NODE_TYPE.STORYBOARD,
    )
  )
    return null;
  const operation = record.nodes?.[node.id]?.webGeneration;
  if (
    typeof operation?.operationId !== "string" ||
    !operation.operationId.trim() ||
    typeof operation.platform !== "string" ||
    !operation.platform ||
    typeof operation.inputKey !== "string"
  )
    return null;
  const nodeOperation = node.data?.webGeneration;
  if (
    nodeOperation &&
    (nodeOperation.operationId !== operation.operationId ||
      nodeOperation.inputKey !== operation.inputKey ||
      nodeOperation.platform !== operation.platform)
  )
    return null;
  let input;
  try {
    input = JSON.parse(operation.inputKey);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  const method =
    node.type === NODE_TYPE.VIDEO ? RPC.GENERATE_VIDEO : RPC.GENERATE;
  if (
    !Array.isArray(input) ||
    input.length !== 5 ||
    input[0] !== method ||
    input[1] !== operation.platform ||
    typeof input[2] !== "string" ||
    !input[2].trim() ||
    !Array.isArray(input[3]) ||
    !input[3].every((id) => typeof id === "string")
  )
    return null;
  // The executor independently compares the fully composed current input key
  // before RPC; changed prompts/references fail rather than submit a new job.
  return operation;
}
