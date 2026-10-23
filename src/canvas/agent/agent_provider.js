import { getStoredCustomProviders } from '../../shared/custom_providers.js';
import { credentialArea } from '../../shared/providers/credential_store.js';
import { providerModelList, PROVIDER_MODELS_KEY } from '../../shared/provider_models.js';
import { getSetting } from '../../shared/settings.js';
import { AGENT_SETTING } from './canvas_tools.js';
import { isCliAgentModel, streamCliStep } from './cli_agent_step.js';
import { streamChatTurn } from './chat_stream.js';

export function customModelGroups(providers = getStoredCustomProviders(), catalog = getSetting(PROVIDER_MODELS_KEY) ?? {}) {
  return providers.map(provider => ({ cliId: provider.id, name: provider.name,
    models: [...new Map([...(provider.models ?? []), ...providerModelList(catalog, provider.id, 'text')].map(model => [model.id, model])).values()]
      .map(model => ({ id: `api:${encodeURIComponent(provider.id)}:${encodeURIComponent(model.id)}`, label: model.label ?? model.id })),
  }));
}

export async function resolveAgentProvider(selected, providers = getStoredCustomProviders()) {
  if (isCliAgentModel(selected)) return { streamStep: streamCliStep, config: { model: selected } };
  if (!selected?.startsWith('api:')) return { streamStep: streamChatTurn, config: { model: selected, apiKey: getSetting(AGENT_SETTING.API_KEY), baseUrl: getSetting(AGENT_SETTING.BASE_URL) } };
  const [, encodedProvider, encodedModel] = selected.split(':');
  const providerId = decodeURIComponent(encodedProvider);
  const provider = providers.find(p => p.id === providerId);
  if (!provider) throw new Error('agentNotConfigured');
  for (const area of ['session', 'local']) {
    const key = `ciw.provider.${providerId}.${area}`;
    const saved = await credentialArea(area)?.get(key);
    if (saved?.[key]?.apiKey) return { streamStep: streamChatTurn, config: { ...saved[key], baseUrl: saved[key].baseUrl || provider.defaultBaseUrl, model: decodeURIComponent(encodedModel) } };
  }
  throw new Error('agentNotConfigured');
}
