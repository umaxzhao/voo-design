import {
  API_MEDIA_TYPE,
  DASHSCOPE_DEFAULT_BASE_URL,
  PROVIDER_ID,
  REMOTE_JOB_STATUS,
  defaultModelsFor,
} from "../providers.js";
import {
  buildDashscopeBody,
  extractDashscopeUrls,
  imagePath,
  normalizeDashscopeStatus,
  videoPath,
  model3dPath,
  asrPath,
  buildAsrBody,
  extractAsrSentences,
} from "./dashscope_protocol.js";
import { credentialArea } from "./credential_store.js";

const REQUEST_TIMEOUT_MS = 60000;
// Video tasks are queued before the provider hands back an async task id, and
// a queued generation can sit a while before the first status poll answers. A
// 5-minute deadline here produces spurious timeouts on long video jobs, so the
// submit call is given the same generous budget the canvas allows the run.
const VIDEO_SUBMIT_TIMEOUT_MS = 600000;

const SYNC_TASK_PREFIX = "sync-";

class ProviderError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "ProviderError";
    this.code = code;
  }
}

function storageArea(name) {
  const area = credentialArea(name);
  if (!area) throw new ProviderError("providerStorageUnavailable");
  return area;
}

function maskKey(apiKey) {
  if (!apiKey) return "";
  const suffix = apiKey.slice(-4);
  return `${"•".repeat(Math.min(8, Math.max(4, apiKey.length - 4)))}${suffix}`;
}

export function createDashscopeProvider({
  providerId = PROVIDER_ID.DASHSCOPE,
  defaultBaseUrl = DASHSCOPE_DEFAULT_BASE_URL,
  defaultModels = {},
} = {}) {
  const SESSION_KEY = `ciw.provider.${providerId}.session`;
  const LOCAL_KEY = `ciw.provider.${providerId}.local`;
  /**
   * Set once the user saves a gateway on this card themselves.
   *
   * The legacy migration below moves a uiodesign.com gateway off the built-in
   * DashScope entry and onto `custom:dashscope_custom`, which is where the
   * product wants that gateway to live. But it matches on the host alone and
   * ran on every read, so typing that address into DashScope saved, then
   * silently reverted to the official endpoint on the very next read — the
   * user's own choice undone by a migration meant for configurations that
   * predate it. An explicit save now marks the credential, and the migration
   * leaves a marked one alone.
   */
  const EXPLICIT_BASE_KEY = `ciw.provider.${providerId}.explicitBase`;
  /**
   * Where a finished synchronous image job parks its URLs.
   *
   * Images come back from one blocking call, but the canvas drives every
   * provider through submit-then-poll. The result is stashed under a synthetic
   * task id so the poll has something to find — in session storage rather
   * than a variable, because the service worker can be torn down between the
   * two calls.
   */
  const SYNC_TASK_KEY = `ciw.provider.${providerId}.syncTasks`;

  async function storedCredential() {
    const session = await storageArea("session").get(SESSION_KEY);
    if (session[SESSION_KEY]?.apiKey) {
      return { ...session[SESSION_KEY], persistence: "session" };
    }

    const local = await storageArea("local").get(LOCAL_KEY);
    if (local[LOCAL_KEY]?.apiKey) {
      return { ...local[LOCAL_KEY], persistence: "local" };
    }
    return null;
  }

  /** Trailing slashes would double up against the paths below. */
  function normalizeBaseUrl(baseUrl) {
    const trimmed = (baseUrl ?? "").trim();
    if (!trimmed) return defaultBaseUrl;
    if (!/^https:\/\//i.test(trimmed)) {
      throw new ProviderError("providerInvalidBaseUrl");
    }
    return trimmed.replace(/\/+$/, "");
  }

  async function getProviderConfig() {
    let credential = await storedCredential();
    // If the built-in DashScope has a custom gateway configured (e.g. ai.api.uiodesign.com),
    // migrate that credential to a dedicated custom provider and reset DashScope to default.
    if (providerId === PROVIDER_ID.DASHSCOPE && credential?.apiKey) {
      const explicit = await storageArea("local").get(EXPLICIT_BASE_KEY);
      const normalizedBase = normalizeBaseUrl(credential.baseUrl);
      if (
        !explicit?.[EXPLICIT_BASE_KEY] &&
        normalizedBase !== DASHSCOPE_DEFAULT_BASE_URL &&
        normalizedBase.includes("uiodesign.com")
      ) {
        const customId = "custom:dashscope_custom";
        const customTargetKey =
          credential.persistence === "local"
            ? `ciw.provider.${customId}.local`
            : `ciw.provider.${customId}.session`;
        const targetArea = storageArea(credential.persistence);
        await targetArea.set({
          [customTargetKey]: {
            apiKey: credential.apiKey,
            baseUrl: normalizedBase,
          },
        });
        await storageArea("local").remove(LOCAL_KEY);
        await storageArea("session").remove(SESSION_KEY);
        credential = null;
      }
    }

    return {
      providerId,
      configured: Boolean(credential),
      persistence: credential?.persistence ?? "session",
      maskedKey: maskKey(credential?.apiKey),
      baseUrl: credential?.baseUrl ?? defaultBaseUrl,
    };
  }

  async function saveProviderConfig({ apiKey, baseUrl, remember }) {
    const existing = await storedCredential();
    const normalizedBase = normalizeBaseUrl(baseUrl);
    const typedKey = apiKey?.trim() || "";
    // Editing only the gateway URL should not force the key to be typed again —
    // the settings form never receives the stored key back to resubmit.
    // But reusing the stored key is only safe while the base URL is unchanged:
    // carrying a key captured for one endpoint over to a new address would leak
    // it, so a base URL change must come with a freshly typed key.
    if (!typedKey && existing && normalizedBase !== existing.baseUrl) {
      throw new ProviderError("providerKeyRequiredForBaseUrlChange");
    }
    const normalized = typedKey || existing?.apiKey;
    if (!normalized) throw new ProviderError("providerKeyRequired");

    const target = remember ? "local" : "session";
    const targetKey = remember ? LOCAL_KEY : SESSION_KEY;
    const other = remember ? "session" : "local";
    const otherKey = remember ? SESSION_KEY : LOCAL_KEY;
    // Mark the choice before anything reads it back, so the legacy migration
    // cannot undo the save that just happened.
    if (normalizedBase !== defaultBaseUrl) {
      await storageArea("local").set({ [EXPLICIT_BASE_KEY]: true });
    }
    await storageArea(target).set({
      [targetKey]: { apiKey: normalized, baseUrl: normalizedBase },
    });
    await storageArea(other).remove(otherKey);
    return getProviderConfig();
  }

  async function clearProviderConfig() {
    await Promise.all([
      storageArea("session").remove(SESSION_KEY),
      storageArea("local").remove(LOCAL_KEY),
    ]);
    return getProviderConfig();
  }

  /**
   * @param {string} path - absolute API path, starting with a slash
   * @param {{method?: string, body?: object, async?: boolean, timeoutMs?: number}} [options]
   */
  async function apiRequest(
    path,
    {
      method = "GET",
      body,
      async: isAsync,
      timeoutMs = REQUEST_TIMEOUT_MS,
    } = {},
  ) {
    const credential = await storedCredential();
    // The code is what the canvas localizes; a message here would be appended to
    // the translated text verbatim, in whatever language it happens to be in.
    if (!credential?.apiKey) throw new ProviderError("providerNotConfigured");
    const baseUrl = normalizeBaseUrl(credential.baseUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${credential.apiKey}`,
          "Content-Type": "application/json",
          // Only task-creating calls take this; a read would be rejected.
          ...(isAsync ? { "X-DashScope-Async": "enable" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      // Non-JSON response (e.g. proxy HTML error pages) falls back to empty object, handled by ok check below.
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        // DashScope puts the reason in `message` and a machine code in `code`;
        // both are worth surfacing, since the model catalogue moves faster than
        // any list this extension can ship.
        const message =
          [payload?.code, payload?.message].filter(Boolean).join(": ") ||
          `HTTP ${response.status}`;
        const code =
          response.status === 401 || response.status === 403
            ? "providerUnauthorized"
            : "providerRequestFailed";
        throw new ProviderError(code, message);
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError")
        throw new ProviderError("providerTimeout");
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("providerNetworkError", error?.message);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Read the model catalogue to verify the key without starting a paid job. */
  async function testProvider() {
    const response = await apiRequest("/api/v1/models?page_no=1&page_size=1");
    if (response?.success !== true || !Array.isArray(response.output?.models)) {
      throw new ProviderError("providerInvalidResponse");
    }
    return { connected: true };
  }

  async function listProviderModels({ mediaType }) {
    try {
      const { PROVIDER_MODELS_KEY, providerModelList } =
        await import("../provider_models.js");
      const { getSettingAsync } = await import("../settings.js");
      const stored = await getSettingAsync(PROVIDER_MODELS_KEY).catch(
        () => ({}),
      );
      const list = providerModelList(stored, providerId, mediaType);
      if (list && list.length > 0) return { models: list };
    } catch {
      // fallback
    }
    return {
      models:
        defaultModels[mediaType] ??
        defaultModelsFor(PROVIDER_ID.DASHSCOPE, mediaType),
    };
  }

  async function readSyncTasks() {
    const stored = await storageArea("session").get(SYNC_TASK_KEY);
    return stored[SYNC_TASK_KEY] ?? {};
  }

  async function stashSyncResult(taskId, urls) {
    const tasks = await readSyncTasks();
    await storageArea("session").set({
      [SYNC_TASK_KEY]: { ...tasks, [taskId]: urls },
    });
  }

  async function takeSyncResult(taskId) {
    const tasks = await readSyncTasks();
    const urls = tasks[taskId];
    if (!urls) return null;
    delete tasks[taskId];
    await storageArea("session").set({ [SYNC_TASK_KEY]: tasks });
    return urls;
  }

  async function submitProviderJob({ mediaType, request }) {
    const body = buildDashscopeBody(request, mediaType);

    if (
      mediaType === API_MEDIA_TYPE.VIDEO ||
      mediaType === API_MEDIA_TYPE.MODEL_3D
    ) {
      const path =
        mediaType === API_MEDIA_TYPE.MODEL_3D ? model3dPath() : videoPath();
      const payload = await apiRequest(path, {
        method: "POST",
        body,
        async: true,
        // A forwarding gateway can take longer to return the asynchronous task
        // id even after the provider has queued the generation. Preserve enough
        // time to receive that id so the paid task remains resumable.
        timeoutMs: VIDEO_SUBMIT_TIMEOUT_MS,
      });
      const taskId = payload?.output?.task_id;
      if (!taskId) throw new ProviderError("providerInvalidResponse");
      return {
        taskId: String(taskId),
        status: normalizeDashscopeStatus(payload?.output?.task_status),
        submittedAt: Date.now(),
      };
    }

    // Images answer in one call. Park the result so the poll below can hand it
    // back through the same interface an asynchronous job uses.
    const payload = await apiRequest(imagePath(), { method: "POST", body });
    const urls = extractDashscopeUrls(payload, mediaType);
    if (urls.length === 0) throw new ProviderError("providerInvalidResponse");

    const taskId = `${SYNC_TASK_PREFIX}${crypto.randomUUID()}`;
    await stashSyncResult(taskId, urls);
    return {
      taskId,
      status: REMOTE_JOB_STATUS.COMPLETED,
      submittedAt: Date.now(),
    };
  }

  async function fetchProviderJob({ mediaType, taskId }) {
    if (taskId.startsWith(SYNC_TASK_PREFIX)) {
      const urls = await takeSyncResult(taskId);
      // A second poll finds nothing: the first one already handed the URLs over,
      // and re-reporting them would download the same picture twice.
      if (!urls) throw new ProviderError("providerNoResult");
      return {
        taskId,
        status: REMOTE_JOB_STATUS.COMPLETED,
        urls,
        errorMessage: null,
      };
    }

    const payload = await apiRequest(
      `/api/v1/tasks/${encodeURIComponent(taskId)}`,
    );
    const status = normalizeDashscopeStatus(payload?.output?.task_status);
    const urls = extractDashscopeUrls(payload, mediaType);
    const finalStatus =
      status !== REMOTE_JOB_STATUS.FAILED && urls.length > 0
        ? REMOTE_JOB_STATUS.COMPLETED
        : status;

    const errorMessage =
      [payload?.output?.code, payload?.output?.message]
        .filter(Boolean)
        .join(": ") ||
      payload?.message ||
      null;
    return {
      taskId,
      status: finalStatus,
      urls: finalStatus === REMOTE_JOB_STATUS.COMPLETED ? urls : [],
      errorMessage:
        finalStatus === REMOTE_JOB_STATUS.FAILED ? errorMessage : null,
    };
  }

  /**
   * Starts a paraformer transcription job for a publicly hosted file.
   * The ASR task runs async: poll with `fetchAsrJob`.
   *
   * @param {{fileUrl: string, model?: string, language?: string}} request
   * @returns {Promise<{taskId: string, status: string}>}
   */
  async function submitAsrJob({ fileUrl, model, language } = {}) {
    if (!fileUrl) throw new ProviderError("providerInvalidResponse");
    const body = buildAsrBody({ fileUrl, model, language });
    const payload = await apiRequest(asrPath(), {
      method: "POST",
      body,
      async: true,
      timeoutMs: VIDEO_SUBMIT_TIMEOUT_MS,
    });
    const taskId = payload?.output?.task_id;
    if (!taskId) throw new ProviderError("providerInvalidResponse");
    return {
      taskId: String(taskId),
      status: normalizeDashscopeStatus(payload?.output?.task_status),
    };
  }

  /**
   * Polls a transcription task; resolves to timed sentences once complete.
   * @returns {Promise<{status: string, sentences: Array, errorMessage: string|null}>}
   */
  async function fetchAsrJob(taskId) {
    const payload = await apiRequest(
      `/api/v1/tasks/${encodeURIComponent(taskId)}`,
    );
    const status = normalizeDashscopeStatus(payload?.output?.task_status);
    const errorMessage =
      [payload?.output?.code, payload?.output?.message]
        .filter(Boolean)
        .join(": ") ||
      payload?.message ||
      null;
    return {
      taskId,
      status,
      sentences:
        status === REMOTE_JOB_STATUS.COMPLETED
          ? extractAsrSentences(payload)
          : [],
      errorMessage: status === REMOTE_JOB_STATUS.FAILED ? errorMessage : null,
    };
  }

  return {
    providerId,
    getProviderConfig,
    saveProviderConfig,
    clearProviderConfig,
    normalizeBaseUrl,
    testProvider,
    listProviderModels,
    submitProviderJob,
    fetchProviderJob,
    submitAsrJob,
    fetchAsrJob,
  };
}

const defaultInstance = createDashscopeProvider({
  providerId: PROVIDER_ID.DASHSCOPE,
  defaultBaseUrl: DASHSCOPE_DEFAULT_BASE_URL,
});

export const normalizeBaseUrl = defaultInstance.normalizeBaseUrl;
export const getProviderConfig = defaultInstance.getProviderConfig;
export const saveProviderConfig = defaultInstance.saveProviderConfig;
export const clearProviderConfig = defaultInstance.clearProviderConfig;
export const testProvider = defaultInstance.testProvider;
export const listProviderModels = defaultInstance.listProviderModels;
export const submitProviderJob = defaultInstance.submitProviderJob;
export const fetchProviderJob = defaultInstance.fetchProviderJob;
export const submitAsrJob = defaultInstance.submitAsrJob;
export const fetchAsrJob = defaultInstance.fetchAsrJob;
