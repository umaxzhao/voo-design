/**
 * Agent Tool Execution — execution and outcome processing for a single tool call.
 *
 * Coordinates pre-execution gating, ChangeSet opening, tool dispatch, verifier,
 * and post-execution event emitting for one tool call.
 *
 * React-free module: all callbacks, stores, and registries are injected.
 *
 * @module agent-runtime/agent-tool-execution
 */

import {
  captureBeforeSnapshot,
  computeChangeSetUndo,
} from "./agent-changeset-stage.js";
import { executeToolWithVerification } from "./agent-tool-stage.js";
import {
  handleToolSideEffects,
  executeCanvasGlance,
  finalizeToolAccounting,
  emitToolPresentation,
} from "./agent-receipt-stage.js";
import { prepareToolCall } from "./agent-prepare-stage.js";
import { appendToolResult } from "./agent-loop-controller.js";
import { capturePreExecutionState } from "../components/agent-panel/verifier.js";
import {
  isCompletedLayoutReceipt,
  isConnectedAssetBatch,
} from "../components/agent-panel/turn-completion-policy.js";
import {
  EVENT_TYPE,
  ITEM_TYPE,
  STATUS,
} from "../components/agent-panel/eventTypes.js";
import { AGENT_RUN_STATUS, AGENT_STEP_STATUS } from "./run-store.js";

/**
 * Executes a single tool call from start to completion.
 */
export async function executeSingleToolCall({
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
  state,
}) {
  const prepared = await prepareToolCall({
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
    pendingPlanFailureRef,
    providerId,
    model,
    baseUrl,
    apiKey,
    state,
  });

  if (!prepared.ready) {
    return {
      shouldBreak: Boolean(prepared.shouldBreak),
      shouldContinue: Boolean(prepared.shouldContinue),
    };
  }

  const {
    toolName,
    args,
    toolContext,
    changeSetId,
    isReviewableTool,
    isMutatingTool,
    isInputRequest,
    handler,
    estCost,
    isCostEstimated,
    toolCapabilities,
  } = prepared;

  const beforeSnapshot = captureBeforeSnapshot({
    isReviewable: isReviewableTool,
    getStore,
  });

  const preExecutionState = await capturePreExecutionState(
    toolName,
    args,
    toolContext,
  );

  const execResult = await executeToolWithVerification({
    toolDispatcher: (name, a, ctx) => registry.dispatch(name, a, ctx),
    toolName,
    args,
    toolContext,
    toolCapabilities,
    verifyRetryCount: verifyRetryCountRef.current,
    preExecutionState,
    undoData: null,
    runId: run.id,
    runStore,
    currentStepId: currentStepIdRef.current,
    registry,
    getStore,
    changeSetId,
  });

  const result = execResult.result;
  const verifyOutcome = execResult.verifyOutcome;
  if (execResult.stepVerificationFailure) {
    state.stepVerificationFailure = true;
  }
  if (execResult.verificationExceededFailed) {
    state.verificationExceededFailed = true;
    state.verificationFailureIssues = execResult.verificationFailureIssues;
    state.continueLoop = false;
  }

  const undoData = computeChangeSetUndo({
    isReviewable: isReviewableTool,
    resultSuccess: result.success,
    beforeSnapshot,
    getStore,
  });

  if (
    toolName === "create_node" &&
    result.success &&
    isConnectedAssetBatch(args, {
      platform: /\bchatgpt\b/i.test(displayText) ? "chatgpt" : null,
    })
  ) {
    state.createdAssetBatch = true;
  }

  if (toolName === "run_workflow") {
    state.attemptedWorkflowRun = true;
    state.workflowRunCompleted =
      result.success && result.result?.status === "completed";
    if (state.workflowRunCompleted && state.latestPlanItems.length > 0) {
      emit({
        type: EVENT_TYPE.ITEM_UPDATED,
        item: {
          id: "active_plan",
          type: ITEM_TYPE.TODO_LIST,
          items: state.latestPlanItems,
          explanation: state.latestPlanExplanation,
          executionVerified: true,
          status: STATUS.IN_PROGRESS,
        },
      });
    }
  }

  // generate_layout executes and materializes its Design document itself.
  // Treat its successful receipt as generation completion, otherwise the
  // generic workflow guard asks the model to run it again indefinitely.
  if (isCompletedLayoutReceipt(toolName, result)) {
    state.attemptedWorkflowRun = true;
    state.workflowRunCompleted = true;
  }

  if (result.success && registry.getCapabilities(toolName)?.mutates) {
    state.successfulMutation = true;
  }

  if (cancelledRef.current || controller.signal.aborted) {
    state.continueLoop = false;
  }

  handleToolSideEffects({
    toolName,
    args,
    result,
    isMutatingTool,
    activeToolNamesRef,
    observedRevsRef,
    agentModifiedIdsRef,
    getStore,
  });

  appendToolResult(messages, toolCall.id, result, {
    toolName,
    model,
    observations: state.observations,
  });

  await executeCanvasGlance({
    toolName,
    result,
    cancelledRef,
    signal: controller.signal,
    glanceAtCanvas,
    emit,
    t,
    toolCallId: toolCall.id,
  });

  const { reviewable } = finalizeToolAccounting({
    run,
    runStore,
    currentStepIdRef,
    changeSetId,
    result,
    toolName,
    toolCallId: toolCall.id,
    args,
    estCost,
    isCostEstimated,
    undoData,
    verifyOutcome,
    approvalMode,
    registry,
    recordCost,
    failureBreaker,
    pendingPlanFailureRef,
    state,
  });

  if (isInputRequest) {
    runStore.setRunStatus(run.id, AGENT_RUN_STATUS.RUNNING);
    runStore.updateStep(run.id, currentStepIdRef.current, {
      status: AGENT_STEP_STATUS.RUNNING,
    });
  }
  bumpRuns();

  emitToolPresentation({
    toolCallId: toolCall.id,
    toolName,
    args,
    result,
    reviewable,
    handler,
    undoData,
    emit,
  });

  return { shouldContinue: false };
}
