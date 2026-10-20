import {
  AI_302_TEXT_MODELS,
  API_MEDIA_TYPE,
  DEFAULT_API_3D_MODELS,
  DEFAULT_API_AUDIO_MODELS,
  DEFAULT_API_IMAGE_MODELS,
  DEFAULT_API_VIDEO_MODELS,
  PROVIDER_ID,
  REMOTE_JOB_STATUS,
} from "../providers.js";
import { credentialArea } from "./credential_store.js";
import { ProviderError } from "./provider_302_error.js";
import {
  creditsApiBase,
  creditsBalanceFromResponse,
  providerErrorCode,
  PROVIDER_AUTH_MODE,
  resolveProviderCredential,
} from "./provider_credentials.js";
import { fetchTripoJob, submitTripoJob } from "./provider_302_3d.js";
import {
  audioResponseDataUrl,
  fetchAudioJob,
  submitAudioJob,
} from "./provider_302_audio.js";
import {
  fetchOpenAIImageJob,
  isOpenAIImageModel,
  isOpenAIImageTaskId,
  submitOpenAIImageJob,
} from "./provider_openai_image.js";
import {
  fetchGoogleJob,
  isGoogleImageModel,
  isGoogleModel,
  isGoogleTaskId,
  isGoogleTextModel,
  submitGoogleImageJob,
  submitGoogleTextJob,
} from "./provider_google_adapter.js";
import {
  ARK_SYNC_TASK_PREFIX,
  fetchArkJob,
  isArkImageModel,
  isArkModel,
  isArkTaskId,
  isArkTextModel,
  isArkVideoModel,
  submitArkImageJob,
  submitArkTextJob,
  submitArkVideoJob,
} from "./provider_ark_adapter.js";
import {
  DASHSCOPE_SYNC_TASK_PREFIX,
  fetchDashScopeJob,
  isDashScopeImageModel,
  isDashScopeModel,
  isDashScopeTaskId,
  isDashScopeTextModel,
  isDashScopeVideoModel,
  submitDashScopeImageJob,
  submitDashScopeTextJob,
  submitDashScopeVideoJob,
} from "./provider_dashscope_adapter.js";

const API_BASE_URLS = ["https://api.302ai.cn", "https://api.302.ai"];
const SESSION_KEY = "ciw.provider.302ai.session";
const LOCAL_KEY = "ciw.provider.302ai.local";
const REQUEST_TIMEOUT_MS = 30000;
// Chat completions can reason for minutes before answering; the 30s media
// timeout would abort mid-generation.
const TEXT_REQUEST_TIMEOUT_MS = 600000;

function addCreditsBalance(payload, response, route) {
  const balance =
    route.mode === PROVIDER_AUTH_MODE.CREDITS
      ? creditsBalanceFromResponse(response)
      : null;
  if (balance === null || !payload || typeof payload !== "object")
    return payload;
  return { ...payload, creditsBalance: balance };
}

function storageArea(name) {
  const area = credentialArea(name);
  if (!area) throw new ProviderError("providerStorageUnavailable");
  return area;
}

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

function maskKey(apiKey) {
  if (!apiKey) return "";
  const suffix = apiKey.slice(-4);
  return `${"•".repeat(Math.min(8, Math.max(4, apiKey.length - 4)))}${suffix}`;
}

export async function getProviderConfig({ authToken } = {}) {
  const credential = await storedCredential();
  const route = resolveProviderCredential({
    apiKey: credential?.apiKey,
    authToken,
  });
  return {
    providerId: PROVIDER_ID.AI_302,
    configured: route.mode !== PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED,
    ...(authToken
      ? {
          authMode: route.mode,
          requiresSignIn: route.mode === PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED,
        }
      : {}),
    persistence: credential?.persistence ?? "session",
    maskedKey: maskKey(credential?.apiKey),
  };
}

export async function saveProviderConfig({ apiKey, remember }) {
  const normalized = apiKey?.trim();
  if (!normalized) throw new ProviderError("providerKeyRequired");

  const target = remember ? "local" : "session";
  const targetKey = remember ? LOCAL_KEY : SESSION_KEY;
  const other = remember ? "session" : "local";
  const otherKey = remember ? SESSION_KEY : LOCAL_KEY;
  await storageArea(target).set({ [targetKey]: { apiKey: normalized } });
  await storageArea(other).remove(otherKey);
  return getProviderConfig();
}

export async function clearProviderConfig() {
  await Promise.all([
    storageArea("session").remove(SESSION_KEY),
    storageArea("local").remove(LOCAL_KEY),
  ]);
  return getProviderConfig();
}

async function apiRequest(
  path,
  {
    method = "GET",
    body,
    timeoutMs = REQUEST_TIMEOUT_MS,
    responseType,
    retryNetworkErrors = true,
    authToken,
  } = {},
) {
  const credential = await storedCredential();
  // The code is what the canvas localizes; a message here would be appended to
  // the translated text verbatim, in whatever language it happens to be in.
  const route = resolveProviderCredential({
    apiKey: credential?.apiKey,
    authToken,
  });
  if (route.mode === PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED)
    throw new ProviderError("providerNotConfigured");

  let lastError = null;
  const baseUrls =
    route.mode === PROVIDER_AUTH_MODE.CREDITS
      ? [creditsApiBase("302")]
      : API_BASE_URLS;
  for (const baseUrl of baseUrls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${route.mode === PROVIDER_AUTH_MODE.CREDITS ? route.token : route.apiKey}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (response.ok && responseType === "audio")
        return await audioResponseDataUrl(response);
      // Non-JSON response (e.g. proxy HTML error pages) falls back to empty object, handled by ok check below.
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          payload?.error?.message ??
          (typeof payload?.error === "string" ? payload.error : null) ??
          payload?.message ??
          payload?.msg ??
          `HTTP ${response.status}`;
        const code =
          providerErrorCode(
            payload,
            response.status,
            route.mode === PROVIDER_AUTH_MODE.CREDITS,
          ) ??
          (response.status === 401
            ? "providerUnauthorized"
            : "providerRequestFailed");
        throw new ProviderError(code, message);
      }
      return addCreditsBalance(payload, response, route);
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      lastError = error;
      // New paid media protocols never repeat an ambiguous submission on another host.
      if (!retryNetworkErrors) break;
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError?.name === "AbortError") {
    throw new ProviderError("providerTimeout");
  }
  throw new ProviderError("providerNetworkError", lastError?.message);
}

function modelArray(payload) {
  const candidates = [
    payload,
    payload?.data,
    payload?.models,
    payload?.data?.models,
    payload?.result,
  ];
  const array = candidates.find(Array.isArray);
  if (array) return array;

  const objectCandidates = [
    payload?.data?.models,
    payload?.models,
    payload?.data,
    payload?.result,
    payload,
  ];
  const object = objectCandidates.find(
    (candidate) =>
      candidate && typeof candidate === "object" && !Array.isArray(candidate),
  );
  if (!object) return [];
  return Object.entries(object)
    .filter(([, value]) => value && typeof value === "object")
    .map(([id, value]) => ({ id, ...value }));
}

function normalizeModel(item) {
  const id = item?.model ?? item?.model_id ?? item?.id ?? item?.name;
  if (!id || typeof id !== "string") return null;
  return {
    id,
    label: item?.display_name ?? item?.label ?? item?.name ?? id,
    modes: item?.modes ?? item?.supported_modes ?? [],
    raw: item,
  };
}

export function normalizeProviderModels(payload) {
  return modelArray(payload).map(normalizeModel).filter(Boolean);
}

export async function testProvider(options) {
  // The media catalogue endpoint answers 200 without checking the key at all,
  // so it cannot prove anything. The OpenAI-style model listing is gated:
  // a bad key earns a 401 there, which is exactly what "test connection"
  // claims to check.
  await apiRequest("/v1/models", options);
  return { connected: true };
}

export async function listProviderModels({ mediaType, authToken } = {}) {
  // These dedicated protocols have no shared image/video catalogue endpoint.
  if (mediaType === API_MEDIA_TYPE.AUDIO)
    return { models: DEFAULT_API_AUDIO_MODELS };
  if (mediaType === API_MEDIA_TYPE.MODEL_3D)
    return { models: DEFAULT_API_3D_MODELS };
  if (mediaType === API_MEDIA_TYPE.TEXT) {
    // The built-in text catalogue is intentionally empty (see
    // AI_302_TEXT_MODELS in providers.js), so the gateway's own OpenAI-style
    // listing is the only source of real text model IDs.
    try {
      const payload = await apiRequest("/v1/models", { authToken });
      const fetched = normalizeProviderModels(payload);
      const combined = [...AI_302_TEXT_MODELS];
      fetched.forEach((model) => {
        if (!combined.some((m) => m.id === model.id)) {
          combined.push(model);
        }
      });
      return { models: combined };
    } catch {
      // Best effort fallback to the (empty) built-in catalogue.
      return { models: AI_302_TEXT_MODELS };
    }
  }
  const defaults =
    mediaType === API_MEDIA_TYPE.VIDEO
      ? DEFAULT_API_VIDEO_MODELS
      : DEFAULT_API_IMAGE_MODELS;
  // Both media types have a catalogue endpoint. The image one is key-gated
  // (it answers 401 unauthenticated) where the video one is open, which is
  // why only video was wired up here for a while; the built-in image list is
  // a guess at what an account can reach, and an account whose image channel
  // is unavailable sees those models offered and then fails per request.
  const catalogue =
    mediaType === API_MEDIA_TYPE.VIDEO
      ? "/302/v2/model/video"
      : "/302/v2/model/image";
  try {
    const payload = await apiRequest(catalogue, { authToken });
    const fetched = normalizeProviderModels(payload);
    const combined = [...defaults];
    fetched.forEach((model) => {
      if (!combined.some((m) => m.id === model.id)) {
        combined.push(model);
      }
    });
    return { models: combined };
  } catch {
    // The catalogue is best effort: an unreachable or unrecognised response
    // leaves the built-in list exactly as it was before this call.
  }
  return { models: defaults };
}

function submitPath(mediaType) {
  if (mediaType === API_MEDIA_TYPE.IMAGE) {
    return "/302/v2/image/generate?run_async=true";
  }
  if (mediaType === API_MEDIA_TYPE.VIDEO) return "/302/v2/video/create";
  throw new ProviderError("providerUnsupportedMedia");
}

/** Builds the OpenAI-compatible chat body; pure so tests can drive it. */
export function buildChatRequestBody({ model, prompt, temperature = 0.8 }) {
  return {
    model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature,
  };
}

/**
 * Synchronous text completion on 302.AI's OpenAI-compatible endpoint.
 * `request` carries `model` and `prompt`; the finished text comes back
 * directly, no task id to poll.
 */
async function submitTextJob(request, authToken) {
  const { model, prompt, temperature } = request ?? {};
  if (!model || !prompt) throw new ProviderError("providerModelRequired");

  const payload = await apiRequest("/v1/chat/completions", {
    method: "POST",
    body: buildChatRequestBody({ model, prompt, temperature }),
    timeoutMs: TEXT_REQUEST_TIMEOUT_MS,
    authToken,
  });
  const message = payload?.choices?.[0]?.message;
  let text = message?.content;
  // Some OpenAI-compatible gateways return content as a part array.
  if (Array.isArray(text)) {
    text = text
      .map((part) => (typeof part === "string" ? part : (part?.text ?? "")))
      .join("");
  }
  if (typeof text !== "string" || !text.trim()) {
    // Attach a short response digest so an unexpected shape is debuggable
    // instead of hiding behind the generic message.
    const digest = JSON.stringify(payload).slice(0, 140);
    throw new ProviderError(
      "providerInvalidResponse",
      `choices=${Array.isArray(payload?.choices) ? payload.choices.length : 0} ${digest}`,
    );
  }
  return { text: text.trim() };
}

export function normalizeModelFor302(model, hasInputImage = false) {
  if (!model) return model;
  const lower = model.toLowerCase().trim();
  if (model === "doubao-seedream-5-0-260128") {
    return "doubao-seedream-5-0-pro-260628";
  }
  if (
    lower === "gpt-image-2" ||
    lower === "gpt-image-2-t2i" ||
    lower === "gpt-image-2-i2i"
  ) {
    return hasInputImage ? "gpt-image-2-i2i" : "gpt-image-2-t2i";
  }
  if (
    lower === "gpt-image-1.5" ||
    lower === "gpt-image-1.5-t2i" ||
    lower === "gpt-image-1.5-i2i"
  ) {
    return hasInputImage ? "gpt-image-1.5-i2i" : "gpt-image-1.5-t2i";
  }
  if (lower === "gpt-image" || lower === "gpt-image-1") {
    return hasInputImage ? "gpt-image-2-i2i" : "gpt-image-2-t2i";
  }
  return model;
}

function defaultSizeFor302(aspectRatio, model = "") {
  const isDoubao =
    model.includes("seedream-5") ||
    model.includes("seedream-4") ||
    model.includes("seedream");
  if (isDoubao) {
    switch (aspectRatio) {
      case "16:9":
        return "2560x1440";
      case "9:16":
        return "1440x2560";
      case "4:3":
        return "2304x1728";
      case "3:4":
        return "1728x2304";
      case "3:2":
        return "2496x1664";
      case "2:3":
        return "1664x2496";
      case "21:9":
        return "3024x1296";
      default:
        return "2048x2048";
    }
  }
  switch (aspectRatio) {
    case "16:9":
      return "1792x1024";
    case "9:16":
      return "1024x1792";
    case "4:3":
      return "1152x864";
    case "3:4":
      return "864x1152";
    case "3:2":
      return "1248x832";
    case "2:3":
      return "832x1248";
    default:
      return "1024x1024";
  }
}

export async function submitProviderJob({
  mediaType,
  request,
  authToken,
  signal,
}) {
  if (mediaType === API_MEDIA_TYPE.AUDIO)
    return submitAudioJob(request, (path, options) =>
      apiRequest(path, { ...options, authToken }),
    );
  if (mediaType === API_MEDIA_TYPE.MODEL_3D)
    return submitTripoJob(request, (path, options) =>
      apiRequest(path, { ...options, authToken }),
    );
  if (mediaType === API_MEDIA_TYPE.TEXT) {
    if (!request?.model || !request?.prompt) {
      throw new ProviderError("providerModelRequired");
    }
    let credential = null;
    try {
      credential = await storedCredential();
    } catch {
      // Ignore storage lookup errors in environments without browser storage
    }
    const route = resolveProviderCredential({
      apiKey: credential?.apiKey,
      authToken,
    });
    if (route.mode === PROVIDER_AUTH_MODE.CREDITS) {
      if (isGoogleTextModel(request?.model)) {
        return submitGoogleTextJob({ request, route, signal });
      }
      if (isArkTextModel(request?.model)) {
        return submitArkTextJob({ request, route, signal });
      }
      if (isDashScopeTextModel(request?.model)) {
        return submitDashScopeTextJob({ request, route, signal });
      }
    }
    return submitTextJob(request, authToken);
  }

  let credential = null;
  try {
    credential = await storedCredential();
  } catch {
    // Ignore storage lookup errors in environments without browser storage
  }
  const route = resolveProviderCredential({
    apiKey: credential?.apiKey,
    authToken,
  });

  if (route.mode === PROVIDER_AUTH_MODE.CREDITS) {
    if (
      mediaType === API_MEDIA_TYPE.IMAGE &&
      isOpenAIImageModel(request?.model)
    ) {
      return submitOpenAIImageJob({ request, route, signal });
    }
    if (
      mediaType === API_MEDIA_TYPE.IMAGE &&
      isGoogleImageModel(request?.model)
    ) {
      return submitGoogleImageJob({ request, route, signal });
    }
    if (
      mediaType === API_MEDIA_TYPE.IMAGE &&
      isArkImageModel(request?.model)
    ) {
      return submitArkImageJob({ request, route, signal });
    }
    if (
      mediaType === API_MEDIA_TYPE.VIDEO &&
      isArkVideoModel(request?.model)
    ) {
      return submitArkVideoJob({ request, route, signal });
    }
    if (
      mediaType === API_MEDIA_TYPE.IMAGE &&
      isDashScopeImageModel(request?.model)
    ) {
      return submitDashScopeImageJob({ request, route, signal });
    }
    if (
      mediaType === API_MEDIA_TYPE.VIDEO &&
      isDashScopeVideoModel(request?.model)
    ) {
      return submitDashScopeVideoJob({ request, route, signal });
    }
  } else if (route.mode === PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED) {
    if (
      isOpenAIImageModel(request?.model) ||
      isGoogleModel(request?.model) ||
      isArkModel(request?.model) ||
      isDashScopeModel(request?.model)
    ) {
      throw new ProviderError("providerNotConfigured");
    }
  }

  // `images` is the provider-neutral ordered reference set used by providers
  // such as DashScope. The 302.AI API expects only `image` / `end_image` and
  // may reject unknown fields.
  const providerRequest = { ...request };
  delete providerRequest.images;

  if (mediaType === API_MEDIA_TYPE.IMAGE) {
    const hasImage = Boolean(
      providerRequest.image &&
      (Array.isArray(providerRequest.image)
        ? providerRequest.image.length > 0
        : Boolean(providerRequest.image)),
    );
    if (!hasImage) {
      delete providerRequest.image;
    }
    if (providerRequest.mask && !providerRequest.mask_image) {
      providerRequest.mask_image = providerRequest.mask;
    }
    providerRequest.model = normalizeModelFor302(
      providerRequest.model,
      hasImage,
    );
    if (!providerRequest.size) {
      providerRequest.size = defaultSizeFor302(
        providerRequest.aspect_ratio,
        providerRequest.model,
      );
    }
    if (providerRequest.size && typeof providerRequest.size === "string") {
      const parts = providerRequest.size.split("x").map((p) => parseInt(p, 10));
      if (
        parts.length === 2 &&
        !Number.isNaN(parts[0]) &&
        !Number.isNaN(parts[1])
      ) {
        if (!providerRequest.width) providerRequest.width = parts[0];
        if (!providerRequest.height) providerRequest.height = parts[1];
      }
    }
    delete providerRequest.resolution;
  }

  const payload = await apiRequest(submitPath(mediaType), {
    method: "POST",
    body: providerRequest,
    authToken,
  });
  const taskId = payload?.task_id ?? payload?.taskId;
  if (!taskId) throw new ProviderError("providerInvalidResponse");
  return {
    taskId: String(taskId),
    status: normalizeProviderStatus(payload?.status),
    submittedAt: Date.now(),
    ...(payload?.creditsBalance === undefined
      ? {}
      : { creditsBalance: payload.creditsBalance }),
  };
}

function fetchPath(mediaType, taskId) {
  const encoded = encodeURIComponent(taskId);
  if (mediaType === API_MEDIA_TYPE.IMAGE)
    return `/302/v2/image/fetch/${encoded}`;
  if (mediaType === API_MEDIA_TYPE.VIDEO)
    return `/302/v2/video/fetch/${encoded}`;
  throw new ProviderError("providerUnsupportedMedia");
}

export function normalizeProviderStatus(status) {
  const value = String(status ?? "").toLowerCase();
  if (
    [
      "completed",
      "complete",
      "success",
      "succeeded",
      "done",
      "finish",
      "finished",
    ].includes(value)
  ) {
    return REMOTE_JOB_STATUS.COMPLETED;
  }
  if (
    ["failed", "failure", "error", "cancelled", "canceled", "fail"].includes(
      value,
    )
  ) {
    return REMOTE_JOB_STATUS.FAILED;
  }
  if (
    [
      "running",
      "processing",
      "in_progress",
      "generating",
      "queue",
      "queued",
      "pending",
    ].includes(value)
  ) {
    return REMOTE_JOB_STATUS.PROCESSING;
  }
  return REMOTE_JOB_STATUS.PENDING;
}

/**
 * The reason a task failed, from the fields 302.AI documents on a failed fetch:
 * `error.message` holds the detail, `error.error` a summary, `error.error_type`
 * the class.
 *
 * Ranked with `??` these lose information, because the detail is sometimes a
 * bare prefix — the documented sample is "Network error after 5 retries: " —
 * and `??` falls through null and undefined but not a blank or half-finished
 * string. So the first field with anything in it wins, and the type is appended
 * when it is not already part of what was picked.
 */
export function failureMessage(payload) {
  const error = payload?.error;
  const candidates =
    typeof error === "string"
      ? [error]
      : [
          error?.message,
          error?.error,
          payload?.message,
          payload?.output?.error,
        ];
  const detail = candidates
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value.replace(/[\s:.\u2014-]+$/u, "").length > 0);
  const kind =
    typeof error?.error_type === "string" ? error.error_type.trim() : "";
  if (!detail) return kind || null;
  return kind && !detail.includes(kind) ? `${detail} (${kind})` : detail;
}

export function extractProviderResultUrls(payload, mediaType) {
  if (!payload || typeof payload !== "object") return [];
  if (mediaType === API_MEDIA_TYPE.AUDIO) {
    // Suno songs and TTS clips surface under a handful of documented shapes.
    const direct = [
      payload?.audio_url,
      payload?.url,
      payload?.song_url,
      payload?.data?.audio?.url,
      payload?.output?.audio_url,
      payload?.output?.url,
      payload?.result?.audio_url,
    ];
    const collections = [
      payload?.audio_urls,
      payload?.urls,
      payload?.songs,
      payload?.data,
      payload?.data?.songs,
      payload?.output,
      payload?.result,
    ]
      .filter(Array.isArray)
      .flatMap((items) => items)
      .map((item) =>
        typeof item === "string"
          ? item
          : (item?.url ??
            item?.audio_url ??
            item?.song_url ??
            item?.audio?.url ??
            (item?.data && item?.data?.url)),
      );
    return [
      ...new Set(
        [...direct, ...collections].filter((v) => typeof v === "string" && v),
      ),
    ];
  }
  const direct =
    mediaType === API_MEDIA_TYPE.VIDEO
      ? [
          payload?.video_url,
          payload?.url,
          payload?.data?.video?.url,
          payload?.output?.video_url,
          payload?.output?.url,
          payload?.result?.video_url,
        ]
      : [
          payload?.image_url,
          payload?.url,
          payload?.output?.image_url,
          payload?.output?.url,
          payload?.result?.image_url,
        ];

  const collections = [
    payload?.image_urls,
    payload?.urls,
    payload?.images,
    payload?.data,
    payload?.data?.images,
    payload?.data?.urls,
    payload?.output?.images,
    payload?.output?.urls,
    payload?.output,
    payload?.result,
    payload?.result?.images,
  ]
    .filter(Array.isArray)
    .flatMap((items) => items)
    .map((item) => {
      if (typeof item === "string") return item;
      if (item?.b64_json && typeof item.b64_json === "string") {
        const b64 = item.b64_json.trim();
        return b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
      }
      return item?.url ?? item?.image_url ?? item?.video_url;
    });

  // `??`/`?.` above handle a *missing* field, not a wrong-typed one. Keep only
  // string values: a number/object/boolean at a URL slot would otherwise sail
  // through `.filter(Boolean)` as a "URL" and be handed to `fetch()`/rendering,
  // which is the sibling module's string-guard and the documented "no result =>
  // []" contract.
  const urls = [...direct, ...collections].filter(
    (value) => typeof value === "string" && value,
  );
  return [...new Set(urls)];
}

export async function fetchProviderJob({ mediaType, taskId, authToken }) {
  if (isOpenAIImageTaskId(taskId)) {
    return fetchOpenAIImageJob(taskId);
  }
  if (isGoogleTaskId(taskId)) {
    return fetchGoogleJob(taskId);
  }
  if (isArkTaskId(taskId)) {
    if (taskId.startsWith(ARK_SYNC_TASK_PREFIX)) {
      return fetchArkJob(taskId);
    }
    let credential = null;
    try {
      credential = await storedCredential();
    } catch {
      // Ignore storage lookup errors in environments without browser storage
    }
    const route = resolveProviderCredential({
      apiKey: credential?.apiKey,
      authToken,
    });
    return fetchArkJob(taskId, { route });
  }
  if (isDashScopeTaskId(taskId)) {
    if (taskId.startsWith(DASHSCOPE_SYNC_TASK_PREFIX)) {
      return fetchDashScopeJob(taskId);
    }
    let credential = null;
    try {
      credential = await storedCredential();
    } catch {
      // Ignore storage lookup errors in environments without browser storage
    }
    const route = resolveProviderCredential({
      apiKey: credential?.apiKey,
      authToken,
    });
    return fetchDashScopeJob(taskId, { route });
  }
  if (mediaType === API_MEDIA_TYPE.AUDIO)
    return fetchAudioJob(taskId, (path, options) =>
      apiRequest(path, { ...options, authToken }),
    );
  if (mediaType === API_MEDIA_TYPE.MODEL_3D)
    return fetchTripoJob(taskId, (path, options) =>
      apiRequest(path, { ...options, authToken }),
    );
  const payload = await apiRequest(fetchPath(mediaType, taskId), { authToken });
  const rawStatus =
    payload?.status ?? payload?.data?.status ?? payload?.output?.status;
  const status = normalizeProviderStatus(rawStatus);
  const urls = extractProviderResultUrls(payload, mediaType);
  const finalStatus =
    status !== REMOTE_JOB_STATUS.FAILED && urls.length > 0
      ? REMOTE_JOB_STATUS.COMPLETED
      : status;

  const errorMessage = failureMessage(payload);
  return {
    taskId,
    status: finalStatus,
    urls: finalStatus === REMOTE_JOB_STATUS.COMPLETED ? urls : [],
    errorMessage:
      finalStatus === REMOTE_JOB_STATUS.FAILED ? errorMessage : null,
  };
}
