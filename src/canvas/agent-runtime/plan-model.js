/**
 * plan-model.js — structured agent plan model (spec-voo-agent-runtime.md §1).
 * Pure module, no React. Normalized plans persist on `AgentRun.plan`.
 *
 * Normalized step: { id, step, status, dependsOn: string[], expectedResult,
 * verification, estimatedCost: number|null, tools: string[], toolCallIds,
 * result }. Validation failures throw PlanValidationError; update_plan maps
 * it to a structured ToolError so the model gets an actionable receipt.
 */

export const PLAN_STEP_STATUS = Object.freeze({
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  BLOCKED: "blocked",
  FAILED: "failed",
  SKIPPED: "skipped",
});

export const PLAN_STEP_STATUSES = Object.freeze(Object.values(PLAN_STEP_STATUS));

/** Legacy update_plan calls only know these three statuses. */
export const LEGACY_STATUSES = Object.freeze([
  PLAN_STEP_STATUS.PENDING,
  PLAN_STEP_STATUS.IN_PROGRESS,
  PLAN_STEP_STATUS.COMPLETED,
]);

/**
 * Legal status transitions. `completed` is terminal: a replan must preserve
 * completed steps and their results (mergeReplan enforces this). `failed`
 * and `skipped` may return to `pending` only through a replan.
 */
export const PLAN_STEP_TRANSITIONS = Object.freeze({
  [PLAN_STEP_STATUS.PENDING]: [
    PLAN_STEP_STATUS.IN_PROGRESS,
    PLAN_STEP_STATUS.BLOCKED,
    PLAN_STEP_STATUS.SKIPPED,
  ],
  [PLAN_STEP_STATUS.IN_PROGRESS]: [
    PLAN_STEP_STATUS.COMPLETED,
    PLAN_STEP_STATUS.FAILED,
    PLAN_STEP_STATUS.BLOCKED,
    PLAN_STEP_STATUS.PENDING,
  ],
  [PLAN_STEP_STATUS.BLOCKED]: [
    PLAN_STEP_STATUS.PENDING,
    PLAN_STEP_STATUS.SKIPPED,
  ],
  [PLAN_STEP_STATUS.FAILED]: [
    PLAN_STEP_STATUS.PENDING,
    PLAN_STEP_STATUS.SKIPPED,
  ],
  [PLAN_STEP_STATUS.COMPLETED]: [],
  [PLAN_STEP_STATUS.SKIPPED]: [PLAN_STEP_STATUS.PENDING],
});

export class PlanValidationError extends Error {
  /**
   * @param {string} message
   * @param {Object} [details] - Structured cause ({ unknownDependencies, cycle, ... }).
   */
  constructor(message, details = {}) {
    super(message);
    this.name = "PlanValidationError";
    this.code = "PLAN_INVALID";
    this.details = details;
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringList(value, field, index) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v.length === 0)) {
    throw new PlanValidationError(
      `plan[${index}].${field} must be an array of non-empty strings`,
      { field, index },
    );
  }
  return [...new Set(value)];
}

function normalizeOptionalText(value, field, index) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new PlanValidationError(`plan[${index}].${field} must be a string`, {
      field,
      index,
    });
  }
  return value;
}

/**
 * Assigns ids to steps missing one: "step-1", "step-2", … in array order,
 * skipping ids already taken by explicit ids. Explicit duplicates throw.
 */
function assignIds(rawSteps) {
  const taken = new Set();
  rawSteps.forEach((raw, index) => {
    if (raw.id === undefined || raw.id === null) return;
    if (typeof raw.id !== "string" || raw.id.length === 0) {
      throw new PlanValidationError(`plan[${index}].id must be a non-empty string`, {
        field: "id",
        index,
      });
    }
    if (taken.has(raw.id)) {
      throw new PlanValidationError(`duplicate plan step id "${raw.id}"`, {
        field: "id",
        duplicateId: raw.id,
      });
    }
    taken.add(raw.id);
  });
  let next = 1;
  return rawSteps.map((raw) => {
    if (raw.id) return raw.id;
    while (taken.has(`step-${next}`)) next += 1;
    const id = `step-${next}`;
    taken.add(id);
    next += 1;
    return id;
  });
}

function detectCycle(steps) {
  const depsById = new Map(steps.map((s) => [s.id, s.dependsOn]));
  const visiting = new Set();
  const done = new Set();
  const visit = (id, trail) => {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      throw new PlanValidationError(
        `plan dependency cycle: ${[...trail, id].join(" -> ")}`,
        { cycle: [...trail, id] },
      );
    }
    visiting.add(id);
    for (const dep of depsById.get(id) || []) visit(dep, [...trail, id]);
    visiting.delete(id);
    done.add(id);
  };
  for (const step of steps) visit(step.id, []);
}

/** Normalizes and validates raw update_plan input. Legacy { step, status }
 * calls keep working: ids are auto-derived, optional fields default to empty.
 * @throws {PlanValidationError} */
export function normalizePlanSteps(rawSteps) {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new PlanValidationError("plan must be a non-empty array of steps", {
      field: "plan",
    });
  }
  const ids = assignIds(rawSteps);
  const steps = rawSteps.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new PlanValidationError(`plan[${index}] must be an object`, { index });
    }
    if (typeof raw.step !== "string" || raw.step.trim().length === 0) {
      throw new PlanValidationError(`plan[${index}].step must be non-empty text`, {
        field: "step",
        index,
      });
    }
    const status = raw.status ?? PLAN_STEP_STATUS.PENDING;
    if (!PLAN_STEP_STATUSES.includes(status)) {
      throw new PlanValidationError(
        `plan[${index}].status must be one of ${PLAN_STEP_STATUSES.join("|")}, got ${JSON.stringify(raw.status)}`,
        { field: "status", index },
      );
    }
    let estimatedCost = null;
    if (raw.estimatedCost !== undefined && raw.estimatedCost !== null) {
      if (typeof raw.estimatedCost !== "number" || !(raw.estimatedCost >= 0)) {
        throw new PlanValidationError(
          `plan[${index}].estimatedCost must be a number >= 0`,
          { field: "estimatedCost", index },
        );
      }
      estimatedCost = raw.estimatedCost;
    }
    return {
      id: ids[index],
      step: raw.step,
      status,
      dependsOn: normalizeStringList(raw.dependsOn, "dependsOn", index),
      expectedResult: normalizeOptionalText(raw.expectedResult, "expectedResult", index),
      verification: normalizeOptionalText(raw.verification, "verification", index),
      estimatedCost,
      tools: normalizeStringList(raw.tools, "tools", index),
      toolCallIds: Array.isArray(raw.toolCallIds)
        ? raw.toolCallIds.filter((id) => typeof id === "string")
        : [],
      result: typeof raw.result === "string" ? raw.result : null,
    };
  });

  const known = new Set(steps.map((s) => s.id));
  const unknown = [];
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      if (!known.has(dep)) unknown.push({ stepId: step.id, dependency: dep });
    }
  }
  if (unknown.length > 0) {
    throw new PlanValidationError(
      `unknown plan dependencies: ${unknown.map((u) => `${u.stepId} -> ${u.dependency}`).join(", ")}`,
      { unknownDependencies: unknown },
    );
  }
  detectCycle(steps);
  return steps;
}

/** @returns {boolean} whether `from -> to` is a legal plan step transition. */
export function canTransitionStep(from, to) {
  return (PLAN_STEP_TRANSITIONS[from] || []).includes(to);
}

/**
 * Transitions one step, validating the move against PLAN_STEP_TRANSITIONS.
 * @returns {{ steps: Array }} a new plan object
 * @throws {PlanValidationError} on unknown step id or illegal transition
 */
export function transitionPlanStep(plan, stepId, toStatus, { result = undefined } = {}) {
  const steps = plan?.steps || [];
  const step = steps.find((s) => s.id === stepId);
  if (!step) {
    throw new PlanValidationError(`unknown plan step id "${stepId}"`, { stepId });
  }
  if (!canTransitionStep(step.status, toStatus)) {
    throw new PlanValidationError(
      `illegal plan step transition ${step.status} -> ${toStatus} for "${stepId}"`,
      { stepId, from: step.status, to: toStatus },
    );
  }
  return {
    ...plan,
    steps: steps.map((s) =>
      s.id === stepId
        ? { ...s, status: toStatus, ...(result !== undefined ? { result } : {}) }
        : s,
    ),
  };
}

/**
 * @returns {Array} pending steps whose dependencies are all completed.
 */
export function computeReadySteps(plan) {
  const steps = plan?.steps || [];
  const statusById = new Map(steps.map((s) => [s.id, s.status]));
  return steps.filter(
    (s) =>
      s.status === PLAN_STEP_STATUS.PENDING &&
      s.dependsOn.every((dep) => statusById.get(dep) === PLAN_STEP_STATUS.COMPLETED),
  );
}

/**
 * @returns {Array} pending/blocked steps with at least one dependency that is
 * not completed (failed or skipped dependencies keep a step blocked).
 */
export function computeBlockedSteps(plan) {
  const steps = plan?.steps || [];
  const statusById = new Map(steps.map((s) => [s.id, s.status]));
  return steps.filter(
    (s) =>
      (s.status === PLAN_STEP_STATUS.PENDING || s.status === PLAN_STEP_STATUS.BLOCKED) &&
      s.dependsOn.length > 0 &&
      s.dependsOn.some((dep) => statusById.get(dep) !== PLAN_STEP_STATUS.COMPLETED),
  );
}

/** Merges a replan with the previous normalized plan. Matching is by id
 * first, then by exact step text (legacy replans re-derive ids, so text is
 * the stable key). Completed and skipped steps keep their status, result and
 * tool call trail no matter what the replan claims.
 * @throws {PlanValidationError} */
export function mergeReplan(previousPlan, nextRawSteps) {
  const next = normalizePlanSteps(nextRawSteps);
  const previousSteps = previousPlan?.steps || [];
  if (previousSteps.length === 0) return { steps: next };

  const byId = new Map(previousSteps.map((s) => [s.id, s]));
  const byText = new Map(previousSteps.map((s) => [s.step, s]));
  const merged = next.map((step) => {
    const prev = byId.get(step.id) || byText.get(step.step);
    if (!prev) return step;
    const preserved =
      prev.status === PLAN_STEP_STATUS.COMPLETED || prev.status === PLAN_STEP_STATUS.SKIPPED;
    return {
      ...step,
      toolCallIds: [...new Set([...prev.toolCallIds, ...step.toolCallIds])],
      result: step.result ?? prev.result,
      ...(preserved
        ? { status: prev.status, result: prev.result ?? step.result }
        : {}),
    };
  });
  // Re-validate the merged plan: preserved steps keep ids the replan may
  // still reference in dependsOn, but a replan can also introduce cycles.
  detectCycle(merged);
  const known = new Set(merged.map((s) => s.id));
  const unknown = [];
  for (const step of merged) {
    for (const dep of step.dependsOn) {
      if (!known.has(dep)) unknown.push({ stepId: step.id, dependency: dep });
    }
  }
  if (unknown.length > 0) {
    throw new PlanValidationError(
      `unknown plan dependencies after replan: ${unknown.map((u) => `${u.stepId} -> ${u.dependency}`).join(", ")}`,
      { unknownDependencies: unknown },
    );
  }
  return { steps: merged };
}

/** Finds the in_progress step that declared `toolName`. Legacy steps
 * without a tools list never match — attribution stays deliberately strict. */
export function findInProgressStepForTool(plan, toolName) {
  const steps = plan?.steps || [];
  return (
    steps.find(
      (s) => s.status === PLAN_STEP_STATUS.IN_PROGRESS && s.tools.includes(toolName),
    ) || null
  );
}

/**
 * Records a finished tool call id on the in_progress step that declared the
 * tool. Returns { plan, stepId } — stepId is null when no step matched, in
 * which case `plan` is the input unchanged.
 */
export function recordToolCallOnStep(plan, { toolName, callId }) {
  const step = findInProgressStepForTool(plan, toolName);
  if (!step || typeof callId !== "string" || callId.length === 0) {
    return { plan, stepId: null };
  }
  if (step.toolCallIds.includes(callId)) return { plan, stepId: step.id };
  return {
    plan: {
      ...plan,
      steps: plan.steps.map((s) =>
        s.id === step.id ? { ...s, toolCallIds: [...s.toolCallIds, callId] } : s,
      ),
    },
    stepId: step.id,
  };
}

/**
 * Marks a step failed through the state machine. Only in_progress -> failed
 * is applied; anything else returns the plan unchanged (the agent loop only
 * fails a step that was actively executing a tool).
 * @returns {{ steps: Array }|null} new plan, or null when the step is gone
 */
export function markPlanStepFailed(plan, stepId) {
  const step = (plan?.steps || []).find((s) => s.id === stepId);
  if (!step) return null;
  if (step.status !== PLAN_STEP_STATUS.IN_PROGRESS) return plan;
  return transitionPlanStep(plan, stepId, PLAN_STEP_STATUS.FAILED);
}

/**
 * Compact one-line-per-step rendering for context injection, e.g.:
 *   1. [completed] Draft layout
 *   2. [in_progress] Generate hero image (tools: generate_image; est $0.08)
 *   3. [blocked] Compose banner (blocked by: step-2)
 */
export function summarizePlan(plan) {
  const steps = plan?.steps || [];
  if (steps.length === 0) return "";
  const textById = new Map(steps.map((s) => [s.id, s.step]));
  return steps
    .map((s, i) => {
      const extras = [];
      if (s.tools.length > 0) extras.push(`tools: ${s.tools.join(", ")}`);
      if (s.estimatedCost !== null) extras.push(`est $${s.estimatedCost}`);
      const blocked = s.dependsOn.filter(
        (dep) => steps.find((x) => x.id === dep)?.status !== PLAN_STEP_STATUS.COMPLETED,
      );
      if (
        (s.status === PLAN_STEP_STATUS.BLOCKED || s.status === PLAN_STEP_STATUS.PENDING) &&
        blocked.length > 0
      ) {
        extras.push(`blocked by: ${blocked.map((d) => textById.get(d) || d).join(", ")}`);
      }
      return `${i + 1}. [${s.status}] ${s.step}${extras.length ? ` (${extras.join("; ")})` : ""}`;
    })
    .join("\n");
}
