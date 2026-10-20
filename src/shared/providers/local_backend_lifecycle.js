import { announceLocalBackendStarting } from "../local_backend_events.js";

/** How long a managed backend may take to answer after we start it. */
const BACKEND_BOOT_TIMEOUT_MS = 120000;
const BACKEND_BOOT_POLL_MS = 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * How this backend can be brought up from the renderer, if at all: a managed
 * runtime declares `lifecycle` with a `status`/`start` pair on its preload
 * bridge. Without the desktop bridge there is nothing to start.
 */
export function backendLauncher(backend) {
  const spec = backend?.lifecycle;
  const bridgeName = spec?.bridge;
  if (!bridgeName || typeof window === "undefined") return null;
  const bridge = window.vooDesktop?.[bridgeName];
  if (!bridge) return null;

  const statusName = spec.status ?? "status";
  const startName = spec.start ?? "start";
  if (typeof bridge[statusName] !== "function") return null;
  if (typeof bridge[startName] !== "function") return null;
  return {
    status: () => bridge[statusName](),
    start: (modelId) => bridge[startName](modelId),
  };
}

/** The managers wrap their payload in `{ok, value}`; the bridge returns it raw. */
export function statusValue(payload) {
  if (!payload) return null;
  return payload.ok === true && payload.value !== undefined
    ? payload.value
    : payload;
}

/**
 * Whether the backend's own status says it can be brought up as-is.
 *
 * Two status shapes are in play and they do not agree on where "installed"
 * lives:
 *
 *  - A top-level `installed` flag, when a status reports one.
 *  - The managed VOO engine has **no** top-level field: it reports
 *    `runtime.installed` plus a per-model `models[].installed` list. Reading
 *    `value.installed === false` here was always `undefined`, so the guard never
 *    fired and `start()` — which installs whatever is missing — turned one Run
 *    into a ~11 GB download.
 *  - Any shape we do not recognise is treated as not startable. Starting is a
 *    convenience; a silent download is not.
 */
export function statusAllowsStart(value, modelId) {
  if (!value) return false;
  if (typeof value.installed === "boolean") return value.installed;

  const runtime = value.runtime;
  if (runtime && typeof runtime === "object") {
    if (runtime.installed !== true) return false;
    const models = Array.isArray(value.models) ? value.models : [];
    const target = modelId ?? value.activeModelId ?? null;
    if (target) {
      // The exact model this request would boot: it has to be present, or start
      // would download it (or refuse an id the engine does not know).
      return models.some(
        (model) => model?.id === target && model?.installed === true,
      );
    }
    // No model named: the engine still needs one already on disk to load.
    return models.some((model) => model?.installed === true);
  }
  return false;
}

/**
 * Starts a backend that is installed but not answering, and waits for it to
 * serve. Returns false — leaving the caller's original, actionable error in
 * place — when this backend cannot be started from here, or when starting it
 * would first have to install the engine or download a model.
 */
export async function startBackendOnDemand(
  backend,
  { endpoint, modelId, force = false },
) {
  const launcher = backendLauncher(backend);
  if (!launcher) return false;

  const value = statusValue(await launcher.status().catch(() => null));
  if (!value) return false;
  if (
    value.serving &&
    !force &&
    (!modelId || !value.activeModelId || value.activeModelId === modelId)
  ) {
    return true;
  }
  if (!statusAllowsStart(value, modelId)) return false;

  announceLocalBackendStarting(backend.kind);
  const started = await launcher.start(modelId ?? undefined).catch(() => null);
  if (started?.ok === false) return false;

  const deadline = Date.now() + BACKEND_BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await backend.ping(endpoint, { timeoutMs: 2000 });
      return true;
    } catch {
      await delay(BACKEND_BOOT_POLL_MS);
    }
  }
  return false;
}
