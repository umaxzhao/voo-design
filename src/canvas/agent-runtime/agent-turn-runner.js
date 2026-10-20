/**
 * Headless agent turn runner.
 *
 * Owns one full turn: run-record creation, user message append, opening
 * glance, the step loop (delegating each step to agent-turn-step), run
 * close-out (agent-turn-close), and turn failure reporting.
 *
 * Extracted from useAgentLoop.sendMessage (AO3b). React-free: all state lives
 * in injected ref cells, all side effects in injected callbacks, and the LLM
 * transport can be swapped for tests. The hook wrapper still owns React state
 * (isRunning) and the finally block (session close + persist).
 *
 * @module agent-runtime/agent-turn-runner
 */

import { supportsVision } from "../../shared/providers.js";
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
import { createToolFailureBreaker } from "../components/agent-panel/toolFailureBreaker.js";
import { generateAgentEventId } from "./agent-event-ids.js";
import { executeTurnStep } from "./agent-turn-step.js";
import { closeAgentTurn } from "./agent-turn-close.js";

/**
 * Run one agent turn.
 *
 * @param {string} userText - The full user text (may carry appended context).
 * @param {Object} options - Per-turn options (images, displayText,
 *   resumedFromRunId, retryNodeIds, approvedBudget, pricingTable).
 * @param {Object} ctx - Injected collaborators: refs, config, services.
 */
export async function runAgentTurn(userText, options, ctx) {
  const {
    images = [],
    displayText = userText,
    skillCatalog = "",
    resumedFromRunId = null,
    retryNodeIds = [],
    recoveryScopeRequired = null,
    deliverableRequirements = null,
    approvedBudget: turnApprovedBudget = undefined,
    pricingTable: turnPricingTable = undefined,
  } = options ?? {};
  const {
    controller,
    cancelledRef,
    emit,
    ensureRegistry,
    ensureRunStore,
    bumpRuns,
    getStore,
    glanceAtCanvas,
    messagesRef,
    currentRunIdRef,
    currentStepIdRef,
    runStoreRef,
    approvedBudgetRef,
    pricingTableRef,
    maxStepsPerTurn,
  } = ctx;

  if (turnApprovedBudget !== undefined) {
    approvedBudgetRef.current = turnApprovedBudget;
  }
  if (turnPricingTable !== undefined) {
    pricingTableRef.current = turnPricingTable;
  }

  const registry = await ensureRegistry();
  if (turnPricingTable !== undefined && registry?.setPricingTable) {
    registry.setPricingTable(turnPricingTable);
  }

  // ── Task record: one AgentRun per user objective. ──
  const runStore = ensureRunStore();
  const initialStore = getStore ? getStore() : null;
  const targetWorkflowId = initialStore?.workflowId ?? null;
  const runApprovedBudget =
    turnApprovedBudget !== undefined
      ? turnApprovedBudget
      : (approvedBudgetRef.current ?? null);
  const run = runStore.createRun({
    workflowId: targetWorkflowId,
    objective: userText,
    status: AGENT_RUN_STATUS.RUNNING,
    approvedBudget: runApprovedBudget,
    resumedFromRunId,
    retryNodeIds,
    recoveryScopeRequired,
    deliverableRequirements,
  });
  if (run?.ok === false) {
    const isQuota = run.code === "quota_exceeded";
    getStore?.()?.setSaveError?.(isQuota ? "quota_exceeded" : true);
    emit({
      type: EVENT_TYPE.ITEM_COMPLETED,
      item: {
        id: generateAgentEventId("storage_err"),
        type: ITEM_TYPE.ERROR,
        code: isQuota ? "quotaExceeded" : "storageError",
        message: run.error || "Failed to persist execution record",
        status: STATUS.FAILED,
      },
    });
    return;
  }
  currentRunIdRef.current = run.id;
  currentStepIdRef.current = null;
  bumpRuns();

  // Append user message. Pictures ride along as content blocks — the
  // OpenAI-compatible multimodal shape — but only to a model that can see
  // them; sending blocks to a text-only model is an API error, not a
  // graceful degradation.
  const visible = images.length > 0 && supportsVision(ctx.model);
  messagesRef.current.push(
    visible
      ? {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...images.map((image) => ({
              type: "image_url",
              image_url: { url: image.url },
            })),
          ],
        }
      : { role: "user", content: userText },
  );

  emit({
    type: EVENT_TYPE.ITEM_COMPLETED,
    item: {
      id: generateAgentEventId("user_msg"),
      type: ITEM_TYPE.USER_MESSAGE,
      text: displayText,
      status: STATUS.COMPLETED,
    },
  });

  // Open the turn looking at the page: a request like "make the sky
  // darker" is unanswerable without seeing what is there.
  await glanceAtCanvas("This is the editor's page right now.", {
    mergeIntoLast: true,
  });

  emit({ type: EVENT_TYPE.TURN_STARTED });

  try {
    const initialNodes =
      (getStore ? getStore()?.nodes : null) ?? initialStore?.nodes ?? [];
    const initialNodeIds = new Set(
      Array.isArray(initialNodes)
        ? initialNodes.map((n) => n?.id).filter(Boolean)
        : [],
    );

    const turn = {
      initialNodeIds,
      stepCount: 0,
      continueLoop: true,
      budgetExhausted: false,
      sawPlan: false,
      successfulMutation: false,
      attemptedWorkflowRun: false,
      workflowRunCompleted: false,
      createdAssetBatch: false,
      latestPlanItems: [],
      latestPlanExplanation: null,
      continuationCount: 0,
      continuationMessage: null,
      executionIncomplete: false,
      verificationExceededFailed: false,
      verificationFailureIssues: [],
      // Ends the turn on a repeated or unrecoverable tool failure instead
      // of letting the model retry until the step limit hides the cause.
      failureBreaker: createToolFailureBreaker(),
      repeatedFailure: null,
      userText,
      displayText,
      skillCatalog,
      targetWorkflowId,
    };

    while (
      turn.continueLoop &&
      turn.stepCount < maxStepsPerTurn &&
      !turn.budgetExhausted &&
      !cancelledRef.current &&
      !controller.signal.aborted
    ) {
      const runStatus = runStore.getRun(run.id)?.status;
      if (
        runStatus === AGENT_RUN_STATUS.STOPPED ||
        runStatus === AGENT_RUN_STATUS.WAITING_INPUT
      ) {
        turn.continueLoop = false;
        break;
      }

      turn.stepCount++;

      // ── Checkpoint: record the step boundary in the run store. ──
      const step = runStore.addStep(run.id, {
        objective: `step ${turn.stepCount}`,
        status: AGENT_STEP_STATUS.RUNNING,
      });
      if (step?.ok === false) {
        const isQuota = step.code === "quota_exceeded";
        getStore?.()?.setSaveError?.(isQuota ? "quota_exceeded" : true);
        emit({
          type: EVENT_TYPE.ITEM_COMPLETED,
          item: {
            id: generateAgentEventId("storage_err"),
            type: ITEM_TYPE.ERROR,
            code: isQuota ? "quotaExceeded" : "storageError",
            message: step.error || "Storage write error",
            status: STATUS.FAILED,
          },
        });
      }
      currentStepIdRef.current = step?.id ?? null;
      bumpRuns();

      await executeTurnStep({ turn, run, runStore, ctx: { ...ctx, registry } });
    }

    closeAgentTurn({ turn, run, runStore, ctx });
  } catch (err) {
    // A turn that never reached run creation (e.g. registry init failed)
    // has no record to close — guard with the refs.
    if (currentRunIdRef.current) {
      runStoreRef.current?.updateRun(currentRunIdRef.current, {
        status: AGENT_RUN_STATUS.FAILED,
        stopReason: AGENT_STOP_REASON.ERROR,
      });
      if (currentStepIdRef.current) {
        runStoreRef.current?.updateStep(
          currentRunIdRef.current,
          currentStepIdRef.current,
          {
            status: AGENT_STEP_STATUS.FAILED,
            stopReason: AGENT_STOP_REASON.ERROR,
          },
        );
      }
      bumpRuns();
    }
    // Turn failures must be visible in the stream: TURN_FAILED alone is a
    // protocol event the UI does not render, so a bad key, an exhausted
    // balance, or a network drop used to end the turn with no feedback.
    emit({
      type: EVENT_TYPE.ITEM_COMPLETED,
      item: {
        id: generateAgentEventId("error"),
        type: ITEM_TYPE.ERROR,
        code: "turnFailed",
        message: err.message || String(err),
        status: STATUS.COMPLETED,
      },
    });
    emit({
      type: EVENT_TYPE.TURN_FAILED,
      error: { message: err.message || String(err) },
    });
  }
}
