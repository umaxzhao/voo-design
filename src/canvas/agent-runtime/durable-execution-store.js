import {
  loadWorkflowExecution,
  listWorkflowExecutions,
  saveWorkflowExecution,
} from "../store/db.js";

export const DURABLE_EXECUTION_STATUS = Object.freeze({
  PREPARED: "prepared",
  RUNNING: "running",
  RECOVERING: "recovering",
  WAITING_CONFIRMATION: "waiting-confirmation",
  SUCCEEDED: "succeeded",
  PARTIAL: "partial",
  FAILED: "failed",
  STOPPED: "stopped",
});

const TERMINAL_STATUSES = new Set([
  DURABLE_EXECUTION_STATUS.SUCCEEDED,
  DURABLE_EXECUTION_STATUS.PARTIAL,
  DURABLE_EXECUTION_STATUS.FAILED,
  DURABLE_EXECUTION_STATUS.STOPPED,
]);

const STATUS_TRANSITIONS = Object.freeze({
  [DURABLE_EXECUTION_STATUS.PREPARED]: new Set([
    DURABLE_EXECUTION_STATUS.RUNNING,
    DURABLE_EXECUTION_STATUS.WAITING_CONFIRMATION,
    DURABLE_EXECUTION_STATUS.FAILED,
  ]),
  [DURABLE_EXECUTION_STATUS.RUNNING]: new Set([
    DURABLE_EXECUTION_STATUS.RECOVERING,
    DURABLE_EXECUTION_STATUS.WAITING_CONFIRMATION,
    DURABLE_EXECUTION_STATUS.SUCCEEDED,
    DURABLE_EXECUTION_STATUS.PARTIAL,
    DURABLE_EXECUTION_STATUS.FAILED,
    DURABLE_EXECUTION_STATUS.STOPPED,
  ]),
  [DURABLE_EXECUTION_STATUS.RECOVERING]: new Set([
    DURABLE_EXECUTION_STATUS.RUNNING,
    DURABLE_EXECUTION_STATUS.WAITING_CONFIRMATION,
    DURABLE_EXECUTION_STATUS.FAILED,
  ]),
  [DURABLE_EXECUTION_STATUS.WAITING_CONFIRMATION]: new Set([
    DURABLE_EXECUTION_STATUS.RECOVERING,
    DURABLE_EXECUTION_STATUS.FAILED,
    DURABLE_EXECUTION_STATUS.STOPPED,
  ]),
});

/** Static-contract metadata: product code may not bypass these boundaries. */
export const DURABLE_EXECUTION_ADAPTER = Object.freeze({
  engineCall: "runWorkflow",
  engineBoundarySource: "src/canvas/store/workflow_run_execution.js",
  repositoryWrites: Object.freeze(["saveWorkflowExecution"]),
  repositoryBoundarySource:
    "src/canvas/agent-runtime/durable-execution-store.js",
  repositoryTransportSources: Object.freeze([
    "src/background/external_bridge.js",
    "src/canvas/store/db.js",
    "src/canvas/store/db_local.js",
    "src/canvas/store/db_proxy.js",
    "src/canvas/store/desktop_storage_host.js",
  ]),
});

async function executionIdentity(workflowId, agentContext) {
  const agentRunId = agentContext?.agentRunId;
  const agentStepId = agentContext?.agentStepId;
  if (!agentRunId || !agentStepId) {
    return {
      id: `workflow-exec-${crypto.randomUUID()}`,
      idempotencyKey: null,
    };
  }
  const idempotencyKey = JSON.stringify([
    workflowId,
    String(agentRunId),
    String(agentStepId),
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(idempotencyKey),
  );
  const suffix = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  return { id: `workflow-exec-agent-${suffix}`, idempotencyKey };
}

function normalizeError(error) {
  if (!error || typeof error !== "object") return null;
  return {
    code: error.code ?? "generic",
    message: error.message ?? null,
    nodeId: error.nodeId ?? null,
    providerId: error.providerId ?? null,
    ...(error.details ? { details: error.details } : {}),
    originalCode: error.originalCode ?? null,
  };
}

function durableNodePatch(previous = {}, patch = {}) {
  const next = { ...previous };
  if (typeof patch.status === "string") {
    next.status = patch.status;
    if (patch.status === "success" && !Object.hasOwn(patch, "error")) {
      next.error = null;
    }
  }
  if (Array.isArray(patch.results)) next.resultIds = [...patch.results];
  if (Object.hasOwn(patch, "error")) next.error = normalizeError(patch.error);
  if (typeof patch.attemptState === "string") {
    next.attemptState = patch.attemptState;
  }
  if (Object.hasOwn(patch, "webGeneration")) {
    next.webGeneration = patch.webGeneration
      ? { ...patch.webGeneration }
      : null;
  }
  // Synchronous speech has finished bytes instead of a provider task id.
  // Keep those bytes until import succeeds so recovery never bills twice.
  const completedUrls =
    patch.remoteJob?.status === "completed" &&
    Array.isArray(patch.remoteJob?.urls)
      ? patch.remoteJob.urls
      : null;
  if (patch.remoteJob?.taskId || completedUrls) {
    next.remoteJob = {
      providerId: patch.remoteJob.providerId ?? null,
      mediaType: patch.remoteJob.mediaType ?? null,
      taskId: patch.remoteJob.taskId,
      status: patch.remoteJob.status ?? null,
      submittedAt: patch.remoteJob.submittedAt ?? null,
      ...(completedUrls ? { urls: [...completedUrls] } : {}),
    };
  } else if (patch.remoteJob === null) {
    next.remoteJob = null;
  }
  return next;
}

function failedNodeIds(record) {
  if (Array.isArray(record.failedNodeIds) && record.failedNodeIds.length > 0) {
    return [...record.failedNodeIds];
  }
  return Object.entries(record.nodes ?? {})
    .filter(([, node]) => node.status === "error" || node.status === "failed")
    .map(([nodeId]) => nodeId);
}

/**
 * A dismissed record is one the user permanently silenced because its recovery
 * plan was blocked and no action can resume it (see planDurableExecutionRecovery
 * BLOCKED). It is deliberately NOT a terminal status: an interrupted record sits
 * in `running`/`recovering`, and forcing a status transition here would resurface
 * its failed nodes through the ordinary retry banner. Every recovery query must
 * therefore skip dismissed records explicitly.
 */
function isDismissed(record) {
  return record?.dismissed === true;
}

function makeRepository() {
  return {
    save: saveWorkflowExecution,
    load: loadWorkflowExecution,
    list: listWorkflowExecutions,
  };
}

function assertTransition(current, next) {
  if (!STATUS_TRANSITIONS[current]?.has(next)) {
    throw new Error(
      `Invalid durable execution transition: ${current} -> ${next}`,
    );
  }
}

class DurableExecutionSession {
  constructor(store, record, { replayed = false } = {}) {
    this.store = store;
    this.record = record;
    this.replayed = replayed;
    this.writeQueue = Promise.resolve();
    this.writeError = null;
  }

  get id() {
    return this.record.id;
  }

  get status() {
    return this.record.status;
  }

  get requestedNodeIds() {
    return [...this.record.requestedNodeIds];
  }

  get request() {
    return { ...this.record.request };
  }

  get failures() {
    return failedNodeIds(this.record);
  }

  remoteJobFor(nodeId) {
    return this.record.nodes?.[nodeId]?.remoteJob ?? null;
  }

  webGenerationFor(nodeId) {
    return this.record.nodes?.[nodeId]?.webGeneration ?? null;
  }

  unfinishedNodeIds() {
    return this.requestedNodeIds.filter((nodeId) => {
      const status = this.record.nodes?.[nodeId]?.status;
      return status !== "success";
    });
  }

  async start() {
    await this.#transition(DURABLE_EXECUTION_STATUS.RUNNING);
    return this;
  }

  async beginRecovery() {
    if (this.status !== DURABLE_EXECUTION_STATUS.RECOVERING) {
      await this.#transition(DURABLE_EXECUTION_STATUS.RECOVERING);
    }
    return this;
  }

  async pauseForConfirmation(error) {
    await this.flush();
    await this.#transition(DURABLE_EXECUTION_STATUS.WAITING_CONFIRMATION, {
      error: normalizeError(error),
    });
    return this;
  }

  recordNodePatch(nodeId, patch) {
    return this.#enqueue((record) => ({
      ...record,
      nodes: {
        ...record.nodes,
        [nodeId]: durableNodePatch(record.nodes?.[nodeId], patch),
      },
    }));
  }

  async checkpointRemoteJob(nodeId, remoteJob) {
    await this.recordNodePatch(nodeId, {
      attemptState: "submitted",
      remoteJob,
    });
    await this.flush();
  }

  async checkpointSubmitting(nodeId) {
    await this.recordNodePatch(nodeId, { attemptState: "submitting" });
    await this.flush();
  }

  async checkpointSubmissionUncertain(nodeId, error) {
    await this.recordNodePatch(nodeId, {
      attemptState: "submission-uncertain",
      error,
    });
    await this.flush();
  }

  async complete(summary = {}) {
    await this.flush();
    const hasUncertainty =
      Boolean(summary?.uncertainError) ||
      Object.values(this.record.nodes ?? {}).some(
        (node) =>
          node.attemptState === "submission-uncertain" ||
          node.attemptState === "submitting",
      );
    if (hasUncertainty) {
      const uncertainNode = Object.values(this.record.nodes ?? {}).find(
        (node) =>
          node.attemptState === "submission-uncertain" ||
          node.attemptState === "submitting",
      );
      const failure = summary?.uncertainError ??
        uncertainNode?.error ?? {
          code: "providerSubmissionUncertain",
          message: "A remote task submission response was lost.",
        };
      await this.#transition(DURABLE_EXECUTION_STATUS.WAITING_CONFIRMATION, {
        error: normalizeError(failure),
        failedNodeIds: summary.failedNodeIds ?? failedNodeIds(this.record),
      });
      return this.record;
    }

    const failures = summary.failedNodeIds ?? failedNodeIds(this.record);
    const successes = Object.values(this.record.nodes ?? {}).filter(
      (node) => node.status === "success",
    ).length;
    const status = summary.stopped
      ? DURABLE_EXECUTION_STATUS.STOPPED
      : failures.length === 0
        ? DURABLE_EXECUTION_STATUS.SUCCEEDED
        : successes > 0
          ? DURABLE_EXECUTION_STATUS.PARTIAL
          : DURABLE_EXECUTION_STATUS.FAILED;
    const error =
      failures.length === 0
        ? null
        : summary?.error
          ? normalizeError(summary.error)
          : this.record.error;
    await this.#transition(status, {
      failedNodeIds: [...failures],
      error,
    });
    return this.record;
  }

  async fail(error) {
    await this.flush();
    await this.#transition(DURABLE_EXECUTION_STATUS.FAILED, {
      error: normalizeError(error),
      failedNodeIds: failedNodeIds(this.record),
    });
    return this.record;
  }

  async flush() {
    await this.writeQueue;
    if (this.writeError) throw this.writeError;
  }

  #enqueue(update) {
    this.writeQueue = this.writeQueue.then(async () => {
      if (this.writeError) return;
      try {
        this.record = await this.store.commit(update(this.record));
      } catch (error) {
        this.writeError = error;
      }
    });
    return this.writeQueue;
  }

  async #transition(status, patch = {}) {
    assertTransition(this.record.status, status);
    this.record = await this.store.commit({
      ...this.record,
      ...patch,
      status,
    });
  }
}

export class DurableExecutionStore {
  constructor(repository = makeRepository()) {
    this.repository = repository;
  }

  async prepare({
    id = null,
    workflowId,
    requestedNodeIds,
    request = {},
    agentContext = null,
  }) {
    if (!workflowId)
      throw new Error("Durable workflow execution requires workflowId");
    const identity = await executionIdentity(workflowId, agentContext);
    const recordId = id ?? identity.id;
    const now = Date.now();
    const record = {
      schemaVersion: 1,
      id: recordId,
      idempotencyKey: id ? null : identity.idempotencyKey,
      workflowId,
      status: DURABLE_EXECUTION_STATUS.PREPARED,
      requestedNodeIds: [...new Set(requestedNodeIds ?? [])],
      request,
      agentContext,
      nodes: {},
      failedNodeIds: [],
      error: null,
      rev: 0,
      createdAt: now,
      updatedAt: now,
    };
    const outcome = await this.repository.save(record, { expectedRev: 0 });
    if (outcome?.ok) {
      return new DurableExecutionSession(this, {
        ...record,
        rev: outcome.rev,
        updatedAt: Date.now(),
      });
    }
    if (record.idempotencyKey) {
      const existing =
        outcome?.stored ?? (await this.repository.load(recordId));
      if (
        existing?.workflowId === workflowId &&
        existing.idempotencyKey === record.idempotencyKey
      ) {
        return new DurableExecutionSession(this, existing, { replayed: true });
      }
    }
    throw new Error(
      `Durable workflow execution revision conflict: ${recordId}`,
    );
  }

  async resume(id, workflowId) {
    const record = await this.repository.load(id);
    if (!record || record.workflowId !== workflowId) {
      throw new Error(`Durable workflow execution not found: ${id}`);
    }
    if (TERMINAL_STATUSES.has(record.status)) {
      throw new Error(`Durable workflow execution is already terminal: ${id}`);
    }
    return new DurableExecutionSession(this, record);
  }

  async listUnfinished(workflowId) {
    const records = await this.repository.list(workflowId);
    return records.filter(
      (record) => !isDismissed(record) && !TERMINAL_STATUSES.has(record.status),
    );
  }

  /**
   * Permanently silences a recovery record. Blocked plans cannot be resumed by
   * any action, so the only honest outcomes are discard or hide-forever;
   * hiding in memory made the same notice reappear on every launch. The record
   * itself is kept for audit, just excluded from every recovery query.
   */
  async dismiss(id, workflowId) {
    const record = await this.repository.load(id);
    if (!record || record.workflowId !== workflowId) return false;
    if (isDismissed(record)) return true;
    await this.commit({ ...record, dismissed: true, dismissedAt: Date.now() });
    return true;
  }

  async getFailureNodeIds(id) {
    const record = await this.repository.load(id);
    return record ? failedNodeIds(record) : [];
  }

  async recoverySnapshot(workflowId) {
    const records = (await this.repository.list(workflowId)).filter(
      (record) => !isDismissed(record),
    );
    const unfinished = records.filter(
      (record) => !TERMINAL_STATUSES.has(record.status),
    );
    const recoveryRecord = unfinished[0] ?? null;
    return {
      unfinished,
      failedNodeIds: recoveryRecord ? failedNodeIds(recoveryRecord) : [],
      latestExecutionId: records[0]?.id ?? null,
    };
  }

  async commit(record) {
    const outcome = await this.repository.save(record, {
      expectedRev: record.rev ?? 0,
    });
    if (!outcome?.ok) {
      throw new Error(
        `Durable workflow execution revision conflict: ${record.id}`,
      );
    }
    return { ...record, rev: outcome.rev, updatedAt: Date.now() };
  }
}

export function createDurableExecutionStore(repository) {
  return new DurableExecutionStore(repository);
}
