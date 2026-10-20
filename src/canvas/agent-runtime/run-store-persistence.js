/** RunStore localStorage persistence, revision control, and retention seam. */

import { AGENT_RUN_STATUS, mergeAgentRuns } from "./run-store-model.js";

const TERMINAL_RUN_STATUSES = new Set([
  AGENT_RUN_STATUS.COMPLETED,
  AGENT_RUN_STATUS.FAILED,
  AGENT_RUN_STATUS.CANCELLED,
  AGENT_RUN_STATUS.STOPPED,
]);

const BASE64_DATA_URL = /^data:[a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]*;base64,/i;
const MAX_STORED_STRING = 8_000;

function isQuotaError(err) {
  return (
    err?.name === "QuotaExceededError" ||
    err?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err?.code === 22 ||
    err?.code === 1014 ||
    /quota/i.test(err?.message || "")
  );
}

/**
 * Deep-clone a run, replacing heavy payloads with short placeholders so a large
 * run can still be persisted under a tight localStorage quota. The bulk lives in
 * ChangeSet `undoData` snapshots and raw tool `result` blobs, which embed base64
 * image data URLs and long text. Structural fields (ids, statuses, costs,
 * node/task refs) are preserved; only oversized binary/text payloads are dropped.
 */
function slimRunForStorage(value) {
  if (typeof value === "string") {
    if (BASE64_DATA_URL.test(value)) return `data:stripped;len=${value.length}`;
    if (value.length > MAX_STORED_STRING) {
      return `${value.slice(0, MAX_STORED_STRING)}…[truncated ${value.length}]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(slimRunForStorage);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value))
      out[key] = slimRunForStorage(value[key]);
    return out;
  }
  return value;
}

export class RunStorePersistence {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.storagePrefix] - localStorage key prefix; pass null/"" to disable persistence.
   * @param {number} [opts.maxRuns] - Maximum number of runs to retain in persistent storage (default 50).
   * @param {Function} [opts.onWriteError] - Callback invoked when a storage write fails.
   */
  constructor({
    storagePrefix = "voo.agent.runs",
    maxRuns = 50,
    onWriteError = null,
  } = {}) {
    this._storagePrefix = storagePrefix;
    this._maxRuns = maxRuns > 0 ? maxRuns : 50;
    this._onWriteError = onWriteError;
    /** @type {Map<string, import("./run-store.js").AgentRun>} */
    this._runs = new Map();
    /** @type {Map<string, import("./run-store.js").AgentRun>} */
    this._baseRuns = new Map();
    this._lastError = null;
    if (storagePrefix) this.load();
  }

  /**
   * Safe report of write errors to callback and window event.
   * @private
   */
  _reportWriteError(failureOutcome) {
    this._lastError = failureOutcome;
    if (typeof this._onWriteError === "function") {
      try {
        this._onWriteError(failureOutcome);
      } catch {
        // Callback error guard
      }
    }
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      try {
        const evt =
          typeof CustomEvent === "function"
            ? new CustomEvent("voo:storage-error", { detail: failureOutcome })
            : { type: "voo:storage-error", detail: failureOutcome };
        window.dispatchEvent(evt);
      } catch {
        // Event dispatch guard
      }
    }
  }

  /**
   * Safe read of the run index from localStorage.
   * @private
   * @returns {Array<{ id: string, rev: number, updatedAt: number, status: string }>}
   */
  _readIndex() {
    if (!this._storagePrefix || typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem(`${this._storagePrefix}:index:v1`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Safe write of the run index to localStorage.
   * @private
   */
  _writeIndex(index) {
    if (!this._storagePrefix || typeof localStorage === "undefined") {
      return {
        ok: false,
        code: "no_storage",
        error: "localStorage is undefined",
      };
    }
    try {
      localStorage.setItem(
        `${this._storagePrefix}:index:v1`,
        JSON.stringify(index),
      );
      return { ok: true };
    } catch (err) {
      const outcome = {
        ok: false,
        code: isQuotaError(err) ? "quota_exceeded" : "storage_error",
        error: err?.message || String(err),
      };
      this._reportWriteError(outcome);
      return outcome;
    }
  }

  load() {
    try {
      if (typeof localStorage === "undefined" || !this._storagePrefix) return;

      // 1. Backward compatibility: migrate legacy whole-table array if present.
      const legacyRaw = localStorage.getItem(`${this._storagePrefix}:v1`);
      if (legacyRaw) {
        let migrationCommitted = false;
        try {
          const legacyRuns = JSON.parse(legacyRaw);
          if (Array.isArray(legacyRuns)) {
            const index = [];
            for (const r of legacyRuns) {
              if (r && r.id) {
                const runWithRev = { ...r, rev: r.rev ?? 1 };
                localStorage.setItem(
                  `${this._storagePrefix}:run:${r.id}`,
                  JSON.stringify(runWithRev),
                );
                this._runs.set(r.id, runWithRev);
                this._baseRuns.set(
                  r.id,
                  JSON.parse(JSON.stringify(runWithRev)),
                );
                index.push({
                  id: r.id,
                  rev: runWithRev.rev,
                  updatedAt: r.updatedAt || Date.now(),
                  status: r.status || AGENT_RUN_STATUS.QUEUED,
                });
              }
            }
            migrationCommitted = this._writeIndex(index).ok;
          }
        } catch {
          // Corrupt legacy data — ignore.
        }
        if (migrationCommitted) {
          try {
            localStorage.removeItem(`${this._storagePrefix}:v1`);
          } catch {
            // The committed index is sufficient for future loads.
          }
        }
      }

      // 2. Load runs referenced in index.
      const index = this._readIndex();
      for (const item of index) {
        const id = typeof item === "string" ? item : item?.id;
        if (!id) continue;
        const rawRun = localStorage.getItem(`${this._storagePrefix}:run:${id}`);
        if (rawRun) {
          try {
            const run = JSON.parse(rawRun);
            if (run && run.id) {
              this._runs.set(run.id, run);
              this._baseRuns.set(run.id, JSON.parse(JSON.stringify(run)));
            }
          } catch {
            // Corrupt run record — skip.
          }
        }
      }
    } catch {
      // Storage completely unavailable — start empty.
      this._runs = new Map();
      this._baseRuns = new Map();
    }
  }

  /**
   * Save an individual run to storage with version conflict checking & three-way merge.
   * @param {import("./run-store.js").AgentRun} run
   * @param {Object} [opts]
   * @param {number|null} [opts.expectedRev]
   * @param {boolean} [opts.merge]
   * @returns {{ ok: true, rev: number, run: import("./run-store.js").AgentRun } | { ok: false, code: string, error: string, rev?: number, stored?: any }}
   */
  saveRun(run, { expectedRev = undefined, merge = undefined } = {}) {
    if (!run || !run.id) {
      return { ok: false, code: "invalid_run", error: "Missing run or run.id" };
    }

    // Memory-only mode
    if (!this._storagePrefix) {
      const nextRev = (run.rev ?? 0) + 1;
      const next = { ...run, rev: nextRev, ok: true };
      this._runs.set(run.id, next);
      this._baseRuns.set(run.id, JSON.parse(JSON.stringify(next)));
      return { ok: true, rev: nextRev, run: next };
    }

    if (typeof localStorage === "undefined") {
      const outcome = {
        ok: false,
        code: "no_storage",
        error: "localStorage is undefined",
      };
      this._reportWriteError(outcome);
      return outcome;
    }

    const runKey = `${this._storagePrefix}:run:${run.id}`;

    // Read stored record to verify revision
    let stored = null;
    let storedRaw = null;
    try {
      storedRaw = localStorage.getItem(runKey);
      if (storedRaw) {
        stored = JSON.parse(storedRaw);
      }
    } catch {
      // Treat corrupt record as missing
    }

    // Strict CAS check if caller explicitly requested expectedRev and merge is not forced
    if (expectedRev !== undefined && expectedRev !== null && merge !== true) {
      const storedRev = stored?.rev ?? 0;
      if (storedRev !== expectedRev) {
        return {
          ok: false,
          code: "revision_conflict",
          error: `Revision conflict: expected ${expectedRev} but found ${storedRev}`,
          rev: storedRev,
          stored,
        };
      }
    }

    // Perform three-way merge against base snapshot if remote record exists
    let toWrite = run;
    const base = this._baseRuns.get(run.id) || null;
    if (stored) {
      toWrite = mergeAgentRuns(base, run, stored);
    }

    const nextRev = Math.max(stored?.rev ?? 0, toWrite.rev ?? run.rev ?? 0) + 1;
    const nextRun = {
      ...toWrite,
      rev: nextRev,
      ok: true,
      updatedAt: Date.now(),
    };

    const written = this._writeRunRecord(runKey, nextRun);
    if (!written.ok) {
      const failureOutcome = {
        ok: false,
        code: written.quota ? "quota_exceeded" : "storage_error",
        error: written.error,
      };
      this._reportWriteError(failureOutcome);
      return failureOutcome;
    }

    const storedRun = written.record;

    // Update index
    let index = this._readIndex();
    const existingIdx = index.findIndex(
      (entry) => (typeof entry === "string" ? entry : entry.id) === run.id,
    );
    const entryMeta = {
      id: run.id,
      rev: storedRun.rev,
      updatedAt: storedRun.updatedAt,
      status: storedRun.status,
    };

    if (existingIdx >= 0) {
      index[existingIdx] = entryMeta;
    } else {
      index.push(entryMeta);
    }

    // Retention policy: select old runs now, but delete their records only after
    // the index commits. An index failure must leave the previous runs intact.
    const prunedIds = [];
    if (index.length > this._maxRuns) {
      while (index.length > this._maxRuns) {
        let pruneIdx = index.findIndex(
          (entry) =>
            entry.id !== run.id && TERMINAL_RUN_STATUSES.has(entry.status),
        );
        if (pruneIdx === -1) {
          pruneIdx = index.findIndex((entry) => entry.id !== run.id);
        }
        const [pruned] = index.splice(pruneIdx, 1);
        const prunedId = typeof pruned === "string" ? pruned : pruned?.id;
        if (prunedId) prunedIds.push(prunedId);
      }
    }

    const indexOutcome = this._writeIndex(index);
    if (!indexOutcome.ok) {
      // The index is the load path's commit marker. Restore the old record so
      // a failed update cannot appear committed after a reload.
      try {
        if (storedRaw === null) localStorage.removeItem(runKey);
        else localStorage.setItem(runKey, storedRaw);
      } catch (rollbackError) {
        const uncertainOutcome = {
          ...indexOutcome,
          uncertain: true,
          error: `${indexOutcome.error}; rollback failed: ${rollbackError?.message || String(rollbackError)}`,
        };
        this._reportWriteError(uncertainOutcome);
        return uncertainOutcome;
      }
      return indexOutcome;
    }
    for (const prunedId of prunedIds) {
      try {
        localStorage.removeItem(`${this._storagePrefix}:run:${prunedId}`);
      } catch {
        // An orphan record is harmless: loads follow the committed index.
      }
      this._runs.delete(prunedId);
      this._baseRuns.delete(prunedId);
    }
    this._runs.set(run.id, storedRun);
    this._baseRuns.set(run.id, JSON.parse(JSON.stringify(storedRun)));
    return { ok: true, rev: storedRun.rev, run: storedRun };
  }

  /**
   * Persist one run record, degrading gracefully under quota pressure: first
   * evict old terminal runs to free space, then retry with a slimmed clone that
   * drops base64/oversized payloads. Returns the record actually written (which
   * may be the slimmed clone) so the in-memory base snapshot matches storage.
   *
   * @private
   * @returns {{ ok: true, record: Object } | { ok: false, error: string, quota: boolean }}
   */
  _writeRunRecord(runKey, record) {
    const candidates = [record, slimRunForStorage(record)];
    let evicted = false;
    for (const candidate of candidates) {
      try {
        localStorage.setItem(runKey, JSON.stringify(candidate));
        return { ok: true, record: candidate };
      } catch (err) {
        if (!isQuotaError(err)) {
          return {
            ok: false,
            error: err?.message || String(err),
            quota: false,
          };
        }
        if (!evicted) {
          evicted = true;
          this._evictTerminalRuns(record.id);
          try {
            localStorage.setItem(runKey, JSON.stringify(candidate));
            return { ok: true, record: candidate };
          } catch (retryErr) {
            if (!isQuotaError(retryErr)) {
              return {
                ok: false,
                error: retryErr?.message || String(retryErr),
                quota: false,
              };
            }
            // Still over quota — fall through to the next, slimmer candidate.
          }
        }
      }
    }
    return { ok: false, error: "localStorage quota exceeded", quota: true };
  }

  /**
   * Free storage by removing terminal-status runs (oldest first), never the run
   * currently being written. Keeps the on-disk index and in-memory maps in sync.
   *
   * @private
   * @returns {number} count of runs evicted
   */
  _evictTerminalRuns(keepId) {
    const index = this._readIndex();
    const removable = index
      .map((entry) => (typeof entry === "string" ? { id: entry } : entry))
      .filter(
        (entry) =>
          entry?.id &&
          entry.id !== keepId &&
          TERMINAL_RUN_STATUSES.has(entry.status),
      )
      .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));

    if (removable.length === 0) return 0;

    const removedIds = new Set(removable.map((entry) => entry.id));
    const kept = index.filter((entry) => {
      const id = typeof entry === "string" ? entry : entry?.id;
      return !removedIds.has(id);
    });
    if (!this._writeIndex(kept).ok) return 0;

    for (const entry of removable) {
      try {
        localStorage.removeItem(`${this._storagePrefix}:run:${entry.id}`);
      } catch {
        // Best effort eviction
      }
      this._runs.delete(entry.id);
      this._baseRuns.delete(entry.id);
    }
    return removedIds.size;
  }

  /** Backward-compatibility flush helper */
  save() {
    for (const run of this._runs.values()) {
      this.saveRun(run);
    }
  }
}
