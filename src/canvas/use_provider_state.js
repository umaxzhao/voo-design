import { useEffect, useState } from "react";
import {
  PROVIDER_ID,
  PROVIDERS,
  defaultModelsFor,
} from "../shared/providers.js";
import {
  PROVIDER_MODELS_KEY,
  providerModelList,
} from "../shared/provider_models.js";
import { getSettingAsync, onSettingChange } from "../shared/settings.js";
import { getProviderConfig, listProviderModels } from "./provider_client.js";
import { CAPABILITY, isCapabilitySupported } from "./platform_capabilities.js";
import { canReadProviderState } from "./desktop_startup_scope.js";

const NO_CONFIGS = {};
let cachedConfigs = null;

/**
 * Whether each provider has a key, for the picker that lists them side by side.
 *
 * Separate from `useProviderState` because the picker needs every provider's
 * status at once, while a node only cares about the one it is set to.
 */
export function useProviderConfigs() {
  const [configs, setConfigs] = useState(cachedConfigs || NO_CONFIGS);
  const [loading, setLoading] = useState(cachedConfigs === null);

  useEffect(() => {
    if (!canReadProviderState()) return undefined;
    let active = true;
    const refresh = () => {
      if (!cachedConfigs) setLoading(true);
      Promise.all(
        PROVIDERS.map((provider) => {
          if (provider.id === PROVIDER_ID.TRIPO_WEB) {
            return Promise.resolve([
              provider.id,
              isCapabilitySupported(CAPABILITY.TRIPO_WEB),
            ]);
          }
          return getProviderConfig({ providerId: provider.id })
            .then((config) => [provider.id, Boolean(config.configured)])
            // One unreachable provider must not blank out the others' status.
            .catch(() => [provider.id, false]);
        }),
      ).then((entries) => {
        if (!active) return;
        cachedConfigs = Object.fromEntries(entries);
        setConfigs(cachedConfigs);
        setLoading(false);
      });
    };

    refresh();
    window.addEventListener("ciw-provider-config-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("ciw-provider-config-changed", refresh);
    };
  }, []);

  return { configs, loading };
}

/** Keeps provider configuration and the media-specific model catalog current. */
export function useProviderState(mediaType, providerId = PROVIDER_ID.AI_302) {
  const fallbackModels = defaultModelsFor(providerId, mediaType);
  const [state, setState] = useState({
    configured: false,
    loading: true,
    models: fallbackModels,
    error: null,
  });

  useEffect(() => {
    if (!canReadProviderState()) return undefined;
    // The catalog is provider- and media-specific, so a picker change has to
    // reset it rather than leave the previous provider's models on screen.
    const builtIn = defaultModelsFor(providerId, mediaType);
    if (!mediaType) {
      setState({
        configured: false,
        loading: false,
        models: builtIn,
        error: null,
      });
      return undefined;
    }

    let active = true;
    const refresh = async () => {
      if (providerId === PROVIDER_ID.TRIPO_WEB) {
        const supported = isCapabilitySupported(CAPABILITY.TRIPO_WEB);
        setState({
          configured: supported,
          loading: false,
          models: builtIn,
          error: supported
            ? null
            : "settings.modelRoutes.tripoWebNeedsExtension",
        });
        return;
      }

      setState((current) => ({ ...current, loading: true }));
      try {
        const [config, stored] = await Promise.all([
          getProviderConfig({ providerId, mediaType }).catch(() => ({
            configured: false,
          })),
          getSettingAsync(PROVIDER_MODELS_KEY).catch(() => ({})),
        ]);

        // Compute stored active models taking into account deletions and custom additions
        const storedModels = providerModelList(stored, providerId, mediaType);

        let dynamicModels = [];
        try {
          const catalog = await listProviderModels({ providerId, mediaType });
          if (Array.isArray(catalog?.models) && catalog.models.length > 0) {
            dynamicModels = catalog.models;
          }
        } catch {
          // Dynamic catalog lookup error is ignored
        }

        if (!active) return;

        // If user has stored customizations or deletions, storedModels takes priority.
        // Otherwise use dynamic models if available, or fall back to builtIn.
        const effectiveModels =
          storedModels && storedModels.length > 0
            ? storedModels
            : dynamicModels.length > 0
              ? dynamicModels
              : builtIn;

        setState({
          configured: Boolean(config?.configured),
          loading: false,
          models: effectiveModels,
          // The local provider explains *why* it is unusable (no checkpoint,
          // unreachable backend, blocked page); the node shows that instead of
          // a generic "configure an API key" hint.
          error: config?.error ?? null,
        });
      } catch {
        if (!active) return;
        setState((current) => ({
          ...current,
          loading: false,
          models: builtIn,
        }));
      }
    };

    refresh();
    window.addEventListener("ciw-provider-config-changed", refresh);
    const stopSettingListener = onSettingChange(PROVIDER_MODELS_KEY, refresh);
    return () => {
      active = false;
      window.removeEventListener("ciw-provider-config-changed", refresh);
      stopSettingListener?.();
    };
  }, [mediaType, providerId]);

  return state;
}
