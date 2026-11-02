import {
  APIMART_DEFAULT_BASE_URL,
  DASHSCOPE_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_BASE_URL,
  MINIMAX_DEFAULT_BASE_URL,
  MODELSCOPE_DEFAULT_BASE_URL,
  OPENROUTER_DEFAULT_BASE_URL,
  VOLCENGINE_DEFAULT_BASE_URL,
  ZHIPU_DEFAULT_BASE_URL,
  DEFAULT_PROVIDER_ID,
  PROVIDER_ID,
} from "../../shared/providers.js";

export const ALL_PROVIDERS = [
  {
    id: PROVIDER_ID.DEEPSEEK,
    labelKey: "provider.deepseek.label",
    label: "DeepSeek",
    descriptionKey: "provider.deepseek.description",
    defaultBaseUrl: DEEPSEEK_DEFAULT_BASE_URL,
  },
  {
    id: PROVIDER_ID.AI_302,
    label: "302.AI",
    labelKey: "provider.302.label",
    descriptionKey: "provider.302.description",
  },
  {
    id: PROVIDER_ID.DASHSCOPE,
    label: "DashScope (通义)",
    labelKey: "provider.dashscope.label",
    descriptionKey: "provider.dashscope.description",
    defaultBaseUrl: DASHSCOPE_DEFAULT_BASE_URL,
  },
  {
    id: PROVIDER_ID.OPENROUTER,
    labelKey: "provider.openrouter.label",
    label: "OpenRouter",
    descriptionKey: "provider.openrouter.description",
    defaultBaseUrl: OPENROUTER_DEFAULT_BASE_URL,
  },
  {
    id: PROVIDER_ID.OPENAI,
    label: "OpenAI",
    labelKey: "provider.openai.label",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  {
    id: PROVIDER_ID.ANTHROPIC,
    label: "Anthropic",
    labelKey: "provider.anthropic.label",
    defaultBaseUrl: "https://api.anthropic.com/v1",
  },
  {
    id: PROVIDER_ID.VOLCENGINE,
    labelKey: "provider.volcengine.label",
    label: "火山方舟 (豆包)",
    descriptionKey: "provider.volcengine.description",
    defaultBaseUrl: VOLCENGINE_DEFAULT_BASE_URL,
  },
  {
    id: PROVIDER_ID.ZHIPU,
    labelKey: "provider.zhipu.label",
    label: "智谱 AI (GLM)",
    descriptionKey: "provider.zhipu.description",
    defaultBaseUrl: ZHIPU_DEFAULT_BASE_URL,
  },
  {
    id: PROVIDER_ID.GEMINI,
    label: "Google Gemini",
    labelKey: "provider.gemini.label",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  {
    id: PROVIDER_ID.MINIMAX,
    label: "MiniMax",
    labelKey: "provider.minimax.label",
    descriptionKey: "provider.minimax.description",
    defaultBaseUrl: MINIMAX_DEFAULT_BASE_URL,
  },
  {
    id: PROVIDER_ID.APIMART,
    label: "API MART",
    labelKey: "provider.apimart.label",
    descriptionKey: "provider.apimart.description",
    defaultBaseUrl: APIMART_DEFAULT_BASE_URL,
  },
  {
    id: PROVIDER_ID.NOVITA,
    label: "Novita AI",
    labelKey: "provider.novita.label",
    defaultBaseUrl: "https://api.novita.ai/v3/openai",
  },
  {
    id: PROVIDER_ID.XAI,
    label: "xAI (Grok)",
    labelKey: "provider.xai.label",
    defaultBaseUrl: "https://api.x.ai/v1",
  },
  {
    id: PROVIDER_ID.MOONSHOT,
    label: "月之暗面 (Kimi)",
    labelKey: "provider.moonshot.label",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
  },
  {
    id: PROVIDER_ID.MODELSCOPE,
    label: "魔搭社区",
    labelKey: "provider.modelscope.label",
    descriptionKey: "provider.modelscope.description",
    defaultBaseUrl: MODELSCOPE_DEFAULT_BASE_URL,
  },
  {
    id: PROVIDER_ID.BAIDU,
    label: "百度千帆 (文心)",
    labelKey: "provider.baidu.label",
    defaultBaseUrl: "https://qianfan.baidubce.com/v2",
  },
  {
    id: PROVIDER_ID.STEPFUN,
    label: "阶跃星辰",
    labelKey: "provider.stepfun.label",
    defaultBaseUrl: "https://api.stepfun.com/v1",
  },
  {
    id: PROVIDER_ID.QINIU,
    label: "七牛云",
    labelKey: "provider.qiniu.label",
    defaultBaseUrl: "https://openai.qiniu.com/v1",
  },
  {
    id: PROVIDER_ID.YI,
    label: "零一万物",
    labelKey: "provider.yi.label",
    defaultBaseUrl: "https://api.lingyiwanwu.com/v1",
  },
];

export const DEFAULT_ESSENTIAL_PROVIDERS = [
  PROVIDER_ID.DEEPSEEK,
  DEFAULT_PROVIDER_ID,
  PROVIDER_ID.DASHSCOPE,
  PROVIDER_ID.OPENROUTER,
  PROVIDER_ID.OPENAI,
];

export const USER_ADDED_PROVIDERS_KEY = "voo_design.userAddedProviders";

export function getStoredUserAddedProviders() {
  try {
    const raw = localStorage.getItem(USER_ADDED_PROVIDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore storage read error
  }
  return DEFAULT_ESSENTIAL_PROVIDERS;
}

export function storeUserAddedProviders(ids) {
  try {
    localStorage.setItem(USER_ADDED_PROVIDERS_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage write error
  }
}

