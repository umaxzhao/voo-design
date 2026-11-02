import {
  OPENROUTER_DEFAULT_BASE_URL,
  OPENROUTER_TEXT_MODELS,
  PROVIDER_ID,
} from "../providers.js";
import { credentialArea } from "./credential_store.js";
import { APP_URL } from "../app_endpoints.js";

const SESSION_KEY = "ciw.provider.openrouter.session";
const LOCAL_KEY = "ciw.provider.openrouter.local";
const REQUEST_TIMEOUT_MS = 60000;

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

export function normalizeBaseUrl(baseUrl) {
  const trimmed = (baseUrl ?? "").trim();
  if (!trimmed) return OPENROUTER_DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new ProviderError("providerInvalidBaseUrl");
  }
  return trimmed.replace(/\/+$/, "");
}

export async function getProviderConfig() {
  const credential = await storedCredential();
  return {
    providerId: PROVIDER_ID.OPENROUTER,
    configured: Boolean(credential),
    persistence: credential?.persistence ?? "session",
    maskedKey: maskKey(credential?.apiKey),
    baseUrl: credential?.baseUrl ?? OPENROUTER_DEFAULT_BASE_URL,
  };
}

export async function saveProviderConfig({ apiKey, baseUrl, remember }) {
  const normalized = apiKey?.trim();
  if (!normalized) throw new ProviderError("providerKeyRequired");

  const normalizedUrl = normalizeBaseUrl(baseUrl);
  const target = remember ? "local" : "session";
  const targetKey = remember ? LOCAL_KEY : SESSION_KEY;
  const other = remember ? "session" : "local";
  const otherKey = remember ? SESSION_KEY : LOCAL_KEY;
  await storageArea(target).set({
    [targetKey]: { apiKey: normalized, baseUrl: normalizedUrl },
  });
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

async function apiRequest(path, { method = "GET", body } = {}) {
  const credential = await storedCredential();
  if (!credential?.apiKey) throw new ProviderError("providerNotConfigured");

  const baseUrl = credential.baseUrl || OPENROUTER_DEFAULT_BASE_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": APP_URL,
        "X-Title": "VOO Studio",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        payload?.error?.message ??
        payload?.message ??
        `HTTP ${response.status}`;
      const code =
        response.status === 401
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

export async function testProvider() {
  await apiRequest("/models");
  return { connected: true };
}

export async function listProviderModels() {
  try {
    const payload = await apiRequest("/models");
    const fetched = Array.isArray(payload?.data)
      ? payload.data
          .map((item) => ({
            id: item.id,
            label: item.name || item.id,
          }))
          .filter((item) => typeof item.id === "string")
      : [];
    const combined = [...OPENROUTER_TEXT_MODELS];
    fetched.forEach((model) => {
      if (!combined.some((m) => m.id === model.id)) combined.push(model);
    });
    return { models: combined };
  } catch {
    return { models: OPENROUTER_TEXT_MODELS };
  }
}
