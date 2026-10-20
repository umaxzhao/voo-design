/**
 * Workflow Execution and Recovery Contract.
 *
 * Single source of truth for workflow generation execution lifecycle:
 * - Unified state machine: PENDING, RUNNING, INTERRUPTED, AWAITING_CONFIRMATION, COMPLETED, FAILED, PARTIAL
 * - Preconditions and serial execution gate (N05)
 * - Submission uncertainty and non-drop recovery confirmation (N06)
 * - Abort / stop barrier preventing un-dispatched tools from mutating canvas (N07)
 * - Idempotent recovery planning and state inspection
 *
 * @module shared/workflow-execution-contract
 */

/** Canonical workflow execution status enum. */
export const WORKFLOW_EXECUTION_STATUS = Object.freeze({
  /** 待启动 / 准备中 / 获取串行门禁中 (prepared / queued / pending / idle) */
  PENDING: "pending",
  /** 执行中 / 正在运行节点或 Agent 步骤 (running) */
  RUNNING: "running",
  /** 已中断 / 经由用户取消或点停止中断 (interrupted / stopped / cancelled) */
  INTERRUPTED: "interrupted",
  /** 待确认 / 遇到提交不确定性或需要高风险恢复确认 (waiting-confirmation) */
  AWAITING_CONFIRMATION: "awaiting_confirmation",
  /** 已完成 / 所有计划节点或步骤顺利完成 (completed / succeeded) */
  COMPLETED: "completed",
  /** 已失败 / 发生明确的不可恢复错误 (failed) */
  FAILED: "failed",
  /** 部分成功 / 允许继续出错时的完成状态 (partial) */
  PARTIAL: "partial",
});

/** Terminal execution states that cannot transition further without a new run or explicit resume. */
export const TERMINAL_EXECUTION_STATUSES = Object.freeze(
  new Set([
    WORKFLOW_EXECUTION_STATUS.COMPLETED,
    WORKFLOW_EXECUTION_STATUS.FAILED,
    WORKFLOW_EXECUTION_STATUS.PARTIAL,
    WORKFLOW_EXECUTION_STATUS.INTERRUPTED,
  ]),
);

/** Legal state transitions graph. */
export const LEGAL_EXECUTION_TRANSITIONS = Object.freeze({
  [WORKFLOW_EXECUTION_STATUS.PENDING]: Object.freeze(
    new Set([
      WORKFLOW_EXECUTION_STATUS.RUNNING,
      WORKFLOW_EXECUTION_STATUS.COMPLETED,
      WORKFLOW_EXECUTION_STATUS.FAILED,
      WORKFLOW_EXECUTION_STATUS.INTERRUPTED,
      WORKFLOW_EXECUTION_STATUS.AWAITING_CONFIRMATION,
    ]),
  ),
  [WORKFLOW_EXECUTION_STATUS.RUNNING]: Object.freeze(
    new Set([
      WORKFLOW_EXECUTION_STATUS.COMPLETED,
      WORKFLOW_EXECUTION_STATUS.PARTIAL,
      WORKFLOW_EXECUTION_STATUS.FAILED,
      WORKFLOW_EXECUTION_STATUS.INTERRUPTED,
      WORKFLOW_EXECUTION_STATUS.AWAITING_CONFIRMATION,
    ]),
  ),
  [WORKFLOW_EXECUTION_STATUS.AWAITING_CONFIRMATION]: Object.freeze(
    new Set([
      WORKFLOW_EXECUTION_STATUS.RUNNING,
      WORKFLOW_EXECUTION_STATUS.INTERRUPTED,
      WORKFLOW_EXECUTION_STATUS.FAILED,
    ]),
  ),
  [WORKFLOW_EXECUTION_STATUS.INTERRUPTED]: Object.freeze(
    new Set([
      WORKFLOW_EXECUTION_STATUS.PENDING,
      WORKFLOW_EXECUTION_STATUS.RUNNING,
    ]),
  ),
  [WORKFLOW_EXECUTION_STATUS.FAILED]: Object.freeze(
    new Set([
      WORKFLOW_EXECUTION_STATUS.PENDING,
      WORKFLOW_EXECUTION_STATUS.RUNNING,
    ]),
  ),
  [WORKFLOW_EXECUTION_STATUS.PARTIAL]: Object.freeze(
    new Set([
      WORKFLOW_EXECUTION_STATUS.PENDING,
      WORKFLOW_EXECUTION_STATUS.RUNNING,
    ]),
  ),
  [WORKFLOW_EXECUTION_STATUS.COMPLETED]: Object.freeze(
    new Set([]), // Terminal
  ),
});

/**
 * Normalizes any legacy or subsystem status string into one of the canonical states.
 *
 * @param {string} rawStatus
 * @returns {string} One of WORKFLOW_EXECUTION_STATUS
 */
export function normalizeExecutionStatus(rawStatus) {
  if (!rawStatus) return WORKFLOW_EXECUTION_STATUS.PENDING;
  const s = String(rawStatus).toLowerCase().trim();
  switch (s) {
    case "idle":
    case "prepared":
    case "queued":
    case "pending":
      return WORKFLOW_EXECUTION_STATUS.PENDING;
    case "running":
    case "recovering":
    case "in_progress":
      return WORKFLOW_EXECUTION_STATUS.RUNNING;
    case "waiting-confirmation":
    case "waiting_confirmation":
    case "awaiting_confirmation":
    case "awaiting-confirmation":
    case "waiting_input":
    case "waiting-input":
      return WORKFLOW_EXECUTION_STATUS.AWAITING_CONFIRMATION;
    case "stopped":
    case "cancelled":
    case "canceled":
    case "interrupted":
    case "aborted":
      return WORKFLOW_EXECUTION_STATUS.INTERRUPTED;
    case "succeeded":
    case "completed":
    case "success":
      return WORKFLOW_EXECUTION_STATUS.COMPLETED;
    case "failed":
    case "error":
      return WORKFLOW_EXECUTION_STATUS.FAILED;
    case "partial":
      return WORKFLOW_EXECUTION_STATUS.PARTIAL;
    default:
      return s;
  }
}

/**
 * Validates whether a state transition from fromStatus to toStatus is permitted.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
export function isValidExecutionTransition(fromStatus, toStatus) {
  const from = normalizeExecutionStatus(fromStatus);
  const to = normalizeExecutionStatus(toStatus);
  if (from === to) return true;
  const allowed = LEGAL_EXECUTION_TRANSITIONS[from];
  return Boolean(allowed && allowed.has(to));
}

/**
 * Asserts that a state transition is legal, throwing an error if rejected.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {object} [context={}]
 * @throws {Error}
 */
export function assertValidExecutionTransition(
  fromStatus,
  toStatus,
  context = {},
) {
  const from = normalizeExecutionStatus(fromStatus);
  const to = normalizeExecutionStatus(toStatus);
  if (!isValidExecutionTransition(from, to)) {
    const error = new Error(
      `[WORKFLOW_EXECUTION_CONTRACT] Illegal state transition from "${from}" to "${to}". Allowed targets: [${Array.from(LEGAL_EXECUTION_TRANSITIONS[from] || []).join(", ")}]${context.executionId ? ` for execution ${context.executionId}` : ""}`,
    );
    error.code = "ILLEGAL_EXECUTION_TRANSITION";
    error.from = from;
    error.to = to;
    throw error;
  }
  return true;
}

/**
 * N05 Precondition Guard: Checks whether a new run may enter the serial execution gate.
 *
 * Invariant N05: Concurrent execution attempts during the asynchronous prepare barrier
 * must be rejected synchronously rather than allowing multiple executions into the engine.
 *
 * @param {object} params
 * @param {string} params.currentStatus - Current workflow / run status
 * @param {boolean} [params.isPreparing=false] - Whether another startRun is in its prepare barrier
 * @param {boolean} [params.isParallelJob=false] - Whether the request consists exclusively of independent parallel API nodes
 * @returns {{ ok: boolean, status?: string, reason?: string, canJoin?: boolean }}
 */
export function checkSerialExecutionGate({
  currentStatus,
  status: aliasStatus,
  isPreparing = false,
  isParallelJob = false,
}) {
  const status = normalizeExecutionStatus(currentStatus ?? aliasStatus);
  if (isParallelJob) {
    return { ok: true, canStart: true, canJoin: true };
  }
  if (status === WORKFLOW_EXECUTION_STATUS.RUNNING || isPreparing) {
    return {
      ok: false,
      canStart: false,
      status: "ignored",
      reason: "SERIAL_GATE_LOCKED",
      message:
        "A workflow execution is already in progress or preparing; serial gate locked.",
    };
  }
  return { ok: true, canStart: true, canJoin: false };
}

/**
 * N06 Guard: Detects if an error signifies submission uncertainty (e.g. lost response after submit).
 *
 * Invariant N06: When a provider job has crossed the network boundary but the acknowledgment is lost,
 * the error is UNCERTAIN. It must NEVER be silently swallowed, dropped to plain failure, or auto-retried.
 *
 * @param {any} error
 * @returns {boolean}
 */
export function isSubmissionUncertain(error) {
  if (!error) return false;
  return Boolean(
    error.code === "providerSubmissionUncertain" ||
    error.uncertain === true ||
    error.reason === "submission-uncertain" ||
    error.attemptState === "submission-uncertain" ||
    String(error.message || "")
      .toLowerCase()
      .includes("submission uncertain") ||
    String(error.message || "")
      .toLowerCase()
      .includes("response lost"),
  );
}

/**
 * Resolves the terminal or recovery outcome for an execution error.
 *
 * Guarantees N06: continueOnError does NOT downgrade submission uncertainty into terminal status.
 *
 * @param {object} params
 * @param {any} params.error
 * @param {boolean} [params.continueOnError=false]
 * @returns {object}
 */
export function resolveErrorOutcome({ error, continueOnError = false }) {
  const uncertain = isSubmissionUncertain(error);
  if (uncertain) {
    return Object.freeze({
      status: WORKFLOW_EXECUTION_STATUS.AWAITING_CONFIRMATION,
      recoveryStatus: "awaiting-confirmation",
      reason: "submission-uncertain",
      requiresConfirmation: true,
      canAutoResume: false,
      uncertain: true,
      error,
    });
  }

  if (continueOnError) {
    return Object.freeze({
      status: WORKFLOW_EXECUTION_STATUS.PARTIAL,
      recoveryStatus: "partial",
      reason: "node-failed",
      requiresConfirmation: false,
      canAutoResume: true,
      uncertain: false,
      error,
    });
  }

  return Object.freeze({
    status: WORKFLOW_EXECUTION_STATUS.FAILED,
    recoveryStatus: "failed",
    reason: "node-failed",
    requiresConfirmation: false,
    canAutoResume: false,
    uncertain: false,
    error,
  });
}

/**
 * N07 Guard: Asserts whether a pending tool dispatch is allowed to execute.
 *
 * Invariant N07: When a user clicks stop (aborted signal, cancelled ref, or interrupted state),
 * any pending tool in the same turn that has not yet started must be immediately aborted
 * and must NOT touch or mutate the canvas store.
 *
 * @param {object} params
 * @param {AbortSignal} [params.signal]
 * @param {boolean} [params.isCancelled=false]
 * @param {string} [params.executionStatus=null]
 * @returns {{ canDispatch: boolean, error?: { code: string, message: string } }}
 */
export function assertCanDispatchTool({
  signal,
  isCancelled = false,
  executionStatus = null,
}) {
  const isInterrupted =
    Boolean(signal?.aborted) ||
    Boolean(isCancelled) ||
    (executionStatus &&
      normalizeExecutionStatus(executionStatus) ===
        WORKFLOW_EXECUTION_STATUS.INTERRUPTED);

  if (isInterrupted) {
    return Object.freeze({
      canDispatch: false,
      error: Object.freeze({
        code: "OPERATION_ABORTED",
        message: "Operation stopped by user.",
      }),
    });
  }

  return Object.freeze({
    canDispatch: true,
    error: null,
  });
}

/**
 * Canonical Reader: Extracts normalized execution lifecycle state from any store or record.
 *
 * Registered in src/canvas/consumer_registry.js under "workflow.executionState".
 *
 * @param {object} target
 * @returns {object}
 */
export function getWorkflowExecutionState(target) {
  if (!target) {
    return Object.freeze({
      status: WORKFLOW_EXECUTION_STATUS.PENDING,
      rawStatus: "idle",
      isRunning: false,
      isInterrupted: false,
      isAwaitingConfirmation: false,
      isTerminal: false,
      requiresConfirmation: false,
      canResume: true,
    });
  }

  const rawStatus =
    target.status ||
    target.run?.status ||
    target.execution?.status ||
    "pending";
  const status = normalizeExecutionStatus(rawStatus);
  const recoveryStatus =
    target.recovery?.status || target.run?.recovery?.status;
  const isAwaitingConfirmation =
    status === WORKFLOW_EXECUTION_STATUS.AWAITING_CONFIRMATION ||
    recoveryStatus === "awaiting-confirmation";

  const isTerminal = TERMINAL_EXECUTION_STATUSES.has(status);
  const isRunning = status === WORKFLOW_EXECUTION_STATUS.RUNNING;
  const isInterrupted = status === WORKFLOW_EXECUTION_STATUS.INTERRUPTED;
  const isUncertain =
    isAwaitingConfirmation || isSubmissionUncertain(target.error);

  const hasRecovery = Boolean(
    target.recovery?.executionId ||
    target.run?.recovery?.executionId ||
    target.recovery?.status === "ready" ||
    target.recovery?.status === "paused",
  );
  const canResume =
    isInterrupted ||
    isAwaitingConfirmation ||
    (status === WORKFLOW_EXECUTION_STATUS.FAILED &&
      (hasRecovery || isUncertain));

  return Object.freeze({
    status,
    rawStatus,
    isRunning,
    isInterrupted,
    isAwaitingConfirmation,
    isUncertain,
    isTerminal,
    requiresConfirmation: isAwaitingConfirmation,
    canResume,
  });
}

/**
 * Idempotent recovery planning: calculates nodes to skip vs nodes to resume.
 *
 * @param {object} record - Durable execution record
 * @param {object} [options={}]
 * @param {boolean} [options.userConfirmed=false]
 * @returns {object}
 */
export function planExecutionRecovery(record, options = {}) {
  const state = getWorkflowExecutionState(record);
  if (state.requiresConfirmation && !options.userConfirmed) {
    return Object.freeze({
      canResume: false,
      requiresConfirmation: true,
      reason: "submission-uncertain",
      message:
        "Execution stopped in submission-uncertain state; explicit user confirmation required to resume.",
    });
  }

  const nodeMap = record?.nodes || {};
  const completedNodeIds = [];
  const pendingNodeIds = [];

  for (const [nodeId, nodeState] of Object.entries(nodeMap)) {
    if (nodeState.status === "success" || nodeState.status === "succeeded") {
      completedNodeIds.push(nodeId);
    } else {
      pendingNodeIds.push(nodeId);
    }
  }

  return Object.freeze({
    canResume: true,
    requiresConfirmation: false,
    resumeExecutionId: record?.id || null,
    skipNodeIds: Object.freeze(completedNodeIds),
    targetNodeIds: Object.freeze(pendingNodeIds),
  });
}
