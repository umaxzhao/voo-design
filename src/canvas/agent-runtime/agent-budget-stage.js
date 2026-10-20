/**
 * Agent Budget Stage — cost estimation and interactive budget exhaustion gating.
 *
 * React-free module: registries, prompt callbacks, and translation injected.
 *
 * @module agent-runtime/agent-budget-stage
 */

import { findCheaperModel } from "../components/agent-panel/toolRegistry.js";
import {
  AGENT_RUN_STATUS,
  AGENT_STEP_STATUS,
  AGENT_STOP_REASON,
} from "./run-store.js";

function estimateCostDetails(registry, toolName, args) {
  if (registry.estimateToolCostDetails) {
    return registry.estimateToolCostDetails(toolName, args, { detailed: true });
  }

  const cost = registry.estimateToolCost(toolName, args);
  const normalizedCost = Number(cost);
  const costUnknown = cost == null || !Number.isFinite(normalizedCost);

  return {
    cost: costUnknown ? null : normalizedCost,
    estimated: true,
    costUnknown,
  };
}

/**
 * Checks budget limits and prompts the user if estimated cost exceeds active budget.
 */
export async function evaluateBudgetGating({
  registry,
  toolName,
  args,
  toolCall,
  run,
  approvedBudget,
  spentBudget,
  runStore,
  currentStepId,
  bumpRuns,
  onRequestUserInput,
  t,
}) {
  const costDetails = estimateCostDetails(registry, toolName, args);
  let costUnknown =
    costDetails.costUnknown === true ||
    costDetails.cost == null ||
    !Number.isFinite(Number(costDetails.cost));
  let estCost = costUnknown ? 0 : Number(costDetails.cost);
  const externalWebsiteCostUnknown =
    costDetails.externalWebsiteCostUnknown === true;
  let isCostEstimated = costDetails.estimated ?? true;

  const activeApprovedBudget = run.approvedBudget ?? approvedBudget;
  if (
    activeApprovedBudget != null &&
    activeApprovedBudget > 0 &&
    spentBudget + estCost > activeApprovedBudget
  ) {
    runStore.setRunStatus(run.id, AGENT_RUN_STATUS.WAITING_INPUT);
    if (currentStepId) {
      runStore.updateStep(run.id, currentStepId, {
        status: AGENT_STEP_STATUS.WAITING_INPUT,
      });
    }
    bumpRuns();

    const question = t("agent.budget.exceededQuestion", {
      spent: spentBudget,
      cost: estCost,
      budget: activeApprovedBudget,
    });
    const options = [
      t("agent.budget.optionIncrease"),
      t("agent.budget.optionCheaperModel"),
      t("agent.budget.optionStop"),
    ];

    let userResponse = null;
    if (onRequestUserInput) {
      userResponse = await onRequestUserInput(question, options);
    }

    let selectedIndex = -1;
    if (
      typeof userResponse === "number" &&
      userResponse >= 0 &&
      userResponse < options.length
    ) {
      selectedIndex = userResponse;
    } else if (userResponse && typeof userResponse === "object") {
      if (
        typeof userResponse.index === "number" &&
        userResponse.index >= 0 &&
        userResponse.index < options.length
      ) {
        selectedIndex = userResponse.index;
      } else if (
        typeof userResponse.id === "number" &&
        userResponse.id >= 0 &&
        userResponse.id < options.length
      ) {
        selectedIndex = userResponse.id;
      } else if (typeof userResponse.value === "string") {
        selectedIndex = options.findIndex(
          (opt) =>
            opt === userResponse.value ||
            opt.trim() === userResponse.value.trim(),
        );
      }
    } else if (typeof userResponse === "string") {
      const trimmed = userResponse.trim();
      selectedIndex = options.findIndex(
        (opt) => opt === userResponse || opt.trim() === trimmed,
      );
    }

    const isIncrease = selectedIndex === 0;
    const isCheaper = selectedIndex === 1;
    const isStop = selectedIndex === 2;
    const isUnrecognized = selectedIndex === -1;

    if (isStop || isUnrecognized) {
      const stopDetail =
        userResponse && selectedIndex === -1
          ? `Budget limit exceeded: stopped (unrecognized response: "${String(userResponse).trim()}")`
          : "Budget limit exceeded: stopped by user";
      runStore.updateRun(run.id, {
        status: AGENT_RUN_STATUS.STOPPED,
        stopReason: AGENT_STOP_REASON.BUDGET_EXHAUSTED,
      });
      if (currentStepId) {
        runStore.updateStep(run.id, currentStepId, {
          status: AGENT_STEP_STATUS.STOPPED,
        });
      }
      bumpRuns();
      return {
        ok: false,
        shouldBreak: true,
        stopDetail,
        estCost: costUnknown ? null : estCost,
        isCostEstimated,
        costUnknown,
        externalWebsiteCostUnknown,
      };
    }

    if (isCheaper) {
      const cheaper = findCheaperModel(
        registry.getPricingTable?.(),
        toolName,
        args.model,
      );
      if (cheaper) {
        args.model = cheaper;
        toolCall.function.arguments = JSON.stringify(args);
        const reEst = estimateCostDetails(registry, toolName, args);
        estCost = Number(reEst.cost) || 0;
        isCostEstimated = reEst.estimated ?? true;
        costUnknown = reEst.costUnknown === true || reEst.cost == null;
        if (costUnknown) estCost = 0;
      }
      runStore.setRunStatus(run.id, AGENT_RUN_STATUS.RUNNING);
      if (currentStepId) {
        runStore.updateStep(run.id, currentStepId, {
          status: AGENT_STEP_STATUS.RUNNING,
        });
      }
      bumpRuns();
      return {
        ok: true,
        estCost: costUnknown ? null : estCost,
        isCostEstimated,
        costUnknown,
        externalWebsiteCostUnknown,
      };
    }

    if (isIncrease) {
      const newBudget = Math.max(
        spentBudget + estCost + 50,
        activeApprovedBudget + 50,
      );
      run.approvedBudget = newBudget;
      runStore.updateRun(run.id, { approvedBudget: newBudget });
      runStore.setRunStatus(run.id, AGENT_RUN_STATUS.RUNNING);
      if (currentStepId) {
        runStore.updateStep(run.id, currentStepId, {
          status: AGENT_STEP_STATUS.RUNNING,
        });
      }
      bumpRuns();
      return {
        ok: true,
        newBudget,
        estCost,
        isCostEstimated,
        costUnknown,
        externalWebsiteCostUnknown,
      };
    }
  }

  return {
    ok: true,
    estCost: costUnknown ? null : estCost,
    isCostEstimated,
    costUnknown,
    externalWebsiteCostUnknown,
  };
}
