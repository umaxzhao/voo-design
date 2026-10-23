import { getStoredCustomProviders } from "../shared/custom_providers.js";
import { createGenericProvider } from "../shared/providers/provider_generic_factory.js";

function customProvider(payload) {
  const provider = getStoredCustomProviders().find(provider => provider.id === payload?.providerId);
  return provider ? createGenericProvider({ providerId: provider.id, defaultBaseUrl: provider.defaultBaseUrl }) : null;
}

/**
 * Standalone decoupled provider client stub.
 * Cloud AI generation runtimes are removed from the standalone editor.
 */

export async function submitProviderJob(payload) {
  throw new Error("Cloud AI generation runtime is not configured in standalone mode.");
}

export async function fetchProviderJob(payload) {
  throw new Error("Cloud AI generation runtime is not configured in standalone mode.");
}

export async function streamProviderJob(payload, onChunk) {
  throw new Error("Cloud AI generation runtime is not configured in standalone mode.");
}

export async function streamProviderText(payload) {
  throw new Error("Cloud AI generation runtime is not configured in standalone mode.");
}

export async function submitAsrJob(payload) {
  throw new Error("Cloud ASR runtime is not configured in standalone mode.");
}

export async function fetchAsrJob(payload) {
  throw new Error("Cloud ASR runtime is not configured in standalone mode.");
}

export async function testProvider(payload) {
  return { success: false, message: "Standalone local mode" };
}

export async function getProviderConfig(payload) {
  return customProvider(payload)?.getProviderConfig() ?? null;
}

export async function saveProviderConfig(payload) {
  return customProvider(payload)?.saveProviderConfig(payload) ?? true;
}

export async function clearProviderConfig(payload) {
  return customProvider(payload)?.clearProviderConfig() ?? true;
}

export async function listProviderModels(payload) {
  return [];
}

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
