/**
 * UI-independent seam for agent tool dispatch and tool-call stage execution.
 *
 * Owns single-tool dispatch through an injected dispatcher, tool result appending,
 * and turn-level tool call stage orchestration.
 *
 * React-free module: all hooks, callbacks, stores, and registries are injected.
 *
 * @module agent-runtime/agent-loop-controller
 */

import {
  createToolError,
  failureReceipt,
  TOOL_ERROR_CODE,
} from "../components/agent-panel/tools/errors.js";
import {
  assertCanDispatchTool,
  getWorkflowExecutionState,
} from "../../shared/workflow-execution-contract.js";
import { AGENT_RUN_STATUS } from "./run-store.js";
import { executeSingleToolCall } from "./agent-tool-execution.js";
import {
  appendObservationMessage,
  prepareObservationReceipt,
} from "./agent-observation-messages.js";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

/** Dispatch exactly one tool call through the injected runtime dispatcher. */
export async function dispatchAgentTool({
  toolDispatcher,
  toolName,
  args,
  context,
} = {}) {
  return requireFunction(toolDispatcher, "toolDispatcher")(
    toolName,
    args ?? {},
    context,
  );
}

/**
 * Append a tool result message to the conversation history in OpenAI format.
 */
export function appendToolResult(
  messages,
  toolCallId,
  result,
  visualContext = {},
) {
  const receipt =
    result.success &&
    ["observe_canvas", "computer_observe", "computer_act"].includes(
      visualContext.toolName,
    )
      ? prepareObservationReceipt(result.result, visualContext)
      : result.result;
  const content = result.success
    ? JSON.stringify(receipt ?? { ok: true })
    : JSON.stringify(failureReceipt(result.error));

  messages.push({
    role: "tool",
    tool_call_id: toolCallId,
    content,
  });
}

/**
 * Orchestrates the execution of a batch of pending tool calls in an agent step.
 */
export async function executeToolCallStage({
  pendingToolCalls,
  messages,
  controller,
  cancelledRef,
  run,
  runStore,
  getStore,
  registry,
  approvalMode,
  requestApproval,
  requestPlanApproval,
  planReviewEnabled = false,
  onRequestUserInput,
  emit,
  bumpRuns,
  currentStepIdRef,
  spentBudgetRef,
  approvedBudgetRef,
  t,
  displayText,
  targetWorkflowId,
  observedRevsRef,
  agentModifiedIdsRef,
  staleReplanCountRef,
  verifyRetryCountRef,
  failureBreaker,
  pendingPlanFailureRef,
  activeToolNamesRef,
  glanceAtCanvas,
  recordCost,
  providerId,
  model,
  baseUrl,
  apiKey,
  initialSawPlan = false,
  initialLatestPlanItems = [],
  initialLatestPlanExplanation = null,
  initialWorkflowRunCompleted = false,
  initialSuccessfulMutation = false,
  initialCreatedAssetBatch = false,
  initialAttemptedWorkflowRun = false,
}) {
  const state = {
    observations: [],
    continueLoop: true,
    stepVerificationFailure: false,
    verificationExceededFailed: false,
    verificationFailureIssues: [],
    repeatedFailure: null,
    createdAssetBatch: initialCreatedAssetBatch,
    attemptedWorkflowRun: initialAttemptedWorkflowRun,
    workflowRunCompleted: initialWorkflowRunCompleted,
    successfulMutation: initialSuccessfulMutation,
    sawPlan: initialSawPlan,
    latestPlanItems: initialLatestPlanItems,
    latestPlanExplanation: initialLatestPlanExplanation,
  };

  for (const toolCall of pendingToolCalls) {
    const executionState = getWorkflowExecutionState(run);
    const isRunCancelled =
      cancelledRef.current ||
      controller.signal.aborted ||
      runStore.getRun(run.id)?.status === AGENT_RUN_STATUS.CANCELLED;
    const persistedStatus = runStore.getRun(run.id)?.status;
    if (
      persistedStatus === AGENT_RUN_STATUS.STOPPED ||
      persistedStatus === AGENT_RUN_STATUS.WAITING_INPUT
    ) {
      state.continueLoop = false;
      break;
    }
    const dispatchCheck = assertCanDispatchTool({
      signal: controller.signal,
      isCancelled: isRunCancelled,
      executionStatus: executionState.status,
    });
    if (!dispatchCheck.canDispatch || isRunCancelled) {
      appendToolResult(messages, toolCall.id, {
        success: false,
        error: createToolError(
          TOOL_ERROR_CODE.OPERATION_ABORTED,
          dispatchCheck.error?.message || "Operation cancelled",
        ),
      });
      state.continueLoop = false;
      break;
    }

    const outcome = await executeSingleToolCall({
      toolCall,
      messages,
      controller,
      cancelledRef,
      run,
      runStore,
      getStore,
      registry,
      approvalMode,
      requestApproval,
      requestPlanApproval,
      planReviewEnabled,
      onRequestUserInput,
      emit,
      bumpRuns,
      currentStepIdRef,
      spentBudgetRef,
      approvedBudgetRef,
      t,
      displayText,
      targetWorkflowId,
      observedRevsRef,
      agentModifiedIdsRef,
      staleReplanCountRef,
      verifyRetryCountRef,
      failureBreaker,
      pendingPlanFailureRef,
      activeToolNamesRef,
      glanceAtCanvas,
      recordCost,
      providerId,
      model,
      baseUrl,
      apiKey,
      state,
    });

    if (outcome.shouldBreak) {
      state.continueLoop = false;
      break;
    }
    if (outcome.shouldContinue) {
      continue;
    }
    if (!state.continueLoop) {
      break;
    }
  }

  appendObservationMessage(messages, state.observations);
  return state;
}
