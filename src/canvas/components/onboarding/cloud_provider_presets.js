import {
  DASHSCOPE_COMPATIBLE_BASE_URL,
  VOLCENGINE_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_BASE_URL,
  PROVIDER_ID,
} from "../../../shared/providers.js";

/** VOO Cloud is the built-in credits provider: selecting it signs in, not API key. */
export const VOO_CLOUD_PROVIDER = Object.freeze({
  id: "vooCloud",
  labelKey: "provider.vooCloud",
  logoId: "voo_credits",
  configured: false,
});

/**
 * The DSH model bridge: a Host plugin in the DeepSeek Harness profile serves the
 * profile's own models on loopback as an OpenAI-compatible endpoint, so the
 * editor can use them through the existing custom-provider pipeline.
 *
 * The endpoint is local and unauthenticated, so the key is only a placeholder
 * the form needs; it stays editable. The hint explains the offline case: the
 * bridge only answers while the Harness desktop app is running.
 */
export const DSH_MODEL_PROVIDER_PRESET = Object.freeze({
  id: "deepseek-harness-models",
  customProviderId: "custom:onboarding-deepseek-harness",
  labelKey: "firstRun.provider.deepseekHarnessModels",
  baseUrl: "http://127.0.0.1:4399/v1",
  presetApiKey: "voo-local",
  hintKey: "firstRun.provider.deepseekHarnessHint",
});

/** Branded shortcuts use the existing custom-provider credential/model pipeline. */
export const CLOUD_PROVIDER_PRESETS = Object.freeze([
  {
    id: PROVIDER_ID.DASHSCOPE,
    customProviderId: "custom:onboarding-dashscope",
    labelKey: "firstRun.provider.dashscope",
    baseUrl: DASHSCOPE_COMPATIBLE_BASE_URL,
  },
  {
    id: PROVIDER_ID.VOLCENGINE,
    customProviderId: "custom:onboarding-volcengine",
    labelKey: "firstRun.provider.volcengine",
    baseUrl: VOLCENGINE_DEFAULT_BASE_URL,
  },
  {
    id: PROVIDER_ID.DEEPSEEK,
    customProviderId: "custom:onboarding-deepseek",
    labelKey: "firstRun.provider.deepseek",
    baseUrl: DEEPSEEK_DEFAULT_BASE_URL,
  },
  DSH_MODEL_PROVIDER_PRESET,
]);
