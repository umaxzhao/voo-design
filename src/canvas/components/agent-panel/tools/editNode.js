/**
 * Tool: edit_node — Update properties of an existing node.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import {
  assertBatchPatch,
  assertExclusiveNodeSelector,
  atomicNodeFailureOptions,
  findMissingNodeIds,
  hasOwnArgument,
  normalizeBatchNodeIds,
  requireBatchStoreAction,
} from "./node-batch.js";
import { t } from "../../../../shared/i18n.js";
import { commitWorkflowHistory } from "../../../undo-action-contracts.js";
import { NODE_TYPE } from "../../../nodes/types.js";
import { normalizeShot } from "../../../engine/storyboard_compile.js";

const def = getWorkflowToolDefinition("edit_node");

function normalizeStoryboardData(node, data) {
  if (node?.type !== NODE_TYPE.STORYBOARD || data?.shots === undefined) {
    return data;
  }
  if (!Array.isArray(data.shots)) {
    throw createToolError(
      TOOL_ERROR_CODE.ARGS_INVALID,
      "Storyboard shots must be an array.",
      { missing: { args: ["data.shots"] } },
    );
  }
  return { ...data, shots: data.shots.map(normalizeShot) };
}

function normalizeBatchEditTasks(args) {
  const selector = assertExclusiveNodeSelector(args, [
    "nodeId",
    "nodeIds",
    "updates",
  ]);
  if (selector === "nodeId") return null;

  if (selector === "nodeIds") {
    assertBatchPatch(args.data, args.position, "edit_node");
    return normalizeBatchNodeIds(args.nodeIds, "nodeIds").map((nodeId) => ({
      nodeId,
      ...(args.data !== undefined ? { data: args.data } : {}),
      ...(args.position !== undefined ? { position: args.position } : {}),
    }));
  }

  if (hasOwnArgument(args, "data") || hasOwnArgument(args, "position")) {
    throw createToolError(
      TOOL_ERROR_CODE.ARGS_INVALID,
      "Top-level data or position cannot be combined with updates.",
      {
        suggestion: {
          tool: null,
          args: {},
          note: "Move each data or position value into its updates item and retry.",
        },
      },
    );
  }
  if (!Array.isArray(args.updates) || args.updates.length === 0) {
    throw createToolError(
      TOOL_ERROR_CODE.ARGS_INVALID,
      "updates must be a non-empty array of node updates.",
      { missing: { args: ["updates"] } },
    );
  }

  const nodeIds = args.updates.map((update, index) => {
    if (
      update === null ||
      typeof update !== "object" ||
      Array.isArray(update)
    ) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        `updates[${index}] must be an object.`,
        { missing: { args: [`updates[${index}]`] } },
      );
    }
    assertBatchPatch(update.data, update.position, `updates[${index}]`);
    return update.nodeId;
  });
  normalizeBatchNodeIds(nodeIds, "updates[].nodeId");
  return args.updates.map((update) => ({
    nodeId: update.nodeId,
    ...(update.data !== undefined ? { data: update.data } : {}),
    ...(update.position !== undefined ? { position: update.position } : {}),
  }));
}

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    const batchRequested =
      hasOwnArgument(args, "nodeIds") || hasOwnArgument(args, "updates");
    if (batchRequested || !hasOwnArgument(args, "nodeId")) {
      const tasks = normalizeBatchEditTasks(args);
      if (tasks) {
        const nodeIds = tasks.map((task) => task.nodeId);
        const missing = findMissingNodeIds(store.nodes, nodeIds);
        if (missing.length > 0) {
          throw createToolError(
            TOOL_ERROR_CODE.NODE_NOT_FOUND,
            `Batch edit aborted: ${missing.length} of ${tasks.length} nodes not found (${missing.join(", ")}). No changes were applied to any nodes.`,
            atomicNodeFailureOptions(nodeIds, missing),
          );
        }
        requireBatchStoreAction(store, "batchUpdateNodes");
        const byId = new Map(store.nodes.map((node) => [node.id, node]));
        await store.batchUpdateNodes(
          tasks.map((task) => ({
            ...task,
            ...(task.data
              ? {
                  data: normalizeStoryboardData(
                    byId.get(task.nodeId),
                    task.data,
                  ),
                }
              : {}),
          })),
        );
        return {
          success: true,
          batch: true,
          total: tasks.length,
          affectedNodeIds: nodeIds,
          summary: `Successfully updated ${tasks.length} nodes in a single atomic transaction`,
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

    const data = normalizeStoryboardData(node, args.data);
    commitWorkflowHistory(store, "workflow.agent.node.edit");

    if (data) {
      store.updateNodeData(args.nodeId, data);
    }

    if (args.position) {
      // Update position via onNodesChange (ReactFlow pattern).
      store.onNodesChange?.([
        {
          id: args.nodeId,
          type: "position",
          position: args.position,
          dragging: false,
        },
      ]);
    }

    return { nodeId: args.nodeId, updated: true };
  },

  presentCall(args) {
    const batchCount = Array.isArray(args.updates)
      ? args.updates.length
      : Array.isArray(args.nodeIds)
        ? args.nodeIds.length
        : null;
    if (batchCount !== null) {
      return {
        title: t("agent.tool.editBatch.call", { count: batchCount }),
        icon: "pencil",
      };
    }
    const keys = Object.keys(args.data || {}).join(", ");
    return {
      title: `Edit node ${(args.nodeId ?? "?").slice(0, 8)}… (${keys})`,
      icon: "pencil",
    };
  },

  presentResult(_args, result) {
    if (result?.batch) {
      return {
        title: t("agent.tool.editBatch.result", { count: result.total }),
        status: "completed",
      };
    }
    return {
      title: `Updated node ${(result?.nodeId ?? "?").slice(0, 8)}…`,
      status: "completed",
    };
  },
});
