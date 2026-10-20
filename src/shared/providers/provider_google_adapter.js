import { REMOTE_JOB_STATUS } from "../providers.js";
import { credentialArea } from "./credential_store.js";
import { ProviderError } from "./provider_302_error.js";
import {
  creditsApiBase,
  creditsBalanceFromResponse,
  providerErrorCode,
  PROVIDER_AUTH_MODE,
} from "./provider_credentials.js";

export const GOOGLE_IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3.1-flash-image-preview",
];

export const GOOGLE_TEXT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

export const GOOGLE_SYNC_TASK_PREFIX = "google-sync-";
const SYNC_TASK_KEY = "ciw.provider.google.syncTasks";
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

export async function stashGoogleSyncResult(taskId, urls) {
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

export async function takeGoogleSyncResult(taskId) {
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

export function isGoogleImageModel(model) {
  if (!model || typeof model !== "string") return false;
  const lower = model.toLowerCase().trim();
  return (
    lower === "gemini-2.5-flash-image" ||
    lower === "gemini-3.1-flash-lite-image" ||
    lower === "gemini-3.1-flash-image-preview" ||
    lower.includes("gemini") && lower.includes("image")
  );
}

export function isGoogleTextModel(model) {
  if (!model || typeof model !== "string") return false;
  const lower = model.toLowerCase().trim();
  if (isGoogleImageModel(lower)) return false;
  return (
    lower.startsWith("gemini-") ||
    lower.startsWith("imagen-") ||
    GOOGLE_TEXT_MODELS.includes(lower)
  );
}

export function isGoogleModel(model) {
  return isGoogleImageModel(model) || isGoogleTextModel(model);
}

export function normalizeGoogleModel(model) {
  if (!model || typeof model !== "string") return model;
  const lower = model.toLowerCase().trim();
  if (lower === "gemini-3.1-flash-image-preview") {
    return "gemini-3.1-flash-lite-image";
  }
  return lower;
}

export function isGoogleTaskId(taskId) {
  return (
    typeof taskId === "string" &&
    (taskId.startsWith(GOOGLE_SYNC_TASK_PREFIX) ||
      taskId.startsWith("google:") ||
      taskId.startsWith("google-"))
  );
}

export function googleEndpoint(baseUrl, model, action = "generateContent") {
  const base = (baseUrl || creditsApiBase("google")).replace(/\/+$/, "");
  return `${base}/v1/publishers/google/models/${model}:${action}`;
}

export function extractGoogleImageUrls(payload) {
  if (!payload || typeof payload !== "object") return [];
  const urls = [];
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts)
      ? candidate.content.parts
      : [];
    for (const part of parts) {
      const inline = part?.inlineData ?? part?.inline_data;
      if (inline && typeof inline.data === "string" && inline.data.trim()) {
        const mime = inline.mimeType || inline.mime_type || "image/png";
        const b64 = inline.data.trim();
        urls.push(
          b64.startsWith("data:") ? b64 : `data:${mime};base64,${b64}`,
        );
      } else if (typeof part?.text === "string") {
        const text = part.text.trim();
        if (text.startsWith("data:image/") || /^https?:\/\//i.test(text)) {
          urls.push(text);
        }
      }
    }
  }

  return [...new Set(urls)];
}

function parseImageInput(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.startsWith("data:")) {
    const match = trimmed.match(/^data:([^;]+);base64,(.*)$/);
    if (match) {
      return {
        inlineData: {
          mimeType: match[1] || "image/png",
          data: match[2],
        },
      };
    }
  }
  // If plain base64 without data prefix
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && trimmed.length > 100) {
    return {
      inlineData: {
        mimeType: "image/png",
        data: trimmed,
      },
    };
  }
  return null;
}

export async function submitGoogleImageJob({
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

  const model = normalizeGoogleModel(request.model) || "gemini-2.5-flash-image";
  const url = googleEndpoint(baseUrl, model, "generateContent");

  const parts = [];
  if (request.prompt) {
    parts.push({ text: request.prompt });
  }

  const rawImages = Array.isArray(request.image)
    ? request.image
    : request.image
      ? [request.image]
      : Array.isArray(request.images)
        ? request.images
        : [];

  for (const img of rawImages) {
    const parsed = parseImageInput(img);
    if (parsed) {
      parts.push(parsed);
    }
  }

  if (parts.length === 0) {
    parts.push({ text: "" });
  }

  const requestBody = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
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
    };
    if (route.mode === PROVIDER_AUTH_MODE.CREDITS) {
      headers.Authorization = `Bearer ${route.token}`;
    } else if (route.apiKey) {
      headers["x-goog-api-key"] = route.apiKey;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        payload?.error?.message ??
        (typeof payload?.error === "string" ? payload.error : null) ??
        payload?.message ??
        payload?.msg ??
        `HTTP ${response.status}`;
      const code =
        providerErrorCode(payload, response.status, true) ??
        (response.status === 401
          ? "providerUnauthorized"
          : "providerRequestFailed");
      throw new ProviderError(code, message);
    }

    const urls = extractGoogleImageUrls(payload);
    if (urls.length === 0) {
      throw new ProviderError(
        "providerInvalidResponse",
        "No image data returned in response",
      );
    }

    const taskId = `${GOOGLE_SYNC_TASK_PREFIX}${crypto.randomUUID()}`;
    await stashGoogleSyncResult(taskId, urls);
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

export async function submitGoogleTextJob({
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

  const model = normalizeGoogleModel(request.model) || "gemini-2.5-flash";
  const url = googleEndpoint(baseUrl, model, "generateContent");

  const prompt = request.prompt || "";
  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    ...(typeof request.temperature === "number"
      ? { generationConfig: { temperature: request.temperature } }
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
    };
    if (route.mode === PROVIDER_AUTH_MODE.CREDITS) {
      headers.Authorization = `Bearer ${route.token}`;
    } else if (route.apiKey) {
      headers["x-goog-api-key"] = route.apiKey;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        payload?.error?.message ??
        (typeof payload?.error === "string" ? payload.error : null) ??
        payload?.message ??
        payload?.msg ??
        `HTTP ${response.status}`;
      const code =
        providerErrorCode(payload, response.status, true) ??
        (response.status === 401
          ? "providerUnauthorized"
          : "providerRequestFailed");
      throw new ProviderError(code, message);
    }

    const candidate = payload?.candidates?.[0];
    const parts = Array.isArray(candidate?.content?.parts)
      ? candidate.content.parts
      : [];
    const textPart = parts.find((p) => typeof p.text === "string");
    const text = textPart?.text ?? "";

    if (!text.trim()) {
      throw new ProviderError(
        "providerInvalidResponse",
        "Empty text response from Google",
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

export async function fetchGoogleJob(taskId) {
  const urls = await takeGoogleSyncResult(taskId);
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
