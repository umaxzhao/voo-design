/** RunStore run/step/ChangeSet operations seam. */

import {
  AGENT_RUN_STATUS,
  AGENT_STOP_REASON,
  CHANGESET_STATUS,
  createAgentRun,
  generateChangeSetId,
  generateStepId,
} from "./run-store-model.js";
import { RunStorePersistence } from "./run-store-persistence.js";
import {
  assertValidExecutionTransition,
  getWorkflowExecutionState,
  isSubmissionUncertain,
} from "../../shared/workflow-execution-contract.js";

/** Derive a retry scope without charging again for a node that already succeeded. */
export function retryNodeIdsForRun(run) {
  if (!run) return [];
  const ids = new Set(Array.isArray(run.retryNodeIds) ? run.retryNodeIds : []);
  for (const changeSet of run.changeSets || []) {
    if (changeSet.status !== CHANGESET_STATUS.FAILED) continue;
    const args = changeSet.args || {};
    for (const id of args.nodeIds || [])
      if (typeof id === "string") ids.add(id);
    for (const id of args.onlyNodeIds || [])
      if (typeof id === "string") ids.add(id);
    for (const id of changeSet.affectedObjects || [])
      if (typeof id === "string") ids.add(id);
    for (const id of changeSet.result?.failedNodeIds || [])
      if (typeof id === "string") ids.add(id);
  }
  const succeeded = new Set();
  const needsInspection = new Set();
  for (const changeSet of run.changeSets || []) {
    if (changeSet.toolName !== "run_workflow") continue;
    for (const node of changeSet.result?.nodes || []) {
      if (node.status === "success") succeeded.add(node.nodeId);
      if (node.status === "failed") {
        if (
          isSubmissionUncertain(node.error) ||
          node.recovery?.mode === "collect_existing_web_generation"
        ) {
          needsInspection.add(node.nodeId);
        } else {
          ids.add(node.nodeId);
        }
      }
    }
  }
  return [...ids].filter(
    (id) => !succeeded.has(id) && !needsInspection.has(id),
  );
}

export class RunStore extends RunStorePersistence {
  /**
   * @returns {import("./run-store.js").AgentRun|{ ok: false, code: string, error: string }}
   */
  createRun(init = {}, { expectedRev = 0, merge = false } = {}) {
    const run = createAgentRun(init);
    const result = this.saveRun(run, { expectedRev, merge });
    if (!result.ok) {
      return result;
    }
    return result.run;
  }

  /** @returns {import("./run-store.js").AgentRun|undefined} */
  getRun(runId) {
    if (!this._storagePrefix || typeof localStorage === "undefined") {
      return this._runs.get(runId);
    }
    try {
      const raw = localStorage.getItem(`${this._storagePrefix}:run:${runId}`);
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored && stored.id === runId) {
          const cached = this._runs.get(runId);
          if (!cached || (stored.rev ?? 0) >= (cached.rev ?? 0)) {
            this._runs.set(runId, stored);
            if (!this._baseRuns.has(runId)) {
              this._baseRuns.set(runId, JSON.parse(JSON.stringify(stored)));
            }
            return stored;
          }
          return cached;
        }
      }
    } catch {
      // Corrupt or unreadable entry
    }
    return this._runs.get(runId);
  }

  /**
   * @returns {import("./run-store.js").AgentRun[]} newest first
   */
  listRuns() {
    if (this._storagePrefix && typeof localStorage !== "undefined") {
      const index = this._readIndex();
      for (const entry of index) {
        const id = typeof entry === "string" ? entry : entry?.id;
        if (id && !this._runs.has(id)) {
          this.getRun(id);
        }
      }
      const runMap = this._runs;
      const loaded = [];
      for (let i = index.length - 1; i >= 0; i--) {
        const id = typeof index[i] === "string" ? index[i] : index[i]?.id;
        if (id && runMap.has(id)) {
          loaded.push(runMap.get(id));
        }
      }
      if (loaded.length > 0) return loaded;
    }
    return [...this._runs.values()].reverse();
  }

  removeRun(runId) {
    const existed = this._runs.delete(runId);
    this._baseRuns.delete(runId);
    if (this._storagePrefix && typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(`${this._storagePrefix}:run:${runId}`);
        const index = this._readIndex().filter(
          (entry) => (typeof entry === "string" ? entry : entry.id) !== runId,
        );
        this._writeIndex(index);
      } catch {
        // Storage cleanup error
      }
    }
    return existed;
  }

  /**
   * @param {string} runId
   * @param {Object} patch
   * @param {Object} [opts]
   * @param {number} [opts.expectedRev]
   * @param {boolean} [opts.merge=true]
   * @returns {import("./run-store.js").AgentRun|{ ok: false, code: string, error: string }|undefined}
   */
  updateRun(runId, patch, { expectedRev = undefined, merge = true } = {}) {
    const run = this.getRun(runId);
    if (!run)
      return { ok: false, code: "not_found", error: `Run ${runId} not found` };
    const outcome = this.saveRun({ ...run, ...patch }, { expectedRev, merge });
    if (!outcome.ok) return outcome;
    return outcome.run;
  }

  /**
   * Accumulates cost into run.spentBudget, marking spentEstimated if any charge is estimated.
   *
   * @param {string} runId
   * @param {Object} [costInfo]
   * @param {number} [costInfo.cost=0]
   * @param {boolean} [costInfo.estimated=false]
   * @param {string} [costInfo.stepId]
   * @returns {import("./run-store.js").AgentRun|undefined}
   */
  recordCost(runId, { cost = 0, estimated = false, stepId = null } = {}) {
    const run = this.getRun(runId);
    if (!run) return undefined;
    const amount = Number(cost) || 0;
    const nextSpent = (Number(run.spentBudget) || 0) + amount;
    const hasEstimated = Boolean(
      run.spentEstimated || run.hasEstimatedCost || estimated,
    );
    const outcome = this.updateRun(runId, {
      spentBudget: nextSpent,
      spentEstimated: hasEstimated,
      hasEstimatedCost: hasEstimated,
    });
    if (stepId) {
      const step = this.getStep(runId, stepId);
      if (step) {
        this.updateStep(runId, stepId, {
          cost: (Number(step.cost) || 0) + amount,
          estimated: Boolean(step.estimated || estimated),
        });
      }
    }
    return outcome;
  }

  /** @returns {import("./run-store.js").AgentRun|{ ok: false, code: string, error: string }|undefined} */
  setRunStatus(runId, status, opts) {
    const run = this.getRun(runId);
    if (run?.status) {
      assertValidExecutionTransition(run.status, status, {
        executionId: runId,
      });
    }
    const {
      expectedRev,
      merge = true,
      ...extra
    } = typeof opts === "object" && opts !== null ? opts : {};
    return this.updateRun(runId, { status, ...extra }, { expectedRev, merge });
  }

  isRunCompleted(runId) {
    const run = this.getRun(runId);
    return run?.status === AGENT_RUN_STATUS.COMPLETED;
  }

  canResumeRun(runId) {
    const run = this.getRun(runId);
    if (!run) return false;
    const state = getWorkflowExecutionState(run);
    return state.canResume;
  }

  /** Whether the run center may start a new, scoped retry run. */
  canRetryRun(runId) {
    const run = this.getRun(runId);
    return Boolean(
      run &&
      [
        AGENT_RUN_STATUS.FAILED,
        AGENT_RUN_STATUS.STOPPED,
        AGENT_RUN_STATUS.CANCELLED,
      ].includes(run.status),
    );
  }

  /**
   * Returns the smallest safe retry scope recorded by failed ChangeSets.
   * Succeeded nodes are intentionally excluded so a retry cannot duplicate a
   * paid generation that already produced a result.
   */
  getRetryNodeIds(runId) {
    return retryNodeIdsForRun(this.getRun(runId));
  }

  /** Mark orphaned in-flight records after a page reload as resumable stops. */
  recoverStaleRuns({ maxAgeMs = 0 } = {}) {
    const recovered = [];
    for (const run of this.listRuns()) {
      if (
        run.status !== AGENT_RUN_STATUS.RUNNING &&
        run.status !== AGENT_RUN_STATUS.WAITING_INPUT
      ) {
        continue;
      }
      if (maxAgeMs > 0 && Date.now() - (run.updatedAt || 0) < maxAgeMs) {
        continue;
      }
      const retryNodeIds = this.getRetryNodeIds(run.id);
      const next = this.updateRun(run.id, {
        status: AGENT_RUN_STATUS.STOPPED,
        stopReason: AGENT_STOP_REASON.ERROR,
        retryNodeIds,
        recovery: { status: "stale", recoveredAt: Date.now() },
      });
      if (next?.ok !== false) recovered.push(next);
    }
    return recovered;
  }

  /** @returns {import("./run-store.js").AgentStep|undefined} */
  getStep(runId, stepId) {
    const run = this.getRun(runId);
    return (run?.steps || []).find((s) => s.id === stepId);
  }

  /** @returns {import("./run-store.js").AgentStep|{ ok: false, code: string, error: string }|undefined} */
  addStep(runId, step) {
    const run = this.getRun(runId);
    if (!run)
      return { ok: false, code: "not_found", error: `Run ${runId} not found` };
    const withStep = {
      ...step,
      id: step.id || generateStepId(runId),
      runId,
    };
    const outcome = this.saveRun(
      {
        ...run,
        steps: [...(run.steps || []), withStep],
        currentStepId: withStep.id,
      },
      { merge: true },
    );
    if (!outcome.ok) return outcome;
    return withStep;
  }

  /** @returns {import("./run-store.js").AgentStep|{ ok: false, code: string, error: string }|undefined} */
  updateStep(runId, stepId, patch) {
    const run = this.getRun(runId);
    if (!run)
      return { ok: false, code: "not_found", error: `Run ${runId} not found` };
    const outcome = this.saveRun(
      {
        ...run,
        steps: (run.steps || []).map((s) =>
          s.id === stepId ? { ...s, ...patch } : s,
        ),
      },
      { merge: true },
    );
    if (!outcome.ok) return outcome;
    return outcome.run.steps.find((s) => s.id === stepId);
  }

  /** @returns {import("./run-store.js").ChangeSet|{ ok: false, code: string, error: string }|undefined} */
  addChangeSet(runId, changeSet) {
    const run = this.getRun(runId);
    if (!run)
      return { ok: false, code: "not_found", error: `Run ${runId} not found` };
    const withCs = {
      ...changeSet,
      id: changeSet.id || generateChangeSetId(runId),
      runId,
    };
    const outcome = this.saveRun(
      {
        ...run,
        changeSets: [...(run.changeSets || []), withCs],
      },
      { merge: true },
    );
    if (!outcome.ok) return outcome;
    return withCs;
  }

  /** @returns {import("./run-store.js").ChangeSet|{ ok: false, code: string, error: string }|undefined} */
  updateChangeSet(runId, changeSetId, patch) {
    const run = this.getRun(runId);
    if (!run)
      return { ok: false, code: "not_found", error: `Run ${runId} not found` };
    const outcome = this.saveRun(
      {
        ...run,
        changeSets: (run.changeSets || []).map((cs) =>
          cs.id === changeSetId ? { ...cs, ...patch } : cs,
        ),
      },
      { merge: true },
    );
    if (!outcome.ok) return outcome;
    return outcome.run.changeSets.find((cs) => cs.id === changeSetId);
  }

  /**
   * Find a ChangeSet by the tool call id it was dispatched under.
   * The loop records `toolCallId` on the ChangeSet args wrapper when created.
   *
   * @returns {import("./run-store.js").ChangeSet|undefined}
   */
  findChangeSetByToolCall(runId, toolCallId) {
    const run = this.getRun(runId);
    if (!run) return undefined;
    return run.changeSets.find((cs) => cs.toolCallId === toolCallId);
  }
}
