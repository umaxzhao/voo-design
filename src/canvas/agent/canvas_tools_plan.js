import { TOOL_ERROR } from "./canvas_tools.js";

const VALID_STATUSES = Object.freeze(["pending", "in_progress", "done", "skipped"]);

let agentPlan = null;

function validateSteps(steps) {
  if (!Array.isArray(steps)) {
    throw Object.assign(new Error(TOOL_ERROR.INVALID_ARGS), { code: TOOL_ERROR.INVALID_ARGS });
  }
  let inProgressCount = 0;
  for (const step of steps) {
    if (!step || typeof step !== "object") {
      throw Object.assign(new Error(TOOL_ERROR.INVALID_ARGS), { code: TOOL_ERROR.INVALID_ARGS });
    }
    if (typeof step.id !== "string" || step.id.trim() === "") {
      throw Object.assign(new Error(TOOL_ERROR.INVALID_ARGS), { code: TOOL_ERROR.INVALID_ARGS });
    }
    if (typeof step.title !== "string" || step.title.trim() === "") {
      throw Object.assign(new Error(TOOL_ERROR.INVALID_ARGS), { code: TOOL_ERROR.INVALID_ARGS });
    }
    if (!VALID_STATUSES.includes(step.status)) {
      throw Object.assign(new Error(TOOL_ERROR.INVALID_ARGS), { code: TOOL_ERROR.INVALID_ARGS });
    }
    if (step.status === "in_progress") {
      inProgressCount++;
      if (inProgressCount > 1) {
        throw Object.assign(new Error(TOOL_ERROR.INVALID_ARGS), { code: TOOL_ERROR.INVALID_ARGS });
      }
    }
  }
  return steps;
}

function countSteps(steps) {
  const counts = { pending: 0, in_progress: 0, done: 0, skipped: 0 };
  for (const step of steps) {
    counts[step.status]++;
  }
  return counts;
}

export function getAgentPlan() {
  return agentPlan;
}

export function resetAgentPlan() {
  agentPlan = null;
}

export const CANVAS_TOOL_PLAN_SCHEMAS = Object.freeze([
  {
    type: "function",
    function: {
      name: "update_plan",
      description:
        "Create or replace the agent's execution plan. Provide an ordered list of steps with id, title, and status (pending|in_progress|done|skipped). At most one step may be in_progress. Optionally include a note.",
      parameters: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                status: { type: "string", enum: VALID_STATUSES },
              },
              required: ["id", "title", "status"],
            },
          },
          note: { type: "string" },
        },
        required: ["steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_plan",
      description: "Read the current agent plan with step counts.",
      parameters: { type: "object", properties: {} },
    },
  },
]);

export async function updatePlan(args = {}) {
  const { steps, note } = args;
  const validatedSteps = validateSteps(steps);
  agentPlan = { steps: validatedSteps, note: typeof note === "string" ? note : undefined, updatedAt: Date.now() };
  return { ok: true, plan: agentPlan, counts: countSteps(validatedSteps) };
}

export async function getPlan() {
  if (!agentPlan) {
    return { ok: true, plan: null, counts: { pending: 0, in_progress: 0, done: 0, skipped: 0 } };
  }
  return { ok: true, plan: agentPlan, counts: countSteps(agentPlan.steps) };
}

export const PLAN_TOOL_EXECUTORS = Object.freeze({
  update_plan: updatePlan,
  get_plan: getPlan,
});