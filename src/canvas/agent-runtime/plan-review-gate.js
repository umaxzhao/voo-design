/**
 * plan-review-gate.js — pre-execution plan review gate policy (pure module).
 *
 * `update_plan` is a READ_ONLY tool, so a submitted plan used to be persisted
 * and executed with no chance for the user to inspect or edit it. The loop-level
 * gate lives in agent-prepare-stage.js; this module owns only the pure policy:
 * whether a plan must be reviewed, and how an interactive-card resolution maps
 * to a gate decision.
 *
 * Keeping the policy pure means it is unit-testable without React or a DOM, and
 * there is exactly one place that decides when a single-step request must not be
 * interrupted for review.
 *
 * @module agent-runtime/plan-review-gate
 */

import { APPROVAL_MODE } from "../components/agent-panel/eventTypes.js";

/** Resolution vocabulary of the PlanReviewCard. */
export const PLAN_REVIEW_DECISION = Object.freeze({
  APPROVE: "approve",
  /** Edit & Run — the user changed the steps before approving. */
  EDIT: "edit",
  CANCEL: "cancel",
});

/**
 * Approval modes where the user already expects to confirm operations, so the
 * plan review gate turns on even when the explicit setting is off.
 */
export const PLAN_REVIEW_APPROVAL_MODES = Object.freeze(
  new Set([APPROVAL_MODE.SUGGEST, APPROVAL_MODE.ON_REQUEST]),
);

/**
 * Whether a submitted plan must pause for review before execution.
 *
 * The gate is deliberately narrow so it does not nag single-step requests:
 * - explicit opt-in (`enabled`) OR an approval mode that already confirms work
 * - AND the plan is either multi-step or carries a positive estimated cost.
 *
 * @param {Object} [input]
 * @param {boolean} [input.enabled] - `agentPlanReview` setting (default off).
 * @param {string} [input.approvalMode] - One of APPROVAL_MODE values.
 * @param {{ steps?: Array }} [input.plan] - Normalized plan.
 * @param {number|null} [input.estimatedCost] - Plan/tool estimated cost.
 * @returns {boolean}
 */
export function shouldGatePlan({
  enabled = false,
  approvalMode = null,
  plan = null,
  estimatedCost = 0,
} = {}) {
  const stepCount = Array.isArray(plan?.steps) ? plan.steps.length : 0;
  const cost = Number(estimatedCost);
  const substantial = stepCount >= 2 || (Number.isFinite(cost) && cost > 0);
  const modeGates = PLAN_REVIEW_APPROVAL_MODES.has(approvalMode);
  return Boolean((enabled === true || modeGates) && substantial);
}

/**
 * Maps the value the interactive card resolves with to a gate decision.
 * Anything that is not an explicit approval (missing payload, a host stop, an
 * error) resolves to CANCEL: a plan must never silently proceed unreviewed.
 *
 * @param {{ approved?: boolean, cancelled?: boolean, editedSteps?: Array }|null} [resolution]
 * @returns {{ decision: string, editedSteps: Array|null }}
 */
export function resolvePlanReviewDecision(resolution) {
  if (!resolution || resolution.approved !== true) {
    return { decision: PLAN_REVIEW_DECISION.CANCEL, editedSteps: null };
  }
  const editedSteps =
    Array.isArray(resolution.editedSteps) && resolution.editedSteps.length > 0
      ? resolution.editedSteps
      : null;
  return {
    decision: editedSteps
      ? PLAN_REVIEW_DECISION.EDIT
      : PLAN_REVIEW_DECISION.APPROVE,
    editedSteps,
  };
}
