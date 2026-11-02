import { isVooBinary } from "./voo_binary.js";

const JOB_TIMEOUT_MS = 120_000;
const IDLE_RELEASE_MS = 30_000;

function validResult(operation, result) {
  if (operation === "encode") return result instanceof Uint8Array && isVooBinary(result);
  return result === null || (typeof result === "string" && result.startsWith("data:image/"));
}

/** Own one serial background job; failure never retries expensive work on the UI thread. */
export function createVooBackgroundClient({
  createWorker = () => new Worker(new URL("./voo-background-worker.js", import.meta.url), { type: "module" }),
  timeoutMs = JOB_TIMEOUT_MS,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("voo-background-invalid-timeout");
  let worker = null;
  let pending = null;
  let nextId = 0;
  let idleTimer = null;

  function release(reason = new DOMException("Background job cancelled", "AbortError")) {
    clearTimeout(idleTimer);
    idleTimer = null;
    const owner = worker;
    worker = null;
    if (owner) owner.onmessage = owner.onmessageerror = owner.onerror = null;
    owner?.terminate();
    pending?.finish(reason);
  }

  // Idle ownership handlers live outside run(), so they retain no document,
  // promise resolver or previous encoded output between jobs.
  function watchWorker(owner) {
    owner.onerror = event => {
      if (worker !== owner) return;
      event.preventDefault?.();
      release(new Error(event.message || "voo-background-worker-failed"));
    };
    owner.onmessageerror = () => {
      if (worker === owner) release(new Error("voo-background-invalid-message"));
    };
  }

  function run(operation, file, { signal } = {}) {
    if (operation !== "cover" && operation !== "encode") return Promise.reject(new Error("voo-background-invalid-operation"));
    if (!file || typeof file !== "object") return Promise.reject(new Error("voo-background-invalid-file"));
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Background job cancelled", "AbortError"));
    if (pending) return Promise.reject(new Error("voo-background-busy"));
    clearTimeout(idleTimer);
    idleTimer = null;
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      let timer;
      const onAbort = () => release(signal.reason ?? new DOMException("Background job cancelled", "AbortError"));
      const finish = (error, result) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        pending = null;
        if (worker) worker.onmessage = null;
        if (error) reject(error);
        else {
          idleTimer = setTimeout(release, IDLE_RELEASE_MS);
          resolve(result);
        }
      };
      pending = { finish };
      try {
        worker ??= createWorker();
        const owner = worker;
        watchWorker(owner);
        worker.onmessage = ({ data }) => {
          if (worker !== owner || !pending || data?.id !== id) return;
          if (data.type === "error") release(new Error(data.message || "voo-background-worker-failed"));
          else if (data.type !== "result" || !validResult(operation, data.result)) {
            release(new Error("voo-background-invalid-result"));
          } else finish(null, data.result);
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => release(new Error("voo-background-timeout")), timeoutMs);
        // Authoritative scene buffers remain owned by the editor. Only the
        // worker's newly encoded output is transferred in the reverse direction.
        worker.postMessage({ id, operation, file });
      } catch (error) { release(error); }
    });
  }

  return { run, release };
}
