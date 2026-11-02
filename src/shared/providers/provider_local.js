/**
 * The local provider: a client for the VOO Local Engine.
 *
 * It owns no models and downloads nothing. Everything it can do depends on the
 * engine process being up on this machine, which is why
 * `getProviderConfig` reports real connectivity instead of a constant — the
 * canvas picks the first *configured* provider, and a local provider that
 * always claimed to be ready would get chosen even with nothing installed.
 *
 * The backend's declared capabilities drive everything below: which medium is
 * accepted, which models are listed, and which error a mismatch produces.
 *
 * Each medium is dispatched through the backend that declares its capability.
 */

import {
  API_MEDIA_TYPE,
  PROVIDER_ID,
  REMOTE_JOB_STATUS,
} from "../providers.js";
import { getSettingAsync, setSetting } from "../settings.js";
import {
  LOCAL_BACKEND_KIND,
  LOCAL_BACKEND_KIND_KEY,
  LOCAL_ENDPOINT_KEY,
  resolveLocalBackend,
} from "../local_backends.js";
import {
  backendCapabilities,
  capabilitiesForMedia,
  capabilityModelNames,
  resolveLocalCapability,
} from "../local_capabilities.js";
import {
  LocalBackendError,
  localBackendReachability,
} from "../local_transport.js";
import {
  backendLauncher,
  statusValue,
  startBackendOnDemand,
} from "./local_backend_lifecycle.js";

/** The backend and endpoint a request should use, read fresh. */
async function currentTarget(mediaType = API_MEDIA_TYPE.IMAGE) {
  const [kind, storedEndpoint] = await Promise.all([
    getSettingAsync(LOCAL_BACKEND_KIND_KEY).catch(() => null),
    getSettingAsync(LOCAL_ENDPOINT_KEY).catch(() => null),
  ]);
  // A 3D route has its own runtime. Switching to it must not disconnect the
  // image engine or reinterpret its saved endpoint as a Hunyuan endpoint.
  const backend = resolveLocalBackend(
    mediaType === API_MEDIA_TYPE.MODEL_3D
      ? LOCAL_BACKEND_KIND.HUNYUAN3D
      : LOCAL_BACKEND_KIND.VOO_ENGINE,
  );
  return {
    backend,
    endpoint:
      kind === backend.kind && storedEndpoint
        ? storedEndpoint
        : backend.defaultEndpoint,
    isExplicit: Boolean(kind === backend.kind && storedEndpoint),
  };
}

/**
 * Whether the local provider can currently do anything.
 *
 * `configured` is the honest answer to "is this usable right now", not "does
 * this exist" — the caller uses it to decide whether to route a job here.
 */
export async function getProviderConfig({
  fetch: fetchImpl,
  probe,
  mediaType = API_MEDIA_TYPE.IMAGE,
} = {}) {
  const reachability = localBackendReachability();
  if (!reachability.ok) {
    return {
      providerId: PROVIDER_ID.LOCAL,
      configured: false,
      persistence: "local",
      maskedKey: null,
      error: reachability.reason,
    };
  }

  const { backend, endpoint, isExplicit } = await currentTarget(mediaType);

  const hasDesktop =
    typeof window !== "undefined" && Boolean(window.vooDesktop);
  const shouldProbe =
    Boolean(probe) ||
    Boolean(fetchImpl) ||
    isExplicit ||
    hasDesktop ||
    typeof window === "undefined";

  if (!shouldProbe) {
    return {
      providerId: PROVIDER_ID.LOCAL,
      configured: false,
      persistence: "local",
      maskedKey: `${backend.label} · ${endpoint}`,
      error: "localBackend.unreachable",
    };
  }

  try {
    if (probe) {
      await probe(endpoint);
    } else {
      await backend.ping(endpoint, { fetch: fetchImpl });
    }
    return {
      providerId: PROVIDER_ID.LOCAL,
      configured: true,
      persistence: "local",
      // Not a key — there is none — but the field the settings drawer renders
      // as "what is this provider pointed at".
      maskedKey: `${backend.label} · ${endpoint}`,
      error: null,
    };
  } catch {
    return {
      providerId: PROVIDER_ID.LOCAL,
      configured: false,
      persistence: "local",
      maskedKey: `${backend.label} · ${endpoint}`,
      error: "localBackend.unreachable",
    };
  }
}

/** Persists the backend kind and endpoint the settings panel chose. */
export async function saveProviderConfig({ endpoint, kind } = {}) {
  if (kind) await setSetting(LOCAL_BACKEND_KIND_KEY, kind);
  if (endpoint) await setSetting(LOCAL_ENDPOINT_KEY, endpoint);
  return { ok: true };
}

/** Forgets a custom endpoint, so the engine's default applies again. */
export async function clearProviderConfig() {
  await setSetting(LOCAL_ENDPOINT_KEY, null);
  return { ok: true };
}

/** A real round trip to the backend, so a red dot means a red dot. */
export async function testProvider({ fetch: fetchImpl, mediaType } = {}) {
  const { backend, endpoint } = await currentTarget(mediaType);
  try {
    const info = await backend.ping(endpoint, { fetch: fetchImpl });
    return { ok: true, info };
  } catch (error) {
    return { ok: false, code: error?.code ?? "localBackend.unreachable" };
  }
}

/**
 * The models this backend actually has, tagged with what they can do.
 *
 * Nothing is hard-coded: the list is whatever the backend itself reports. An
 * empty list is a real answer — the backend is running but has no weights — and
 * the settings panel says so rather than showing a menu of things that do not
 * exist.
 *
 * The `capabilities` tags are load-bearing: the workflow's image-generation and
 * the editor's image-edit pickers both filter on them through
 * `modelSupportsRoute`.
 */
export async function listProviderModels({
  mediaType = API_MEDIA_TYPE.IMAGE,
  fetch: fetchImpl,
} = {}) {
  const { backend, endpoint, isExplicit } = await currentTarget(mediaType);
  const hasDesktop =
    typeof window !== "undefined" && Boolean(window.vooDesktop);
  const shouldProbe =
    Boolean(fetchImpl) ||
    isExplicit ||
    hasDesktop ||
    typeof window === "undefined";

  if (!shouldProbe) {
    return { models: [] };
  }
  const byId = new Map();
  for (const capability of capabilitiesForMedia(mediaType)) {
    const entry = backendCapabilities(backend)[capability];
    if (!entry) continue;
    const names = await capabilityModelNames(entry, backend, endpoint);
    for (const name of names) {
      const existing = byId.get(name);
      if (existing) {
        if (!existing.capabilities.includes(capability)) {
          existing.capabilities.push(capability);
        }
      } else {
        byId.set(name, { id: name, label: name, capabilities: [capability] });
      }
    }
  }
  return { models: [...byId.values()] };
}

/**
 * Submitted jobs, by our task id.
 *
 * The engine owns its own job id, so submitting really queues the job and
 * `fetchProviderJob` polls it — the two-phase shape the canvas expects for
 * remote providers, with the minutes of local GPU time on the polling side
 * where the UI already shows progress.
 */
const PENDING_LOCAL_REQUESTS = new Map();

export async function submitProviderJob({ mediaType, request }) {
  const reachability = localBackendReachability();
  if (!reachability.ok) throw new LocalBackendError(reachability.reason);

  const { backend, endpoint } = await currentTarget(mediaType);
  const capability = resolveLocalCapability(backend, mediaType, request);
  if (!capability) {
    throw new LocalBackendError("localBackend.mediaUnsupported", {
      mediaType,
      backend: backend.kind,
    });
  }
  const entry = backendCapabilities(backend)[capability];

  try {
    const info = await backend.ping(endpoint);
    const mode =
      mediaType === API_MEDIA_TYPE.VIDEO
        ? "vid_gen"
        : mediaType === API_MEDIA_TYPE.IMAGE
          ? "img_gen"
          : null;
    const launcher = backendLauncher(backend);
    const runtimeStatus =
      launcher && request?.model
        ? statusValue(await launcher.status().catch(() => null))
        : null;
    const wrongModel = Boolean(
      runtimeStatus?.activeModelId &&
      request?.model &&
      runtimeStatus.activeModelId !== request.model,
    );
    const wrongMode = Boolean(
      mode && Array.isArray(info.modes) && !info.modes.includes(mode),
    );
    if (wrongModel || wrongMode) {
      const switched = await startBackendOnDemand(backend, {
        endpoint,
        modelId: request?.model,
        force: true,
      });
      if (!switched) {
        throw new LocalBackendError("localBackend.mediaUnsupported");
      }
      const active = await backend.ping(endpoint);
      if (mode && Array.isArray(active.modes) && !active.modes.includes(mode)) {
        throw new LocalBackendError("localBackend.mediaUnsupported");
      }
    }
  } catch (error) {
    if (error?.code === "localBackend.mediaUnsupported") throw error;
    // A managed engine that is merely stopped must not cost a trip to Settings
    // before every run. Start it, wait for it to serve, and keep going, booting
    // the model this request names. Anything that cannot be started here
    // rethrows the original error, which is the one that explains what the
    // user has to do.
    const bootModel = request?.model || null;
    const started = await startBackendOnDemand(backend, {
      endpoint,
      modelId: bootModel,
    });
    if (!started) throw error;
    const active = await backend.ping(endpoint);
    const expectedMode =
      mediaType === API_MEDIA_TYPE.VIDEO
        ? "vid_gen"
        : mediaType === API_MEDIA_TYPE.IMAGE
          ? "img_gen"
          : null;
    if (
      expectedMode &&
      Array.isArray(active.modes) &&
      !active.modes.includes(expectedMode)
    ) {
      throw new LocalBackendError("localBackend.mediaUnsupported");
    }
  }

  const taskId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const submitted = await entry.async.submit({
    endpoint,
    image: request?.image,
    // The mask is half of an edit request: the engine's img_gen body carries
    // `mask_image` only when `submitVooEngineJob` receives a mask. Without it
    // the engine silently ran a plain img2img — the editor's mask reached the
    // composite but never the engine.
    mask: request?.mask,
    request: request ?? {},
  });
  const uid = submitted?.uid;
  if (typeof uid !== "string" || !uid.trim()) {
    // A 200 without a task id is a version mismatch, not a queued job.
    throw new LocalBackendError("localBackend.submitRejected", { submitted });
  }
  PENDING_LOCAL_REQUESTS.set(taskId, {
    poll: entry.async.poll,
    endpoint,
    remoteId: uid,
  });

  return {
    taskId,
    status: REMOTE_JOB_STATUS.PROCESSING,
    submittedAt: Date.now(),
    request,
    mediaType,
    capability,
  };
}

/** Polls the engine for a submitted job. */
export async function fetchProviderJob({ taskId }) {
  const parked = PENDING_LOCAL_REQUESTS.get(taskId);
  if (!parked) {
    return {
      taskId,
      status: REMOTE_JOB_STATUS.FAILED,
      error: "localBackend.unknownTask",
    };
  }

  try {
    const polled = await parked.poll({
      endpoint: parked.endpoint,
      uid: parked.remoteId,
    });
    // Keep the entry while the backend still owns the task so a timed-out
    // poll — or a Stop-then-resume — can ask about the same uid again.
    if (
      polled?.status === REMOTE_JOB_STATUS.COMPLETED ||
      polled?.status === REMOTE_JOB_STATUS.FAILED
    ) {
      PENDING_LOCAL_REQUESTS.delete(taskId);
    }
    const urls = polled?.urls ?? [];
    return {
      taskId,
      status: polled?.status,
      urls,
      resultUrls: urls,
      error: polled?.error ?? undefined,
      errorMessage: polled?.errorMessage ?? null,
    };
  } catch (error) {
    PENDING_LOCAL_REQUESTS.delete(taskId);
    return {
      taskId,
      status: REMOTE_JOB_STATUS.FAILED,
      error: error?.code ?? "localBackend.failed",
      detail: error?.detail ?? null,
    };
  }
}
