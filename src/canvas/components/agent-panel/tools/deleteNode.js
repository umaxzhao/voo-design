/**
 * Tool: delete_node — Remove a node from the canvas.
 *
 * Classified as DESTRUCTIVE — always requires approval regardless of policy.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import {
  assertExclusiveNodeSelector,
  atomicNodeFailureOptions,
  findMissingNodeIds,
  hasOwnArgument,
  normalizeBatchNodeIds,
  requireBatchStoreAction,
} from "./node-batch.js";
import { t } from "../../../../shared/i18n.js";

const def = getWorkflowToolDefinition("delete_node");

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    const batchRequested = hasOwnArgument(args, "nodeIds");
    if (batchRequested || !hasOwnArgument(args, "nodeId")) {
      const selector = assertExclusiveNodeSelector(args, ["nodeId", "nodeIds"]);
      if (selector === "nodeIds") {
        const nodeIds = normalizeBatchNodeIds(args.nodeIds, "nodeIds");
        const missing = findMissingNodeIds(store.nodes, nodeIds);
        if (missing.length > 0) {
          throw createToolError(
            TOOL_ERROR_CODE.NODE_NOT_FOUND,
            `Batch delete aborted: ${missing.length} of ${nodeIds.length} nodes not found (${missing.join(", ")}). No changes were applied to any nodes.`,
            atomicNodeFailureOptions(nodeIds, missing),
          );
        }
        requireBatchStoreAction(store, "batchDeleteNodes");
        await store.batchDeleteNodes(nodeIds);
        return {
          success: true,
          batch: true,
          total: nodeIds.length,
          affectedNodeIds: nodeIds,
          summary: `Successfully deleted ${nodeIds.length} nodes in a single atomic transaction`,
        };
      }
    }

    const node = store.nodes.find((n) => n.id === args.nodeId);
    if (!node) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        `Node not found: ${args.nodeId}`,
        {
          missing: { nodes: [args.nodeId] },
          suggestion: {
            tool: "list_nodes",
            args: {},
            note: "Call list_nodes to get valid node ids, then retry.",
          },
        },
      );
    }

    store.deleteNode(args.nodeId);

    return { nodeId: args.nodeId, deleted: true, type: node.type };
  },

  presentCall(args) {
    if (Array.isArray(args.nodeIds)) {
      return {
        title: t("agent.tool.deleteBatch.call", { count: args.nodeIds.length }),
        icon: "trash-2",
      };
    }
    return {
      title: `Delete node ${(args.nodeId ?? "?").slice(0, 8)}…`,
      icon: "trash-2",
    };
  },

  presentResult(_args, result) {
    if (result?.batch) {
      return {
        title: t("agent.tool.deleteBatch.result", { count: result.total }),
        status: "completed",
      };
    }
    return { title: `Deleted ${result.type} node`, status: "completed" };
  },
});
