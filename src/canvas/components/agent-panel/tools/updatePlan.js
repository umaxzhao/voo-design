/**
 * Tool: update_plan — Track a multi-step plan as a structured TODO list.
 *
 * Directly adapted from Codex's update_plan tool (plan_spec.rs + plan.rs),
 * extended with the spec-voo-agent-runtime.md §1 plan model: dependencies,
 * expected result, verification, estimated cost and a status state machine.
 * Legacy calls passing only { step, status } keep working; ids are
 * auto-derived. The normalized plan is validated here and persisted on the
 * active AgentRun by the agent loop.
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { ToolError, TOOL_ERROR_CODE } from "./errors.js";
import {
  PlanValidationError,
  normalizePlanSteps,
  PLAN_STEP_STATUSES,
} from "../../../agent-runtime/plan-model.js";
import { normalizeDeliverableRequirements } from "../../../agent-runtime/task-deliverables.js";

const STEP_STATUS_DESCRIPTION =
  "Step status: pending, in_progress, completed, blocked, failed or skipped.";

export default {
  spec: {
    name: "update_plan",
    description:
      "Update the task plan displayed to the user. Provide a list of steps with their status. At most one step should be in_progress at a time. Steps may declare dependencies on other step ids, the tools they will use, an expected result, how completion is verified, and an estimated cost. Replanning is allowed: repeat completed steps unchanged so their results are preserved.",
    parameters: {
      type: "object",
      properties: {
        deliverables: {
          type: "array",
          description:
            "Optional explicit task deliverables. Set only when the user specified a count and media type; do not infer counts from prose or count variants as separate deliverables.",
          items: {
            type: "object",
            properties: {
              mediaType: {
                type: "string",
                enum: [
                  "image",
                  "video",
                  "audio",
                  "model3d",
                  "html",
                  "ppt",
                  "pptx",
                  "md",
                  "markdown",
                  "mindmap",
                ],
              },
              count: { type: "integer", minimum: 1 },
              requireVerification: { type: "boolean" },
              requireExport: { type: "boolean" },
            },
            required: ["mediaType", "count"],
            additionalProperties: false,
          },
        },
        explanation: {
          type: "string",
          description: "Optional explanation for this plan update.",
        },
        plan: {
          type: "array",
          description: "The list of plan steps.",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description:
                  "Stable step id. Optional; auto-derived as step-N when omitted.",
              },
              step: { type: "string", description: "Task step text." },
              status: {
                type: "string",
                enum: [...PLAN_STEP_STATUSES],
                description: STEP_STATUS_DESCRIPTION,
              },
              dependsOn: {
                type: "array",
                items: { type: "string" },
                description:
                  "Ids of steps that must complete before this step can start.",
              },
              expectedResult: {
                type: "string",
                description: "What this step should produce when done.",
              },
              verification: {
                type: "string",
                description: "How completion of this step is verified.",
              },
              estimatedCost: {
                type: "number",
                description: "Estimated cost of this step in USD.",
              },
              tools: {
                type: "array",
                items: { type: "string" },
                description: "Tool names this step is expected to call.",
              },
            },
            required: ["step", "status"],
            additionalProperties: false,
          },
        },
      },
      required: ["plan"],
      additionalProperties: false,
    },
  },

  // Plan updates are informational — no approval needed.
  approvalLevel: TOOL_APPROVAL_LEVEL.READ_ONLY,

  /** UI-only plan state; re-running with the same plan is harmless. */
  capabilities: {
    mutates: false,
    externalData: false,
    estimatedCost: 0,
    idempotent: true,
    reversible: true,
    timeout: null,
  },

  async execute(args) {
    // Validation lives in the pure plan model; a malformed plan (unknown
    // dependency, cycle, bad status) becomes a structured tool error so the
    // model can fix the arguments instead of retrying blindly. A missing or
    // empty plan stays a tolerated no-op, matching the legacy contract.
    let steps = [];
    let deliverables = null;
    try {
      deliverables = normalizeDeliverableRequirements(args.deliverables);
    } catch (error) {
      throw new ToolError(TOOL_ERROR_CODE.ARGS_INVALID, error.message);
    }
    if (Array.isArray(args.plan) && args.plan.length > 0) {
      try {
        steps = normalizePlanSteps(args.plan);
      } catch (err) {
        if (err instanceof PlanValidationError) {
          throw new ToolError(TOOL_ERROR_CODE.ARGS_INVALID, err.message, {
            details: err.details,
            suggestion: {
              tool: "update_plan",
              args: {},
              note: "Fix the plan steps (ids, dependsOn references, cycles) and call update_plan again.",
            },
          });
        }
        throw err;
      }
    }
    // The plan is rendered by the UI via the item.updated event and persisted
    // on the active run by the agent loop — the tool itself stays stateless.
    return {
      planUpdated: true,
      stepCount: steps.length,
      explanation: args.explanation || null,
      plan: steps,
      deliverables,
    };
  },

  presentCall(args) {
    const total = args.plan?.length || 0;
    const completed =
      args.plan?.filter((s) => s.status === "completed").length || 0;
    return {
      title: `Plan update (${completed}/${total} steps)`,
      icon: "list-checks",
    };
  },

  presentResult(_args, result) {
    return {
      title: `Plan updated (${result.stepCount} steps)`,
      status: "completed",
    };
  },
};
