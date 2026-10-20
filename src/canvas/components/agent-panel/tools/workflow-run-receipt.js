import { t } from "../../../../shared/i18n.js";
import { errorExplanation } from "../../../error_text.js";
import { webGenerationAdvice } from "./generation-route.js";

function nodeReceipt(nodeId, data, phase, error, nodeType) {
  if (data?.status === "success") {
    const resultIds = data.resultIds ?? data.results;
    return {
      nodeId,
      status: "success",
      ...(Array.isArray(resultIds) ? { resultIds: [...resultIds] } : {}),
    };
  }
  if (phase === "pending_confirmation") {
    return { nodeId, status: "pending_confirmation" };
  }
  if (data?.status === "error" || data?.status === "failed") {
    // A failed website attempt must stay askable: the agent has to be able to
    // name the platform and the route to switch to instead of silently
    // rerouting the user's paid work to an API model.
    const advice = webGenerationAdvice({ nodeId, data, nodeType });
    // `error` is passed through whole — the code is the machine-readable cause
    // the turn's failure breaker keys on — but a code on its own leaves the
    // model with nothing to act on or repeat to the user. `explanation` is the
    // sentence the run banner would show for that code; it is absent for a code
    // with no authored copy, because there is then nothing to say but the code.
    const explanation = errorExplanation(data.error ?? error ?? null);
    return {
      nodeId,
      status: "failed",
      error: data.error ?? error ?? null,
      ...(explanation ? { explanation } : {}),
      ...(data.webGeneration
        ? {
            recovery: {
              mode: "collect_existing_web_generation",
              operationId: data.webGeneration.operationId,
              tool: "run_workflow",
              args: { nodeIds: [nodeId] },
            },
          }
        : {}),
      ...(advice ? { webGenerationAdvice: advice } : {}),
    };
  }
  if (data?.status === "skipped") return { nodeId, status: "skipped" };
  if (phase === "cancelled" || phase === "in_progress") {
    return { nodeId, status: phase };
  }
  const failure = error ?? {
    code: "run_not_completed",
    message: t("agent.tool.runWorkflow.notCompleted"),
  };
  const explanation = errorExplanation(failure);
  return {
    nodeId,
    status: "failed",
    error: failure,
    ...(explanation ? { explanation } : {}),
  };
}

function executionPhase(result, store) {
  const status = result.execution?.status;
  if (result.cancelled) return "cancelled";
  if (result.status === "pending" || status === "waiting-confirmation") {
    return "pending_confirmation";
  }
  if (status === "stopped") return "cancelled";
  if (["prepared", "running", "recovering"].includes(status)) {
    return "in_progress";
  }
  if (!result.execution && store.run?.status === "stopped") {
    return "cancelled";
  }
  return null;
}

/**
 * startRun resolves after the engine settles, even when its legacy transport
 * status says "started". Prefer its durable snapshot: live nodes may belong
 * to another workflow, and replay must report the original execution.
 */
export function createWorkflowRunReceipt({
  result = {},
  store,
  mode,
  requestedNodeIds,
  executionOrder,
  batch = false,
}) {
  const execution = result.execution;
  const order = execution?.requestedNodeIds ?? executionOrder;
  const ids = batch ? requestedNodeIds : order;
  const runnableIds = new Set(order);
  const phase = executionPhase(result, store);
  const error = execution
    ? (execution.error ?? result.error ?? null)
    : (result.error ?? store.run?.error ?? null);
  const liveById = new Map(
    (store.nodes ?? []).map((node) => [node.id, node.data]),
  );
  // The durable execution snapshot carries node data only, so the type used to
  // pick the API route to offer comes from the live canvas.
  const typeById = new Map(
    (store.nodes ?? []).map((node) => [node.id, node.type]),
  );
  const nodes = ids.map((nodeId) => {
    if (!runnableIds.has(nodeId)) return { nodeId, status: "not_runnable" };
    const data = execution
      ? execution.nodes?.[nodeId]
      : result.status === "pending" || result.cancelled
        ? null
        : liveById.get(nodeId);
    return nodeReceipt(nodeId, data, phase, error, typeById.get(nodeId));
  });
  // A run-level failure (a graph with a cycle, a node that vanished) reaches
  // the model the same way a node failure does: the code, plus what it means.
  const explanation = errorExplanation(error);
  const count = (status) =>
    nodes.filter((node) => node.status === status).length;
  const succeeded = count("success");
  let status = phase ?? "failed";
  if (!phase) {
    if (
      ids.length > 0 &&
      succeeded === ids.length &&
      !error &&
      (!execution || execution.status === "succeeded")
    )
      status = "completed";
    else if (succeeded > 0) status = "partial";
  }
  return {
    status,
    mode,
    ...(batch
      ? { batch: true, atomic: false, failurePolicy: "best_effort" }
      : {}),
    requestedNodeIds: ids,
    executionOrder: order,
    executionId: result.executionId ?? null,
    replayed: result.replayed === true,
    total: ids.length,
    succeeded,
    failed: count("failed"),
    skipped: count("skipped"),
    notRunnable: count("not_runnable"),
    pendingConfirmation: count("pending_confirmation"),
    nodes,
    ...(error ? { error } : {}),
    ...(explanation ? { explanation } : {}),
    history: {
      runUndoEntries: 0,
      outputUndoEntries: succeeded > 0 && !result.replayed ? 1 : 0,
      outputCommits: "single",
    },
  };
}

export function presentWorkflowRunResult(result) {
  const titles = {
    up_to_date: "agent.tool.runWorkflow.upToDate",
    pending_confirmation: "agent.tool.runWorkflow.pending",
    cancelled: "agent.tool.runWorkflow.cancelled",
    in_progress: "agent.tool.runWorkflow.inProgress",
    failed: "agent.tool.runWorkflow.failed",
    partial: "agent.tool.runWorkflow.partial",
    completed: "agent.tool.runWorkflow.completed",
  };
  return {
    title: t(titles[result.status] ?? titles.failed, {
      succeeded: result.succeeded ?? 0,
      count: result.total ?? 0,
    }),
    status: ["pending_confirmation", "in_progress"].includes(result.status)
      ? "in_progress"
      : ["completed", "up_to_date"].includes(result.status)
        ? "completed"
        : "failed",
  };
}
