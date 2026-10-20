/**
 * Persistence write contract — one shared definition of when a write counts
 * as saved.
 *
 * Every durable write in the product resolves to exactly one of three
 * outcomes; there is no fourth:
 *
 *   committed — the data crossed its durability point; callers may trust it.
 *   failed    — the write definitively did not land (validation, quota,
 *               revision conflict, or a completed rollback).
 *   uncertain — nobody knows whether it landed (partial commit, a rollback
 *               that itself failed, a lost IPC/network response). Uncertain
 *               is a first-class outcome: it must NOT be treated as failed
 *               (a blind retry may double-write) and must NOT be treated as
 *               committed (the data may not be there). Callers surface it:
 *               user-initiated writes ask for confirmation; background writes
 *               mark the state for reconcile. This mirrors the
 *               submission-uncertain semantics of durable-recovery-policy.js
 *               (uncertain → REQUIRE_CONFIRMATION).
 *
 * The rules behind the shapes (full rationale: the M4 audit):
 *   R1  The durability point is the success point: IndexedDB = tx.oncomplete,
 *       Electron file = the atomic manifest rename (or an explicitly declared
 *       non-atomic write, R5), localStorage = setItem returning without
 *       throwing, chrome.storage = await set() resolving.
 *       `request.onsuccess` and "enqueued for write" are NOT success points.
 *   R2  Failure is explicit: a write function either throws or returns the
 *       discriminated union below — never resolves a success-looking value.
 *       A user-initiated save failure must reach a user-visible surface.
 *   R3  Uncertain propagates as `{ ok: "uncertain" }` (or a
 *       PersistenceWriteError with `uncertain: true`).
 *   R4  Swallowing errors is allowed only on declared best-effort paths
 *       (mirrors/caches/preferences) — never on an authoritative copy of
 *       user data.
 *   R5  Non-atomic direct overwrites are allowed but must be declared, so
 *       callers know a crash can leave a half-written file.
 *   R6  A partial commit (chunked/batched writes that failed midway) is
 *       uncertain — part of the data objectively exists.
 *
 * This module is dependency-free and frozen so every side of a write
 * (renderer, Electron main, tests, the static scanner) shares one vocabulary.
 *
 * @module shared/persistence_contract
 */

/** The three outcomes a durable write can have. */
export const PERSISTENCE_OUTCOME = Object.freeze({
  COMMITTED: "committed",
  FAILED: "failed",
  UNCERTAIN: "uncertain",
});

/** Stable failure/uncertainty codes (string values are part of the wire shape). */
export const PERSISTENCE_FAILURE_CODE = Object.freeze({
  /** OS/IO error before or during the durability point. */
  IO_ERROR: "io_error",
  /** Storage quota exhausted (localStorage/IndexedDB quota family). */
  QUOTA_EXCEEDED: "quota_exceeded",
  /** Optimistic-lock revision mismatch. */
  REVISION_CONFLICT: "revision_conflict",
  /** A batched/chunked write landed only in part. */
  PARTIAL_COMMIT: "partial_commit",
  /** The write failed AND the rollback failed — on-disk state is a mix. */
  ROLLBACK_FAILED: "rollback_failed",
  /** The write crossed a boundary (IPC/network) and the answer never came back. */
  RESPONSE_LOST: "response_lost",
  /** Input failed validation before anything touched the disk. */
  INVALID_WRITE: "invalid_write",
});

/**
 * The success half of the discriminated union.
 * @param {Object} [details] - e.g. { durabilityPoint, filesWritten }.
 */
export function committed(details = {}) {
  return Object.freeze({
    ok: true,
    outcome: PERSISTENCE_OUTCOME.COMMITTED,
    ...details,
  });
}

/**
 * The write definitively did not land (any pre-commit state was rolled back).
 * @param {string} code - One of PERSISTENCE_FAILURE_CODE.
 * @param {string} [error] - Human/log-readable detail.
 */
export function failed(code, error = "") {
  return Object.freeze({
    ok: false,
    outcome: PERSISTENCE_OUTCOME.FAILED,
    code,
    error: String(error),
  });
}

/**
 * Nobody knows whether the write landed. NOT a synonym for failed — see R3.
 * @param {string} code - One of PERSISTENCE_FAILURE_CODE.
 * @param {string} [error] - Human/log-readable detail.
 */
export function uncertain(code, error = "") {
  return Object.freeze({
    ok: "uncertain",
    outcome: PERSISTENCE_OUTCOME.UNCERTAIN,
    code,
    error: String(error),
  });
}

export function isCommitted(result) {
  return (
    result?.ok === true && result?.outcome === PERSISTENCE_OUTCOME.COMMITTED
  );
}

export function isFailed(result) {
  return result?.ok === false && result?.outcome === PERSISTENCE_OUTCOME.FAILED;
}

export function isUncertain(result) {
  return (
    result?.ok === "uncertain" &&
    result?.outcome === PERSISTENCE_OUTCOME.UNCERTAIN
  );
}

/**
 * Throw-style carrier for the same contract (R2 allows throw OR the union).
 * `uncertain: true` marks the R3 case; anything else is a definite failure.
 * Note: this class does not survive an IPC boundary — handlers convert it to
 * a result object via persistenceResultFromError before returning.
 */
export class PersistenceWriteError extends Error {
  constructor(
    code,
    message,
    { uncertain: isUncertainFlag = false, cause } = {},
  ) {
    super(message || code, { cause });
    this.name = "PersistenceWriteError";
    this.code = code;
    this.uncertain = isUncertainFlag;
  }
}

/** True for the platform's quota-exceeded family of errors. */
export function isQuotaError(error) {
  return (
    error?.name === "QuotaExceededError" ||
    error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    /quota/i.test(error?.message || "")
  );
}

/**
 * Maps any thrown write error onto the result union:
 *   PersistenceWriteError → its declared code and certainty;
 *   quota errors          → failed(quota_exceeded);
 *   anything else         → uncertain(response_lost) — a write that failed in
 *                           an unrecognized way may have partially landed, so
 *                           honesty requires the uncertain outcome (R3/R6).
 */
export function persistenceResultFromError(error) {
  if (error instanceof PersistenceWriteError) {
    return error.uncertain
      ? uncertain(error.code, error.message)
      : failed(error.code, error.message);
  }
  if (isQuotaError(error)) {
    return failed(PERSISTENCE_FAILURE_CODE.QUOTA_EXCEEDED, error?.message);
  }
  return uncertain(
    PERSISTENCE_FAILURE_CODE.RESPONSE_LOST,
    error?.message || String(error),
  );
}

/**
 * Inventory of the repo's durable write paths — the single source of truth
 * the static scanner (scripts/check-persistence.mjs) enforces.
 *
 * kind:
 *   authoritative — an authoritative copy of user data; failure must be explicit.
 *   mirror        — a redundant reflection of an authoritative store elsewhere.
 * contract:
 *   "v1"      — returns/throws via this module's contract (scanner-verified).
 *   "declared" — pre-contract path whose semantics are declared here (R4/R5);
 *                migrating to "v1" is follow-up work.
 */
export const PERSISTENCE_WRITE_REGISTRY = Object.freeze([
  Object.freeze({
    id: "extension.saveTaskPayload",
    file: "src/background/service-worker-task-payloads.js",
    kind: "authoritative",
    contract: "v1",
    durabilityPoint:
      "IndexedDB readwrite transaction.oncomplete; throws failed writes before task metadata is published",
  }),
  Object.freeze({
    id: "electron.writeChromeLocal",
    file: "electron/chrome_storage.js",
    kind: "authoritative",
    contract: "v1",
    durabilityPoint:
      "atomic chrome-storage.json rename after staging file fsync; cache updated only after commit",
  }),
  Object.freeze({
    id: "extension.saveFrozenWebReceipt",
    file: "src/background/web-generation-receipts.js",
    kind: "authoritative",
    contract: "v1",
    durabilityPoint:
      "IndexedDB readwrite transaction.oncomplete; returns committed frozen receipt metadata and rejects storage failures",
  }),
  Object.freeze({
    id: "electron.writeProjectFolder",
    file: "electron/project_store.js",
    kind: "authoritative",
    contract: "v1",
    durabilityPoint: "atomic rename of workflow.json after staged assets",
  }),
  Object.freeze({
    id: "electron.writeWorkflowJson",
    file: "electron/project_store.js",
    kind: "mirror",
    contract: "declared",
    durabilityPoint:
      "non-atomic per-file overwrite (R5 declared); renderer treats IndexedDB as authoritative",
  }),
  Object.freeze({
    id: "electron.writeVooFile",
    file: "electron/project_store.js",
    kind: "authoritative",
    contract: "declared",
    durabilityPoint: "non-atomic overwrite (R5 declared)",
  }),
  Object.freeze({
    id: "electron.writeImageFile",
    file: "electron/project_store.js",
    kind: "authoritative",
    contract: "declared",
    durabilityPoint: "non-atomic overwrite (R5 declared)",
  }),
]);

/**
 * Modules allowed to open IndexedDB directly. Everywhere else must go through
 * db.js; a bare `indexedDB.open` elsewhere is a scanner violation (R1: the
 * durability point must be the one place that defines it).
 */
export const IDB_OWNER_MODULES = Object.freeze([
  "src/background/service-worker-task-payloads.js",
  // Dedicated extension-origin receipts flush before result collection starts.
  "src/background/web-generation-receipts.js",
  "src/canvas/store/db_local.js",
  "src/canvas/store/template_ugc.js",
]);
