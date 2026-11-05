/**
 * Robust compilation and lifecycle management for local AI super-resolution sessions.
 *
 * Provides cancellation responsiveness and application-level compile timeouts
 * so long-running or stalled ONNX Runtime Web model compilations can be cancelled
 * immediately by the user or safely timed out across provider attempts.
 */

import { loadOrtRuntime } from "./ort_runtime.js";
import { UPSCALE_MODEL_CACHE } from "./model_cache_names.js";
import { loadModelAssetBytes } from "./model_asset_loader.js";

const MODEL_CACHE = UPSCALE_MODEL_CACHE;

export const DEFAULT_COMPILE_TIMEOUT_MS = 20000;

let sessionPromise = null;
let activeBackend = null;
let loadedModelId = null;

export function describeUpscaleBackend() {
  return activeBackend;
}

export function releaseLocalUpscale() {
  if (sessionPromise) {
    sessionPromise
      .then(({ session }) => session?.release?.().catch?.(() => {}))
      .catch(() => {});
  }
  sessionPromise = null;
  loadedModelId = null;
  activeBackend = null;
}

export async function loadModelBytes(model, onProgress) {
  const filename =
    model.filename ||
    (model.url ? model.url.split("/").pop() : "realesrgan-compact-2x.onnx");
  return await loadModelAssetBytes({
    filename,
    fallbackUrl: model.url,
    cacheName: MODEL_CACHE,
    onProgress,
  });
}

/**
 * Checks whether cancellation has been requested via a function or an AbortSignal.
 *
 * @param {Function|AbortSignal|object} [shouldStop]
 * @returns {boolean}
 */
export function checkShouldStop(shouldStop) {
  if (!shouldStop) return false;
  if (typeof shouldStop === "function") {
    try {
      return Boolean(shouldStop());
    } catch {
      return true;
    }
  }
  if (typeof shouldStop?.aborted === "boolean") {
    return shouldStop.aborted;
  }
  return false;
}

/**
 * Compiles an ONNX inference session with timeout and cancellation races.
 *
 * @param {object} ort - Loaded ONNX Runtime namespace
 * @param {Uint8Array} bytes - Model binary bytes
 * @param {string} provider - Execution provider ('webgpu' or 'wasm')
 * @param {object} [options]
 * @param {number} [options.timeoutMs=20000] - Compilation timeout per provider attempt
 * @param {Function|AbortSignal} [options.shouldStop] - Cancellation predicate or signal
 * @returns {Promise<object>} The compiled InferenceSession
 */
export function createSessionWithTimeout(
  ort,
  bytes,
  provider,
  { timeoutMs = DEFAULT_COMPILE_TIMEOUT_MS, shouldStop } = {},
) {
  if (checkShouldStop(shouldStop)) {
    return Promise.reject(new Error("stopped"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timerId = null;
    let pollId = null;
    let abortListener = null;

    const cleanup = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (pollId !== null) {
        clearInterval(pollId);
        pollId = null;
      }
      if (
        abortListener &&
        typeof shouldStop?.removeEventListener === "function"
      ) {
        shouldStop.removeEventListener("abort", abortListener);
        abortListener = null;
      }
    };

    const settle = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    if (typeof shouldStop?.addEventListener === "function") {
      abortListener = () => {
        settle(() => reject(new Error("stopped")));
      };
      shouldStop.addEventListener("abort", abortListener, { once: true });
    }

    if (
      typeof shouldStop === "function" ||
      typeof shouldStop?.aborted === "boolean"
    ) {
      pollId = setInterval(() => {
        if (checkShouldStop(shouldStop)) {
          settle(() => reject(new Error("stopped")));
        }
      }, 50);
    }

    if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
      timerId = setTimeout(() => {
        settle(() =>
          reject(
            new Error(
              `upscaleCompileTimeout: ${provider} compilation exceeded ${timeoutMs}ms`,
            ),
          ),
        );
      }, timeoutMs);
    }

    ort.InferenceSession.create(bytes, {
      executionProviders: [provider],
      graphOptimizationLevel: "all",
    })
      .then((session) => {
        if (settled) {
          try {
            session?.release?.().catch?.(() => {});
          } catch {
            // Ignore background release error
          }
          return;
        }
        if (checkShouldStop(shouldStop)) {
          settle(() => {
            try {
              session?.release?.().catch?.(() => {});
            } catch {
              // Ignore background release error
            }
            reject(new Error("stopped"));
          });
          return;
        }
        settle(() => resolve(session));
      })
      .catch((err) => {
        if (settled) return;
        settle(() => reject(err));
      });
  });
}

/**
 * Obtains or creates an active ONNX super-resolution inference session.
 *
 * Checks `shouldStop` before and after each phase (runtime loading, model bytes
 * loading, compiling state, and each provider compilation attempt).
 *
 * @param {object} model - Model description
 * @param {Function} [onProgress] - Progress callback
 * @param {object} [options]
 * @param {Function|AbortSignal} [options.shouldStop] - Cancellation predicate or signal
 * @param {number} [options.compileTimeoutMs] - Per-provider compile timeout
 * @returns {Promise<{ ort: object, session: object }>}
 */
export async function getSession(model, onProgress, options = {}) {
  const shouldStop =
    typeof options === "function" ? options : options?.shouldStop;
  const compileTimeoutMs =
    typeof options === "object" && typeof options?.compileTimeoutMs === "number"
      ? options.compileTimeoutMs
      : DEFAULT_COMPILE_TIMEOUT_MS;

  if (checkShouldStop(shouldStop)) throw new Error("stopped");
  if (loadedModelId && loadedModelId !== model.id) releaseLocalUpscale();
  if (sessionPromise) {
    const existing = await sessionPromise;
    if (checkShouldStop(shouldStop)) throw new Error("stopped");
    return existing;
  }

  sessionPromise = (async () => {
    if (checkShouldStop(shouldStop)) throw new Error("stopped");
    const ort = await loadOrtRuntime(onProgress);
    if (checkShouldStop(shouldStop)) throw new Error("stopped");
    const bytes = await loadModelBytes(model, onProgress);
    if (checkShouldStop(shouldStop)) throw new Error("stopped");
    onProgress?.({ phase: "compiling" });
    if (checkShouldStop(shouldStop)) throw new Error("stopped");

    const providers =
      typeof navigator === "object" && navigator.gpu
        ? ["webgpu", "wasm"]
        : ["wasm"];
    for (const provider of providers) {
      if (checkShouldStop(shouldStop)) throw new Error("stopped");
      try {
        const session = await createSessionWithTimeout(ort, bytes, provider, {
          timeoutMs: compileTimeoutMs,
          shouldStop,
        });
        if (checkShouldStop(shouldStop)) {
          try {
            session?.release?.().catch?.(() => {});
          } catch {
            // ignore
          }
          throw new Error("stopped");
        }
        activeBackend = provider;
        loadedModelId = model.id;
        return { ort, session };
      } catch (error) {
        if (checkShouldStop(shouldStop) || error?.message === "stopped") {
          throw error?.message === "stopped" ? error : new Error("stopped");
        }
        console.warn(`upscale: ${provider} provider unavailable`, error);
      }
    }
    throw new Error("upscaleNoBackend");
  })().catch((error) => {
    sessionPromise = null;
    throw error;
  });
  return sessionPromise;
}
