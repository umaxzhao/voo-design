import {
  createEmptyUsage,
  EVENT_TYPE,
} from "../components/agent-panel/eventTypes.js";

function isValidCounter(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Restore legacy completed-turn accounting without reviving an explicitly reset total. */
export function restoreSessionAccounting({
  events = [],
  budget,
  spentBudget,
} = {}) {
  let completedBudget = 0;
  let usage = createEmptyUsage();
  for (const event of events) {
    if (event?.type !== EVENT_TYPE.TURN_COMPLETED) continue;
    if (isValidCounter(event.budgetUsed)) completedBudget = event.budgetUsed;
    usage = createEmptyUsage();
    for (const key of Object.keys(usage)) {
      if (isValidCounter(event.usage?.[key])) usage[key] = event.usage[key];
    }
  }
  return {
    budget: isValidCounter(budget) ? budget : completedBudget,
    spentBudget: isValidCounter(spentBudget) ? spentBudget : 0,
    usage,
  };
}
