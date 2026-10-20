/**
 * Pure client-side capability and environment checks for on-device AI operations (Matting, Repair, Upscale).
 *
 * Kept strictly separated from heavy runtime modules (local_matting.js, local_ai_repair.js, local_upscale.js)
 * so UI components and editors can query platform support without eagerly triggering dynamic module loads
 * or pulling in ONNX Runtime bundles.
 */

import { resolveDesktopWebOrigin } from "../environment.js";
import { EDITOR_MODULE } from "../../shared/editor-modules.js";

export { EDITOR_MODULE };

/**
 * Checks synchronously whether the matting module (voo-matting) is installed.
 *
 * @param {object} [options]
 * @param {object} [options.host] - Optional EditorHost boundary
 * @param {object} [options._deps] - Test injection overrides
 * @returns {boolean}
 */
export function isMattingModuleInstalled({ host, _deps = {} } = {}) {
  if (typeof _deps.isModuleInstalled === "function") {
    return _deps.isModuleInstalled(EDITOR_MODULE.MATTING);
  }
  if (typeof _deps.moduleState === "function") {
    return _deps.moduleState(EDITOR_MODULE.MATTING) === "installed";
  }
  if (host && typeof host.isModuleInstalled === "function") {
    return host.isModuleInstalled(EDITOR_MODULE.MATTING);
  }
  if (host && typeof host.moduleState === "function") {
    return host.moduleState(EDITOR_MODULE.MATTING) === "installed";
  }
  return true;
}

/**
 * Probes and ensures that the on-device matting module (voo-matting) is ready.
 *
 * Strictly follows docs/plan-modular-editor-packaging.md M-2.1:
 * Routes through host.ensureModule if an EditorHost is provided,
 * or dynamically invokes module_loader's ensureModule(EDITOR_MODULE.MATTING).
 *
 * @param {object} [options]
 * @param {object} [options.host] - Optional EditorHost conforming to editor-host-contract
 * @param {Function} [options.onProgress] - Optional progress callback
 * @param {object} [options._deps] - Test injection overrides
 * @returns {Promise<{ ok: boolean, reason?: string, dir?: string }> }
 */
export async function ensureMattingModule({ host, onProgress, _deps = {} } = {}) {
  if (typeof _deps.ensureModule === "function") {
    return await _deps.ensureModule(EDITOR_MODULE.MATTING, { onProgress });
  }
  if (host && typeof host.ensureModule === "function") {
    return await host.ensureModule(EDITOR_MODULE.MATTING, { onProgress });
  }

  // Pure Node/test environment check: avoid network calls if no browser/DOM/fetch
  if (typeof window === "undefined" && typeof document === "undefined" && !_deps.forceModuleLoader) {
    return { ok: true };
  }

  try {
    const { ensureModule } = await import("../module_loader.js");
    return await ensureModule(EDITOR_MODULE.MATTING, { onProgress, _deps });
  } catch (error) {
    return { ok: false, reason: error?.message || "mattingModuleLoadFailed" };
  }
}

export function isLocalMattingSupported() {
  return (
    typeof WebAssembly === "object" &&
    typeof caches === "object" &&
    typeof OffscreenCanvas !== "undefined"
  );
}

export function isLocalUpscaleSupported() {
  return (
    typeof WebAssembly === "object" &&
    typeof caches === "object" &&
    typeof OffscreenCanvas !== "undefined"
  );
}

export function isLocalAiRepairSupported() {
  return (
    typeof WebAssembly === "object" &&
    typeof caches === "object" &&
    typeof OffscreenCanvas !== "undefined"
  );
}

/**
 * True in the desktop app's renderers: the canvas under `voo://` and the
 * app-served panel page on the loopback origin.
 *
 * Both run cross-origin-isolated, which makes onnxruntime-web default to its
 * threaded WASM runtime — and its worker cannot start from the `voo://`
 * scheme (the panel's loopback origin fares the same). The worker's failure
 * is swallowed by the runtime, so the session build hangs forever instead of
 * falling back. Keeping the runtime single-threaded there avoids the worker
 * entirely; WebGPU still runs, so matting stays fast.
 */
export function appRendererUsesSingleThreadedWasm() {
  try {
    return (
      window.location.protocol === "voo:" || resolveDesktopWebOrigin() !== null
    );
  } catch {
    return false;
  }
}
