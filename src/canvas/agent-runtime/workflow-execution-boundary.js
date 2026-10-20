import {
  estimateRunCalls,
  requestedRunOrder,
  shouldAskBeforeRun,
} from "../engine/cost_estimate.js";
import { isParallelApiNode } from "../engine/graph.js";
import { RUN_STATUS } from "../nodes/types.js";
import { DURABLE_EXECUTION_STATUS } from "./durable-execution-store.js";
import {
  DURABLE_RECOVERY_ACTION,
  planDurableExecutionRecovery,
} from "./durable-recovery-policy.js";
import {
  checkSerialExecutionGate,
  getWorkflowExecutionState,
} from "../../shared/workflow-execution-contract.js";

/** Opens or resumes the durable record before the workflow engine can run. */
export async function openWorkflowExecution({
  executionStore,
  workflowId,
  nodes,
  edges,
  options,
}) {
  const execution = options.resumeExecutionId
    ? await executionStore.resume(options.resumeExecutionId, workflowId)
    : await executionStore.prepare({
        workflowId,
        requestedNodeIds: requestedRunOrder(nodes, edges, options),
        request: {
          onlyNodeId: options.onlyNodeId ?? null,
          onlyNodeIds: options.onlyNodeIds ?? null,
          startFromNodeId: options.startFromNodeId ?? null,
          preserveOrder: Boolean(options.preserveOrder),
          apiConcurrency: options.apiConcurrency ?? null,
          continueOnError: Boolean(options.continueOnError),
          // Run-scoped brand constraint. Persisted so a resume replays the
          // same identity lock the original run resolved.
          identityLock: options.identityLock ?? null,
        },
        agentContext: options.agentContext,
      });
  if (!execution.replayed) {
    if (execution.status === DURABLE_EXECUTION_STATUS.PREPARED) {
      await execution.start();
    } else {
      await execution.beginRecovery();
      await execution.start();
    }
  }
  return execution;
}

/** Shared Ask/running gate before the durable workflow execution boundary. */
export async function requestWorkflowExecution({
  get,
  set,
  executionStore,
  options,
  performRun,
}) {
  if (get().run.pendingRequest) return { status: "pending" };
  const requestOptions =
    options.startFromNodeId && get().run.recoverableExecutionId
      ? {
          ...options,
          resumeExecutionId: get().run.recoverableExecutionId,
        }
      : options;

  const requestedIds =
    requestOptions.onlyNodeIds ??
    (requestOptions.onlyNodeId ? [requestOptions.onlyNodeId] : null);
  const requestedNodes = requestedIds
    ? requestedIds
        .map((id) => get().nodes.find((node) => node.id === id))
        .filter(Boolean)
    : null;
  const isParallelJob = Boolean(
    requestedNodes?.length > 0 &&
    requestedNodes.every((node) => isParallelApiNode(node)),
  );
  const gateCheck = checkSerialExecutionGate({
    currentStatus: get().run.status,
    isParallelJob,
  });
  if (!gateCheck.ok) return { status: "ignored" };

  const estimate = estimateRunCalls(get().nodes, get().edges, requestOptions);
  if (
    shouldAskBeforeRun({
      askBeforeRun: get().settings?.askBeforeRun,
      estimateTotal: estimate.total,
      runStatus: get().run.status,
      hasPendingRequest: Boolean(get().run.pendingRequest),
    })
  ) {
    set({ run: { ...get().run, pendingRequest: { ...requestOptions } } });
    return { status: "pending" };
  }

  const result = await performRun(get, set, executionStore, requestOptions);
  if (result?.status === "ignored") return result;
  return { status: "started", ...result };
}

/** Rehydrates the non-document execution summary used by UI and Agent context. */
export async function refreshWorkflowExecutionRecovery({
  executionStore,
  workflowId,
  get,
  set,
}) {
  if (!workflowId) return null;
  const recovery = await executionStore.recoverySnapshot(workflowId);
  // Storage can settle after navigation; never project another workflow here.
  if (get().workflowId !== workflowId) return null;
  const active = recovery.unfinished[0] ?? null;
  const plans = new Map(
    recovery.unfinished.map((record) => [
      record.id,
      planDurableExecutionRecovery(record, {
        nodes: get().nodes,
        edges: get().edges,
      }),
    ]),
  );
  const activePlan = active ? plans.get(active.id) : null;
  const remainingNodeIds = active
    ? active.requestedNodeIds.filter(
        (nodeId) => active.nodes?.[nodeId]?.status !== RUN_STATUS.SUCCESS,
      )
    : [];
  const durableExecutionRecovery = {
    unfinished: recovery.unfinished.map((record) => ({
      id: record.id,
      status: record.status,
      requestedNodeIds: [...record.requestedNodeIds],
      remainingNodeIds: record.requestedNodeIds.filter(
        (nodeId) => record.nodes?.[nodeId]?.status !== RUN_STATUS.SUCCESS,
      ),
      failedNodeIds: Object.entries(record.nodes ?? {})
        .filter(
          ([, node]) =>
            node.status === RUN_STATUS.ERROR || node.status === "failed",
        )
        .map(([nodeId]) => nodeId),
      agentContext: record.agentContext ?? null,
      recoveryAction: plans.get(record.id).action,
      recoveryReason: plans.get(record.id).reason,
      billableCount: plans.get(record.id).billableCount,
    })),
    failedNodeIds: active ? [...recovery.failedNodeIds] : [],
    latestExecutionId: recovery.latestExecutionId ?? null,
  };
  set({
    durableExecutionRecovery,
    durableExecutionError: null,
    run: {
      ...get().run,
      recoverableExecutionId: active?.id ?? null,
      resumeFrom: get().run.resumeFrom ?? remainingNodeIds[0] ?? null,
      failedNodeIds:
        active && recovery.failedNodeIds.length > 0
          ? [...recovery.failedNodeIds]
          : get().run.failedNodeIds,
      recovery: activePlan
        ? {
            executionId: active.id,
            status:
              activePlan.action === DURABLE_RECOVERY_ACTION.AUTO_RESUME
                ? "ready"
                : activePlan.action ===
                    DURABLE_RECOVERY_ACTION.REQUIRE_CONFIRMATION
                  ? "awaiting-confirmation"
                  : "blocked",
            reason: activePlan.reason,
            remainingNodeIds: [...activePlan.remainingNodeIds],
            billableCount: activePlan.billableCount,
            ...(activePlan.webPlatforms
              ? { webPlatforms: activePlan.webPlatforms }
              : {}),
          }
        : null,
    },
  });
  return durableExecutionRecovery;
}

export { getWorkflowExecutionState };
