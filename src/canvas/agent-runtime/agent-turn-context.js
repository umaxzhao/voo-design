/**
 * Turn context assembly: build the dependency bag runAgentTurn drives.
 *
 * Extracted from useAgentLoop (AO3c) so the hook's sendMessage stays a thin
 * React bridge. React-free: refs and services are injected, the accounting
 * closures are created per turn.
 *
 * @module agent-runtime/agent-turn-context
 */

import { compactAgentConversation } from "./agent-context-compaction.js";
import { restoreSpentBudget } from "./agent-session.js";
import {
  createCostRecorder,
  createUsageAccounting,
} from "./agent-usage-accounting.js";

export function buildTurnContext({
  // config
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
  t,
  storagePrefix,
  // ref cells
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
  // React state setters (bridged by the hook)
  setBudgetUsed,
  setSpentBudget,
  // services
  controller,
  emit,
  ensureRegistry,
  ensureRunStore,
  bumpRuns,
  glanceAtCanvas,
}) {
  // A reload leaves the spend ref at 0; seed it from storage before any budget
  // gate reads it, or the approved budget restarts from zero.
  restoreSpentBudget({ storagePrefix, spentBudgetRef, setSpentBudget });
  return {
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
    controller,
    emit,
    ensureRegistry,
    ensureRunStore,
    bumpRuns,
    glanceAtCanvas,
    accountUsage: createUsageAccounting({
      usageRef,
      budgetUsedRef,
      reminderSentRef,
      tokenBudget,
      emit,
      onBudgetUsed: setBudgetUsed,
    }),
    recordCost: createCostRecorder({
      spentBudgetRef,
      runStoreRef,
      storagePrefix,
      onSpentBudget: setSpentBudget,
      bumpRuns,
    }),
    compactContext: () =>
      compactAgentConversation({
        messagesRef,
        model,
        reasoningEffort,
        apiKey,
        baseUrl,
        emit,
      }),
  };
}
