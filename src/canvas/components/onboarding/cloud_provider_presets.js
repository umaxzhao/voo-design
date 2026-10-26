import {
  DASHSCOPE_COMPATIBLE_BASE_URL,
  VOLCENGINE_DEFAULT_BASE_URL,
  PROVIDER_ID,
} from "../../../shared/providers.js";

/** VOO Cloud is the built-in credits provider: selecting it signs in, not API key. */
export const VOO_CLOUD_PROVIDER = Object.freeze({
  id: "vooCloud",
  labelKey: "provider.vooCloud",
  logoId: "voo_credits",
  configured: false,
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
]);
