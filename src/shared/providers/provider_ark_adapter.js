import { REMOTE_JOB_STATUS } from "../providers.js";
import { credentialArea } from "./credential_store.js";
import { ProviderError } from "./provider_302_error.js";
import {
  creditsApiBase,
  creditsBalanceFromResponse,
  providerErrorCode,
  PROVIDER_AUTH_MODE,
} from "./provider_credentials.js";

export const ARK_IMAGE_MODELS = [
  "doubao-seedream-5-0-260128",
  "doubao-seedream-5-0-pro-260628",
  "doubao-seedream-4-0",
  "doubao-seedream-4-0-20260415",
  "doubao-seedream-4-5-251128",
  "doubao-seedream-3-0-t2i-250415",
];

export const ARK_VIDEO_MODELS = [
  "doubao-seedance-2-5-260628",
  "doubao-seedance-2-0-260128",
  "doubao-seedance-2-0-fast-260128",
  "doubao-seedance-1-5-pro-251215",
  "doubao-seedance-1-0-pro-250528",
  "doubao-seedance-1-0-pro-fast-251015",
  "doubao-seedance-1-0-lite-i2v-250428",
  "doubao-seedance-1-0-lite-t2v-250428",
];

export const ARK_TEXT_MODELS = [
  "doubao-seed-2-1-pro-260628",
  "doubao-seed-2-1-turbo-260628",
  "doubao-pro-32k-241215",
  "doubao-1-5-pro-32k-250115",
  "doubao-1-5-lite-32k-250115",
  "doubao-1-5-thinking-pro-250415",
  "deepseek-v3-250324",
  "deepseek-v3-241226",
  "deepseek-v3",
  "deepseek-v3-1-250821",
  "deepseek-v3-2-251201",
  "deepseek-r1-250528",
  "deepseek-r1-250120",
  "deepseek-r1",
  "deepseek-v4-pro-ga-260813",
  "deepseek-v4-flash-ga-260731",
];

export const ARK_SYNC_TASK_PREFIX = "ark-sync-";
const SYNC_TASK_KEY = "ciw.provider.ark.syncTasks";
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

export async function stashArkSyncResult(taskId, urls) {
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

export async function takeArkSyncResult(taskId) {
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

export function isArkImageModel(model) {
  if (!model || typeof model !== "string") return false;
  const lower = model.toLowerCase().trim();
  return (
    ARK_IMAGE_MODELS.includes(lower) ||
    lower.includes("seedream") ||
    lower.includes("seededit")
  );
}

export function isArkVideoModel(model) {
  if (!model || typeof model !== "string") return false;
  const lower = model.toLowerCase().trim();
  return ARK_VIDEO_MODELS.includes(lower) || lower.includes("seedance");
}

export function isArkTextModel(model) {
  if (!model || typeof model !== "string") return false;
  const lower = model.toLowerCase().trim();
  if (isArkImageModel(lower) || isArkVideoModel(lower)) return false;
  return (
    ARK_TEXT_MODELS.includes(lower) ||
    lower.startsWith("doubao-") ||
    lower.startsWith("deepseek-")
  );
}

export function isArkModel(model) {
  return isArkImageModel(model) || isArkVideoModel(model) || isArkTextModel(model);
}

export function normalizeArkModel(model) {
  if (!model || typeof model !== "string") return model;
  return model.trim();
}

export function isArkTaskId(taskId) {
  return (
    typeof taskId === "string" &&
    (taskId.startsWith(ARK_SYNC_TASK_PREFIX) ||
      taskId.startsWith("ark:") ||
      taskId.startsWith("cgt-"))
  );
}

export function arkEndpoint(baseUrl, path) {
  const base = (baseUrl || creditsApiBase("ark")).replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function extractArkImageUrls(payload) {
  if (!payload || typeof payload !== "object") return [];
  const urls = [];
  const data = Array.isArray(payload.data) ? payload.data : [];

  for (const item of data) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) urls.push(trimmed);
    } else if (item && typeof item === "object") {
      if (typeof item.url === "string" && item.url.trim()) {
        urls.push(item.url.trim());
      } else if (typeof item.b64_json === "string" && item.b64_json.trim()) {
        const b64 = item.b64_json.trim();
        urls.push(b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`);
      }
    }
  }

  return [...new Set(urls)];
}

export function extractArkVideoUrls(payload) {
  if (!payload || typeof payload !== "object") return [];
  const urls = [];
  const content = payload.content || payload.output || payload;

  if (typeof content.video_url === "string" && content.video_url.trim()) {
    urls.push(content.video_url.trim());
  }
  if (typeof content.url === "string" && content.url.trim()) {
    urls.push(content.url.trim());
  }
  if (Array.isArray(content.video_urls)) {
    for (const u of content.video_urls) {
      if (typeof u === "string" && u.trim()) urls.push(u.trim());
    }
  }

  return [...new Set(urls)];
}

export function normalizeArkStatus(rawStatus) {
  const s = String(rawStatus ?? "").toLowerCase().trim();
  if (["succeeded", "success", "completed", "done", "finished"].includes(s)) {
    return REMOTE_JOB_STATUS.COMPLETED;
  }
  if (["failed", "failure", "error", "cancelled", "canceled", "expired"].includes(s)) {
    return REMOTE_JOB_STATUS.FAILED;
  }
  if (["running", "queued", "pending", "processing", "in_progress"].includes(s)) {
    return REMOTE_JOB_STATUS.PROCESSING;
  }
  return REMOTE_JOB_STATUS.PENDING;
}

export async function submitArkImageJob({
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

  const model = normalizeArkModel(request.model) || "doubao-seedream-5-0-260128";
  const url = arkEndpoint(baseUrl, "/api/v3/images/generations");

  const body = {
    model,
    prompt: request.prompt || "",
    response_format: request.response_format || "url",
    ...(request.size ? { size: request.size } : {}),
  };

  const imageInput = request.image || request.image_url;
  if (imageInput) {
    body.image_url = typeof imageInput === "string" ? imageInput : String(imageInput);
  }

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
        payload?.error?.message ??
        (typeof payload?.error === "string" ? payload.error : null) ??
        payload?.message ??
        `HTTP ${response.status}`;
      const code =
        providerErrorCode(payload, response.status, true) ??
        (response.status === 401
          ? "providerUnauthorized"
          : "providerRequestFailed");
      throw new ProviderError(code, message);
    }

    const urls = extractArkImageUrls(payload);
    if (urls.length === 0) {
      throw new ProviderError(
        "providerInvalidResponse",
        "No image data returned in Ark response",
      );
    }

    const taskId = `${ARK_SYNC_TASK_PREFIX}${crypto.randomUUID()}`;
    await stashArkSyncResult(taskId, urls);
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

export async function submitArkVideoJob({
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

  const model = normalizeArkModel(request.model) || "doubao-seedance-2-5-260628";
  const url = arkEndpoint(baseUrl, "/api/v3/contents/generations/tasks");

  const content = [];
  if (request.prompt) {
    content.push({ type: "text", text: request.prompt });
  }

  const firstFrame = request.image || request.first_frame || request.image_url;
  if (firstFrame) {
    content.push({
      type: "image_url",
      image_url: { url: String(firstFrame) },
    });
  }

  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }

  const body = {
    model,
    content,
    ...(request.duration ? { duration: Number(request.duration) } : {}),
    ...(request.ratio ? { ratio: String(request.ratio) } : {}),
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
        payload?.error?.message ??
        (typeof payload?.error === "string" ? payload.error : null) ??
        payload?.message ??
        `HTTP ${response.status}`;
      const code =
        providerErrorCode(payload, response.status, true) ??
        (response.status === 401
          ? "providerUnauthorized"
          : "providerRequestFailed");
      throw new ProviderError(code, message);
    }

    const createdId = payload?.id || payload?.task_id;
    if (!createdId) {
      throw new ProviderError(
        "providerInvalidResponse",
        "Missing task ID in Ark response",
      );
    }

    // Preserve 'ark:' prefix if gateway auto returned it, or add 'ark:' prefix
    const taskId = String(createdId).startsWith("ark:")
      ? String(createdId)
      : `ark:${createdId}`;

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

export async function fetchArkJob(
  taskId,
  { route, signal, baseUrl, timeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  if (typeof taskId === "string" && taskId.startsWith(ARK_SYNC_TASK_PREFIX)) {
    const urls = await takeArkSyncResult(taskId);
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

  const base = (baseUrl || creditsApiBase("ark")).replace(/\/+$/, "");
  const isAutoMode = base.includes("/auto");

  // In auto mode, pass the prefixed taskId so gateway unwraps it
  // In direct ark mode, pass raw id without 'ark:' prefix
  const pollId = isAutoMode ? taskId : taskId.replace(/^ark:/, "");
  const url = `${base}/api/v3/contents/generations/tasks/${pollId}`;

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
        payload?.error?.message ??
        (typeof payload?.error === "string" ? payload.error : null) ??
        payload?.message ??
        `HTTP ${response.status}`;
      const code =
        providerErrorCode(payload, response.status, true) ??
        (response.status === 401
          ? "providerUnauthorized"
          : "providerRequestFailed");
      throw new ProviderError(code, message);
    }

    const status = normalizeArkStatus(payload?.status);
    const urls = extractArkVideoUrls(payload);
    const finalStatus =
      status !== REMOTE_JOB_STATUS.FAILED && urls.length > 0
        ? REMOTE_JOB_STATUS.COMPLETED
        : status;

    const errorMessage =
      finalStatus === REMOTE_JOB_STATUS.FAILED
        ? payload?.error?.message || payload?.message || "Ark video task failed"
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

export async function submitArkTextJob({
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

  const model = normalizeArkModel(request.model) || "deepseek-v3";
  const url = arkEndpoint(baseUrl, "/api/v3/chat/completions");

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
        payload?.error?.message ??
        (typeof payload?.error === "string" ? payload.error : null) ??
        payload?.message ??
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
        "Empty text response from Ark",
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
