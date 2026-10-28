/** Lightweight settings shared by onboarding, model menus and the agent runtime. */
export const AGENT_SETTING = Object.freeze({
  API_KEY: "agent.apiKey",
  BASE_URL: "agent.baseUrl",
  MODEL: "agent.model",
  IMAGE_PROVIDER_ID: "agent.imageProviderId",
  IMAGE_MODEL_ID: "agent.imageModelId",
  TEXT_PROVIDER_ID: "agent.text.providerId",
  TEXT_MODEL_ID: "agent.text.modelId",
  LLM_PROVIDER_ID: "agent.llm.providerId",
  LLM_MODEL_ID: "agent.llm.modelId",
  CONFIRM_BEFORE_IMAGE: "agent.confirmBeforeImage",
  USE_SELECTION_BY_DEFAULT: "agent.useSelectionByDefault",
  DEFAULT_IMAGE_SIZE: "agent.defaultImageSize",
  MAX_STEPS: "agent.maxSteps",
  STYLE_NOTE: "agent.styleNote",
});

export const AGENT_DEFAULTS = Object.freeze({
  confirmBeforeImage: true,
  useSelectionByDefault: true,
  defaultImageSize: "1024x1024",
  // Native CLI tools yield one model step per MCP call (including token setup).
  maxSteps: 64,
  styleNote: "",
});

export const IMAGE_SIZE_PRESETS = Object.freeze(["1024x1024", "1024x1536", "1536x1024"]);

