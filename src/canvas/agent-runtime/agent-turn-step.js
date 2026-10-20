/**
 * Single agent turn step: request assembly, streaming, cost accounting, and
 * the tool-call stage hand-off.
 *
 * Extracted from useAgentLoop.sendMessage (AO3b). React-free: every
 * collaborator arrives through the injected ctx (refs, config, services) and
 * per-turn state through `turn`; the LLM transport is injectable for headless
 * tests.
 *
 * @module agent-runtime/agent-turn-step
 */

import {
  streamChatCompletion as defaultStreamChatCompletion,
  accumulateToolCalls,
} from "../components/agent-panel/deepseekApi.js";
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
import {
  executionCompletionDecision,
  executionContinuationMessage,
} from "../components/agent-panel/turn-completion-policy.js";
import { executeToolCallStage } from "./agent-loop-controller.js";
import { compactAgentConversation } from "./agent-context-compaction.js";
import { estimateLlmStepCost } from "./agent-usage-accounting.js";
import { generateAgentEventId } from "./agent-event-ids.js";

/**
 * Fallback system prompt when no custom assembler is provided.
 */
export function buildDefaultSystemPrompt(canvasState) {
  const nodeCount = canvasState.nodes?.length || 0;
  return [
    "You are VOO AI Assistant, embedded in a visual workflow editor.",
    "You help users create, modify, and run workflows on a node-based canvas.",
    `Current canvas has ${nodeCount} node(s).`,
    "",
    "Available actions:",
    "- Create, connect, edit, and delete nodes on the canvas",
    "- Generate images and videos using AI APIs",
    "- Run workflows and analyze canvas state",
    "- Plan multi-step workflows before executing",
    "",
    "Always use the provided tools to interact with the canvas.",
    "Do not describe actions you would take — take them using tools.",
    "When creating workflows, prefer plan_workflow first for complex tasks.",
  ].join("\n");
}

/** Keep Skill discovery metadata in user context, below the system prompt. */
export function buildAgentApiMessages(systemPrompt, messages, turn) {
  return [
    { role: "system", content: systemPrompt },
    ...(turn.skillCatalog
      ? [{ role: "user", content: turn.skillCatalog }]
      : []),
    ...messages,
    ...(turn.continuationMessage
      ? [{ role: "user", content: turn.continuationMessage }]
      : []),
  ];
}

/**
 * Execute one step of the turn loop: compact if needed, assemble the request,
 * stream the LLM response, account cost, append the assistant message, then
 * either dispatch tool calls through the AO3a stage or decide completion.
 * Mutates `turn`; sets turn.continueLoop to control the runner's loop.
 */
export async function executeTurnStep({ turn, run, runStore, ctx }) {
  const {
    controller,
    cancelledRef,
    messagesRef,
    usageRef,
    activeToolNamesRef,
    registry,
    emit,
    accountUsage,
    recordCost,
    compactContext,
    model,
    reasoningEffort,
    apiKey,
    baseUrl,
    compactThreshold,
    maxStepsPerTurn,
    assembleSystemPrompt,
    getCanvasState,
  } = ctx;
  const streamImpl = ctx.streamChatCompletion ?? defaultStreamChatCompletion;

  // ── Compaction check: if the last request filled the window, compact. ──
  if (usageRef.current.input_tokens > compactThreshold) {
    await (
      compactContext ??
      (() =>
        compactAgentConversation({
          messagesRef,
          model,
          reasoningEffort,
          apiKey,
          baseUrl,
          emit,
          chatCompletionImpl: ctx.chatCompletion,
        }))
    )();
  }

  // ── Assemble context (stateless: full history every step) ──
  const canvasState = getCanvasState?.() || {};
  const systemPrompt = assembleSystemPrompt
    ? assembleSystemPrompt(messagesRef.current, canvasState)
    : buildDefaultSystemPrompt(canvasState);

  const apiMessages = buildAgentApiMessages(
    systemPrompt,
    messagesRef.current,
    turn,
  );
  turn.continuationMessage = null;

  // Active tools = direct set + any deferred tools discovered so far.
  const activeSchemas = registry.getSchemasFor(activeToolNamesRef.current);

  // ── Stream LLM response ──
  const assistantItemId = generateAgentEventId("msg");
  let assistantText = "";
  const pendingToolCalls = [];

  emit({
    type: EVENT_TYPE.ITEM_STARTED,
    item: {
      id: assistantItemId,
      type: ITEM_TYPE.AGENT_MESSAGE,
      text: "",
      status: STATUS.IN_PROGRESS,
    },
  });

  let streamCreditsCharged = null;
  let lastUsage = null;

  try {
    const stream = streamImpl({
      messages: apiMessages,
      tools: activeSchemas,
      model,
      reasoningEffort,
      apiKey,
      baseUrl,
      signal: controller.signal,
    });

    for await (const chunk of stream) {
      if (chunk.creditsCharged !== undefined && chunk.creditsCharged !== null) {
        streamCreditsCharged = Number(chunk.creditsCharged);
      }
      // Accumulate usage from the final chunk.
      if (chunk.usage) {
        lastUsage = chunk.usage;
        turn.budgetExhausted = accountUsage(chunk.usage);
      }

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      // Text content — stream to UI immediately.
      if (delta.content) {
        assistantText += delta.content;
        emit({
          type: EVENT_TYPE.ITEM_UPDATED,
          item: {
            id: assistantItemId,
            type: ITEM_TYPE.AGENT_MESSAGE,
            text: assistantText,
            status: STATUS.IN_PROGRESS,
          },
        });
      }

      // Tool call deltas — accumulate until complete.
      if (delta.tool_calls) {
        accumulateToolCalls(pendingToolCalls, delta.tool_calls);
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      // Faithful to the original `break`: skip finalize/cost/dispatch and let
      // the runner close the turn.
      turn.continueLoop = false;
      return;
    }
    throw err;
  }

  // Finalize the assistant message item.
  emit({
    type: EVENT_TYPE.ITEM_COMPLETED,
    item: {
      id: assistantItemId,
      type: ITEM_TYPE.AGENT_MESSAGE,
      text: assistantText,
      status: STATUS.COMPLETED,
    },
  });

  // ── Monetary cost accounting for LLM step ──
  if (streamCreditsCharged !== null && !isNaN(streamCreditsCharged)) {
    recordCost(run.id, streamCreditsCharged, false, {
      type: "llm",
      model,
      stepId: ctx.currentStepIdRef.current,
    });
  } else if (lastUsage) {
    const { cost, totalTokens } = estimateLlmStepCost({
      pricingTable: registry.getPricingTable?.(),
      model,
      usage: lastUsage,
    });
    if (cost > 0) {
      recordCost(run.id, cost, true, {
        type: "llm",
        model,
        tokens: totalTokens,
        stepId: ctx.currentStepIdRef.current,
      });
    }
  }

  // Append assistant message to history.
  const assistantMessage = {
    role: "assistant",
    content: assistantText || null,
  };
  if (pendingToolCalls.length > 0) {
    assistantMessage.tool_calls = pendingToolCalls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));
  }
  messagesRef.current.push(assistantMessage);

  // ── Dispatch tool calls ──
  if (pendingToolCalls.length > 0) {
    const toolStageResult = await executeToolCallStage({
      pendingToolCalls,
      messages: messagesRef.current,
      controller,
      cancelledRef,
      run,
      runStore,
      getStore: ctx.getStore,
      registry,
      approvalMode: ctx.approvalMode,
      requestApproval: ctx.requestApproval,
      requestPlanApproval: ctx.requestPlanApproval,
      planReviewEnabled: ctx.planReviewEnabled,
      onRequestUserInput: ctx.onRequestUserInput,
      emit,
      bumpRuns: ctx.bumpRuns,
      currentStepIdRef: ctx.currentStepIdRef,
      spentBudgetRef: ctx.spentBudgetRef,
      approvedBudgetRef: ctx.approvedBudgetRef,
      t: ctx.t,
      displayText: turn.displayText,
      targetWorkflowId: turn.targetWorkflowId,
      observedRevsRef: ctx.observedRevsRef,
      agentModifiedIdsRef: ctx.agentModifiedIdsRef,
      staleReplanCountRef: ctx.staleReplanCountRef,
      verifyRetryCountRef: ctx.verifyRetryCountRef,
      failureBreaker: turn.failureBreaker,
      pendingPlanFailureRef: ctx.pendingPlanFailureRef,
      activeToolNamesRef,
      glanceAtCanvas: ctx.glanceAtCanvas,
      recordCost,
      providerId: ctx.providerId,
      model,
      baseUrl,
      apiKey,
      initialSawPlan: turn.sawPlan,
      initialLatestPlanItems: turn.latestPlanItems,
      initialLatestPlanExplanation: turn.latestPlanExplanation,
      initialWorkflowRunCompleted: turn.workflowRunCompleted,
      initialSuccessfulMutation: turn.successfulMutation,
      initialCreatedAssetBatch: turn.createdAssetBatch,
      initialAttemptedWorkflowRun: turn.attemptedWorkflowRun,
    });

    turn.continueLoop = toolStageResult.continueLoop;
    turn.sawPlan = toolStageResult.sawPlan;
    turn.latestPlanItems = toolStageResult.latestPlanItems;
    turn.latestPlanExplanation = toolStageResult.latestPlanExplanation;
    turn.workflowRunCompleted = toolStageResult.workflowRunCompleted;
    turn.successfulMutation = toolStageResult.successfulMutation;
    turn.createdAssetBatch = toolStageResult.createdAssetBatch;
    turn.attemptedWorkflowRun = toolStageResult.attemptedWorkflowRun;
    turn.verificationExceededFailed =
      toolStageResult.verificationExceededFailed;
    turn.verificationFailureIssues = toolStageResult.verificationFailureIssues;
    turn.repeatedFailure = toolStageResult.repeatedFailure;

    // Tools were called → loop back for another step unless stopped.
    if (
      cancelledRef.current ||
      controller.signal.aborted ||
      !turn.continueLoop ||
      runStore.getRun(run.id)?.status === AGENT_RUN_STATUS.STOPPED
    ) {
      turn.continueLoop = false;
    } else {
      turn.continueLoop = true;
      if (turn.stepCount < maxStepsPerTurn) {
        if (ctx.currentStepIdRef.current) {
          if (
            !toolStageResult.stepVerificationFailure &&
            !toolStageResult.verificationExceededFailed
          ) {
            runStore.updateStep(run.id, ctx.currentStepIdRef.current, {
              status: AGENT_STEP_STATUS.COMPLETED,
              stopReason: AGENT_STOP_REASON.COMPLETED,
            });
          }
        }
      }
    }
  } else {
    const completionDecision = executionCompletionDecision({
      userText: turn.displayText,
      sawPlan: turn.sawPlan,
      successfulMutation: turn.successfulMutation,
      attemptedWorkflowRun: turn.attemptedWorkflowRun,
      createdAssetBatch: turn.createdAssetBatch,
      continuationCount: turn.continuationCount,
    });
    if (completionDecision === "continue") {
      turn.continuationCount += 1;
      turn.continuationMessage = executionContinuationMessage(turn.displayText);
      turn.continueLoop = true;
      if (ctx.currentStepIdRef.current) {
        runStore.updateStep(run.id, ctx.currentStepIdRef.current, {
          status: AGENT_STEP_STATUS.COMPLETED,
          stopReason: AGENT_STOP_REASON.COMPLETED,
        });
      }
    } else {
      turn.executionIncomplete = completionDecision === "incomplete";
      turn.continueLoop = false;
    }
  }
}
