/** AgentRun/AgentStep/ChangeSet data model, factories, transitions, and merge seam.
 *
 * Agent runtime data model — minimal, UI-independent task records.
 *
 * Implements the P0 slice of spec-voo-agent-runtime.md §8:
 *   AgentRun    — one user objective → one recoverable execution record
 *   AgentStep   — one model/tool round within a run
 *   ChangeSet   — one tool execution's transaction record (before/after intent,
 *                 review status, external calls, undo data)
 *
 * Design rules:
 *   - Pure module: NO React imports, so tests/ can drive it directly
 *     (CLAUDE.md §2 — src/canvas/editor must stay React-free; this module is
 *     equally free so the future execution-engine migration can reuse it).
 *   - Persistence is best-effort and guarded: quota/unavailable storage must
 *     never break an agent turn. No API keys or sensitive payloads are ever
 *     written (spec §8 "检查点不得保存 API Key…").
 *   - Records are plain JSON-safe objects; the React loop stays an adapter.
 *
 * @module agent-runtime/run-store-model
 */

import {
  assertValidExecutionTransition,
  getWorkflowExecutionState,
} from "../../shared/workflow-execution-contract.js";
import { mergeById } from "../store/merge.js";

// ─── Status vocabularies ──────────────────────────────────────────────────────

export const AGENT_RUN_STATUS = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  /** Paused on a request_user_input question — resumable in place. */
  WAITING_INPUT: "waiting_input",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  STOPPED: "stopped",
});

export const AGENT_STEP_STATUS = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  WAITING_INPUT: "waiting_input",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  STOPPED: "stopped",
});

export const AGENT_STOP_REASON = Object.freeze({
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  MAX_STEPS: "max_steps",
  BUDGET_EXHAUSTED: "budget_exhausted",
  ERROR: "error",
});

/** Lifecycle of one tool execution's ChangeSet record. */
export const CHANGESET_STATUS = Object.freeze({
  /** Tool call dispatched; result not yet known. */
  PENDING: "pending",
  /** Executed successfully, no post-hoc review required. */
  COMMITTED: "committed",
  /** Executed but the tool failed — receipt recorded. */
  FAILED: "failed",
  /** Executed under auto-review; awaiting the user's decision. */
  PENDING_REVIEW: "pending_review",
  /** Reviewed and accepted. */
  ACCEPTED: "accepted",
  /** Reviewed and marked for rollback. */
  REVERTED: "reverted",
});

// ─── ID generation ────────────────────────────────────────────────────────────

let _idCounter = 0;
export function generateRunId(prefix = "run") {
  return `${prefix}_${Date.now()}_${++_idCounter}`;
}

export function generateStepId(runId) {
  return `${runId}_step_${++_idCounter}`;
}

export function generateChangeSetId(runId) {
  return `${runId}_cs_${++_idCounter}`;
}

// ─── Factories (spec §8 shapes, minimal P0 fields) ───────────────────────────

/**
 * @param {Object} [init]
 * @param {string} [init.objective] - The user's request that started this run.
 * @param {Object} [init.constraints] - Structured constraints (costLimit, approvalPolicy…).
 * @returns {import("./run-store.js").AgentRun}
 */
export function createAgentRun(init = {}) {
  const now = Date.now();
  return {
    id: init.id || generateRunId(),
    workflowId: init.workflowId || null,
    objective: init.objective || "",
    constraints: init.constraints || {},
    plan: init.plan || null,
    deliverableRequirements: init.deliverableRequirements ?? null,
    status: init.status || AGENT_RUN_STATUS.QUEUED,
    currentStepId: null,
    approvedBudget: init.approvedBudget ?? null,
    spentBudget: init.spentBudget ?? 0,
    spentEstimated: init.spentEstimated ?? false,
    hasEstimatedCost: init.hasEstimatedCost ?? init.spentEstimated ?? false,
    steps: [],
    changeSets: [],
    stopReason: init.stopReason ?? null,
    rev: init.rev ?? 0,
    createdAt: init.createdAt || now,
    updatedAt: init.updatedAt || now,
    resumedFromRunId: init.resumedFromRunId || null,
    recoveryScopeRequired: init.recoveryScopeRequired ?? null,
    retryNodeIds: Array.isArray(init.retryNodeIds)
      ? [...init.retryNodeIds]
      : [],
  };
}

/**
 * @param {Object} [init]
 * @param {string} [init.id]
 * @param {string} [init.runId]
 * @param {string} [init.objective] - Short description of this step's goal.
 * @returns {import("./run-store.js").AgentStep}
 */
export function createAgentStep(init = {}) {
  return {
    id: init.id || generateStepId(init.runId || "run"),
    runId: init.runId || null,
    objective: init.objective || "",
    toolCalls: init.toolCalls || [],
    dependencies: init.dependencies || [],
    expectedResult: init.expectedResult ?? null,
    verification: init.verification ?? null,
    checkpointId: init.checkpointId ?? null,
    status: init.status || AGENT_STEP_STATUS.PENDING,
    stopReason: init.stopReason ?? null,
    attempts: init.attempts ?? 0,
    cost: init.cost ?? 0,
    estimated: init.estimated ?? false,
  };
}

/**
 * @param {Object} [init]
 * @param {string} [init.runId]
 * @param {string} [init.stepId]
 * @param {string} [init.toolName]
 * @param {Object} [init.args]
 * @param {Object} [init.result]
 * @param {Object} [init.error]
 * @returns {import("./run-store.js").ChangeSet}
 */
export function createChangeSet(init = {}) {
  return {
    id: init.id || generateChangeSetId(init.runId || "run"),
    runId: init.runId || null,
    stepId: init.stepId || null,
    toolCallId: init.toolCallId ?? null,
    toolName: init.toolName || "",
    args: init.args ?? {},
    /** Known before-state markers (node ids, revision) — filled by the loop. */
    affectedObjects: init.affectedObjects || [],
    externalCalls: init.externalCalls || [],
    expectedResult: init.expectedResult ?? null,
    /**
     * Link to the single reversible workflow history transaction this
     * ChangeSet produced ({ actionId, entryIndex, undoDepthBefore,
     * undoDepthAfter, entryCount }) — populated from the tool result for
     * atomic graph builds.
     */
    historyTransaction: init.historyTransaction ?? null,
    undoData: init.undoData ?? null,
    status: init.status || CHANGESET_STATUS.PENDING,
    cost: init.cost ?? 0,
    estimated: init.estimated ?? false,
    result: init.result ?? null,
    verificationStatus: init.verificationStatus ?? "unverified",
    error: init.error ?? null,
    createdAt: init.createdAt || Date.now(),
    updatedAt: init.updatedAt || Date.now(),
  };
}

// ─── Pure transitions (testable without storage) ─────────────────────────────

/** Resolve a reviewable ChangeSet: PENDING_REVIEW → ACCEPTED | REVERTED. */
export function resolveChangeSetReview(changeSet, accepted) {
  return {
    ...changeSet,
    status: accepted ? CHANGESET_STATUS.ACCEPTED : CHANGESET_STATUS.REVERTED,
    updatedAt: Date.now(),
  };
}

/** Move a run to a new status, stamping updatedAt. */
export function transitionRun(run, status) {
  if (run?.status) {
    assertValidExecutionTransition(run.status, status, { executionId: run.id });
  }
  return { ...run, status, updatedAt: Date.now() };
}

function unchanged(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Three-way merge for an AgentRun record adhering to the repository's
 * established merge semantics (src/canvas/store/merge.js):
 * - steps and changeSets sub-collections merged by item id via mergeById
 * - without timing info or at same revision: local (current writer) priority
 * - with comparable rev: higher rev (later writer) wins conflicting scalar properties
 * - different properties modified concurrently are both preserved
 *
 * @param {Object|null} base - snapshot when this instance read/saved
 * @param {Object} local - local modified run
 * @param {Object} remote - remote run in storage
 * @returns {Object} merged run
 */
export function mergeAgentRuns(base, local, remote) {
  if (!remote) return local;
  if (!local) return remote;

  const baseObj = base || {};
  const localRev = local.rev ?? 0;
  const remoteRev = remote.rev ?? 0;
  const remoteIsLater = remoteRev > localRev;

  const allKeys = new Set([
    ...Object.keys(baseObj),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);

  const merged = {};

  for (const key of allKeys) {
    if (key === "steps") {
      merged.steps = mergeById(baseObj.steps, local.steps, remote.steps);
      continue;
    }
    if (key === "changeSets") {
      merged.changeSets = mergeById(
        baseObj.changeSets,
        local.changeSets,
        remote.changeSets,
      );
      continue;
    }
    if (key === "rev") {
      merged.rev = Math.max(localRev, remoteRev);
      continue;
    }
    if (key === "updatedAt") {
      merged.updatedAt = Math.max(
        local.updatedAt ?? 0,
        remote.updatedAt ?? 0,
        Date.now(),
      );
      continue;
    }

    const localVal = local[key];
    const remoteVal = remote[key];
    const baseVal = baseObj[key];

    const localChanged = !unchanged(localVal, baseVal);
    const remoteChanged = !unchanged(remoteVal, baseVal);

    if (localChanged && !remoteChanged) {
      merged[key] = localVal;
    } else if (!localChanged && remoteChanged) {
      merged[key] = remoteVal;
    } else if (localChanged && remoteChanged) {
      if (unchanged(localVal, remoteVal)) {
        merged[key] = localVal;
      } else {
        // Competing concurrent edits to same property:
        // "无时序信息时取本地也就是写入者优先,有 rev 可比时后写者赢"
        merged[key] = remoteIsLater ? remoteVal : localVal;
      }
    } else {
      merged[key] =
        localVal !== undefined
          ? localVal
          : remoteVal !== undefined
            ? remoteVal
            : baseVal;
    }
  }

  return merged;
}

export { getWorkflowExecutionState };
