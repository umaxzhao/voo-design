import { REMOTE_JOB_STATUS } from "../providers.js";
import { credentialArea } from "./credential_store.js";
import { ProviderError } from "./provider_302_error.js";
import {
  creditsApiBase,
  creditsBalanceFromResponse,
  providerErrorCode,
  PROVIDER_AUTH_MODE,
} from "./provider_credentials.js";
import {
  buildDashscopeBody,
  extractDashscopeUrls,
} from "./dashscope_protocol.js";

export const DASHSCOPE_IMAGE_MODELS = [
  "qwen-image-3.0-pro",
  "qwen-image-3.0",
  "qwen-image-2.0-pro",
  "qwen-image-2.0",
  "wan2.7-image-pro",
  "wan2.7-image",
];

export const DASHSCOPE_VIDEO_MODELS = [
  "wan3.0-video",
  "wan3.0-video-prime",
];

export const DASHSCOPE_TEXT_MODELS = [
  "qwen-plus",
  "qwen-max",
  "qwen-turbo",
  "qwen-flash",
  "qwen3.8-flash",
  "qwen3.5-plus",
  "qwen3.5-flash",
  "deepseek-v3",
  "deepseek-r1",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
];

export const DASHSCOPE_SYNC_TASK_PREFIX = "dashscope-sync-";
const SYNC_TASK_KEY = "ciw.provider.dashscope.syncTasks";
const REQUEST_TIMEOUT_MS = 120000;

const memorySyncTasks = new Map();

function storageArea(name) {
  try {
    return credentialArea(name);
  } catch {
    return null;
  }
}

async function readSyncTasks() {
  try {
    const area = storageArea("session");
    if (!area) return {};
    const stored = await area.get(SYNC_TASK_KEY);
    return stored?.[SYNC_TASK_KEY] ?? {};
  } catch {
    return {};
  }
}

export async function stashDashScopeSyncResult(taskId, urls) {
  memorySyncTasks.set(taskId, urls);
  try {
    const area = storageArea("session");
    if (area) {
      const tasks = await readSyncTasks();
      await area.set({
        [SYNC_TASK_KEY]: { ...tasks, [taskId]: urls },
      });
    }
  } catch {
    // Non-fatal if session storage is unavailable
  }
}

export async function takeDashScopeSyncResult(taskId) {
  if (memorySyncTasks.has(taskId)) {
    return memorySyncTasks.get(taskId);
  }
  try {
    const tasks = await readSyncTasks();
    return tasks[taskId] ?? null;
  } catch {
    return null;
  }
}

export function isDashScopeImageModel(model) {
  if (!model || typeof model !== "string") return false;
  const lower = model.toLowerCase().trim();
  return (
    DASHSCOPE_IMAGE_MODELS.includes(lower) ||
    lower.startsWith("qwen-image") ||
    lower.startsWith("wan2.") ||
    lower.startsWith("wanx")
  );
}

export function isDashScopeVideoModel(model) {
  if (!model || typeof model !== "string") return false;
  const lower = model.toLowerCase().trim();
  return (
    DASHSCOPE_VIDEO_MODELS.includes(lower) ||
    (lower.startsWith("wan") && lower.includes("video"))
  );
}

export function isDashScopeTextModel(model) {
  if (!model || typeof model !== "string") return false;
  const lower = model.toLowerCase().trim();
  if (isDashScopeImageModel(lower) || isDashScopeVideoModel(lower)) return false;
  return (
    DASHSCOPE_TEXT_MODELS.includes(lower) ||
    lower.startsWith("qwen")
  );
}

export function isDashScopeModel(model) {
  return (
    isDashScopeImageModel(model) ||
    isDashScopeVideoModel(model) ||
    isDashScopeTextModel(model)
  );
}

export function normalizeDashScopeModel(model) {
  if (!model || typeof model !== "string") return model;
  return model.trim();
}

export function isDashScopeTaskId(taskId) {
  return (
    typeof taskId === "string" &&
    (taskId.startsWith(DASHSCOPE_SYNC_TASK_PREFIX) ||
      taskId.startsWith("dashscope:") ||
      taskId.startsWith("dashscope-"))
  );
}

export function dashScopeEndpoint(baseUrl, path) {
  const base = (baseUrl || creditsApiBase("dashscope")).replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function normalizeDashScopeStatus(rawStatus) {
  const s = String(rawStatus ?? "").toUpperCase().trim();
  if (["SUCCEEDED", "SUCCESS", "COMPLETED"].includes(s)) {
    return REMOTE_JOB_STATUS.COMPLETED;
  }
  if (["FAILED", "FAILURE", "ERROR", "CANCELED", "CANCELLED", "UNKNOWN"].includes(s)) {
    return REMOTE_JOB_STATUS.FAILED;
  }
  if (["PENDING", "RUNNING", "QUEUED", "PROCESSING"].includes(s)) {
    return REMOTE_JOB_STATUS.PROCESSING;
  }
  return REMOTE_JOB_STATUS.PENDING;
}

export function extractDashScopeVideoUrls(payload) {
  if (!payload || typeof payload !== "object") return [];
  const urls = [];
  const output = payload.output || payload;

  if (typeof output.video_url === "string" && output.video_url.trim()) {
    urls.push(output.video_url.trim());
  }
  if (typeof output.url === "string" && output.url.trim()) {
    urls.push(output.url.trim());
  }
  if (Array.isArray(output.results)) {
    for (const r of output.results) {
      if (typeof r?.url === "string" && r.url.trim()) {
        urls.push(r.url.trim());
      } else if (typeof r?.video_url === "string" && r.video_url.trim()) {
        urls.push(r.video_url.trim());
      }
    }
  }

  return [...new Set(urls)];
}

export async function submitDashScopeImageJob({
  request = {},
  route,
  signal,
  baseUrl,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  if (
    !route ||
    (route.mode === PROVIDER_AUTH_MODE.CREDITS && !route.token) ||
    (route.mode === PROVIDER_AUTH_MODE.OWN_KEY && !route.apiKey) ||
    route.mode === PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED
  ) {
    throw new ProviderError("providerNotConfigured");
  }

  const model = normalizeDashScopeModel(request.model) || "qwen-image-3.0-pro";
  const url = dashScopeEndpoint(
    baseUrl,
    "/api/v1/services/aigc/multimodal-generation/generation",
  );

  const body = buildDashscopeBody({
    ...request,
    model,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let onExternalAbort = null;
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      const err = new Error(signal.reason?.message || "Operation aborted");
      err.name = "AbortError";
      throw err;
    }
    onExternalAbort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${route.mode === PROVIDER_AUTH_MODE.CREDITS ? route.token : route.apiKey}`,
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        payload?.message ??
        payload?.error?.message ??
        (typeof payload?.error === "string" ? payload.error : null) ??
        `HTTP ${response.status}`;
      const code =
        providerErrorCode(payload, response.status, true) ??
        (response.status === 401
          ? "providerUnauthorized"
          : "providerRequestFailed");
      throw new ProviderError(code, message);
    }

    const urls = extractDashscopeUrls(payload);
    if (urls.length === 0) {
      throw new ProviderError(
        "providerInvalidResponse",
        "No image data returned in DashScope response",
      );
    }

    const taskId = `${DASHSCOPE_SYNC_TASK_PREFIX}${crypto.randomUUID()}`;
    await stashDashScopeSyncResult(taskId, urls);
    const creditsBalance = creditsBalanceFromResponse(response);

    return {
      taskId,
      status: REMOTE_JOB_STATUS.COMPLETED,
      urls,
      submittedAt: Date.now(),
      ...(creditsBalance !== null ? { creditsBalance } : {}),
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    if (signal?.aborted) {
      const err = new Error(signal.reason?.message || "Operation aborted");
      err.name = "AbortError";
      throw err;
    }
    if (error?.name === "AbortError") {
      throw new ProviderError("providerTimeout");
    }
    throw new ProviderError("providerNetworkError", error?.message);
  } finally {
    clearTimeout(timer);
    if (signal && onExternalAbort) {
      signal.removeEventListener("abort", onExternalAbort);
    }
  }
}

export async function submitDashScopeVideoJob({
  request = {},
  route,
  signal,
  baseUrl,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  if (
    !route ||
    (route.mode === PROVIDER_AUTH_MODE.CREDITS && !route.token) ||
    (route.mode === PROVIDER_AUTH_MODE.OWN_KEY && !route.apiKey) ||
    route.mode === PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED
  ) {
    throw new ProviderError("providerNotConfigured");
  }

  const model = normalizeDashScopeModel(request.model) || "wan3.0-video";
  const url = dashScopeEndpoint(
    baseUrl,
    "/api/v1/services/aigc/video-generation/video-synthesis",
  );

  const input = {
    prompt: request.prompt || "",
  };
  const firstFrame = request.image || request.first_frame || request.image_url;
  if (firstFrame) {
    input.img_url = String(firstFrame);
  }

  const parameters = {
    size: request.size || "1280*720",
    ...(request.duration ? { duration: Number(request.duration) } : {}),
  };

  const body = {
    model,
    input,
    parameters,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let onExternalAbort = null;
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      const err = new Error(signal.reason?.message || "Operation aborted");
      err.name = "AbortError";
      throw err;
    }
    onExternalAbort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${route.mode === PROVIDER_AUTH_MODE.CREDITS ? route.token : route.apiKey}`,
      "X-DashScope-Async": "enable",
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        payload?.message ??
        payload?.error?.message ??
        (typeof payload?.error === "string" ? payload.error : null) ??
        `HTTP ${response.status}`;
      const code =
        providerErrorCode(payload, response.status, true) ??
        (response.status === 401
          ? "providerUnauthorized"
          : "providerRequestFailed");
      throw new ProviderError(code, message);
    }

    const createdId = payload?.output?.task_id || payload?.task_id || payload?.id;
    if (!createdId) {
      throw new ProviderError(
        "providerInvalidResponse",
        "Missing task ID in DashScope response",
      );
    }

    // Preserve 'dashscope:' prefix if gateway auto returned it, or add 'dashscope:' prefix
    const taskId = String(createdId).startsWith("dashscope:")
      ? String(createdId)
      : `dashscope:${createdId}`;

    const creditsBalance = creditsBalanceFromResponse(response);

    return {
      taskId,
      status: REMOTE_JOB_STATUS.PENDING,
      submittedAt: Date.now(),
      ...(creditsBalance !== null ? { creditsBalance } : {}),
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    if (signal?.aborted) {
      const err = new Error(signal.reason?.message || "Operation aborted");
      err.name = "AbortError";
      throw err;
    }
    if (error?.name === "AbortError") {
      throw new ProviderError("providerTimeout");
    }
    throw new ProviderError("providerNetworkError", error?.message);
  } finally {
    clearTimeout(timer);
    if (signal && onExternalAbort) {
      signal.removeEventListener("abort", onExternalAbort);
    }
  }
}

export async function fetchDashScopeJob(
  taskId,
  { route, signal, baseUrl, timeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  if (typeof taskId === "string" && taskId.startsWith(DASHSCOPE_SYNC_TASK_PREFIX)) {
    const urls = await takeDashScopeSyncResult(taskId);
    if (!urls || urls.length === 0) {
      throw new ProviderError("providerNoResult");
    }
    return {
      taskId,
      status: REMOTE_JOB_STATUS.COMPLETED,
      urls,
      errorMessage: null,
    };
  }

  const base = (baseUrl || creditsApiBase("dashscope")).replace(/\/+$/, "");
  const isAutoMode = base.includes("/auto");

  // In auto mode, pass the prefixed taskId so gateway unwraps it
  // In direct dashscope mode, pass raw id without 'dashscope:' prefix
  const pollId = isAutoMode ? taskId : taskId.replace(/^dashscope:/, "");
  const url = `${base}/api/v1/tasks/${pollId}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let onExternalAbort = null;
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      const err = new Error(signal.reason?.message || "Operation aborted");
      err.name = "AbortError";
      throw err;
    }
    onExternalAbort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const headers = {};
    if (route?.token) {
      headers.Authorization = `Bearer ${route.token}`;
    } else if (route?.apiKey) {
      headers.Authorization = `Bearer ${route.apiKey}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        payload?.message ??
        payload?.error?.message ??
        (typeof payload?.error === "string" ? payload.error : null) ??
        `HTTP ${response.status}`;
      const code =
        providerErrorCode(payload, response.status, true) ??
        (response.status === 401
          ? "providerUnauthorized"
          : "providerRequestFailed");
      throw new ProviderError(code, message);
    }

    const taskStatus = payload?.output?.task_status ?? payload?.status;
    const status = normalizeDashScopeStatus(taskStatus);
    const urls = extractDashScopeVideoUrls(payload);
    const finalStatus =
      status !== REMOTE_JOB_STATUS.FAILED && urls.length > 0
        ? REMOTE_JOB_STATUS.COMPLETED
        : status;

    const errorMessage =
      finalStatus === REMOTE_JOB_STATUS.FAILED
        ? payload?.output?.message || payload?.message || "DashScope task failed"
        : null;

    return {
      taskId,
      status: finalStatus,
      urls: finalStatus === REMOTE_JOB_STATUS.COMPLETED ? urls : [],
      errorMessage,
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    if (signal?.aborted) {
      const err = new Error(signal.reason?.message || "Operation aborted");
      err.name = "AbortError";
      throw err;
    }
    if (error?.name === "AbortError") {
      throw new ProviderError("providerTimeout");
    }
    throw new ProviderError("providerNetworkError", error?.message);
  } finally {
    clearTimeout(timer);
    if (signal && onExternalAbort) {
      signal.removeEventListener("abort", onExternalAbort);
    }
  }
}

export async function submitDashScopeTextJob({
  request = {},
  route,
  signal,
  baseUrl,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  if (
    !route ||
    (route.mode === PROVIDER_AUTH_MODE.CREDITS && !route.token) ||
    (route.mode === PROVIDER_AUTH_MODE.OWN_KEY && !route.apiKey) ||
    route.mode === PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED
  ) {
    throw new ProviderError("providerNotConfigured");
  }

  const model = normalizeDashScopeModel(request.model) || "qwen-plus";
  const url = dashScopeEndpoint(baseUrl, "/compatible-mode/v1/chat/completions");

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: request.prompt || "",
      },
    ],
    ...(typeof request.temperature === "number"
      ? { temperature: request.temperature }
      : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let onExternalAbort = null;
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      const err = new Error(signal.reason?.message || "Operation aborted");
      err.name = "AbortError";
      throw err;
    }
    onExternalAbort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${route.mode === PROVIDER_AUTH_MODE.CREDITS ? route.token : route.apiKey}`,
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        payload?.message ??
        payload?.error?.message ??
        (typeof payload?.error === "string" ? payload.error : null) ??
        `HTTP ${response.status}`;
      const code =
        providerErrorCode(payload, response.status, true) ??
        (response.status === 401
          ? "providerUnauthorized"
          : "providerRequestFailed");
      throw new ProviderError(code, message);
    }

    const message = payload?.choices?.[0]?.message;
    let text = message?.content;
    if (Array.isArray(text)) {
      text = text.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("");
    }

    if (typeof text !== "string" || !text.trim()) {
      throw new ProviderError(
        "providerInvalidResponse",
        "Empty text response from DashScope",
      );
    }

    const creditsBalance = creditsBalanceFromResponse(response);
    return {
      text: text.trim(),
      ...(creditsBalance !== null ? { creditsBalance } : {}),
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    if (signal?.aborted) {
      const err = new Error(signal.reason?.message || "Operation aborted");
      err.name = "AbortError";
      throw err;
    }
    if (error?.name === "AbortError") {
      throw new ProviderError("providerTimeout");
    }
    throw new ProviderError("providerNetworkError", error?.message);
  } finally {
    clearTimeout(timer);
    if (signal && onExternalAbort) {
      signal.removeEventListener("abort", onExternalAbort);
    }
  }
}
