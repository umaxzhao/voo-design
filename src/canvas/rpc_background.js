import { CANVAS_MODE } from "./environment.js";
import {
  getEnvironment,
  guarded,
  hasChromeApis,
  RpcError,
} from "./rpc_environment.js";
import { desktopMessageListeners, onHostEvent } from "./rpc_events.js";

// Long-running jobs (video generation especially) can sit queued for minutes
// before the first status answer. The fallback budget must be generous enough
// that a job is not abandoned mid-generation.
const DEFAULT_JOB_TIMEOUT_MS = 600000;

/** Talks to the service worker (side panel open/close, image fetching). */
export async function callBackground(type, payload = {}, { timeoutMs } = {}) {
  const env = getEnvironment();
  if (env.bridge) return env.bridge.call(type, payload, { timeoutMs });
  if (env.mode === CANVAS_MODE.DESKTOP) {
    const response = await globalThis.vooDesktop.callBackground(type, payload);
    if (response && response.ok === false) {
      throw new RpcError(
        response.error ?? "generic",
        response.message,
        response.details,
      );
    }
    return response;
  }
  // No extension APIs at all means no extension — say so, not "noPlatform".
  if (!hasChromeApis()) throw new RpcError("extensionRequired");
  const response = await guarded(() =>
    chrome.runtime.sendMessage({ type, ...payload }),
  );
  if (response && response.ok === false)
    throw new RpcError(
      response.error ?? "generic",
      response.message,
      response.details,
    );
  return response;
}

/**
 * Desktop twin of the runtime-broadcast job below: the request only has to be
 * accepted, and the outcome arrives later on the relay channel. Generation
 * runs for minutes, so nothing may hold an IPC reply open for its duration.
 */
async function callDesktopJob(
  type,
  payload,
  doneType,
  timeout = DEFAULT_JOB_TIMEOUT_MS,
) {
  const safeTimeout =
    Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_JOB_TIMEOUT_MS;
  const jobId = crypto.randomUUID();
  let listener;
  let timer;
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    if (listener) desktopMessageListeners.delete(listener);
  };
  const outcome = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      cleanup();
      reject(new RpcError("jobTimeout"));
    }, safeTimeout);
    listener = function (message) {
      if (message?.type !== doneType || message?.jobId !== jobId) return;
      cleanup();
      if (message.ok) resolve(message);
      else
        reject(
          new RpcError(
            message.error ?? "generic",
            message.message,
            message.details,
          ),
        );
    };
    desktopMessageListeners.add(listener);
  });
  try {
    // Observe both channels immediately: a fast platform error or timeout
    // can arrive while IPC is still waiting for the submission acknowledgement.
    const [, result] = await Promise.all([
      callBackground(type, { ...payload, jobId }),
      outcome,
    ]);
    return result;
  } finally {
    cleanup();
  }
}

/**
 * Starts a background job whose result arrives later as its own broadcast.
 *
 * Used for work that outlives any single message channel (minutes, not
 * seconds): the request only asks the service worker to START the job and
 * fails fast if it cannot; the outcome is a separate runtime broadcast —
 * which, coming from a content script, reaches every extension page — that
 * the matching jobId listener here picks up. Hosted pages get the same
 * outcome over the bridge port instead.
 */
export async function callBackgroundJob(
  type,
  payload,
  doneType,
  { timeout = DEFAULT_JOB_TIMEOUT_MS } = {},
) {
  const safeTimeout =
    Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_JOB_TIMEOUT_MS;
  const env = getEnvironment();
  if (env.bridge)
    return env.bridge.callJob(type, payload, doneType, {
      timeout: safeTimeout,
    });
  if (env.mode === CANVAS_MODE.DESKTOP) {
    return callDesktopJob(type, payload, doneType, safeTimeout);
  }
  if (!hasChromeApis()) throw new RpcError("extensionRequired");
  const jobId = crypto.randomUUID();
  let listener;
  let timer;
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    if (listener) chrome.runtime.onMessage.removeListener(listener);
  };
  const outcome = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      cleanup();
      reject(new RpcError("jobTimeout"));
    }, safeTimeout);
    listener = function (message) {
      if (message?.type !== doneType || message?.jobId !== jobId) return;
      cleanup();
      if (message.ok) resolve(message);
      else
        reject(
          new RpcError(
            message.error ?? "generic",
            message.message,
            message.details,
          ),
        );
    };
    chrome.runtime.onMessage.addListener(listener);
  });
  try {
    const [, result] = await Promise.all([
      callBackground(type, { ...payload, jobId }),
      outcome,
    ]);
    return result;
  } finally {
    cleanup();
  }
}

/**
 * Starts a job that reports progress before it finishes.
 *
 * Same shape as `callBackgroundJob` — the request only has to be accepted,
 * the outcome arrives later keyed by jobId — except the job also pushes
 * intermediate states, which `onChunk` receives. Both travel as ordinary
 * host events, the one channel every mode already has: runtime broadcasts on
 * extension pages, the bridge port on hosted ones, the IPC relay on desktop.
 *
 * The timeout is idle-based, not total: a stream that keeps producing tokens
 * is alive by definition, and a layout can legitimately take minutes. Its
 * default matches `callBackgroundJob`'s, because a provider with no SSE
 * endpoint (the local CLI) answers in one piece at the very end — silence
 * there means "still working", not "dead".
 */
export async function callBackgroundStream(
  type,
  payload,
  { chunkEvent, doneEvent, onChunk, idleTimeout = DEFAULT_JOB_TIMEOUT_MS } = {},
) {
  const jobId = crypto.randomUUID();
  let offChunk = () => {};
  let offDone = () => {};
  let timer = null;
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    offChunk();
    offDone();
  };
  const outcome = new Promise((resolve, reject) => {
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        cleanup();
        reject(new RpcError("jobTimeout"));
      }, idleTimeout);
      timer.unref?.();
    };
    offChunk = onHostEvent(chunkEvent, (event) => {
      if (event?.jobId !== jobId) return;
      arm();
      onChunk?.(event);
    });
    offDone = onHostEvent(doneEvent, (event) => {
      if (event?.jobId !== jobId) return;
      cleanup();
      if (event.ok) resolve(event);
      else
        reject(
          new RpcError(event.error ?? "generic", event.message, event.details),
        );
    });
    arm();
  });

  try {
    const [, result] = await Promise.all([
      callBackground(type, { ...payload, jobId }),
      outcome,
    ]);
    return result;
  } finally {
    cleanup();
  }
}
