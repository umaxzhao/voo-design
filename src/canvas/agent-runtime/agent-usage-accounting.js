/**
 * Token-budget and monetary-cost accounting for agent turns.
 *
 * Extracted from useAgentLoop (AO3b): React-free factories — all state lives
 * in injected ref cells, all side effects in injected callbacks.
 *
 * @module agent-runtime/agent-usage-accounting
 */

import {
  EVENT_TYPE,
  ITEM_TYPE,
  STATUS,
} from "../components/agent-panel/eventTypes.js";
import { generateAgentEventId } from "./agent-event-ids.js";

/** Soft reminder at 80% of the budget, once. */
const BUDGET_REMINDER_RATIO = 0.8;

/**
 * Build the per-usage accountant: updates the session usage snapshot, grows
 * the cumulative token budget, fires the one-time 80% reminder, and reports
 * whether the budget is now exhausted.
 */
export function createUsageAccounting({
  usageRef,
  budgetUsedRef,
  reminderSentRef,
  tokenBudget = Infinity,
  emit,
  onBudgetUsed,
}) {
  const hasTokenLimit = Number.isFinite(tokenBudget);
  return function accountUsage(usage) {
    usageRef.current = {
      input_tokens: usage.prompt_tokens || 0,
      cached_input_tokens: usage.prompt_tokens_details?.cached_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
      reasoning_output_tokens:
        usage.completion_tokens_details?.reasoning_tokens || 0,
    };
    const consumed =
      (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
    budgetUsedRef.current += consumed;
    onBudgetUsed?.(budgetUsedRef.current);

    // One-time soft reminder near the budget cap.
    if (
      hasTokenLimit &&
      !reminderSentRef.current &&
      budgetUsedRef.current > tokenBudget * BUDGET_REMINDER_RATIO
    ) {
      reminderSentRef.current = true;
      emit({
        type: EVENT_TYPE.ITEM_COMPLETED,
        item: {
          id: generateAgentEventId("budget"),
          type: ITEM_TYPE.ERROR,
          code: "budgetReminder",
          params: {
            percent: Math.round((budgetUsedRef.current / tokenBudget) * 100),
          },
          message: `Token budget ${Math.round((budgetUsedRef.current / tokenBudget) * 100)}% used.`,
          status: STATUS.COMPLETED,
        },
      });
    }

    return hasTokenLimit && budgetUsedRef.current >= tokenBudget;
  };
}

/**
 * Build the monetary cost recorder (P1-9): accumulates session spend,
 * persists it best-effort, and mirrors the entry onto the run record.
 */
export function createCostRecorder({
  spentBudgetRef,
  runStoreRef,
  storagePrefix,
  onSpentBudget,
  bumpRuns,
}) {
  return function recordCost(runId, cost, isEstimated = false, meta = {}) {
    const amount = Number(cost) || 0;
    if (amount <= 0) return;
    spentBudgetRef.current += amount;
    onSpentBudget?.(spentBudgetRef.current);
    if (storagePrefix) {
      try {
        localStorage.setItem(
          `${storagePrefix}:spentBudget`,
          String(spentBudgetRef.current),
        );
      } catch {
        // best-effort
      }
    }
    if (runStoreRef.current && runId) {
      runStoreRef.current.recordCost(runId, {
        cost: amount,
        estimated: isEstimated,
        ...meta,
      });
      bumpRuns();
    }
  };
}

/**
 * Estimate the LLM cost of one streamed step from the registry pricing table.
 * Returns { cost, totalTokens }; cost is 0 when the model has no usable rate.
 */
export function estimateLlmStepCost({ pricingTable, model, usage }) {
  const totalTokens =
    (usage.prompt_tokens || 0) + (usage.completion_tokens || 0) ||
    usage.total_tokens ||
    0;
  let cost = 0;
  if (pricingTable) {
    const modelPricing =
      (pricingTable.models && pricingTable.models[model]) ||
      pricingTable[model];
    const rate =
      modelPricing?.rate ??
      modelPricing?.credits ??
      (modelPricing?.cost ? modelPricing.cost : 0);
    if (rate > 0) {
      const unit = modelPricing.unit || "1k_tokens";
      if (unit === "1k_tokens" || unit === "1k_token") {
        cost = (totalTokens / 1000) * rate;
      } else if (unit === "token" || unit === "tokens") {
        cost = totalTokens * rate;
      } else {
        cost = (totalTokens / 1000) * rate;
      }
    }
  }
  return { cost, totalTokens };
}
