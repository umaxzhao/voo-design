/**
 * Persistence and management of user-defined custom AI providers.
 *
 * Each custom provider has:
 *  - id: `custom:${id || slug}`
 *  - name: string (e.g. "OneAPI Gateway")
 *  - label: string (same as name)
 *  - defaultBaseUrl: string (e.g. "https://api.mygateway.com/v1")
 *  - isCustom: true
 */

export const CUSTOM_PROVIDERS_KEY = "voo.custom_providers";

export function getStoredCustomProviders() {
  try {
    const raw = globalThis.localStorage?.getItem(CUSTOM_PROVIDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isCustomProviderId(providerId) {
  return (
    typeof providerId === "string" &&
    (providerId.startsWith("custom:") || providerId.startsWith("custom_"))
  );
}

export function isValidCustomBaseUrl(url) {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:") return true;
    if (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function parseCustomModels(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input !== "string") return [];
  const entries = input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const models = [];
  const seenIds = new Set();
  for (const entry of entries) {
    let id = entry;
    let label = entry;
    if (entry.includes(":")) {
      const idx = entry.indexOf(":");
      id = entry.slice(0, idx).trim();
      label = entry.slice(idx + 1).trim() || id;
    }
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      models.push({ id, label });
    }
  }
  return models;
}

export function formatCustomModels(models) {
  if (!Array.isArray(models)) return "";
  return models
    .map((m) => (m.label && m.label !== m.id ? `${m.id}:${m.label}` : m.id))
    .join(", ");
}

export function saveStoredCustomProvider({
  id,
  name,
  defaultBaseUrl,
  protocol,
  models,
}) {
  const providers = getStoredCustomProviders();
  const trimmedName = (name ?? "").trim();
  const trimmedUrl = (defaultBaseUrl ?? "").trim();
  if (!trimmedName) {
    const error = new Error("providerNameRequired");
    error.code = "providerNameRequired";
    throw error;
  }
  if (!trimmedUrl || !isValidCustomBaseUrl(trimmedUrl)) {
    const error = new Error("providerInvalidBaseUrl");
    error.code = "providerInvalidBaseUrl";
    throw error;
  }

  const providerId =
    id &&
    typeof id === "string" &&
    (id.startsWith("custom:") || id.startsWith("custom_"))
      ? id
      : `custom:${id || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`}`;

  const existingIndex = providers.findIndex((p) => p.id === providerId);
  const detectedProtocol =
    protocol ||
    (trimmedUrl.includes("uiodesign.com") || trimmedUrl.includes("dashscope")
      ? "dashscope"
      : "openai");
  const parsedModels = Array.isArray(models)
    ? models
    : typeof models === "string"
      ? parseCustomModels(models)
      : undefined;

  const providerObj = {
    id: providerId,
    name: trimmedName,
    label: trimmedName,
    defaultBaseUrl: trimmedUrl,
    protocol: detectedProtocol,
    ...(parsedModels && parsedModels.length > 0 ? { models: parsedModels } : {}),
    isCustom: true,
  };

  if (existingIndex >= 0) {
    providers[existingIndex] = { ...providers[existingIndex], ...providerObj };
  } else {
    providers.push(providerObj);
  }

  try {
    globalThis.localStorage?.setItem(
      CUSTOM_PROVIDERS_KEY,
      JSON.stringify(providers),
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ciw-custom-providers-changed"));
      window.dispatchEvent(new Event("ciw-provider-config-changed"));
    }
  } catch {
    // ignore storage write error
  }

  return providerObj;
}

export function deleteStoredCustomProvider(providerId) {
  const providers = getStoredCustomProviders().filter(
    (p) => p.id !== providerId,
  );
  try {
    globalThis.localStorage?.setItem(
      CUSTOM_PROVIDERS_KEY,
      JSON.stringify(providers),
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ciw-custom-providers-changed"));
      window.dispatchEvent(new Event("ciw-provider-config-changed"));
    }
  } catch {
    // ignore storage write error
  }
}
