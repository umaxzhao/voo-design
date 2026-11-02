import {
  API_MEDIA_TYPE,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_TEXT_MODELS,
  PROVIDER_ID,
} from "../providers.js";
import { credentialArea } from "./credential_store.js";
import {
  creditsApiBase,
  creditsBalanceFromResponse,
  providerErrorCode,
  PROVIDER_AUTH_MODE,
  resolveProviderCredential,
} from "./provider_credentials.js";

/**
 * DeepSeek provider: OpenAI-compatible chat completions.
 *
 * Unlike the image/video providers this is a synchronous round trip — one
 * POST returns the finished text, so there is no task to poll. It powers the
 * Design node's AI layout generation by default (see layout_actions.js).
 */

const SESSION_KEY = "ciw.provider.deepseek.session";
const LOCAL_KEY = "ciw.provider.deepseek.local";
// DeepSeek V4 Flash reasons extensively before writing a full layout
// document (measured 3-7 minutes), so the budget must be generous — 120s
// aborts mid-generation and the swallowed abort surfaces as a bogus
// "unrecognized response".
const REQUEST_TIMEOUT_MS = 600000;

function addCreditsBalance(payload, response, route) {
  const balance =
    route.mode === PROVIDER_AUTH_MODE.CREDITS
      ? creditsBalanceFromResponse(response)
      : null;
  if (balance === null || !payload || typeof payload !== "object") return payload;
  return { ...payload, creditsBalance: balance };
}

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
    providerId: PROVIDER_ID.DEEPSEEK,
    configured: route.mode !== PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED,
    ...(authToken ? {
      authMode: route.mode,
      requiresSignIn: route.mode === PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED,
    } : {}),
    persistence: credential?.persistence ?? "session",
    maskedKey: maskKey(credential?.apiKey),
    baseUrl:
      route.mode === PROVIDER_AUTH_MODE.CREDITS
        ? creditsApiBase("deepseek")
        : DEEPSEEK_DEFAULT_BASE_URL,
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

async function apiRequest(path, { method = "GET", body, authToken } = {}) {
  const credential = await storedCredential();
  const route = resolveProviderCredential({ apiKey: credential?.apiKey, authToken });
  if (route.mode === PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED)
    throw new ProviderError("providerNotConfigured");
  const baseUrl =
    route.mode === PROVIDER_AUTH_MODE.CREDITS
      ? creditsApiBase("deepseek")
      : DEEPSEEK_DEFAULT_BASE_URL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
    // Non-JSON responses (proxy HTML error pages) fall back to an empty
    // object — but an aborted body read is a timeout, not a bad payload, and
    // must bubble up to the AbortError mapping below.
    const payload = await response.json().catch((error) => {
      if (error?.name === "AbortError") throw error;
      return {};
    });
    if (!response.ok) {
      const message =
        payload?.error?.message ??
        payload?.message ??
        `HTTP ${response.status}`;
      const code = providerErrorCode(payload, response.status, route.mode === PROVIDER_AUTH_MODE.CREDITS) ??
        (response.status === 401 ? "providerUnauthorized" : "providerRequestFailed");
      throw new ProviderError(code, message);
    }
    return addCreditsBalance(payload, response, route);
  } catch (error) {
    if (error?.name === "AbortError")
      throw new ProviderError("providerTimeout");
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("providerNetworkError", error?.message);
  } finally {
    clearTimeout(timer);
  }
}

export async function testProvider(options) {
  await apiRequest("/models", options);
  return { connected: true };
}

export async function listProviderModels(options) {
  try {
    const payload = await apiRequest("/models", options);
    const fetched = Array.isArray(payload?.data)
      ? payload.data
          .map((item) => ({ id: item.id, label: item.id }))
          .filter((item) => typeof item.id === "string")
      : [];
    const combined = [...DEEPSEEK_TEXT_MODELS];
    fetched.forEach((model) => {
      if (!combined.some((m) => m.id === model.id)) combined.push(model);
    });
    return { models: combined };
  } catch {
    // Best effort fallback to the built-in catalogue.
    return { models: DEEPSEEK_TEXT_MODELS };
  }
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

/** Parses one SSE `data:` line; null when it carries no JSON payload. */
export function parseSseLine(line) {
  const trimmed = String(line).trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") return { done: true };
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/** The text delta from one streaming chunk (OpenAI-compatible shape). */
export function deltaTextFromChunk(chunk) {
  const delta = chunk?.choices?.[0]?.delta?.content;
  if (typeof delta === "string") return delta;
  if (Array.isArray(delta)) {
    return delta
      .map((part) => (typeof part === "string" ? part : (part?.text ?? "")))
      .join("");
  }
  return "";
}

/** The reasoning delta from one streaming chunk (DeepSeek-R1 / Qwen-R1 / OpenAI shape). */
export function deltaReasoningFromChunk(chunk) {
  const delta = chunk?.choices?.[0]?.delta;
  const reasoning =
    delta?.reasoning_content ?? delta?.reasoning ?? delta?.thought;
  if (typeof reasoning === "string") return reasoning;
  if (Array.isArray(reasoning)) {
    return reasoning
      .map((part) => (typeof part === "string" ? part : (part?.text ?? "")))
      .join("");
  }
  return "";
}

/**
 * Streaming chat completion. Emits the accumulated text through `onChunk`
 * after every chunk, so the caller can render a live preview while the model
 * is still writing — the OpenDesign-style experience.
 * Emits reasoning tokens through `onReasoning` when available.
 */
export async function streamProviderJob({
  mediaType,
  request,
  onChunk = () => {},
  onReasoning = () => {},
  baseUrl = DEEPSEEK_DEFAULT_BASE_URL,
  authToken,
}) {
  if (mediaType !== API_MEDIA_TYPE.TEXT) {
    throw new ProviderError("providerUnsupportedMedia");
  }
  const { model, prompt, temperature } = request ?? {};
  if (!model || !prompt) throw new ProviderError("providerModelRequired");

  const credential = await storedCredential();
  const route = resolveProviderCredential({ apiKey: credential?.apiKey, authToken });
  if (route.mode === PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED)
    throw new ProviderError("providerNotConfigured");

  const targetBaseUrl =
    request?.baseUrl ||
    baseUrl ||
    (route.mode === PROVIDER_AUTH_MODE.CREDITS
      ? creditsApiBase("deepseek")
      : DEEPSEEK_DEFAULT_BASE_URL);
  const targetUrl = targetBaseUrl.endsWith("/chat/completions")
    ? targetBaseUrl
    : `${targetBaseUrl.replace(/\/+$/, "")}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${route.mode === PROVIDER_AUTH_MODE.CREDITS ? route.token : route.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...buildChatRequestBody({ model, prompt, temperature }),
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError")
      throw new ProviderError("providerTimeout");
    throw new ProviderError("providerNetworkError", error?.message);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload?.error?.message ?? payload?.message ?? `HTTP ${response.status}`;
    const code =
      response.status === 401
        ? "providerUnauthorized"
      : providerErrorCode(payload, response.status, route.mode === PROVIDER_AUTH_MODE.CREDITS) ?? "providerRequestFailed";
    throw new ProviderError(code, message);
  }

  let text = "";
  let reasoningText = "";
  let buffer = "";
  const decoder = new TextDecoder();
  const reader = response.body?.getReader();
  if (!reader)
    throw new ProviderError("providerNetworkError", "no stream body");
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const parsed = parseSseLine(line);
      if (!parsed) continue;
      if (parsed.done) continue;
      const reasoningDelta = deltaReasoningFromChunk(parsed);
      if (reasoningDelta) {
        reasoningText += reasoningDelta;
        onReasoning(reasoningDelta, reasoningText);
      }
      const delta = deltaTextFromChunk(parsed);
      if (delta) {
        text += delta;
        onChunk(text);
      }
    }
  }
  if (!text.trim()) {
    throw new ProviderError("providerInvalidResponse", "stream ended empty");
  }
  const trimmedReasoning = reasoningText.trim();
  return {
    text: text.trim(),
    ...(creditsBalanceFromResponse(response) === null
      ? {}
      : { creditsBalance: creditsBalanceFromResponse(response) }),
    ...(trimmedReasoning ? { reasoning: trimmedReasoning } : {}),
  };
}

/**
 * Synchronous text completion. `request` carries `model` and `prompt`; the
 * finished text comes back directly, no task id to poll.
 */
export async function submitProviderJob({ mediaType, request, authToken }) {
  if (mediaType !== API_MEDIA_TYPE.TEXT) {
    throw new ProviderError("providerUnsupportedMedia");
  }
  const { model, prompt, temperature } = request ?? {};
  if (!model || !prompt) throw new ProviderError("providerModelRequired");

  const payload = await apiRequest("/chat/completions", {
    method: "POST",
    body: buildChatRequestBody({ model, prompt, temperature }),
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
  return {
    text: text.trim(),
    ...(payload?.creditsBalance === undefined
      ? {}
      : { creditsBalance: payload.creditsBalance }),
  };
}

export async function fetchProviderJob() {
  throw new ProviderError("providerUnsupportedMedia");
}
