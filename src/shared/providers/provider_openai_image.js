import { REMOTE_JOB_STATUS } from "../providers.js";
import { credentialArea } from "./credential_store.js";
import { ProviderError } from "./provider_302_error.js";
import {
  supportsOpenAITransparentBackground,
  validateImageTransparencyOutput,
} from "./image-transparency.js";
import {
  creditsApiBase,
  creditsBalanceFromResponse,
  providerErrorCode,
  PROVIDER_AUTH_MODE,
} from "./provider_credentials.js";

export const OPENAI_IMAGE_MODELS = [
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
];

export const OPENAI_IMAGE_SIZES = [
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "auto",
];

export const OPENAI_SYNC_TASK_PREFIX = "openai-sync-";
const SYNC_TASK_KEY = "ciw.provider.302ai.openaiSyncTasks";
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

export async function stashSyncResult(taskId, urls) {
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

export async function takeSyncResult(taskId) {
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

export function isOpenAIImageModel(model) {
  if (!model || typeof model !== "string") return false;
  const lower = model.toLowerCase().trim();
  return (
    supportsOpenAITransparentBackground(lower) ||
    lower === "gpt-image-2-t2i" ||
    lower === "gpt-image-2-i2i" ||
    lower === "gpt-image-1.5-t2i" ||
    lower === "gpt-image-1.5-i2i" ||
    lower === "gpt-image-1-mini" ||
    lower === "gpt-image-2.5-flare" ||
    lower === "gpt-image-2.5-flare-t2i" ||
    lower === "gpt-image-2.5-flare-i2i" ||
    lower === "gpt-image-2.5-sunburst" ||
    lower === "gpt-image-2.5-sunburst-t2i" ||
    lower === "gpt-image-2.5-sunburst-i2i" ||
    lower === "gpt-image"
  );
}

export function normalizeOpenAIImageModel(model) {
  if (!model || typeof model !== "string") return model;
  const lower = model.toLowerCase().trim();
  if (
    lower === "gpt-image-2" ||
    lower === "gpt-image-2-t2i" ||
    lower === "gpt-image-2-i2i"
  ) {
    return "gpt-image-2";
  }
  if (
    lower === "gpt-image-1.5" ||
    lower === "gpt-image-1.5-t2i" ||
    lower === "gpt-image-1.5-i2i"
  ) {
    return "gpt-image-1.5";
  }
  if (lower === "gpt-image-1-mini") {
    return "gpt-image-1-mini";
  }
  if (
    lower === "gpt-image-2.5-flare" ||
    lower === "gpt-image-2.5-flare-t2i" ||
    lower === "gpt-image-2.5-flare-i2i"
  ) {
    return "gpt-image-2.5-flare";
  }
  if (
    lower === "gpt-image-2.5-sunburst" ||
    lower === "gpt-image-2.5-sunburst-t2i" ||
    lower === "gpt-image-2.5-sunburst-i2i"
  ) {
    return "gpt-image-2.5-sunburst";
  }
  if (lower === "gpt-image" || lower === "gpt-image-1") {
    return "gpt-image-1";
  }
  return supportsOpenAITransparentBackground(lower) ? lower : model;
}

export function isOpenAIImageTaskId(taskId) {
  return (
    typeof taskId === "string" && taskId.startsWith(OPENAI_SYNC_TASK_PREFIX)
  );
}

/**
 * Maps requested dimensions, aspect ratios, or sizes to an OpenAI supported size.
 * Supported: "1024x1024", "1536x1024" (landscape), "1024x1536" (portrait), "auto".
 */
export function mapToOpenAISize(request = {}) {
  const rawSize =
    typeof request.size === "string" ? request.size.trim().toLowerCase() : "";
  if (rawSize === "auto") return "auto";
  if (
    rawSize === "1024x1024" ||
    rawSize === "1536x1024" ||
    rawSize === "1024x1536"
  ) {
    return rawSize;
  }

  const rawAspect =
    typeof (request.aspect_ratio ?? request.aspectRatio) === "string"
      ? (request.aspect_ratio ?? request.aspectRatio).trim().toLowerCase()
      : "";
  if (rawAspect === "auto") return "auto";

  let ratio = null;

  if (rawAspect && rawAspect.includes(":")) {
    const [w, h] = rawAspect.split(":").map(Number);
    if (w > 0 && h > 0) {
      ratio = w / h;
    }
  } else if (rawAspect && rawAspect.includes("/")) {
    const [w, h] = rawAspect.split("/").map(Number);
    if (w > 0 && h > 0) {
      ratio = w / h;
    }
  }

  if (
    ratio === null &&
    typeof request.width === "number" &&
    typeof request.height === "number" &&
    request.width > 0 &&
    request.height > 0
  ) {
    ratio = request.width / request.height;
  }

  if (ratio === null && rawSize && rawSize.includes("x")) {
    const [w, h] = rawSize.split("x").map(Number);
    if (w > 0 && h > 0) {
      ratio = w / h;
    }
  }

  if (ratio === null) {
    return "1024x1024";
  }

  const candidates = [
    { size: "1024x1024", ratio: 1.0 },
    { size: "1536x1024", ratio: 1.5 },
    { size: "1024x1536", ratio: 1024 / 1536 },
  ];

  let best = candidates[0];
  let minDiff = Math.abs(ratio - best.ratio);
  for (let i = 1; i < candidates.length; i++) {
    const diff = Math.abs(ratio - candidates[i].ratio);
    if (diff < minDiff) {
      minDiff = diff;
      best = candidates[i];
    }
  }
  return best.size;
}

export function openAIEndpoint(apiBase, path) {
  const base = (apiBase || creditsApiBase("openai")).replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/v1")) {
    return `${base}${normalizedPath}`;
  }
  return `${base}/v1${normalizedPath}`;
}

export function extractOpenAIImageUrls(payload, requestedFormat = "png") {
  if (!payload || typeof payload !== "object") return [];
  const format = payload.output_format ?? requestedFormat;
  const mimeType =
    format === "webp"
      ? "image/webp"
      : format === "jpeg"
        ? "image/jpeg"
        : "image/png";
  const data = Array.isArray(payload.data) ? payload.data : [];
  const urls = [];
  for (const item of data) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) {
        urls.push(
          trimmed.startsWith("data:") || /^https?:\/\//i.test(trimmed)
            ? trimmed
            : `data:${mimeType};base64,${trimmed}`,
        );
      }
    } else if (item && typeof item === "object") {
      if (typeof item.b64_json === "string" && item.b64_json.trim()) {
        const b64 = item.b64_json.trim();
        urls.push(
          b64.startsWith("data:") ? b64 : `data:${mimeType};base64,${b64}`,
        );
      } else if (typeof item.url === "string" && item.url.trim()) {
        urls.push(item.url.trim());
      }
    }
  }
  return [...new Set(urls)];
}

export async function toImageBlob(input) {
  if (!input) return null;
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return input;
  }
  if (typeof input === "string") {
    if (input.startsWith("data:")) {
      const match = input.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        const mimeType = match[1] || "image/png";
        const b64 = match[2];
        if (typeof globalThis.Buffer !== "undefined") {
          return new Blob([globalThis.Buffer.from(b64, "base64")], {
            type: mimeType,
          });
        }
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType });
      }
    }
    if (/^https?:\/\//i.test(input)) {
      const res = await fetch(input);
      if (!res.ok) {
        throw new ProviderError(
          "providerRequestFailed",
          `Failed to fetch image: ${input}`,
        );
      }
      return await res.blob();
    }
    try {
      if (typeof globalThis.Buffer !== "undefined") {
        return new Blob([globalThis.Buffer.from(input, "base64")], {
          type: "image/png",
        });
      }
      const binary = atob(input);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: "image/png" });
    } catch {
      return new Blob([input], { type: "image/png" });
    }
  }
  return input;
}

export async function submitOpenAIImageJob({
  request = {},
  route,
  signal,
  baseUrl,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  if (!route || route.mode !== PROVIDER_AUTH_MODE.CREDITS || !route.token) {
    throw new ProviderError("providerNotConfigured");
  }
  validateImageTransparencyOutput(request);

  const hasImage =
    Boolean(
      request?.image &&
      (Array.isArray(request.image)
        ? request.image.length > 0
        : Boolean(request.image)),
    ) ||
    Boolean(
      request?.images &&
      Array.isArray(request.images) &&
      request.images.length > 0,
    );

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
    let url;
    let fetchOptions;

    if (!hasImage) {
      url = openAIEndpoint(
        baseUrl || creditsApiBase("openai"),
        "/images/generations",
      );
      const jsonBody = {
        model: normalizeOpenAIImageModel(request.model),
        prompt: request.prompt || "",
        n: request.n ?? 1,
        size: mapToOpenAISize(request),
        quality: request.quality ?? "auto",
        output_format: request.output_format ?? "b64_json",
        ...(request.background != null
          ? { background: request.background }
          : {}),
        ...(request.response_format
          ? { response_format: request.response_format }
          : {}),
      };
      fetchOptions = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${route.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jsonBody),
        signal: controller.signal,
      };
    } else {
      url = openAIEndpoint(
        baseUrl || creditsApiBase("openai"),
        "/images/edits",
      );
      const formData = new FormData();
      formData.append("model", normalizeOpenAIImageModel(request.model));
      formData.append("prompt", request.prompt || "");
      formData.append("n", String(request.n ?? 1));
      formData.append("size", mapToOpenAISize(request));
      formData.append("quality", String(request.quality ?? "auto"));
      if (request.background != null) {
        formData.append("background", request.background);
      }
      formData.append(
        "output_format",
        String(request.output_format ?? "b64_json"),
      );

      const imageList = Array.isArray(request.image)
        ? request.image
        : request.image
          ? [request.image]
          : Array.isArray(request.images)
            ? request.images
            : [];

      for (let i = 0; i < imageList.length; i++) {
        const blob = await toImageBlob(imageList[i], `image_${i}.png`);
        if (blob) {
          formData.append("image[]", blob, `image_${i}.png`);
        }
      }

      const maskInput = request.mask ?? request.mask_image;
      if (maskInput) {
        const maskBlob = await toImageBlob(maskInput, "mask.png");
        if (maskBlob) {
          formData.append("mask", maskBlob, "mask.png");
        }
      }

      fetchOptions = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${route.token}`,
        },
        body: formData,
        signal: controller.signal,
      };
    }

    const response = await fetch(url, fetchOptions);
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

    const urls = extractOpenAIImageUrls(payload, request.output_format);
    if (urls.length === 0) {
      throw new ProviderError(
        "providerInvalidResponse",
        "No image data returned in response",
      );
    }

    const taskId = `${OPENAI_SYNC_TASK_PREFIX}${crypto.randomUUID()}`;
    await stashSyncResult(taskId, urls);
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

export async function fetchOpenAIImageJob(taskId) {
  const urls = await takeSyncResult(taskId);
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
