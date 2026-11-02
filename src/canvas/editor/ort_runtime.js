/**
 * Lazy, on-demand loader for ONNX Runtime Web (onnxruntime-web).
 *
 * Ensures onnxruntime-web (and its associated WebGPU/WASM pipelines) is never
 * loaded during initial page startup, layout parsing, or canvas rendering.
 * Loads strictly when an AI inference session is first requested by the user.
 */

import {
  appRendererUsesSingleThreadedWasm,
  ensureMattingModule,
} from "./ai_capabilities.js";

let runtimePromise = null;

/**
 * Asynchronously loads and configures onnxruntime-web on demand.
 *
 * @param {Function} [onProgress] - Optional progress callback reporting `{ phase: "runtime" }`.
 * @param {object} [options]
 * @param {object} [options.host] - Optional EditorHost conforming to editor-host-contract
 * @param {object} [options._deps] - Optional test overrides
 * @param {string} [options.wasmPaths] - Optional custom wasm base path
 * @returns {Promise<any>} The configured `ort` namespace.
 */
export async function loadOrtRuntime(onProgress, options = {}) {
  if (runtimePromise) {
    return runtimePromise;
  }

  // Gate on modular installer/loader contract (M-2.1)
  const ensureResult = await ensureMattingModule({
    host: options.host,
    onProgress,
    _deps: options._deps,
  });
  if (ensureResult && !ensureResult.ok) {
    throw new Error(ensureResult.reason || "mattingModuleUnavailable");
  }

  onProgress?.({ phase: "runtime" });

  runtimePromise = (async () => {
    const ort = await import("onnxruntime-web");
    // The runtime builds its wasm URL from this base plus a filename it hard-codes,
    // so the binaries and their loaders ship unhashed under /ort/ (scripts/copy-ort-wasm.mjs).
    if (typeof document !== "undefined" && document.baseURI) {
      let wasmPath = options.wasmPaths;
      if (!wasmPath && ensureResult?.dir) {
        const normalized = String(ensureResult.dir).replace(/\\/g, "/").replace(/\/+$/, "");
        wasmPath = normalized.startsWith("file://") ? `${normalized}/` : `file://${normalized}/`;
      }
      ort.env.wasm.wasmPaths =
        wasmPath || new URL("ort/", document.baseURI).href;
    }
    if (appRendererUsesSingleThreadedWasm()) {
      ort.env.wasm.numThreads = 1;
    }
    return ort;
  })().catch((err) => {
    // Reset so subsequent user actions can retry rather than permanently failing.
    runtimePromise = null;
    throw err;
  });

  return runtimePromise;
}

/**
 * Resets the cached runtime promise (useful for tests or teardown).
 */
export function resetOrtRuntime() {
  runtimePromise = null;
}
