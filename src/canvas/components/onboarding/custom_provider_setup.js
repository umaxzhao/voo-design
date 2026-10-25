import {
  deleteStoredCustomProvider,
  saveStoredCustomProvider,
} from "../../../shared/custom_providers.js";
import {
  PROVIDER_MODELS_KEY,
  mergeFetchedModels,
  providerModelList,
} from "../../../shared/provider_models.js";
import { API_MEDIA_TYPE } from "../../../shared/providers.js";
import { listRegisteredProviderModels } from "../../../shared/providers/provider_registry.js";
import { getSettingAsync, setSetting } from "../../../shared/settings.js";
import { clearProviderConfig, saveProviderConfig } from "../../provider_client.js";
import {
  VERIFICATION_STATUS,
  invalidateProviderVerification,
  setProviderVerification,
} from "../provider_verification_state.js";

/** Same event Settings → AI Providers listens to when credentials change. */
const CONFIG_CHANGED_EVENT = "ciw-provider-config-changed";

function announceConfigChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT));
}

/** A custom provider needs a display name; the endpoint host is the least surprising default. */
function providerNameFor(baseUrl) {
  return new URL(baseUrl).hostname;
}

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

/** Undoes a provider this attempt created, so a failed fetch leaves nothing behind in Settings. */
async function rollbackCreated(providerId) {
  // Clear the key first: the client resolves the provider from the stored list.
  // Best effort: the fetch error is the one the user needs to see, not a cleanup failure.
  await clearProviderConfig({ providerId }).catch(() => undefined);
  deleteStoredCustomProvider(providerId);
  invalidateProviderVerification(providerId);
  announceConfigChange();
}

/**
 * Persists a custom provider and its key exactly as Settings → AI Providers
 * does, asks the provider registry for its model list and stores that list in
 * the shared catalogue Settings reads.
 *
 * `providerId` is passed on a retry so the same provider is updated rather
 * than duplicated; an empty `apiKey` then keeps the key already stored.
 *
 * @returns {Promise<{providerId: string, models: Array<{id: string, label: string}>}>}
 * @throws {Error} with a `code` the provider error helpers can translate
 */
export async function fetchCustomProviderModels({ providerId = null, baseUrl, apiKey }) {
  const created = !providerId;
  const saved = saveStoredCustomProvider({
    id: providerId ?? undefined,
    name: providerNameFor(baseUrl),
    defaultBaseUrl: baseUrl,
  });
  try {
    if (apiKey.trim() || created) {
      // Same call and storage as the Settings provider card (remember = local).
      await saveProviderConfig({ providerId: saved.id, apiKey, remember: true, baseUrl });
    }
    invalidateProviderVerification(saved.id);
    // The generic provider turns every request failure into an empty list.
    const result = await listRegisteredProviderModels({
      providerId: saved.id,
      mediaType: API_MEDIA_TYPE.TEXT,
    });
    if (!Array.isArray(result?.models) || result.models.length === 0) {
      throw failure("providerRequestFailed");
    }
    const stored = (await getSettingAsync(PROVIDER_MODELS_KEY)) ?? {};
    const next = mergeFetchedModels(stored, saved.id, API_MEDIA_TYPE.TEXT, result.models);
    await setSetting(PROVIDER_MODELS_KEY, next);
    setProviderVerification(saved.id, { status: VERIFICATION_STATUS.VERIFIED });
    announceConfigChange();
    return { providerId: saved.id, models: providerModelList(next, saved.id, API_MEDIA_TYPE.TEXT) };
  } catch (error) {
    if (created) await rollbackCreated(saved.id);
    throw error;
  }
}
