import { getStoredCustomProviders } from '../../shared/custom_providers.js';
import { providerModelList, PROVIDER_MODELS_KEY } from '../../shared/provider_models.js';
import { getSetting } from '../../shared/settings.js';

/** Read model menus without loading CLI transports or canvas tool executors. */
export function customModelGroups(providers = getStoredCustomProviders(), catalog = getSetting(PROVIDER_MODELS_KEY) ?? {}) {
  return providers.map(provider => ({ cliId: provider.id, name: provider.name,
    models: [...new Map([...(provider.models ?? []), ...providerModelList(catalog, provider.id, 'text')].map(model => [model.id, model])).values()]
      .map(model => ({ id: `api:${encodeURIComponent(provider.id)}:${encodeURIComponent(model.id)}`, label: model.label ?? model.id })),
  }));
}

