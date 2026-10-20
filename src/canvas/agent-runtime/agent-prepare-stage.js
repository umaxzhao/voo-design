/**
 * Agent Prepare Stage — pre-execution validation, gating, and context assembly.
 *
 * Coordinates argument parsing, budget evaluation, plan update handling, approval
 * policy checks, ChangeSet initiation, workflow consistency assertions, and stale
 * revision checks before tool execution begins.
 *
 * React-free module: all stores, signals, and registries are injected.
 *
 * @module agent-runtime/agent-prepare-stage
 */

import {
  openChangeSet,
  validateWorkflowConsistency,
  createToolExecutionContext,
} from "./agent-changeset-stage.js";
import { parseToolArguments, checkApprovalGating } from "./agent-tool-stage.js";
import { evaluateBudgetGating } from "./agent-budget-stage.js";
import { resolveStaleRevision } from "./agent-stale-stage.js";
import {
  createToolError,
  TOOL_ERROR_CODE,
} from "../components/agent-panel/tools/errors.js";
import { getWorkflowExecutionState } from "../../shared/workflow-execution-contract.js";
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
import { mergeReplan, PlanValidationError } from "./plan-model.js";
import {
  PLAN_REVIEW_DECISION,
  resolvePlanReviewDecision,
  shouldGatePlan,
} from "./plan-review-gate.js";
import { requiresWorkflowExecution } from "../components/agent-panel/turn-completion-policy.js";
import { appendToolResult } from "./agent-loop-controller.js";
import { isRunWorkflowWithinRecoveryScope } from "./agent-run-control.js";

/**
 * Prepares a tool call for execution: validates arguments, budget, approval,
 * workflow consistency, and concurrency conflicts.
 *
 * Returns `{ ready: true, args, toolContext, changeSetId, isReviewableTool }`
 * or `{ ready: false, shouldBreak, shouldContinue }`.
 */
export async function prepareToolCall({
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
  pendingPlanFailureRef,
  providerId,
  model,
  baseUrl,
  apiKey,
  state,
}) {
  const toolName = toolCall.function.name;
  if (pendingPlanFailureRef.current?.toolName === toolName) {
    pendingPlanFailureRef.current = null;
  }

  const parseResult = parseToolArguments(toolCall);
  if (!parseResult.ok) {
    appendToolResult(messages, toolCall.id, {
      success: false,
      error: parseResult.error,
    });
    return { ready: false, shouldContinue: true };
  }
  const args = parseResult.args;

  if (!isRunWorkflowWithinRecoveryScope(run, toolName, args)) {
    appendToolResult(messages, toolCall.id, {
      success: false,
      error: createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        "Recovered runs may execute only recorded remaining nodeIds; full and selected runs are blocked.",
      ),
    });
    return { ready: false, shouldContinue: true };
  }

  const budgetResult = await evaluateBudgetGating({
    registry,
    toolName,
    args,
    toolCall,
    run,
    approvedBudget: approvedBudgetRef.current,
    spentBudget: spentBudgetRef.current,
    runStore,
    currentStepId: currentStepIdRef.current,
    bumpRuns,
    onRequestUserInput,
    t,
  });

  if (budgetResult.newBudget !== undefined) {
    approvedBudgetRef.current = budgetResult.newBudget;
  }

  if (budgetResult.shouldBreak) {
    appendToolResult(messages, toolCall.id, {
      success: false,
      error: createToolError(
        TOOL_ERROR_CODE.OPERATION_ABORTED,
        budgetResult.stopDetail,
      ),
    });
    emit({
      type: EVENT_TYPE.ITEM_COMPLETED,
      item: {
        id: toolCall.id,
        type: ITEM_TYPE.COMMAND_EXECUTION,
        command: toolName,
        status: STATUS.FAILED,
        error: budgetResult.stopDetail,
      },
    });
    return { ready: false, shouldBreak: true };
  }

  const estCost = budgetResult.estCost;
  const isCostEstimated = budgetResult.isCostEstimated;
  const costUnknown = budgetResult.costUnknown === true;
  const externalWebsiteCostUnknown =
    budgetResult.externalWebsiteCostUnknown === true;

  // Hoisted out of the update_plan block: the loop-level review gate below
  // needs the merged plan after the merge/reduce persisted it.
  let mergedPlan = null;
  if (toolName === "update_plan") {
    state.sawPlan = true;
    try {
      mergedPlan = mergeReplan(runStore.getRun(run.id)?.plan, args.plan || []);
    } catch {
      mergedPlan = null;
    }
    if (mergedPlan) {
      runStore.updateRun(run.id, { plan: mergedPlan });
      state.latestPlanItems = mergedPlan.steps;
      state.latestPlanExplanation = args.explanation || null;
      pendingPlanFailureRef.current = null;
      emit({
        type: EVENT_TYPE.ITEM_UPDATED,
        item: {
          id: "active_plan",
          type: ITEM_TYPE.TODO_LIST,
          items: state.latestPlanItems,
          explanation: state.latestPlanExplanation,
          executionVerified:
            !requiresWorkflowExecution(displayText) ||
            state.workflowRunCompleted,
          status: STATUS.IN_PROGRESS,
        },
      });
    }
  }

  const handler = registry.get(toolName);
  const presentation = handler?.presentCall?.(args) || {
    title: toolName,
  };

  emit({
    type: EVENT_TYPE.ITEM_STARTED,
    item: {
      id: toolCall.id,
      type: ITEM_TYPE.COMMAND_EXECUTION,
      command: toolName,
      arguments: args,
      externalWebsiteCostUnknown,
      status: STATUS.IN_PROGRESS,
      ...presentation,
    },
  });

  // ── Loop-level pre-execution plan review gate ──────────────────────────────
  // `update_plan` is READ_ONLY, so the checkApprovalGating below can never
  // prompt for it. This gate pauses here, persists the pending review on the
  // AgentRun (so the card survives a reload), and unwinds through the same
  // WAITING_INPUT pause model the loop and resumeAgentRun/takeoverAgentRun
  // already understand. It is intentionally not stacked with a tool approval.
  if (toolName === "update_plan" && mergedPlan) {
    const planEstimatedCost = mergedPlan.steps.reduce(
      (total, step) => total + (Number(step.estimatedCost) || 0),
      0,
    );
    const planReviewCost =
      planEstimatedCost > 0 ? planEstimatedCost : Number(estCost) || 0;

    if (
      shouldGatePlan({
        enabled: planReviewEnabled,
        approvalMode,
        plan: mergedPlan,
        estimatedCost: planReviewCost,
      })
    ) {
      runStore.updateRun(run.id, {
        planReview: {
          pending: true,
          plan: mergedPlan,
          estimatedCost: planReviewCost,
          requestedAt: Date.now(),
        },
      });
      runStore.setRunStatus(run.id, AGENT_RUN_STATUS.WAITING_INPUT);
      if (currentStepIdRef.current) {
        runStore.updateStep(run.id, currentStepIdRef.current, {
          status: AGENT_STEP_STATUS.WAITING_INPUT,
        });
      }
      bumpRuns();

      let resolution = null;
      if (typeof requestPlanApproval === "function") {
        try {
          resolution = await requestPlanApproval({
            runId: run.id,
            plan: mergedPlan,
            estimatedCost: planReviewCost,
          });
        } catch {
          // A host error must fail closed, like a cancel.
          resolution = { approved: false, cancelled: true };
        }
      }
      const reviewDecision = resolvePlanReviewDecision(resolution);

      if (reviewDecision.decision === PLAN_REVIEW_DECISION.CANCEL) {
        runStore.updateRun(run.id, {
          planReview: {
            pending: false,
            plan: mergedPlan,
            estimatedCost: planReviewCost,
            cancelledAt: Date.now(),
          },
        });
        // The Composer Stop button already flipped the run to CANCELLED via
        // cancelAgentTurn; only a card Cancel needs the explicit stop here.
        if (!cancelledRef.current && !controller.signal.aborted) {
          runStore.setRunStatus(run.id, AGENT_RUN_STATUS.STOPPED, {
            stopReason: AGENT_STOP_REASON.CANCELLED,
          });
          if (currentStepIdRef.current) {
            runStore.updateStep(run.id, currentStepIdRef.current, {
              status: AGENT_STEP_STATUS.STOPPED,
            });
          }
        }
        bumpRuns();
        appendToolResult(messages, toolCall.id, {
          success: false,
          error: createToolError(
            TOOL_ERROR_CODE.OPERATION_ABORTED,
            "Plan review cancelled by user",
          ),
        });
        emit({
          type: EVENT_TYPE.ITEM_COMPLETED,
          item: {
            id: toolCall.id,
            type: ITEM_TYPE.COMMAND_EXECUTION,
            command: toolName,
            status: STATUS.FAILED,
            error: t("agent.plan.review.cancelled"),
          },
        });
        return { ready: false, shouldBreak: true };
      }

      if (reviewDecision.decision === PLAN_REVIEW_DECISION.EDIT) {
        try {
          mergedPlan = mergeReplan(
            runStore.getRun(run.id)?.plan,
            reviewDecision.editedSteps,
          );
        } catch (err) {
          // The card validates with normalizePlanSteps before it resolves, so
          // this is a defensive boundary: a malformed resolve must never throw
          // into the turn loop. Re-open the gate so the user can fix it.
          const message =
            err instanceof PlanValidationError
              ? err.message
              : "Plan could not be applied.";
          runStore.updateRun(run.id, {
            planReview: {
              pending: true,
              plan: mergedPlan,
              estimatedCost: planReviewCost,
              error: message,
            },
          });
          runStore.setRunStatus(run.id, AGENT_RUN_STATUS.RUNNING);
          if (currentStepIdRef.current) {
            runStore.updateStep(run.id, currentStepIdRef.current, {
              status: AGENT_STEP_STATUS.RUNNING,
            });
          }
          bumpRuns();
          appendToolResult(messages, toolCall.id, {
            success: false,
            error: createToolError(TOOL_ERROR_CODE.ARGS_INVALID, message),
          });
          return { ready: false, shouldContinue: true };
        }
        // Make the user's edits the plan the tool result reports back to the
        // model, not the model's original submission it was just overridden on.
        args.plan = mergedPlan.steps;
      }

      runStore.updateRun(run.id, {
        plan: mergedPlan,
        planReview: {
          pending: false,
          plan: mergedPlan,
          estimatedCost: planReviewCost,
          approvedAt: Date.now(),
        },
      });
      state.latestPlanItems = mergedPlan.steps;
      state.latestPlanExplanation =
        args.explanation || state.latestPlanExplanation;
      runStore.setRunStatus(run.id, AGENT_RUN_STATUS.RUNNING);
      if (currentStepIdRef.current) {
        runStore.updateStep(run.id, currentStepIdRef.current, {
          status: AGENT_STEP_STATUS.RUNNING,
        });
      }
      bumpRuns();
      // Edit feed-back: a fresh TODO_LIST item so the rendered plan reflects the
      // user's edits immediately (the merge/reduce event above predates them).
      emit({
        type: EVENT_TYPE.ITEM_UPDATED,
        item: {
          id: "active_plan",
          type: ITEM_TYPE.TODO_LIST,
          items: state.latestPlanItems,
          explanation: state.latestPlanExplanation,
          executionVerified:
            !requiresWorkflowExecution(displayText) ||
            state.workflowRunCompleted,
          status: STATUS.IN_PROGRESS,
        },
      });
    }
  }

  const approvalCheck = await checkApprovalGating({
    registry,
    toolName,
    approvalMode,
    requestApproval,
    toolCallId: toolCall.id,
    args,
    costInfo: {
      cost: estCost,
      estimated: isCostEstimated,
      unknown: costUnknown,
      externalWebsiteCostUnknown,
    },
    signal: controller.signal,
    isCancelled: cancelledRef.current,
    executionStatus: getWorkflowExecutionState(run).status,
  });

  if (!approvalCheck.approved) {
    if (approvalCheck.aborted) {
      appendToolResult(messages, toolCall.id, {
        success: false,
        error: createToolError(
          TOOL_ERROR_CODE.OPERATION_ABORTED,
          approvalCheck.reason,
        ),
      });
      emit({
        type: EVENT_TYPE.ITEM_COMPLETED,
        item: {
          id: toolCall.id,
          type: ITEM_TYPE.COMMAND_EXECUTION,
          command: toolName,
          status: STATUS.FAILED,
          error: "Stopped by user",
        },
      });
      return { ready: false, shouldBreak: true };
    }
    appendToolResult(messages, toolCall.id, approvalCheck.denialResult);
    emit({
      type: EVENT_TYPE.ITEM_COMPLETED,
      item: {
        id: toolCall.id,
        type: ITEM_TYPE.COMMAND_EXECUTION,
        command: toolName,
        status: STATUS.FAILED,
        error: "Denied by user",
      },
    });
    return { ready: false, shouldContinue: true };
  }

  const { changeSetId, idempotencyKey } = openChangeSet({
    runStore,
    runId: run.id,
    stepId: currentStepIdRef.current,
    toolName,
    args,
    toolCallId: toolCall.id,
  });

  const isInputRequest = toolName === "request_user_input";
  if (isInputRequest) {
    runStore.setRunStatus(run.id, AGENT_RUN_STATUS.WAITING_INPUT);
    runStore.updateStep(run.id, currentStepIdRef.current, {
      status: AGENT_STEP_STATUS.WAITING_INPUT,
    });
    bumpRuns();
  }

  const activeStore = getStore ? getStore() : null;
  validateWorkflowConsistency({
    targetWorkflowId,
    activeStore,
    toolName,
    runStore,
    runId: run.id,
    changeSetId,
    controller,
  });

  const toolContext = createToolExecutionContext({
    getStore,
    targetWorkflowId,
    registry,
    signal: controller.signal,
    runStore,
    runId: run.id,
    stepId: currentStepIdRef.current,
    observedRevs: observedRevsRef.current,
    changeSetId,
    idempotencyKey,
    toolCallId: toolCall.id,
    activeStore,
    llm: { providerId, model, baseUrl, apiKey },
    onRequestUserInput,
  });

  const isReviewableTool = registry.isReviewable(toolName);
  const toolCapabilities = registry.getCapabilities(toolName);
  const isMutatingTool = isReviewableTool || Boolean(toolCapabilities?.mutates);

  if (isMutatingTool) {
    const staleResult = await resolveStaleRevision({
      toolName,
      args,
      activeStore,
      observedRevs: observedRevsRef.current,
      agentModifiedIds: agentModifiedIdsRef.current,
      staleReplanCount: staleReplanCountRef.current,
      runStore,
      runId: run.id,
      currentStepId: currentStepIdRef.current,
      bumpRuns,
      onRequestUserInput,
      t,
    });

    if (staleResult.hasConflict) {
      if (
        staleResult.shouldRetry ||
        staleResult.abandoned ||
        staleResult.reobserve
      ) {
        appendToolResult(messages, toolCall.id, staleResult.conflictResult);
        return { ready: false, shouldContinue: true };
      }
      if (staleResult.shouldBreak) {
        return { ready: false, shouldBreak: true };
      }
    }
  }

  return {
    ready: true,
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
  };
}
