const INFERENCE_TIMEOUT_MS = 120_000;
const IDLE_RELEASE_MS = 60_000;

/** Own a bounded, reusable worker; abort and timeout release its model memory. */
export function createAiRepairWorkerClient({
  createWorker = () => new Worker(new URL("./ai-repair-worker.js", import.meta.url), { type: "module" }),
  timeoutMs = INFERENCE_TIMEOUT_MS,
} = {}) {
  let worker = null;
  let loadedModelId = null;
  let backend = null;
  let pending = null;
  let nextId = 0;
  let idleTimer = null;

  const release = (reason = new DOMException("Repair cancelled", "AbortError")) => {
    clearTimeout(idleTimer);
    worker?.terminate();
    worker = null;
    loadedModelId = null;
    backend = null;
    pending?.finish(reason);
  };

  function run({ model, bytes, input, wasmPaths }, { signal, onProgress } = {}) {
    signal?.throwIfAborted();
    if (pending) return Promise.reject(new Error("aiRepairBusy"));
    clearTimeout(idleTimer);
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      let timer;
      const onAbort = () => release(signal.reason);
      const finish = (error, result) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        pending = null;
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
        worker.onerror = event => {
          if (worker === owner) release(new Error(event.message || "aiRepairWorkerFailed"));
        };
        worker.onmessageerror = () => {
          if (worker === owner) release(new Error("aiRepairInvalidWorkerMessage"));
        };
        worker.onmessage = ({ data }) => {
          if (worker !== owner || data?.id !== id || !pending) return;
          if (data.type === "progress") {
            try { onProgress?.({ phase: data.phase }); }
            catch (error) { release(error); }
          }
          else if (data.type === "error") release(new Error(data.message));
          else if (data.type === "result") {
            loadedModelId = model.id;
            backend = data.backend;
            finish(null, data.pixels);
          }
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => release(new Error("aiRepairTimeout")), timeoutMs);
        const transfer = [input.buffer];
        if (bytes) transfer.push(bytes.buffer);
        worker.postMessage({ id, model, bytes, input, wasmPaths }, transfer);
      } catch (error) { release(error); }
    });
  }

  return { run, release, hasModel: id => loadedModelId === id, backend: () => backend };
}
