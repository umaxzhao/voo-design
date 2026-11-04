import { getSetting, setSetting } from "../../../shared/settings.js";
import { AGENT_SETTING } from "../../agent/agent-settings.js";
import { customModelGroups } from "../../agent/custom-model-groups.js";
import { DSH_MODEL_PROVIDER_PRESET } from "./cloud_provider_presets.js";
import { fetchCustomProviderModels } from "./custom_provider_setup.js";

/** Display name stored for the loopback Harness model bridge provider. */
export const HARNESS_PROVIDER_NAME = "DeepSeek Harness";

/**
 * The harness side panel already runs on DeepSeek Harness, so its Agent must use
 * the profile's models through the local model bridge instead of asking the user
 * to configure a CLI. This configures the loopback custom provider once (when the
 * workspace still has no model) and selects its first model as the default.
 *
 * Best effort: if the model bridge is not running yet the Agent keeps its
 * existing/default settings and the user can still configure it in Settings.
 *
 * @param {object} [options]
 * @param {Function} [options.fetchModels] injected for tests.
 * @param {Function} [options.readSetting] injected for tests.
 * @returns {Promise<{configured: boolean, reused?: boolean}>}
 */
export async function ensureHarnessAgentModel({ fetchModels = fetchCustomProviderModels, readSetting = getSetting } = {}) {
  const preset = DSH_MODEL_PROVIDER_PRESET;
  const currentModel = readSetting(AGENT_SETTING.MODEL);
  const group = customModelGroups().find((entry) => entry.cliId === preset.customProviderId);
  if (group?.models?.length) {
    if (!currentModel) await setSetting(AGENT_SETTING.MODEL, group.models[0].id);
    return { configured: true, reused: true };
  }
  if (currentModel) return { configured: true, reused: true };
  try {
    const { providerId, models } = await fetchModels({
      baseUrl: preset.baseUrl,
      apiKey: preset.presetApiKey,
      name: HARNESS_PROVIDER_NAME,
      newProviderId: preset.customProviderId,
    });
    const modelId = models?.[0]?.id;
    if (!modelId) return { configured: false };
    await setSetting(
      AGENT_SETTING.MODEL,
      `api:${encodeURIComponent(providerId)}:${encodeURIComponent(modelId)}`,
    );
    return { configured: true };
  } catch {
    return { configured: false };
  }
}
