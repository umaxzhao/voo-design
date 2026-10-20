/**
 * Turn close-out: decide the terminal run/step status, apply the deferred
 * plan-step failure, persist the outcome, and emit the terminal events.
 *
 * Extracted from useAgentLoop.sendMessage (AO3b). React-free: every
 * collaborator arrives through the injected ctx.
 *
 * @module agent-runtime/agent-turn-close
 */

import {
  EVENT_TYPE,
  ITEM_TYPE,
  STATUS,
} from "../components/agent-panel/eventTypes.js";
import {
  AGENT_RUN_STATUS,
  AGENT_STEP_STATUS,
  AGENT_STOP_REASON,
} from "./run-store.js";
import { markPlanStepFailed } from "./plan-model.js";
import { requiresWorkflowExecution } from "../components/agent-panel/turn-completion-policy.js";
import { generateAgentEventId } from "./agent-event-ids.js";
import { autoTidyTurnCreatedNodes } from "./agent-turn-tidy.js";

export function closeAgentTurn({ turn, run, runStore, ctx }) {
  const { cancelledRef, currentStepIdRef, pendingPlanFailureRef, emit, bumpRuns, tokenBudget, usageRef, budgetUsedRef } =
    ctx;

  // ── Close the run record with the actual outcome. Read the cancel
  const existingRun = runStore.getRun(run.id);
  const wasCancelled =
    cancelledRef.current ||
    ctx.controller.signal.aborted ||
    existingRun?.status === AGENT_RUN_STATUS.CANCELLED;
  const reachedStepLimit =
    turn.continueLoop && turn.stepCount >= ctx.maxStepsPerTurn;

  let finalRunStatus;
  let finalStepStatus;
  let stopReason;

  if (
    existingRun?.status === AGENT_RUN_STATUS.STOPPED &&
    existingRun?.stopReason === AGENT_STOP_REASON.BUDGET_EXHAUSTED
  ) {
    finalRunStatus = AGENT_RUN_STATUS.STOPPED;
    finalStepStatus = AGENT_STEP_STATUS.STOPPED;
    stopReason = AGENT_STOP_REASON.BUDGET_EXHAUSTED;
  } else if (turn.verificationExceededFailed) {
    finalRunStatus = AGENT_RUN_STATUS.FAILED;
    finalStepStatus = AGENT_STEP_STATUS.FAILED;
    stopReason = AGENT_STOP_REASON.ERROR;
  } else if (wasCancelled) {
    finalRunStatus = AGENT_RUN_STATUS.CANCELLED;
    finalStepStatus = AGENT_STEP_STATUS.CANCELLED;
    stopReason = AGENT_STOP_REASON.CANCELLED;
  } else if (turn.budgetExhausted) {
    finalRunStatus = AGENT_RUN_STATUS.FAILED;
    finalStepStatus = AGENT_STEP_STATUS.FAILED;
    stopReason = AGENT_STOP_REASON.BUDGET_EXHAUSTED;
  } else if (turn.repeatedFailure) {
    finalRunStatus = AGENT_RUN_STATUS.FAILED;
    finalStepStatus = AGENT_STEP_STATUS.FAILED;
    stopReason = AGENT_STOP_REASON.ERROR;
  } else if (turn.executionIncomplete) {
    finalRunStatus = AGENT_RUN_STATUS.FAILED;
    finalStepStatus = AGENT_STEP_STATUS.FAILED;
    stopReason = AGENT_STOP_REASON.ERROR;
  } else if (reachedStepLimit) {
    finalRunStatus = AGENT_RUN_STATUS.STOPPED;
    finalStepStatus = AGENT_STEP_STATUS.STOPPED;
    stopReason = AGENT_STOP_REASON.MAX_STEPS;
  } else {
    finalRunStatus = AGENT_RUN_STATUS.COMPLETED;
    finalStepStatus = AGENT_STEP_STATUS.COMPLETED;
    stopReason = AGENT_STOP_REASON.COMPLETED;
  }

  const externallyPaused =
    runStore.getRun(run.id)?.status === AGENT_RUN_STATUS.STOPPED &&
    existingRun?.stopReason !== AGENT_STOP_REASON.BUDGET_EXHAUSTED;
  if (externallyPaused && !cancelledRef.current) {
    finalRunStatus = AGENT_RUN_STATUS.STOPPED;
    finalStepStatus = AGENT_STEP_STATUS.STOPPED;
    stopReason = AGENT_STOP_REASON.ERROR;
  }

  // Apply the deferred plan-step failure: the turn ended without the
  // model retrying the failed tool. User cancellation leaves the step
  // untouched — stopping is not the model declining to retry.
  const pendingPlanFailure = pendingPlanFailureRef.current;
  if (pendingPlanFailure && !wasCancelled) {
    pendingPlanFailureRef.current = null;
    const currentPlan = runStore.getRun(run.id)?.plan;
    const failedPlan = currentPlan
      ? markPlanStepFailed(currentPlan, pendingPlanFailure.stepId)
      : null;
    if (failedPlan && failedPlan !== currentPlan) {
      runStore.updateRun(run.id, { plan: failedPlan });
      turn.latestPlanItems = failedPlan.steps;
      emit({
        type: EVENT_TYPE.ITEM_UPDATED,
        item: {
          id: "active_plan",
          type: ITEM_TYPE.TODO_LIST,
          items: turn.latestPlanItems,
          explanation: turn.latestPlanExplanation,
          executionVerified:
            !requiresWorkflowExecution(turn.userText) ||
            turn.workflowRunCompleted,
          status: STATUS.IN_PROGRESS,
        },
      });
    }
  }

  runStore.updateRun(run.id, {
    status: finalRunStatus,
    stopReason,
    ...(turn.verificationExceededFailed
      ? { issues: turn.verificationFailureIssues }
      : {}),
  });
  if (currentStepIdRef.current) {
    runStore.updateStep(run.id, currentStepIdRef.current, {
      status: finalStepStatus,
      stopReason,
    });
  }
  bumpRuns();

  if (!wasCancelled) {
    autoTidyTurnCreatedNodes({
      run,
      runStore,
      getStore: ctx.getStore,
      initialNodeIds: turn?.initialNodeIds,
    });
  }

  if (turn.budgetExhausted) {
    emit({
      type: EVENT_TYPE.ITEM_COMPLETED,
      item: {
        id: generateAgentEventId("budget"),
        type: ITEM_TYPE.ERROR,
        code: "budgetExhausted",
        params: { budget: tokenBudget.toLocaleString() },
        message: `Token budget of ${tokenBudget.toLocaleString()} reached — session stopped.`,
        status: STATUS.COMPLETED,
      },
    });
  } else if (cancelledRef.current) {
    // A user stop is not a silent normal finish — say so.
    cancelledRef.current = false;
    emit({
      type: EVENT_TYPE.ITEM_COMPLETED,
      item: {
        id: generateAgentEventId("stopped"),
        type: ITEM_TYPE.ERROR,
        code: "stopped",
        message: "Stopped by user.",
        status: STATUS.COMPLETED,
      },
    });
  } else if (turn.repeatedFailure) {
    emit({
      type: EVENT_TYPE.ITEM_COMPLETED,
      item: {
        id: generateAgentEventId("repeated_failure"),
        type: ITEM_TYPE.ERROR,
        code: turn.repeatedFailure.unrecoverable
          ? "unrecoverableToolFailure"
          : "repeatedToolFailure",
        params: {
          tool: turn.repeatedFailure.toolName,
          error: turn.repeatedFailure.error,
          count: turn.repeatedFailure.count,
        },
        message: `${turn.repeatedFailure.toolName} failed: ${turn.repeatedFailure.error}`,
        status: STATUS.FAILED,
      },
    });
  } else if (turn.executionIncomplete) {
    emit({
      type: EVENT_TYPE.ITEM_COMPLETED,
      item: {
        id: generateAgentEventId("execution_incomplete"),
        type: ITEM_TYPE.ERROR,
        code: "executionIncomplete",
        message:
          "The agent stopped before the planned canvas work was executed.",
        status: STATUS.FAILED,
      },
    });
  } else if (turn.stepCount >= ctx.maxStepsPerTurn) {
    emit({
      type: EVENT_TYPE.ITEM_COMPLETED,
      item: {
        id: generateAgentEventId("warn"),
        type: ITEM_TYPE.ERROR,
        code: "maxSteps",
        params: { steps: ctx.maxStepsPerTurn },
        message: `Turn stopped after ${ctx.maxStepsPerTurn} steps to prevent infinite loops.`,
        status: STATUS.COMPLETED,
      },
    });
  }

  emit({
    type: EVENT_TYPE.TURN_COMPLETED,
    usage: usageRef.current,
    budgetUsed: budgetUsedRef.current,
  });
}
