/**
 * Idempotent retry, parameter canonicalization, and remote task reconciliation.
 *
 * Implements docs/roadmap-voo-agent-os.md P0-3:
 * 1. Deterministic idempotency key: hash(runId, stepId, toolName, canonicalizedArgs).
 * 2. Exponential backoff retry: only for idempotent:true tools and network errors / 429 / 5xx.
 * 3. Remote task reconciliation: fetch existing task status instead of resubmitting if taskId exists.
 * 4. Canvas deduplication: reuse existing node ID instead of creating duplicate nodes.
 */

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 100;

/**
 * Recursively canonicalize an argument value so that object keys are sorted
 * lexicographically and undefined entries are omitted.
 *
 * @param {unknown} val
 * @returns {unknown}
 */
export function canonicalizeValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val !== "object") return val;
  if (Array.isArray(val)) {
    return val.map(canonicalizeValue);
  }
  const sorted = {};
  const keys = Object.keys(val).sort();
  for (const key of keys) {
    if (val[key] !== undefined) {
      sorted[key] = canonicalizeValue(val[key]);
    }
  }
  return sorted;
}

export const canonicalizeArgs = canonicalizeValue;

/**
 * 64-bit FNV-1a hash implementation for deterministic, cross-platform hashing.
 *
 * @param {string} str
 * @returns {string} 16-character hexadecimal string
 */
export function fnv1a64(str) {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619);
    h2 = Math.imul(h2 ^ (ch * 31), 2246822519);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

/**
 * Generates a deterministic idempotency key for a tool invocation.
 *
 * Accepts either an options object or positional arguments:
 *   generateIdempotencyKey({ runId, stepId, toolName, args })
 *   generateIdempotencyKey(runId, stepId, toolName, args)
 *
 * @param {string|{ runId?: string, stepId?: string, toolName: string, args?: Object }} runIdOrOptions
 * @param {string} [stepId]
 * @param {string} [toolName]
 * @param {Object} [args]
 * @returns {string}
 */
export function generateIdempotencyKey(runIdOrOptions, stepId, toolName, args) {
  let rId = "";
  let sId = "";
  let tName = "";
  let aObj = {};

  if (runIdOrOptions && typeof runIdOrOptions === "object") {
    rId = runIdOrOptions.runId ?? "";
    sId = runIdOrOptions.stepId ?? "";
    tName = runIdOrOptions.toolName ?? "";
    aObj = runIdOrOptions.args ?? {};
  } else {
    rId = runIdOrOptions ?? "";
    sId = stepId ?? "";
    tName = toolName ?? "";
    aObj = args ?? {};
  }

  const canonicalArgs = JSON.stringify(canonicalizeValue(aObj));
  const payload = `${rId}:${sId}:${tName}:${canonicalArgs}`;
  return `ik_${fnv1a64(payload)}`;
}

/**
 * Determines whether an error is eligible for retry.
 * Only network errors, HTTP 429, and HTTP 5xx qualify.
 * HTTP 400 and other 4xx client errors, AbortError, and user denials do not.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isRetryableError(err) {
  if (!err) return false;

  // Abort / Cancellation is never retryable
  if (err.name === "AbortError" || err.code === "OPERATION_ABORTED" || err.code === "DENIED_BY_USER") {
    return false;
  }

  // Check HTTP status code
  const status =
    err.status ??
    err.statusCode ??
    err.response?.status ??
    err.error?.status ??
    err.details?.status;

  if (typeof status === "number") {
    if (status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    // Client errors (400, 401, 403, 404, etc.) are non-retryable
    if (status >= 400 && status < 500) return false;
  }

  // Network error indicators
  if (err.isNetworkError === true) return true;
  const networkCodes = [
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "UND_ERR_CONNECT_TIMEOUT",
    "ERR_NETWORK",
  ];
  if (typeof err.code === "string" && networkCodes.includes(err.code)) {
    return true;
  }

  if (err.name === "TypeError" && /fetch failed/i.test(err.message)) {
    return true;
  }

  if (typeof err.message === "string") {
    if (
      /network error/i.test(err.message) ||
      /fetch failed/i.test(err.message) ||
      /socket hang up/i.test(err.message) ||
      /connection refused/i.test(err.message) ||
      /connection reset/i.test(err.message) ||
      /timed? ?out/i.test(err.message)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Executes an async operation with exponential backoff retry.
 * Only retries when isIdempotent is true and error is retryable.
 * Throws the last error after reaching maxRetries.
 *
 * @template T
 * @param {(attempt: number) => Promise<T>} fn
 * @param {Object} [options]
 * @param {boolean} [options.isIdempotent=false]
 * @param {number} [options.maxRetries=DEFAULT_MAX_RETRIES]
 * @param {number} [options.baseDelayMs=DEFAULT_RETRY_BASE_DELAY_MS]
 * @param {AbortSignal} [options.signal]
 * @param {(event: { attempt: number, error: unknown, delayMs: number }) => void} [options.onRetry]
 * @returns {Promise<T>}
 */
export async function executeWithRetry(
  fn,
  {
    isIdempotent = false,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
    signal = null,
    onRetry = null,
  } = {},
) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    if (signal?.aborted) {
      const abortErr = new Error("Operation aborted.");
      abortErr.name = "AbortError";
      abortErr.code = "OPERATION_ABORTED";
      throw abortErr;
    }

    try {
      return await fn(attempt);
    } catch (err) {
      if (signal?.aborted) {
        throw err;
      }

      const canRetry = isIdempotent && isRetryableError(err) && attempt < maxRetries;
      if (!canRetry) {
        throw err;
      }

      attempt += 1;
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);

      if (typeof onRetry === "function") {
        try {
          onRetry({ attempt, error: err, delayMs });
        } catch {
          // ignore observer errors
        }
      }

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}

/**
 * Searches for an existing ChangeSet record by idempotency key.
 *
 * @param {Object} runStore
 * @param {string} [runId]
 * @param {string} idempotencyKey
 * @returns {Object|null}
 */
export function findChangeSetByIdempotencyKey(runStore, runId, idempotencyKey) {
  if (!runStore || !idempotencyKey) return null;

  if (typeof runStore.findChangeSetByIdempotencyKey === "function") {
    const found = runStore.findChangeSetByIdempotencyKey(runId, idempotencyKey);
    if (found) return found;
  }

  if (runId && typeof runStore.getRun === "function") {
    const run = runStore.getRun(runId);
    if (run?.changeSets) {
      for (let i = run.changeSets.length - 1; i >= 0; i--) {
        const cs = run.changeSets[i];
        if (cs.idempotencyKey === idempotencyKey) {
          return cs;
        }
      }
    }
  }

  if (typeof runStore.listRuns === "function") {
    const runs = runStore.listRuns();
    for (const r of runs) {
      const changeSets = r.changeSets || [];
      for (let i = changeSets.length - 1; i >= 0; i--) {
        const cs = changeSets[i];
        if (cs.idempotencyKey === idempotencyKey) {
          return cs;
        }
      }
    }
  }

  return null;
}

/**
 * Extracts existing taskId or nodeId recorded for this idempotency key.
 *
 * @param {Object} context
 * @param {string} [idempotencyKey]
 * @returns {{ taskId?: string, nodeId?: string, changeSet?: Object }|null}
 */
export function getExistingIdempotentRecord(context, idempotencyKey) {
  const key =
    idempotencyKey ||
    context?.idempotencyKey ||
    context?.executionContext?.idempotencyKey;

  if (!key) return null;

  if (context?.existingRecord) {
    return context.existingRecord;
  }

  const runStore = context?.runStore;
  const runId = context?.runId || context?.executionContext?.agentRunId;

  if (runStore) {
    const cs = findChangeSetByIdempotencyKey(runStore, runId, key);
    if (cs) {
      const taskId = cs.taskId ?? cs.result?.taskId ?? cs.remoteJob?.taskId;
      const nodeId = cs.nodeId ?? cs.result?.nodeId;
      if (taskId || nodeId) {
        return { taskId, nodeId, changeSet: cs };
      }
    }
  }

  if (context?.changeSet && context.changeSet.idempotencyKey === key) {
    const cs = context.changeSet;
    const taskId = cs.taskId ?? cs.result?.taskId ?? cs.remoteJob?.taskId;
    const nodeId = cs.nodeId ?? cs.result?.nodeId;
    if (taskId || nodeId) {
      return { taskId, nodeId, changeSet: cs };
    }
  }

  return null;
}

/**
 * Reconciles an asynchronous remote task:
 * If a task already has a taskId recorded, fetch its status instead of submitting.
 *
 * @param {Object} options
 * @param {Object} options.context
 * @param {string} [options.mediaType="image"]
 * @param {string} [options.idempotencyKey]
 * @param {() => Promise<{ taskId: string }>} options.submit
 * @param {({ taskId: string, mediaType: string }) => Promise<Object>} [options.fetch]
 * @returns {Promise<Object>}
 */
export async function reconcileOrSubmitTask({
  context,
  mediaType = "image",
  idempotencyKey,
  submit,
  fetch,
}) {
  const existing = getExistingIdempotentRecord(context, idempotencyKey);

  // Existing taskId found: fetch status instead of resubmitting
  if (existing?.taskId) {
    const fetchFn =
      fetch ||
      context?.fetchProviderJob ||
      context?.fetchTaskStatus;

    if (typeof fetchFn === "function") {
      const taskStatus = await fetchFn({ taskId: existing.taskId, mediaType });
      return {
        taskId: existing.taskId,
        nodeId: existing.nodeId,
        reconciled: true,
        fetched: true,
        status: taskStatus?.status || "pending",
        taskStatus,
        ...taskStatus,
      };
    }

    return {
      taskId: existing.taskId,
      nodeId: existing.nodeId,
      reconciled: true,
      fetched: true,
      status: "pending",
    };
  }

  // Not yet submitted: execute submit
  if (typeof submit !== "function") {
    throw new Error("reconcileOrSubmitTask requires a submit function.");
  }

  const result = await submit();
  const taskId = result?.taskId;

  if (taskId) {
    const runStore = context?.runStore;
    const runId = context?.runId || context?.executionContext?.agentRunId;
    const csId = context?.changeSetId || context?.executionContext?.changeSetId;
    if (runStore && runId && csId) {
      runStore.updateChangeSet(runId, csId, { taskId });
    }
  }

  return result;
}
