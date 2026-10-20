/**
 * useSendMessage — the sendMessage callback of the agent loop.
 *
 * Thin React bridge: owns the isRunning/abort lifecycle and the session-close
 * finally; the turn itself runs headless in agent-runtime/agent-turn-runner.
 * Split out of useAgentLoop (AO3c) to keep the facade under the size limit.
 *
 * `displayText` is what the user typed; `userText` may also carry context
 * the panel appends (linked objects, attached references). The execution
 * guard judges `displayText`: a linked "API image (type: generate)" once
 * made "Create a prompt node" read as a generation task and forced two
 * continuations after the node already existed.
 *
 * @module agent-panel/useAgentSendMessage
 */

import { useCallback } from "react";
import { closeCodexSession } from "./codex_transport.js";
import { t } from "../../../shared/i18n.js";
import { runAgentTurn } from "../../agent-runtime/agent-turn-runner.js";
import { buildTurnContext } from "../../agent-runtime/agent-turn-context.js";

export function useSendMessage({
  isRunning,
  setIsRunning,
  abortRef,
  cancelledRef,
  persist,
  model,
  reasoningEffort,
  apiKey,
  baseUrl,
  providerId,
  approvalMode,
  assembleSystemPrompt,
  getCanvasState,
  requestApproval,
  requestPlanApproval,
  planReviewEnabled = false,
  getStore,
  onRequestUserInput,
  tokenBudget,
  compactThreshold,
  maxStepsPerTurn,
  storagePrefix,
  messagesRef,
  usageRef,
  budgetUsedRef,
  activeToolNamesRef,
  reminderSentRef,
  currentRunIdRef,
  currentStepIdRef,
  verifyRetryCountRef,
  observedRevsRef,
  agentModifiedIdsRef,
  staleReplanCountRef,
  pendingPlanFailureRef,
  spentBudgetRef,
  approvedBudgetRef,
  pricingTableRef,
  runStoreRef,
  setBudgetUsed,
  setSpentBudget,
  emit,
  ensureRegistry,
  ensureRunStore,
  bumpRuns,
  glanceAtCanvas,
}) {
  return useCallback(
    async (userText, options = {}) => {
      if (isRunning) return;

      const controller = new AbortController();
      abortRef.current = controller;
      cancelledRef.current = false;
      setIsRunning(true);

      try {
        await runAgentTurn(
          userText,
          options,
          buildTurnContext({
            model,
            reasoningEffort,
            apiKey,
            baseUrl,
            providerId,
            approvalMode,
            assembleSystemPrompt,
            getCanvasState,
            requestApproval,
            requestPlanApproval,
            planReviewEnabled,
            getStore,
            onRequestUserInput,
            tokenBudget,
            compactThreshold,
            maxStepsPerTurn,
            t,
            storagePrefix,
            messagesRef,
            usageRef,
            budgetUsedRef,
            activeToolNamesRef,
            reminderSentRef,
            cancelledRef,
            currentRunIdRef,
            currentStepIdRef,
            verifyRetryCountRef,
            observedRevsRef,
            agentModifiedIdsRef,
            staleReplanCountRef,
            pendingPlanFailureRef,
            spentBudgetRef,
            approvedBudgetRef,
            pricingTableRef,
            runStoreRef,
            setBudgetUsed,
            setSpentBudget,
            controller,
            emit,
            ensureRegistry,
            ensureRunStore,
            bumpRuns,
            glanceAtCanvas,
          }),
        );
      } finally {
        try {
          await closeCodexSession(controller.signal);
        } finally {
          setIsRunning(false);
          abortRef.current = null;
          persist();
        }
      }
    },
    [
      isRunning,
      setIsRunning,
      setBudgetUsed,
      setSpentBudget,
      abortRef,
      activeToolNamesRef,
      agentModifiedIdsRef,
      approvedBudgetRef,
      budgetUsedRef,
      cancelledRef,
      currentRunIdRef,
      currentStepIdRef,
      messagesRef,
      observedRevsRef,
      pendingPlanFailureRef,
      pricingTableRef,
      reminderSentRef,
      runStoreRef,
      spentBudgetRef,
      staleReplanCountRef,
      usageRef,
      verifyRetryCountRef,
      apiKey,
      model,
      reasoningEffort,
      baseUrl,
      providerId,
      approvalMode,
      assembleSystemPrompt,
      glanceAtCanvas,
      getCanvasState,
      requestApproval,
      requestPlanApproval,
      planReviewEnabled,
      getStore,
      onRequestUserInput,
      tokenBudget,
      compactThreshold,
      maxStepsPerTurn,
      emit,
      ensureRegistry,
      ensureRunStore,
      bumpRuns,
      persist,
      storagePrefix,
    ],
  );
}
