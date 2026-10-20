/**
 * Run control actions for the agent loop: cancel the live turn, and
 * resume / abandon / pause / take over persisted runs.
 *
 * Extracted from useAgentLoop (AO3c). React-free: records live in the
 * injected RunStore, the live-turn refs are injected cells.
 *
 * @module agent-runtime/agent-run-control
 */

import {
  AGENT_RUN_STATUS,
  AGENT_STEP_STATUS,
  AGENT_STOP_REASON,
} from "./run-store.js";
import { projectTaskDeliverables } from "./task-deliverables.js";

/** A resumed run may execute only its recorded remaining workflow nodes. */
export function isRunWorkflowWithinRecoveryScope(run, toolName, args) {
  if (
    toolName !== "run_workflow" ||
    !run?.resumedFromRunId ||
    run.recoveryScopeRequired === false
  )
    return true;
  const allowed = new Set(run.retryNodeIds ?? []);
  return (
    allowed.size > 0 &&
    Array.isArray(args?.nodeIds) &&
    args.nodeIds.length > 0 &&
    args.nodeIds.every((id) => allowed.has(id))
  );
}

/** Cancel the current turn. */
export function cancelAgentTurn({
  cancelledRef,
  abortRef,
  runStoreRef,
  currentRunIdRef,
  bumpRuns,
}) {
  cancelledRef.current = true;
  abortRef.current?.abort();
  if (runStoreRef.current && currentRunIdRef.current) {
    runStoreRef.current.setRunStatus(
      currentRunIdRef.current,
      AGENT_RUN_STATUS.CANCELLED,
    );
    bumpRuns();
  }
}

/**
 * Starts a fresh run scoped to the failed nodes of a persisted run. The
 * original record remains immutable history; the new record links back via
 * `resumedFromRunId`, making retries auditable and preventing duplicate
 * execution of nodes that already succeeded.
 */
export async function resumeAgentRun(
  runId,
  { isRunning, ensureRunStore, sendMessage, getStore },
) {
  if (isRunning) return false;
  const store = ensureRunStore();
  const previous = store.getRun(runId);
  const retryNodeIds = store.getRetryNodeIds(runId);
  const deliveryIncomplete =
    previous?.status === AGENT_RUN_STATUS.COMPLETED &&
    retryNodeIds.length > 0 &&
    projectTaskDeliverables(previous, getStore?.()?.nodes ?? []).status ===
      "incomplete";
  if (
    !previous ||
    (!store.canResumeRun(runId) &&
      !store.canRetryRun(runId) &&
      !deliveryIncomplete)
  )
    return false;
  const workflowReceipts = (previous.changeSets || []).filter(
    (entry) => entry.toolName === "run_workflow",
  );
  // Without a recorded remaining-node scope, a fresh agent prompt could
  // submit a paid request again under a new run/idempotency key.
  if (workflowReceipts.length > 0 && retryNodeIds.length === 0) return false;
  const scope =
    retryNodeIds.length > 0
      ? `仅重试失败节点（nodeIds: ${retryNodeIds.join(", ")}），跳过已成功节点。`
      : "仅继续上次未完成的步骤，跳过已经成功的节点，不要重复提交已完成的生成任务。";
  const completed = (previous.steps || [])
    .filter((step) => step.status === AGENT_STEP_STATUS.COMPLETED)
    .map((step) => ({
      objective: step.objective,
      result:
        step.result ??
        step.expectedResult ??
        step.verification ??
        step.output ??
        "completed",
    }));
  const context = JSON.stringify({ plan: previous.plan, completed });
  const prompt = `继续任务：${previous.objective || "未命名任务"}。${scope} 这是从运行记录 ${runId} 恢复的执行。已完成步骤上下文：${context}。请先读取现有画布和运行状态，再执行必要工具并验证结果。`;
  await sendMessage(prompt, {
    displayText: prompt,
    resumedFromRunId: runId,
    retryNodeIds,
    recoveryScopeRequired: workflowReceipts.length > 0,
    deliverableRequirements: previous.deliverableRequirements ?? null,
  });
  return true;
}

export function abandonAgentRun(runId, { ensureRunStore, bumpRuns }) {
  const store = ensureRunStore();
  const run = store.getRun(runId);
  if (
    !run ||
    [AGENT_RUN_STATUS.COMPLETED, AGENT_RUN_STATUS.CANCELLED].includes(
      run.status,
    )
  )
    return false;
  store.setRunStatus(runId, AGENT_RUN_STATUS.CANCELLED, {
    stopReason: AGENT_STOP_REASON.CANCELLED,
  });
  bumpRuns();
  return true;
}

export function pauseAgentRun(runId, { ensureRunStore, bumpRuns }) {
  if (!runId) return false;
  const run = ensureRunStore().getRun(runId);
  if (!run || run.status !== AGENT_RUN_STATUS.RUNNING) return false;
  ensureRunStore().setRunStatus(runId, AGENT_RUN_STATUS.STOPPED, {
    stopReason: AGENT_STOP_REASON.ERROR,
  });
  bumpRuns();
  return true;
}

export async function takeoverAgentRun(runId, { ensureRunStore, resumeRun }) {
  const run = ensureRunStore().getRun(runId);
  if (
    !run ||
    ![AGENT_RUN_STATUS.WAITING_INPUT, AGENT_RUN_STATUS.STOPPED].includes(
      run.status,
    )
  )
    return false;
  return resumeRun(runId);
}
