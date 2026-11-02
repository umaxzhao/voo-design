import { getStoredCustomProviders } from "../custom_providers.js";
import { createGenericProvider } from "./provider_generic_factory.js";
import * as registry from "./provider_registry.js";

/**
 * Resolves a custom provider definition by id.
 */
function customProvider(payload) {
  if (!payload?.providerId) return null;
  try {
    const list = getStoredCustomProviders();
    const provider = Array.isArray(list)
      ? list.find((p) => p.id === payload.providerId)
      : null;
    return provider
      ? createGenericProvider({
          providerId: provider.id,
          defaultBaseUrl: provider.defaultBaseUrl,
        })
      : null;
  } catch {
    return null;
  }
}

/**
 * Checks whether a provider is configured either via stored credentials or payload.
 */
async function isConfigured(payload) {
  if (payload?.apiKey && typeof payload.apiKey === "string" && payload.apiKey.trim()) {
    return true;
  }
  const config = await getProviderConfig(payload);
  return Boolean(config?.configured);
}

/**
 * Submits a generation job. When credentials are configured, delegates to
 * registered provider execution instead of throwing unconfigured error.
 */
export async function submitProviderJob(payload) {
  if (await isConfigured(payload)) {
    if (typeof registry?.submitRegisteredProviderJob === "function") {
      return registry.submitRegisteredProviderJob(payload);
    }
  }
  throw new Error("Cloud AI generation runtime is not configured in standalone mode.");
}

/**
 * Fetches async generation job status.
 */
export async function fetchProviderJob(payload) {
  if (await isConfigured(payload)) {
    if (typeof registry?.fetchRegisteredProviderJob === "function") {
      return registry.fetchRegisteredProviderJob(payload);
    }
  }
  throw new Error("Cloud AI generation runtime is not configured in standalone mode.");
}

/**
 * Streams generation job chunks.
 */
export async function streamProviderJob(payload, onChunk) {
  if (await isConfigured(payload)) {
    if (typeof registry?.streamRegisteredProviderJob === "function") {
      return registry.streamRegisteredProviderJob(payload, { onChunk });
    }
  }
  throw new Error("Cloud AI generation runtime is not configured in standalone mode.");
}

/**
 * Streams text generation chunks.
 */
export async function streamProviderText(payload) {
  if (await isConfigured(payload)) {
    if (typeof registry?.streamRegisteredProviderJob === "function") {
      return registry.streamRegisteredProviderJob(payload);
    }
  }
  throw new Error("Cloud AI generation runtime is not configured in standalone mode.");
}

/**
 * Submits an ASR speech transcription job.
 */
export async function submitAsrJob(payload) {
  if (await isConfigured({ ...payload, providerId: "dashscope" })) {
    if (typeof registry?.submitRegisteredAsrJob === "function") {
      return registry.submitRegisteredAsrJob(payload);
    }
  }
  throw new Error("Cloud ASR runtime is not configured in standalone mode.");
}

/**
 * Fetches an ASR speech transcription job.
 */
export async function fetchAsrJob(payload) {
  if (await isConfigured({ ...payload, providerId: "dashscope" })) {
    if (typeof registry?.fetchRegisteredAsrJob === "function") {
      return registry.fetchRegisteredAsrJob(payload);
    }
  }
  throw new Error("Cloud ASR runtime is not configured in standalone mode.");
}

/**
 * Tests connectivity to a provider.
 */
export async function testProvider(payload) {
  const custom = customProvider(payload);
  if (custom && typeof custom.testProvider === "function") {
    return custom.testProvider();
  }

  if (await isConfigured(payload)) {
    if (typeof registry?.testRegisteredProvider === "function") {
      try {
        const result = await registry.testRegisteredProvider(payload);
        return {
          connected: Boolean(result?.connected ?? result?.success ?? true),
          success: Boolean(result?.connected ?? result?.success ?? true),
          ...result,
        };
      } catch (error) {
        return {
          connected: false,
          success: false,
          message: error?.message || "Provider test failed",
          code: error?.code,
        };
      }
    }
  }
  return { connected: false, success: false, message: "Standalone local mode" };
}

/**
 * Gets provider configuration. Never returns null; always returns a valid config
 * object with configured boolean to prevent TypeError on dereference.
 */
export async function getProviderConfig(payload) {
  const providerId = payload?.providerId;
  const custom = customProvider(payload);
  if (custom && typeof custom.getProviderConfig === "function") {
    const config = await custom.getProviderConfig();
    if (config) return config;
  }

  if (typeof registry?.getRegisteredProviderConfig === "function") {
    try {
      const config = await registry.getRegisteredProviderConfig(payload);
      if (config) {
        return {
          providerId,
          configured: Boolean(config.configured),
          persistence: config.persistence ?? "session",
          maskedKey: config.maskedKey ?? "",
          baseUrl: config.baseUrl ?? "",
          ...config,
        };
      }
    } catch {
      // Fall through to unconfigured return
    }
  }

  return {
    providerId,
    configured: false,
    persistence: "session",
    maskedKey: "",
    baseUrl: "",
  };
}

/**
 * Saves provider configuration with readback verification.
 */
export async function saveProviderConfig(payload) {
  const custom = customProvider(payload);
  if (custom && typeof custom.saveProviderConfig === "function") {
    await custom.saveProviderConfig(payload);
  } else if (typeof registry?.saveRegisteredProviderConfig === "function") {
    await registry.saveRegisteredProviderConfig(payload);
  }

  // Readback verification: verify written configuration can be retrieved and is configured
  const verified = await getProviderConfig(payload);
  if (!verified?.configured) {
    const error = new Error("Failed to persist provider configuration");
    error.code = "providerStorageUnavailable";
    throw error;
  }
  return verified;
}

/**
 * Clears provider configuration.
 */
export async function clearProviderConfig(payload) {
  const custom = customProvider(payload);
  if (custom && typeof custom.clearProviderConfig === "function") {
    await custom.clearProviderConfig(payload);
  } else if (typeof registry?.clearRegisteredProviderConfig === "function") {
    await registry.clearRegisteredProviderConfig(payload);
  }
  return getProviderConfig(payload);
}

/**
 * Lists available models for a provider.
 */
export async function listProviderModels(payload) {
  const custom = customProvider(payload);
  if (custom && typeof custom.listProviderModels === "function") {
    return custom.listProviderModels();
  }

  if (typeof registry?.listRegisteredProviderModels === "function") {
    try {
      const result = await registry.listRegisteredProviderModels(payload);
      return result?.models ?? result ?? [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Fetches asset data URL from remote or blob sources.
 */
export async function fetchAssetDataUrl({ url, maxBytes }) {
  if (!url) return { dataUrl: "" };
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return { dataUrl: url };
  }
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ dataUrl: reader.result });
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return { dataUrl: url };
  }
}
