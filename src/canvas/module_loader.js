/**
 * Module Loader (三端适配层)
 *
 * Single source of truth for modular editor package loading across
 * Electron Desktop, Hosted Web, and Chrome Extension.
 *
 * Implements M-1.2 in docs/plan-modular-editor-packaging.md:
 * - Electron: delegates to window.vooElectron.modules IPC (M-1.3).
 * - Web: triggers dynamic import() with fetch + ReadableStream byte-level progress.
 * - Chrome Extension: assets are bundled with the extension package; returns installed ({ ok: true }).
 *
 * Environment detection strictly reuses src/canvas/environment.js.
 * Contract definitions imported statically from src/shared/editor-modules.js.
 */

import { CANVAS_MODE, getEnvironment } from "./environment.js";
import { EDITOR_MODULE } from "../shared/editor-modules.js";

export { EDITOR_MODULE };

/**
 * Module loading state vocabulary.
 */
export const MODULE_STATE = Object.freeze({
  INSTALLED: "installed",
  AVAILABLE: "available",
  DOWNLOADING: "downloading",
  UNSUPPORTED: "unsupported",
});

/**
 * In-memory module state cache across platforms.
 * Keeps moduleState(moduleId) synchronous while enabling async refreshes.
 */
const moduleStateCache = new Map();

/**
 * Maps module IDs to their corresponding web bundle / asset fetch targets and dynamic import loaders.
 */
const WEB_MODULE_IMPORTERS = {
  [EDITOR_MODULE.MATTING]: {
    url: "/ort/ort-wasm-simd-threaded.wasm",
    load: () => import("./editor/ort_runtime.js"),
  },
};

/**
 * Checks the current lifecycle state of a module synchronously.
 *
 * Packaging Invariant:
 * Currently, the one first-party module (MATTING) has its assets
 * bundled with releases across all platforms (web dynamic import chunks, extension assets,
 * electron asar). Therefore, their default state is INSTALLED across all 5 runtime modes
 * (STANDALONE, DESKTOP, EXTENSION, FRAME, BRIDGE).
 *
 * moduleStateCache (populated by ensureModule / refreshModuleState IPC) takes precedence,
 * and test overrides (window.__vooModuleStateOverride / _deps.moduleStateOverride) allow
 * simulating AVAILABLE / DOWNLOADING states.
 *
 * @param {string} moduleId - One of EDITOR_MODULE.*
 * @param {object} [options]
 * @param {object} [options._deps] - Test injection overrides
 * @returns {"installed" | "available" | "downloading" | "unsupported"}
 */
export function moduleState(moduleId, { _deps = {} } = {}) {
  if (typeof window !== "undefined" && window.__vooModuleStateOverride?.[moduleId]) {
    return window.__vooModuleStateOverride[moduleId];
  }
  if (_deps.moduleStateOverride?.[moduleId]) {
    return _deps.moduleStateOverride[moduleId];
  }
  if (moduleStateCache.has(moduleId)) {
    return moduleStateCache.get(moduleId);
  }
  if (_deps.electronModules && typeof _deps.electronModules.stateSync === "function") {
    return _deps.electronModules.stateSync(moduleId);
  }
  if (_deps.electronModules) {
    return moduleStateCache.get(moduleId) ?? MODULE_STATE.AVAILABLE;
  }
  if (moduleId === EDITOR_MODULE.MATTING) {
    return MODULE_STATE.INSTALLED;
  }
  return MODULE_STATE.AVAILABLE;
}

/**
 * Asynchronously queries the underlying platform for the module state,
 * updates the local memory cache, and returns the resolved state.
 * Fails fast by propagating IPC query errors rather than silently swallowing.
 *
 * @param {string} moduleId - One of EDITOR_MODULE.*
 * @param {object} [options]
 * @param {object} [options._deps] - Test injection overrides
 * @returns {Promise<"installed" | "available" | "downloading" | "unsupported">}
 */
export async function refreshModuleState(moduleId, { _deps = {} } = {}) {
  if (typeof window !== "undefined" && window.__vooModuleStateOverride?.[moduleId]) {
    return window.__vooModuleStateOverride[moduleId];
  }
  if (_deps.moduleStateOverride?.[moduleId]) {
    return _deps.moduleStateOverride[moduleId];
  }

  const env = _deps.getEnvironment ? _deps.getEnvironment() : getEnvironment();
  const mode = env?.mode;

  if (mode === CANVAS_MODE.EXTENSION || (mode === CANVAS_MODE.FRAME && !env?.hosted)) {
    return MODULE_STATE.INSTALLED;
  }

  if (mode === CANVAS_MODE.DESKTOP) {
    const electronModules =
      _deps.electronModules ??
      globalThis.window?.vooElectron?.modules ??
      globalThis.window?.vooDesktop?.modules;

    if (electronModules && typeof electronModules.state === "function") {
      const state = await electronModules.state(moduleId);
      if (state) {
        moduleStateCache.set(moduleId, state);
        return state;
      }
    }
  }

  return moduleState(moduleId, { _deps });
}

/**
 * Reads a ReadableStream while reporting downloaded bytes and total bytes.
 *
 * @param {ReadableStream} stream
 * @param {number} totalBytes
 * @param {Function} [onProgress]
 */
async function pumpStreamWithProgress(stream, totalBytes, onProgress) {
  const reader = stream.getReader();
  let loadedBytes = 0;

  try {
    let finished = false;
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      if (value) {
        loadedBytes += value.byteLength;
        if (onProgress) {
          onProgress({
            loadedBytes,
            totalBytes: totalBytes > 0 ? totalBytes : loadedBytes,
            percent: totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : null,
          });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Web adapter for downloading/loading modules with real byte progress.
 *
 * @param {string} moduleId
 * @param {object} [options]
 * @param {Function} [options.onProgress]
 * @param {Function} [options.fetcher] - Dependency injection for tests
 * @param {Function} [options.loaderOverride] - Dynamic import override for tests
 * @returns {Promise<{ok: true} | {ok: false, reason: string}>}
 */
async function ensureWebModule(moduleId, { onProgress, fetcher = globalThis.fetch, loaderOverride } = {}) {
  const importer = WEB_MODULE_IMPORTERS[moduleId];
  if (!importer) {
    return { ok: false, reason: `Unknown module: "${moduleId}"` };
  }

  moduleStateCache.set(moduleId, MODULE_STATE.DOWNLOADING);

  try {
    // If a companion asset URL is registered (e.g. wasm binary for matting),
    // fetch it with ReadableStream to read Content-Length and report real byte progress.
    if (importer.url && typeof fetcher === "function") {
      let response;
      try {
        response = await fetcher(importer.url);
      } catch (err) {
        moduleStateCache.set(moduleId, MODULE_STATE.AVAILABLE);
        return { ok: false, reason: `Network error downloading ${moduleId}: ${err?.message || "connection failed"}` };
      }

      if (!response || !response.ok) {
        moduleStateCache.set(moduleId, MODULE_STATE.AVAILABLE);
        return { ok: false, reason: `HTTP ${response?.status || 500} downloading ${moduleId}` };
      }

      const contentLength = response.headers?.get?.("content-length") ?? response.headers?.["content-length"];
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      if (response.body && typeof response.body.getReader === "function") {
        await pumpStreamWithProgress(response.body, totalBytes, onProgress);
      } else if (onProgress && totalBytes > 0) {
        onProgress({ loadedBytes: totalBytes, totalBytes, percent: 100 });
      }
    } else if (onProgress) {
      // Simpler JS chunk progress reporting
      onProgress({ loadedBytes: 1, totalBytes: 1, percent: 100 });
    }

    // Trigger dynamic import() to load and execute JS chunk into runtime
    if (loaderOverride) {
      await loaderOverride();
    } else {
      await importer.load();
    }

    moduleStateCache.set(moduleId, MODULE_STATE.INSTALLED);
    return { ok: true };
  } catch (error) {
    moduleStateCache.set(moduleId, MODULE_STATE.AVAILABLE);
    return { ok: false, reason: error?.message || "Module import failed" };
  }
}

/**
 * Ensures that a given module is downloaded, verified, and loaded into runtime.
 *
 * @param {string} moduleId - One of EDITOR_MODULE.*
 * @param {object} [options]
 * @param {Function} [options.onProgress] - Callback ({ loadedBytes, totalBytes, percent, phase })
 * @param {object} [options._deps] - Optional test injection overrides
 * @returns {Promise<{ok: true} | {ok: false, reason: string}>}
 */
export async function ensureModule(moduleId, { onProgress, _deps = {} } = {}) {
  const env = _deps.getEnvironment ? _deps.getEnvironment() : getEnvironment();
  const mode = env?.mode;

  // 1. Chrome Extension: assets are bundled with the extension package; no download required
  if (mode === CANVAS_MODE.EXTENSION || (mode === CANVAS_MODE.FRAME && !env?.hosted)) {
    return { ok: true };
  }

  // 2. Electron Desktop: route to window.vooElectron.modules / window.vooDesktop.modules IPC
  if (mode === CANVAS_MODE.DESKTOP) {
    const electronModules =
      _deps.electronModules ??
      globalThis.window?.vooElectron?.modules ??
      globalThis.window?.vooDesktop?.modules;

    if (!electronModules || typeof electronModules.ensure !== "function") {
      return {
        ok: false,
        reason: "Electron module installer IPC is unavailable (window.vooElectron.modules missing).",
      };
    }

    moduleStateCache.set(moduleId, MODULE_STATE.DOWNLOADING);

    const wrappedProgress = (progress) => {
      moduleStateCache.set(moduleId, MODULE_STATE.DOWNLOADING);
      onProgress?.(progress);
    };

    try {
      const result = await electronModules.ensure(moduleId, { onProgress: wrappedProgress });
      if (!result) {
        moduleStateCache.set(moduleId, MODULE_STATE.AVAILABLE);
        return { ok: false, reason: "Installer returned empty response." };
      }
      if (result.ok === true) {
        moduleStateCache.set(moduleId, MODULE_STATE.INSTALLED);
        return {
          ok: true,
          ...(result.dir ? { dir: result.dir } : {}),
        };
      }
      moduleStateCache.set(moduleId, MODULE_STATE.AVAILABLE);
      return {
        ok: false,
        reason: result.reason || result.error || "Installation failed.",
      };
    } catch (err) {
      moduleStateCache.set(moduleId, MODULE_STATE.AVAILABLE);
      return {
        ok: false,
        reason: err?.message || "Electron module installation failed.",
      };
    }
  }

  // 3. Hosted Web / Standalone: fallback to fetch + ReadableStream byte progress + dynamic import()
  return await ensureWebModule(moduleId, {
    onProgress,
    fetcher: _deps.fetch || globalThis.fetch,
    loaderOverride: _deps.loaderOverride,
  });
}

/**
 * Resets in-memory module state (for test cleanup).
 */
export function _resetWebModuleState() {
  moduleStateCache.clear();
}

export function _resetModuleStateCache() {
  moduleStateCache.clear();
}
