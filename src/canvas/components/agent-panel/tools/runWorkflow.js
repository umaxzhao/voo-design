/**
 * Tool: run_workflow — Trigger workflow execution.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import {
  findMissingNodeIds,
  hasOwnArgument,
  normalizeBatchNodeIds,
} from "./node-batch.js";
import { requestedRunOrder } from "../../../engine/cost_estimate.js";
import { t } from "../../../../shared/i18n.js";
import {
  createWorkflowRunReceipt,
  presentWorkflowRunResult,
} from "./workflow-run-receipt.js";
import { nodesNeedingRun } from "../../../engine/workflow-staleness.js";

const def = getWorkflowToolDefinition("run_workflow");

/** Long enough for one web generation to finish; a stuck run still surfaces. */
export const RUN_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const RUN_WAIT_INTERVAL_MS = 500;

/**
 * Waits for a run that is already executing. A user pressing Generate while
 * the agent works used to fail this tool twice in a row, which ended the whole
 * agent turn. A pending confirmation is not waited on: only the user can
 * resolve it, so it still fails at once.
 */
async function waitForRunToFinish(context) {
  const deadline =
    Date.now() + (context.runWaitTimeoutMs ?? RUN_WAIT_TIMEOUT_MS);
  while (context.getStore().run?.status === "running") {
    if (context.signal?.aborted || Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, RUN_WAIT_INTERVAL_MS));
  }
}

async function executeNodeBatch(nodeIds, context) {
  const initialStore = context.getStore();
  const missingNodeIds = findMissingNodeIds(initialStore.nodes || [], nodeIds);
  if (missingNodeIds.length > 0) {
    throw createToolError(
      TOOL_ERROR_CODE.NODE_NOT_FOUND,
      `Cannot run node batch because these nodes do not exist: ${missingNodeIds.join(", ")}. No nodes were started.`,
      {
        missing: { nodes: missingNodeIds },
        details: {
          totalRequested: nodeIds.length,
          validNodeIds: nodeIds.filter(
            (nodeId) => !missingNodeIds.includes(nodeId),
          ),
          invalidNodeIds: missingNodeIds,
        },
        suggestion: {
          tool: "list_nodes",
          args: {},
          note: "Call list_nodes to get valid node ids, then retry.",
        },
      },
    );
  }

  const executionOrder = requestedRunOrder(
    initialStore.nodes || [],
    initialStore.edges || [],
    { onlyNodeIds: nodeIds },
  );
  // One agent batch is one store run. The store owns the shared async-final
  // commit, so all successful outputs land behind exactly one undo entry.
  // continueOnError preserves the tool's documented best-effort semantics;
  // strict order and concurrency 1 preserve the pre-existing execution order.
  let result;
  try {
    result = await initialStore.startRun({
      ...(context.signal ? { signal: context.signal } : {}),
      onlyNodeIds: executionOrder,
      preserveOrder: true,
      apiConcurrency: 1,
      continueOnError: true,
      ...(context.executionContext
        ? { agentContext: context.executionContext }
        : {}),
    });
  } catch (error) {
    result = {
      error: {
        code: error?.code || "run_exception",
        message: error?.message || t("agent.tool.runWorkflow.failed"),
      },
      execution: { requestedNodeIds: executionOrder, nodes: {} },
    };
  }
  if (result?.status === "ignored") {
    result = {
      ...result,
      error: {
        code: "run_ignored",
        message: t("agent.tool.runWorkflow.notStarted"),
      },
      execution: { requestedNodeIds: executionOrder, nodes: {} },
    };
  }
  return createWorkflowRunReceipt({
    result,
    store:
      result?.execution || result?.status === "pending"
        ? {}
        : context.getStore(),
    mode: "nodes",
    requestedNodeIds: nodeIds,
    executionOrder,
    batch: true,
  });
}

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    await waitForRunToFinish(context);
    const store = context.getStore();

    if (hasOwnArgument(args, "nodeIds")) {
      if (hasOwnArgument(args, "mode")) {
        throw createToolError(
          TOOL_ERROR_CODE.ARGS_INVALID,
          "nodeIds cannot be combined with mode.",
          {
            suggestion: {
              tool: null,
              args: {},
              note: "Use nodeIds for explicit targets, or mode for full/selected execution.",
            },
          },
        );
      }
      const nodeIds = normalizeBatchNodeIds(args.nodeIds, "nodeIds");
      if (store.run?.status === "running" || store.run?.pendingRequest) {
        throw createToolError(
          TOOL_ERROR_CODE.RUN_ALREADY_RUNNING,
          "A workflow run or confirmation is already in progress.",
          {
            missing: { run: ["status=idle", "pendingRequest=null"] },
            suggestion: {
              tool: null,
              args: {},
              note: "Finish or dismiss the current run request, then retry.",
            },
          },
        );
      }
      if (typeof store.startRun !== "function") {
        throw createToolError(
          TOOL_ERROR_CODE.STORE_UNAVAILABLE,
          "Workflow runner is not available in this environment.",
          {
            missing: { store: ["startRun"] },
            suggestion: {
              tool: null,
              args: {},
              note: "Open the workflow canvas in a supported VOO environment, then retry.",
            },
          },
        );
      }
      return executeNodeBatch(nodeIds, context);
    }

    // A run already in progress would be silently ignored by startRun —
    // surface it as a structured error instead of a fake "started" receipt.
    if (store.run?.status === "running") {
      throw createToolError(
        TOOL_ERROR_CODE.RUN_ALREADY_RUNNING,
        "A workflow run is already in progress.",
        {
          missing: { run: ["status=running"] },
          suggestion: {
            tool: null,
            args: {},
            note: "Wait for the running workflow to finish, or stop it, then retry.",
          },
        },
      );
    }

    // VOO's runner action is startRun; "full" = run everything, "selected" =
    // run exactly the currently selected nodes, in their dependency order.
    // In Ask mode startRun parks the request behind a canvas confirmation
    // card and reports { status: "pending" } instead of starting.
    if (typeof store.startRun === "function") {
      let options = {};
      if (args.mode === "selected") {
        const selectedIds = (store.nodes || [])
          .filter((n) => n.selected)
          .map((n) => n.id);
        if (selectedIds.length === 0) {
          throw createToolError(
            TOOL_ERROR_CODE.NO_SELECTION,
            "No nodes are selected to run.",
            {
              missing: { selection: ["workflow nodes"] },
              suggestion: {
                tool: null,
                args: {},
                note: "Select one or more runnable nodes, or run the full workflow instead.",
              },
            },
          );
        }
        options = { onlyNodeIds: selectedIds };
      } else if (args.mode === "stale") {
        const pendingIds = nodesNeedingRun(
          store.nodes || [],
          store.edges || [],
        );
        if (pendingIds.length === 0) {
          return {
            status: "up_to_date",
            mode: "stale",
            requestedNodeIds: [],
            executionOrder: [],
            total: 0,
            succeeded: 0,
            failed: 0,
            skipped: 0,
            nodes: [],
          };
        }
        options = { onlyNodeIds: pendingIds };
      }
      const executionOrder = requestedRunOrder(
        store.nodes || [],
        store.edges || [],
        options,
      );
      const result = await store.startRun({
        ...(context.signal ? { signal: context.signal } : {}),
        ...options,
        ...(context.executionContext
          ? { agentContext: context.executionContext }
          : {}),
      });
      if (result?.status === "ignored") {
        throw createToolError(
          TOOL_ERROR_CODE.RUN_ALREADY_RUNNING,
          "The workflow could not start because another run is in progress.",
          {
            missing: { run: ["status=idle"] },
            suggestion: {
              tool: null,
              args: {},
              note: "Wait for the running workflow to finish, or stop it, then retry.",
            },
          },
        );
      }
      return createWorkflowRunReceipt({
        result,
        store:
          result?.execution || result?.status === "pending"
            ? {}
            : context.getStore(),
        mode: args.mode || "full",
        executionOrder,
      });
    }

    throw createToolError(
      TOOL_ERROR_CODE.STORE_UNAVAILABLE,
      "Workflow runner is not available in this environment.",
      {
        missing: { store: ["startRun"] },
        suggestion: {
          tool: null,
          args: {},
          note: "Open the workflow canvas in a supported VOO environment, then retry.",
        },
      },
    );
  },

  presentCall(args) {
    if (Array.isArray(args.nodeIds)) {
      return {
        title: t("agent.tool.runBatch.call", { count: args.nodeIds.length }),
        icon: "play",
      };
    }
    return {
      title: t(
        args.mode === "selected"
          ? "agent.tool.runWorkflow.callSelected"
          : args.mode === "stale"
            ? "agent.tool.runWorkflow.callStale"
            : "agent.tool.runWorkflow.callFull",
      ),
      icon: "play",
    };
  },

  presentResult(_args, result) {
    if (result.batch && !["cancelled", "in_progress"].includes(result.status)) {
      if (result.status === "pending_confirmation") {
        return {
          title: t("agent.tool.runBatch.pending", { count: result.total }),
          status: "in_progress",
        };
      }
      return {
        title: t("agent.tool.runBatch.result", {
          succeeded: result.succeeded,
          count: result.total,
        }),
        status: result.status === "completed" ? "completed" : "failed",
      };
    }
    return presentWorkflowRunResult(result);
  },
});
