/**
 * Bridge client for the hosted editor: talks to the extension's service
 * worker through `externally_connectable`.
 *
 * Two channels are kept:
 *  - request/response over `chrome.runtime.sendMessage(extensionId, …)` —
 *    used for DB operations, settings, provider calls and job submission;
 *  - a long-lived port for events the worker pushes (job outcomes, sync
 *    announcements, tab changes), because runtime broadcasts from the worker
 *    never reach web pages.
 *
 * `detectBridge()` doubles as the environment probe: when no candidate ID
 * answers the ping, the caller knows the extension is absent and the editor
 * is running standalone.
 */

import { BG, BRIDGE_PORT_NAME, EVENTS } from "../shared/messages.js";
import { candidateExtensionIds } from "../shared/extension_id.js";
import { DB_OPS } from "../shared/db_wire.js";
import {
  extractStorageQuotaDiagnostics,
  storageFailureCode,
} from "../shared/storage-quota-diagnostics.js";

const DEFAULT_PING_TIMEOUT_MS = 1500;
const DEFAULT_CALL_TIMEOUT_MS = 30000;
// Long-running jobs (video generation especially) spend minutes queued before
// the first status answer. The fallback budget must be generous enough that a
// routed job is not abandoned mid-generation.
const DEFAULT_JOB_TIMEOUT_MS = 600000;

export const CONTEXT_GONE = /Extension context invalidated/i;

/**
 * Explicit whitelist of message types representing idempotent read operations
 * that are safe to retry automatically on transient failures.
 */
export const IDEMPOTENT_READ_TYPES = new Set([
  BG.EXTERNAL_PING,
  BG.SETTINGS_GET,
  BG.PROVIDER_CONFIG_GET,
  BG.PROVIDER_MODELS,
  BG.FETCH_JSON,
  BG.FETCH_AS_DATA_URL,
]);

/**
 * Idempotent DB_OP sub-operations that are pure reads.
 */
export const IDEMPOTENT_DB_OPS = new Set([
  DB_OPS.LOAD_WORKFLOW,
  DB_OPS.LIST_WORKFLOWS,
  DB_OPS.LIST_WORKFLOW_SUMMARIES,
  DB_OPS.LOAD_WORKFLOW_EXECUTION,
  DB_OPS.LIST_WORKFLOW_EXECUTIONS,
  DB_OPS.GET_IMAGE_BLOBS,
  DB_OPS.GET_IMAGE_DATA_URLS,
  DB_OPS.LIST_ASSET_PAGE,
  DB_OPS.GET_ASSET_THUMBS,
  DB_OPS.LIST_ASSET_RECORDS,
  DB_OPS.LIST_ASSET_IDS,
  DB_OPS.LIST_AGENT_SKILLS,
]);

/**
 * Returns true if a request is a known idempotent read operation.
 */
export function isIdempotentRead(type, payload = {}) {
  if (IDEMPOTENT_READ_TYPES.has(type)) return true;
  if (type === BG.DB_OP && payload?.op && IDEMPOTENT_DB_OPS.has(payload.op)) {
    return true;
  }
  return false;
}

/** Carries the worker's error code so the UI can localize it. */
export class BridgeError extends Error {
  constructor(code, message, details) {
    super(message ?? code);
    this.name = "BridgeError";
    this.code = code;
    if (details) this.details = details;
  }
}

function hasExternalMessaging() {
  return Boolean(globalThis.chrome?.runtime?.sendMessage);
}

function pingExtension(extensionId, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    chrome.runtime
      .sendMessage(extensionId, { type: BG.EXTERNAL_PING })
      .then((response) => {
        clearTimeout(timer);
        resolve(response?.ok === true ? response : null);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/**
 * Picks the first connected extension among the candidates (plan 4.7).
 *
 * Every ping starts at once — a candidate whose service worker hangs until
 * its timeout must not stack that wait in front of a healthy candidate — but
 * the *choice* still honours candidate order, so an `?extid=` override or a
 * persisted choice wins a tie against a dev build. Pure, so the probing
 * behaviour is unit-testable with fake pings.
 *
 * @param {Array<string>} candidates most specific first
 * @param {(id: string) => Promise<{version?: string} | null>} ping
 * @returns {Promise<null | {extensionId: string, version: string | null}>}
 */
export async function firstConnectedExtension(candidates, ping) {
  const inflight = new Map(candidates.map((id) => [id, ping(id)]));
  for (const candidate of candidates) {
    const res = await inflight.get(candidate);
    if (res) {
      return { extensionId: candidate, version: res.version ?? null };
    }
  }
  return null;
}

/**
 * Probes the candidate extension IDs and returns a connected bridge, or null
 * when the extension is not installed (or unreachable from this origin).
 *
 * @returns {Promise<null | {
 *   extensionId: string,
 *   call: (type: string, payload?: object, options?: object) => Promise<object>,
 *   callJob: (type: string, payload: object, doneType: string, opts?: object) => Promise<object>,
 *   onEvent: (name: string, listener: (payload: object) => void) => () => void,
 * }>}
 */
export async function detectBridge({
  timeoutMs = DEFAULT_PING_TIMEOUT_MS,
} = {}) {
  if (!hasExternalMessaging()) return null;

  const winner = await firstConnectedExtension(
    candidateExtensionIds(),
    (candidate) => pingExtension(candidate, timeoutMs),
  );
  if (!winner) return null;
  const { extensionId, version: extensionVersion } = winner;

  /** @type {chrome.runtime.Port | null} */
  let port = null;
  let invalidated = false;
  const eventListeners = new Map();

  function markInvalidated() {
    if (invalidated) return;
    invalidated = true;
    port = null;
    dispatchEvent({
      type: "ciw.event",
      name: EVENTS.BRIDGE_INVALIDATED,
      payload: {},
    });
  }

  function dispatchEvent(message) {
    if (message?.type !== "ciw.event") return;
    eventListeners
      .get(message.name)
      ?.forEach((listener) => listener(message.payload));
  }

  /**
   * (Re)opens the event port. The worker is killed after ~30s idle, which
   * drops the port; listeners survive in the registry and the port is
   * re-established on the next interaction.
   */
  function ensurePort() {
    if (invalidated) return null;
    if (port) return port;
    try {
      port = chrome.runtime.connect(extensionId, { name: BRIDGE_PORT_NAME });
    } catch (error) {
      port = null;
      if (CONTEXT_GONE.test(error?.message ?? "")) {
        markInvalidated();
      }
      return null;
    }
    port.onMessage.addListener(dispatchEvent);
    port.onDisconnect.addListener(() => {
      port = null;
      if (invalidated) return;
      const lastError = chrome.runtime?.lastError?.message ?? "";
      if (CONTEXT_GONE.test(lastError)) {
        markInvalidated();
        return;
      }
      // Reconnect eagerly so job outcomes arriving soon still find a port.
      if (eventListeners.size > 0) ensurePort();
    });
    return port;
  }

  async function sendOnce(type, payload, timeoutMs) {
    let timer;
    let response;
    try {
      const messagePromise = chrome.runtime.sendMessage(extensionId, {
        type,
        ...payload,
      });
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new BridgeError(
              "callTimeout",
              `Bridge call timed out after ${timeoutMs}ms`,
            ),
          );
        }, timeoutMs);
      });
      response = await Promise.race([messagePromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      if (CONTEXT_GONE.test(error?.message ?? "")) {
        markInvalidated();
        throw new BridgeError("extensionReloaded", error?.message);
      }
      throw new BridgeError("bridgeUnreachable", error?.message);
    } finally {
      clearTimeout(timer);
    }
    if (response && response.ok === false) {
      const sanitized = extractStorageQuotaDiagnostics({
        code: response.error,
        message: response.message,
        details: response.details,
      });
      throw new BridgeError(
        storageFailureCode({ code: response.error, message: response.message }),
        response.message,
        sanitized ?? undefined,
      );
    }
    return response;
  }

  async function call(
    type,
    payload = {},
    { timeoutMs = DEFAULT_CALL_TIMEOUT_MS, maxRetries } = {},
  ) {
    if (invalidated) {
      throw new BridgeError("extensionReloaded");
    }
    const isIdempotent = isIdempotentRead(type, payload);
    const retriesAllowed =
      maxRetries !== undefined ? maxRetries : isIdempotent ? 1 : 0;

    let attempts = 0;
    for (;;) {
      try {
        return await sendOnce(type, payload, timeoutMs);
      } catch (err) {
        attempts += 1;
        // Never retry if the context was invalidated or if retries are exhausted
        if (err.code === "extensionReloaded" || attempts > retriesAllowed) {
          throw err;
        }
      }
    }
  }

  /**
   * Starts a worker job whose outcome arrives later over the event port.
   * Mirrors callBackgroundJob in rpc.js: the request must be accepted first,
   * then the first port event matching `doneType` + `jobId` settles it.
   */
  async function callJob(
    type,
    payload,
    doneType,
    { timeout = DEFAULT_JOB_TIMEOUT_MS } = {},
  ) {
    if (invalidated) {
      throw new BridgeError("extensionReloaded");
    }
    const jobId = crypto.randomUUID();
    let unsubscribe = () => {};
    let timer;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
    const outcome = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        cleanup();
        // Fire-and-forget job cancellation to SW to stop computing
        call(BG.CANCEL_JOB, { jobId }).catch(() => {});
        reject(new BridgeError("jobTimeout"));
      }, timeout);
      const listener = (message) => {
        if (message?.jobId !== jobId) return;
        cleanup();
        if (message.ok) resolve(message);
        else
          reject(
            new BridgeError(
              message.error ?? "generic",
              message.message,
              message.details,
            ),
          );
      };
      unsubscribe = onEvent(doneType, listener);
    });
    ensurePort();
    try {
      // The event port may reject before sendMessage acknowledges the job.
      // Attach both handlers now so that failure reaches the caller once.
      const [, result] = await Promise.all([
        call(type, { ...payload, jobId }),
        outcome,
      ]);
      return result;
    } finally {
      cleanup();
    }
  }

  function onEvent(name, listener) {
    if (!eventListeners.has(name)) eventListeners.set(name, new Set());
    eventListeners.get(name).add(listener);
    return () => eventListeners.get(name)?.delete(listener);
  }

  ensurePort();
  return { extensionId, extensionVersion, call, callJob, onEvent };
}
