import { CLAUDE_MODELS, CODEX_MODELS, DEFAULT_AGENT_MODEL } from "./agent-defaults.js";
import {
  HUNYUAN3D_LOCAL_MODEL_ID,
  HUNYUAN3D_LOCAL_MODEL_LABEL,
} from "./hunyuan3d-local-client.js";
import { LOCAL_CAPABILITY } from "./local_capabilities.js";
import { CURATED_LOCAL_MODELS } from "./local_models_catalog.js";
import {
  getStoredCustomProviders,
  isCustomProviderId,
} from "./custom_providers.js";
/** Provider and media vocabulary shared by the canvas and service worker. */

export const PROVIDER_ID = {
  LOCAL: "local",
  CLI: "cli",
  CREDITS: "credits",
  AI_302: "302ai",
  APIMART: "apimart",
  DASHSCOPE: "dashscope",
  DEEPSEEK: "deepseek",
  OPENROUTER: "openrouter",
  VOLCENGINE: "volcengine",
  ZHIPU: "zhipu",
  MINIMAX: "minimax",
  MOONSHOT: "moonshot",
  XAI: "xai",
  NOVITA: "novita",
  BAIDU: "baidu",
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  GEMINI: "gemini",
  QINIU: "qiniu",
  MODELSCOPE: "modelscope",
  STEPFUN: "stepfun",
  YI: "yi",
  /** Browser-driven Tripo Studio account; no API key is stored by VOO. */
  TRIPO_WEB: "tripo-web",
  /** Browser-driven ChatGPT web platform. */
  CHATGPT: "chatgpt",
};

/** Ordered for the node's provider picker and the settings drawer. */
export const PROVIDERS = [
  {
    id: PROVIDER_ID.LOCAL,
    labelKey: "settings.tabLocalModel",
    label: "本地模型",
  },
  { id: PROVIDER_ID.CLI, labelKey: "agent.provider.cli", label: "本地 CLI" },
  {
    id: PROVIDER_ID.DASHSCOPE,
    labelKey: "provider.dashscope.label",
    label: "DashScope",
  },
  { id: PROVIDER_ID.AI_302, labelKey: "provider.302.label", label: "302.AI" },
  {
    id: PROVIDER_ID.APIMART,
    labelKey: "provider.apimart.label",
    label: "API MART",
  },
  {
    id: PROVIDER_ID.DEEPSEEK,
    labelKey: "provider.deepseek.label",
    label: "DeepSeek",
  },
  {
    id: PROVIDER_ID.VOLCENGINE,
    labelKey: "provider.volcengine.label",
    label: "火山方舟",
  },
  {
    id: PROVIDER_ID.MINIMAX,
    labelKey: "provider.minimax.label",
    label: "MiniMax",
  },
  { id: PROVIDER_ID.ZHIPU, labelKey: "provider.zhipu.label", label: "智谱 AI" },
  {
    id: PROVIDER_ID.OPENROUTER,
    labelKey: "provider.openrouter.label",
    label: "OpenRouter",
  },
  {
    id: PROVIDER_ID.NOVITA,
    labelKey: "provider.novita.label",
    label: "Novita AI",
  },
  { id: PROVIDER_ID.XAI, labelKey: "provider.xai.label", label: "xAI" },
  {
    id: PROVIDER_ID.OPENAI,
    labelKey: "provider.openai.label",
    label: "OpenAI",
  },
  {
    id: PROVIDER_ID.ANTHROPIC,
    labelKey: "provider.anthropic.label",
    label: "Anthropic",
  },
  {
    id: PROVIDER_ID.GEMINI,
    labelKey: "provider.gemini.label",
    label: "Gemini",
  },
  {
    id: PROVIDER_ID.BAIDU,
    labelKey: "provider.baidu.label",
    label: "百度千帆",
  },
  {
    id: PROVIDER_ID.MOONSHOT,
    labelKey: "provider.moonshot.label",
    label: "月之暗面",
  },
  {
    id: PROVIDER_ID.MODELSCOPE,
    labelKey: "provider.modelscope.label",
    label: "魔搭社区",
  },
  {
    id: PROVIDER_ID.STEPFUN,
    labelKey: "provider.stepfun.label",
    label: "阶跃星辰",
  },
  { id: PROVIDER_ID.QINIU, labelKey: "provider.qiniu.label", label: "七牛云" },
  { id: PROVIDER_ID.YI, labelKey: "provider.yi.label", label: "零一万物" },
  {
    id: PROVIDER_ID.TRIPO_WEB,
    labelKey: "provider.tripoWeb.label",
    label: "Tripo Web",
  },
  {
    id: PROVIDER_ID.CHATGPT,
    labelKey: "provider.chatgptWeb.label",
    label: "ChatGPT 网页版",
  },
];

export const PROVIDERS_ORDER_ZH = [
  PROVIDER_ID.LOCAL,
  PROVIDER_ID.DASHSCOPE,
  PROVIDER_ID.VOLCENGINE,
  PROVIDER_ID.DEEPSEEK,
  PROVIDER_ID.ZHIPU,
  PROVIDER_ID.MOONSHOT,
  PROVIDER_ID.MINIMAX,
  PROVIDER_ID.BAIDU,
  PROVIDER_ID.MODELSCOPE,
  PROVIDER_ID.STEPFUN,
  PROVIDER_ID.QINIU,
  PROVIDER_ID.YI,
  PROVIDER_ID.OPENAI,
  PROVIDER_ID.CHATGPT,
  PROVIDER_ID.ANTHROPIC,
  PROVIDER_ID.GEMINI,
  PROVIDER_ID.AI_302,
  PROVIDER_ID.APIMART,
  PROVIDER_ID.OPENROUTER,
  PROVIDER_ID.XAI,
  PROVIDER_ID.NOVITA,
  PROVIDER_ID.TRIPO_WEB,
];

export const PROVIDERS_ORDER_EN = [
  PROVIDER_ID.OPENAI,
  PROVIDER_ID.CHATGPT,
  PROVIDER_ID.ANTHROPIC,
  PROVIDER_ID.GEMINI,
  PROVIDER_ID.OPENROUTER,
  PROVIDER_ID.APIMART,
  PROVIDER_ID.XAI,
  PROVIDER_ID.NOVITA,
  PROVIDER_ID.TRIPO_WEB,
  PROVIDER_ID.LOCAL,
  PROVIDER_ID.DEEPSEEK,
  PROVIDER_ID.DASHSCOPE,
  PROVIDER_ID.AI_302,
  PROVIDER_ID.MINIMAX,
  PROVIDER_ID.VOLCENGINE,
  PROVIDER_ID.ZHIPU,
  PROVIDER_ID.BAIDU,
  PROVIDER_ID.MOONSHOT,
  PROVIDER_ID.MODELSCOPE,
  PROVIDER_ID.STEPFUN,
  PROVIDER_ID.QINIU,
  PROVIDER_ID.YI,
];

/**
 * The provider a fresh install generates on.
 *
 * Every built-in model route (`DEFAULT_MODEL_ROUTES`, model-routes.js) resolves
 * to this provider, so it is what a new node's first, untouched generation
 * sends to. Kept here as one named constant because two surfaces have to agree
 * on it and historically did not: the settings panel used to open on whichever
 * provider `PROVIDERS_ORDER_*` happened to sort first (DashScope), while the
 * route default was this one, so a user could follow the panel it put in front
 * of them, configure exactly that, and still have their first generation
 * unable to run.
 *
 * The route default is the side that must not move: 302.AI is the only provider
 * that covers every medium this app generates (audio runs on it alone), so
 * pointing new work at DashScope would strand audio outright. The panel is the side that moves.
 */
export const DEFAULT_PROVIDER_ID = PROVIDER_ID.AI_302;

/**
 * Orders a provider list for a surface that has to open on the generation
 * provider: DEFAULT_PROVIDER_ID leads, everything else keeps the order it came
 * in with. `Array#sort` is stable, so this moves at most the one entry.
 *
 * Exists because "which provider is first" and "which provider a run uses" were
 * answered in two different places — see DEFAULT_PROVIDER_ID.
 */
export function withDefaultProviderFirst(providers) {
  const leads = (entry) => Number(entry?.id === DEFAULT_PROVIDER_ID);
  return [...(providers ?? [])].sort((a, b) => leads(b) - leads(a));
}

export function getCombinedProviders(locale = "zh") {
  const isEn = typeof locale === "string" && locale.startsWith("en");
  const orderList = isEn ? PROVIDERS_ORDER_EN : PROVIDERS_ORDER_ZH;
  const sorted = [...PROVIDERS].sort((a, b) => {
    const idxA = orderList.indexOf(a.id);
    const idxB = orderList.indexOf(b.id);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  try {
    const raw = globalThis.localStorage?.getItem("voo.custom_providers");
    if (!raw) return sorted;
    const custom = JSON.parse(raw);
    if (!Array.isArray(custom) || custom.length === 0) return sorted;
    return sorted.concat(
      custom.map((p) => ({
        id: p.id,
        label: p.name || p.label,
        defaultBaseUrl: p.defaultBaseUrl,
        isCustom: true,
      })),
    );
  } catch {
    return sorted;
  }
}

/**
 * The provider an action should default to: the first entry in PROVIDERS
 * that has a config, or null when none do. One function feeds both the
 * confirmation copy and the request that follows, so what the user is told
 * it will use is exactly what gets sent — a caller that picked its own
 * "first provider" out of PROVIDERS directly would disagree with this the
 * moment the configured one is not the first entry.
 */
export function firstConfiguredProvider(configs, locale = "zh") {
  const all = getCombinedProviders(locale);
  return all.find((entry) => configs?.[entry.id]) ?? null;
}

/**
 * DashScope reaches the same paths under several hosts — Alibaba's own, the
 * international endpoint, or a gateway that only swaps the domain — so the base
 * URL is a setting rather than a constant.
 */
export const DASHSCOPE_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com";
export const APIMART_DEFAULT_BASE_URL = "https://api.apimart.ai/v1";

export const API_MEDIA_TYPE = {
  IMAGE: "image",
  VIDEO: "video",
  /** Text completion, used by the Design node's AI layout generation. */
  TEXT: "text",
  /** Audio generation: music (Suno) and speech (TTS) share this type. */
  AUDIO: "audio",
  /** A generated GLB asset, currently served by 302.AI's Tripo gateway. */
  MODEL_3D: "model3d",
};

export const REMOTE_JOB_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
};

export function isApiNodeType(type) {
  return ["apiImage", "apiVideo", "apiAudio", "api3d"].includes(type);
}

/**
 * 302.AI's short default image list.
 *
 * A long list is what produced wrong picks and provider errors, so the default
 * set is now the handful of models that cover the work the app actually does;
 * a user reaches anything else through "Add model" in the provider panel or the
 * node's "Custom…" model field, both of which persist and are honoured at
 * request time (see provider_models.js / api_node_editor.jsx).
 *
 * ORDER IS LOAD-BEARING, not cosmetic. The node's model pill seeds itself from
 * `models[0]` when it has no stored id (api_node_editor.jsx ApiModelSelectPill),
 * so the first entry is the model a fresh node submits. It therefore has to be
 * the verified default, not merely the first one somebody listed — an
 * unverified id here is a first generation that fails on the click.
 *
 * `unverified: true` marks an id that could not be confirmed against 302.AI's
 * own index. Probed 2026-09-18 through the 302ai CLI against api.302.ai:
 * `302ai model list t2i` / `list i2i` index `gpt-image-2-t2i` / `gpt-image-2-i2i`
 * and no `gpt-image-2.5-*` id at all, and `302ai model params
 * gpt-image-2.5-sunburst` answers "unknown model", where the same two commands
 * answer normally for `qwen-image-3.0-pro` and `gemini-3.1-flash-image-preview`.
 * Read that index as positive evidence only: it is a curated subset, not the
 * gateway's full surface — it also omits `doubao-seedream-5-0-pro-260628`,
 * which this app has been shipping as the default and which
 * `normalizeModelFor302` maps to — so an id missing from it is unconfirmed
 * rather than dead, and none of these entries may be dropped on that basis
 * alone: a saved workflow may already have one selected.
 */
export const DEFAULT_API_IMAGE_MODELS = [
  // The app's default (DEFAULT_API_IMAGE_MODEL_ID). First so that the model a
  // fresh node shows is the model its request will name.
  { id: "doubao-seedream-5-0-pro-260628", label: "Seedream 5.0 Pro" },
  { id: "qwen-image-3.0-pro", label: "Qwen 3.0 Pro" },
  { id: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image" },
  // Supplied by the owner; no part of the gateway index confirms them. Kept
  // because a workflow may already point at one — but labelled, and last.
  {
    id: "gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    unverified: true,
  },
  { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare", unverified: true },
];

/**
 * 302.AI's short default video list.
 *
 * Both ids are confirmed against the live service (2026-09-18): each one was
 * submitted to `POST /302/v2/video/create` and answered with a task id, so the
 * earlier "unverified" note on `wan3.0-video` no longer applies. 302's own
 * product page prices it per second (480P $0.05 / 720P $0.10 / 1080P $0.20).
 *
 * `wan3.0-video` leads because it is the one a VOO-credit user can actually
 * buy: `doubao-seedance-2-5-260628` is billed upstream by composite tokens
 * ((input+output duration) x width x height x fps / 1024, at $10 or $6 per 1M
 * tokens), which the credit gateway's price units cannot express, so its row is
 * deliberately disabled and a credits call answers `modelNotPriced`. Same order
 * rule as the image list: the priced, confirmed default leads, because
 * `models[0]` is what a fresh node submits.
 */
export const DEFAULT_API_VIDEO_MODELS = [
  { id: "wan3.0-video", label: "Wan 3.0 Video" },
  { id: "doubao-seedance-2-5-260628", label: "Seedance 2.5" },
];

/**
 * Audio generation models on 302.AI. Music mode maps to Suno (the prompt is
 * the song description); speech mode maps to a TTS model. IDs come from the
 * documented Suno auto-mode and OpenAI speech endpoints on 302.AI.
 *
 * DO NOT TRIM THIS LIST as part of a catalogue tidy-up. Two independent
 * reasons, both verified:
 *   1. `provider_302_audio.js` looks the requested id up HERE and throws
 *      `providerModelRequired` when it is absent, so removing an entry does not
 *      hide a model — it breaks submission for anything still pointing at it.
 *   2. Audio has no other implementation: `isMediaProviderAllowed` in
 *      provider_registry.js admits 302.AI only, and `catalogFor` returns an
 *      empty list for every other provider. Emptied, the whole audio medium
 *      becomes unreachable. `302ai model list song` confirms `chirp-crow`
 *      (as `chirp-crow@suno`) is a live 302.AI model.
 */
export const DEFAULT_API_AUDIO_MODELS = [
  { id: "chirp-crow", label: "Suno v5 (Music)", audioMode: "music" },
  { id: "tts-1", label: "TTS (Speech)", audioMode: "tts" },
];
export const DEFAULT_API_AUDIO_MODEL_ID = "chirp-crow";

/**
 * 3D models on 302.AI's hosted Tripo gateway. Same warning as the audio list
 * above: `provider_302_3d.js` rejects any id that is not in this array
 * (`providerModelRequired`), the list is already a single entry, and the only
 * other cloud 3D path is DashScope's Tripo catalogue below.
 */
export const DEFAULT_API_3D_MODEL_ID = "v3.0-20250812";
export const DEFAULT_API_3D_MODELS = [
  { id: DEFAULT_API_3D_MODEL_ID, label: "Tripo 3.0" },
];

export const TRIPO_WEB_MODEL_ID = "tripo-studio-v3.1";
export const TRIPO_WEB_MODELS = [
  {
    id: TRIPO_WEB_MODEL_ID,
    label: "Auto",
    labelKey: "settings.modelRoutes.auto",
  },
];

export const CHATGPT_DEFAULT_IMAGE_MODEL_ID = "chatgpt-4o";
export const CHATGPT_IMAGE_MODELS = [
  {
    id: CHATGPT_DEFAULT_IMAGE_MODEL_ID,
    label: "Auto",
    labelKey: "settings.modelRoutes.auto",
  },
];

export const GEMINI_DEFAULT_IMAGE_MODEL_ID = "gemini-flash";
export const GEMINI_IMAGE_MODELS = [
  {
    id: GEMINI_DEFAULT_IMAGE_MODEL_ID,
    label: "Auto",
    labelKey: "settings.modelRoutes.auto",
  },
];

export const GEMINI_DEFAULT_VIDEO_MODEL_ID = "gemini-veo";
export const GEMINI_VIDEO_MODELS = [
  {
    id: GEMINI_DEFAULT_VIDEO_MODEL_ID,
    label: "Auto",
    labelKey: "settings.modelRoutes.auto",
  },
];

export const DEFAULT_API_IMAGE_MODEL_ID = "doubao-seedream-5-0-pro-260628";
export const DEFAULT_API_VIDEO_MODEL_ID = "wan3.0-video";

export const AI_302_DEFAULT_BASE_URL = "https://api.302.ai";

/**
 * 302.AI text (chat/LLM) models.
 *
 * Short on purpose. A long list is what invites a wrong pick, and a wrong pick
 * surfaces as a provider API error, which is the complaint the short default
 * catalogues exist to answer. Anything else is reachable through "Add model"
 * in the provider panel or the node's "Custom…" model field.
 *
 * These three are 302.AI's own, not guesses. `deepseek-chat`,
 * `deepseek-reasoner` and `gemini-2.5-flash` are listed verbatim in 302.AI's
 * help centre chat configuration page, `help.302.ai/docs/jie-ru-dao-ChatBox`
 * (checked 2026-09-18), which is the closest thing the gateway publishes to a
 * supported chat-model list: its `302ai model list` index covers only
 * t2i/i2i/t2v/i2v/t23d/i23d/song/sfx and has no text kind, and `/v1/models` is
 * key-gated (401 without a key).
 *
 * Two things this list deliberately does NOT contain:
 *   - `qwen-plus`. The previous fallback named it, and 302.AI does not document
 *     it: every Qwen Plus page they publish is date-pinned
 *     (`qwen-plus-2024-09-19`, `qwen-plus-2025-07-14`, …). Bare `qwen-plus` is
 *     DashScope's own id, so sending it here is the unverified-id failure this
 *     catalogue exists to avoid. Use a dated variant if that model is wanted.
 *   - `gpt-4o` / `gpt-4o-mini`. Those have product pages, but they are absent
 *     from the chat configuration list above; `gpt-4.1` and `gpt-4.1-mini` are
 *     what that page names, so they are the ones that can be added unchecked.
 *
 * The `[API_MEDIA_TYPE.TEXT]` entry in `CATALOG` below must stay: without it a
 * text lookup falls through to the catalog's unknown-medium fallback and
 * answers with the *image* models, which is how a picture model once became a
 * text request's default id.
 */
export const AI_302_TEXT_MODELS = [
  { id: "deepseek-chat", label: "DeepSeek Chat (302.AI)" },
  { id: "deepseek-reasoner", label: "DeepSeek Reasoner (302.AI)" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (302.AI)" },
];
export const AI_302_TEXT_MODEL_ID = "deepseek-chat";

/** OpenRouter models */
export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_TEXT_MODELS = [
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3 (OpenRouter)" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1 (OpenRouter)" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
  { id: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B" },
];
export const OPENROUTER_TEXT_MODEL_ID = "anthropic/claude-3.5-sonnet";

/** API MART models */
export const APIMART_TEXT_MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5" },
  { id: "kimi-k3", label: "Kimi K3" },
  { id: "gpt-5", label: "GPT-5" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "deepseek-chat", label: "DeepSeek V3" },
  { id: "deepseek-reasoner", label: "DeepSeek R1" },
];
export const APIMART_TEXT_MODEL_ID = "claude-opus-5";

export const APIMART_IMAGE_MODELS = [
  { id: "nano-banana", label: "Nano banana" },
  { id: "seedream-5.0-pro", label: "Seedream 5.0 Pro" },
  { id: "midjourney", label: "Midjourney" },
  { id: "flux-dev", label: "FLUX.1 Dev" },
  { id: "flux-schnell", label: "FLUX.1 Schnell" },
  { id: "dall-e-3", label: "DALL-E 3" },
];
export const APIMART_IMAGE_MODEL_ID = "nano-banana";

export const APIMART_VIDEO_MODELS = [
  { id: "gemini-omni-flash-preview", label: "Gemini Omni Flash Preview" },
  { id: "kling-3.0-turbo", label: "Kling 3.0 Turbo" },
  { id: "pixverse-v6", label: "Pixverse V6" },
  { id: "sora-2", label: "Sora 2" },
  { id: "veo-3", label: "Google VEO 3" },
];
export const APIMART_VIDEO_MODEL_ID = "kling-3.0-turbo";

/** 火山方舟 (Volcengine Ark) models */
export const VOLCENGINE_DEFAULT_BASE_URL =
  "https://ark.cn-beijing.volces.com/api/v3";
export const VOLCENGINE_TEXT_MODELS = [
  { id: "doubao-1-5-pro-32k", label: "豆包 Doubao 1.5 Pro 32K" },
  { id: "doubao-1-5-pro-256k", label: "豆包 Doubao 1.5 Pro 256K" },
  { id: "doubao-1-5-lite-32k", label: "豆包 Doubao 1.5 Lite 32K" },
  { id: "deepseek-v3", label: "DeepSeek V3 (火山方舟)" },
  { id: "deepseek-r1", label: "DeepSeek R1 (火山方舟)" },
];
export const VOLCENGINE_TEXT_MODEL_ID = "doubao-1-5-pro-32k";

export const VOLCENGINE_IMAGE_MODELS = [
  { id: "doubao-seedream-5-0-pro-260628", label: "Seedream 5.0 Pro" },
  { id: "doubao-seedream-4-0", label: "Seedream 4.0" },
];
export const VOLCENGINE_IMAGE_MODEL_ID = "doubao-seedream-5-0-pro-260628";

export const VOLCENGINE_VIDEO_MODELS = [
  { id: "doubao-seedance-2-5-260628", label: "Seedance 2.5" },
  { id: "doubao-seedance-2-0-fast-260128", label: "Seedance 2.0 Fast" },
];
export const VOLCENGINE_VIDEO_MODEL_ID = "doubao-seedance-2-5-260628";

/** 智谱 AI (Zhipu GLM / BigModel) models */
export const ZHIPU_DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
export const ZHIPU_IMAGE_MODELS = [
  { id: "cogview-3-plus", label: "CogView 3 Plus (智谱旗舰生图)" },
  { id: "cogview-3-flash", label: "CogView 3 Flash (智谱极速生图)" },
  { id: "cogview-3", label: "CogView 3" },
];
export const ZHIPU_IMAGE_MODEL_ID = "cogview-3-plus";

export const ZHIPU_VIDEO_MODELS = [
  { id: "cogvideox-flash", label: "CogVideoX Flash (智谱视频)" },
  { id: "cogvideox", label: "CogVideoX (智谱视频)" },
];
export const ZHIPU_VIDEO_MODEL_ID = "cogvideox-flash";

export const ZHIPU_TEXT_MODELS = [
  { id: "glm-4-plus", label: "GLM-4 Plus (智谱旗舰)" },
  { id: "glm-4-flash", label: "GLM-4 Flash (智谱极速/免费)" },
  { id: "glm-4-air", label: "GLM-4 Air" },
  { id: "deepseek-v3", label: "DeepSeek V3 (智谱)" },
  { id: "deepseek-r1", label: "DeepSeek R1 (智谱)" },
];
export const ZHIPU_TEXT_MODEL_ID = "glm-4-plus";

/** MiniMax API models */
export const MINIMAX_DEFAULT_BASE_URL = "https://api.minimax.chat/v1";
export const MINIMAX_TEXT_MODELS = [
  { id: "MiniMax-Text-01", label: "MiniMax-Text-01 (4M)" },
  { id: "minimax-m2.7", label: "MiniMax M2.7" },
  { id: "minimax-m2.7-highspeed", label: "MiniMax M2.7 Highspeed" },
  { id: "minimax-m2.5", label: "MiniMax M2.5" },
  { id: "minimax-m2.5-lightning", label: "MiniMax M2.5 Lightning" },
];
export const MINIMAX_TEXT_MODEL_ID = "MiniMax-Text-01";

/** Moonshot AI (Kimi) API models */
export const MOONSHOT_DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";
export const MOONSHOT_TEXT_MODELS = [
  { id: "kimi-k3", label: "Kimi K3" },
  { id: "kimi-latest", label: "Kimi Latest" },
  { id: "moonshot-v1-auto", label: "Moonshot V1 Auto" },
  { id: "moonshot-v1-128k", label: "Moonshot V1 128K" },
  { id: "moonshot-v1-32k", label: "Moonshot V1 32K" },
  { id: "moonshot-v1-8k", label: "Moonshot V1 8K" },
];
export const MOONSHOT_TEXT_MODEL_ID = "kimi-k3";

/** 魔搭社区 (ModelScope) API models */
export const MODELSCOPE_DEFAULT_BASE_URL =
  "https://api-inference.modelscope.cn/v1";
export const MODELSCOPE_TEXT_MODELS = [
  { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 72B Instruct" },
  {
    id: "Qwen/Qwen2.5-Coder-32B-Instruct",
    label: "Qwen 2.5 Coder 32B Instruct",
  },
  { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3" },
  { id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1" },
  { id: "Qwen/Qwen2.5-32B-Instruct", label: "Qwen 2.5 32B Instruct" },
];
export const MODELSCOPE_TEXT_MODEL_ID = "Qwen/Qwen2.5-72B-Instruct";

/**
 * DashScope image models, all on the multimodal generation endpoint.
 *
 * Deliberately short: the previous ten-entry list is what made users pick a
 * model they had no reason to pick and then hit provider errors. Anything else
 * is reachable through "Add model" in the provider panel or the node's
 * "Custom…" model field.
 */
export const DASHSCOPE_IMAGE_MODELS = [
  { id: "qwen-image-3.0", label: "Qwen Image 3.0" },
  { id: "qwen-image-3.0-pro", label: "Qwen Image 3.0 Pro" },
];

/**
 * DashScope video models, all on the async video synthesis endpoint.
 *
 * Only `wan3.0-video-prime` ships by default. `dashscopeVideoCapabilities`
 * keys the node's control set off the `wan3.0-video` prefix, so prime still
 * gets the documented resolution / ratio / duration / audio controls.
 */
export const DASHSCOPE_VIDEO_MODELS = [
  { id: "wan3.0-video-prime", label: "Wan 3.0 视频（高速）" },
];

export const DASHSCOPE_COMPATIBLE_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

/**
 * DashScope text models, OpenAI-compatible chat completions.
 *
 * One entry. `qwen3.8-flash` is the owner's pick for the agent LLM, and unlike
 * the 302.AI ids above it is documented rather than assumed: Alibaba Cloud
 * Model Studio states the call id as `qwen3.8-flash`
 * (help.aliyun.com/zh/model-studio/qwen3-8-flash, checked 2026-09-18).
 *
 * Vision note: `supportsVision` does not recognise this id, so an agent asked
 * about a picture falls back to `VISION_TEXT_MODELS[DASHSCOPE]` (qwen-vl-max).
 * That is a working fallback, not a dead end — but teach `supportsVision`
 * about this id only if the multimodal claim is confirmed for API calls.
 */
export const DASHSCOPE_TEXT_MODELS = [
  { id: "qwen3.8-flash", label: "Qwen3.8 Flash" },
];
export const DASHSCOPE_TEXT_MODEL_ID = "qwen3.8-flash";

export const DASHSCOPE_IMAGE_MODEL_ID = "qwen-image-3.0-pro";
export const DASHSCOPE_VIDEO_MODEL_ID = "wan3.0-video-prime";

const DASHSCOPE_WAN3_VIDEO_CAPABILITIES = {
  resolutions: ["480P", "720P", "1080P"],
  ratios: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"],
  duration: { min: 2, max: 30, supportsAuto: true },
  supportsAudio: true,
  supportsSeed: true,
  supportsPromptExtend: true,
  supportsWatermark: true,
};

/** Returns documented video controls for a DashScope model, or null. */
export function dashscopeVideoCapabilities(modelId) {
  return String(modelId ?? "")
    .toLowerCase()
    .startsWith("wan3.0-video")
    ? DASHSCOPE_WAN3_VIDEO_CAPABILITIES
    : null;
}

export const DASHSCOPE_3D_MODEL_ID = "Tripo/Tripo-H3.1";
export const DASHSCOPE_3D_MODELS = [
  { id: "Tripo/Tripo-H3.1", label: "Tripo 3.1" },
];

/*
 * Why DashScope has no music entry, although the owner listed `fun-music-v1`.
 *
 * The model is real — `fun-music-v1` is documented on the
 * `/api/v1/services/audio/music/generation` endpoint
 * (help.aliyun.com/zh/model-studio/fun-music-api, checked 2026-09-18) — but
 * this app cannot call it yet, and listing it would recreate exactly the
 * failures this catalogue shrink is meant to remove:
 *   - `provider_dashscope.js` has no AUDIO branch at all. `submitProviderJob`
 *     routes VIDEO to the async path and everything else to the
 *     image path, so a music id would be posted to the image endpoint.
 *   - `catalogFor` returns an empty list for non-302 audio and
 *     `isMediaProviderAllowed` admits 302.AI only, so the entry would either be
 *     invisible (dead code) or selectable-and-rejected, depending on which of
 *     the two gates was lifted.
 *
 * Shipping it needs all three together: a catalogue entry, the two gates in
 * providers.js / provider_registry.js, and a submit/fetch pair for the music
 * endpoint in provider_dashscope.js. Music is not uncovered in the meantime —
 * 302.AI's Suno entry (`chirp-crow`) below is the default audio route.
 */

/**
 * The local provider has no fixed catalogue.
 *
 * Its models are whichever model the managed engine has loaded, which only
 * the engine can report — see `provider_local.listProviderModels`. These stay as empty defaults so the
 * catalogue below keeps its shape for callers that read it before a backend
 * has answered.
 */
export const LOCAL_IMAGE_MODELS = [];

export const LOCAL_IMAGE_MODEL_ID = null;

/**
 * The engine model a fresh local image route names.
 *
 * The managed engine serves exactly one model per process and its generation
 * endpoint takes no model field (`voo_engine_client.buildEngineGenerationBody`),
 * so this id never travels on the wire. It is carried on the route and on new
 * nodes for three reasons: the node's "a model must be chosen" guard
 * (`api_executor` raises `providerModelRequired` on an empty id), the desktop
 * bridge's start/install lookup (`findEngineModel(modelId, engineModels())`),
 * and display/filtering in Settings and the Design Editor.
 *
 * It must stay equal to the first `engineModels()` entry in
 * `electron/local_engine_catalog.js`; tests/model_routes.test.js cross-checks
 * the two so a catalogue rename cannot silently strand the default.
 */
export const LOCAL_ENGINE_DEFAULT_MODEL_ID = "qwen-image-2.1-q4";

/**
 * Text models the local Codex agent accepts as `--model` (Pencil-style MCP).
 *
 * These are surfaced in the Agent/provider menu so a local coding agent can be
 * used as the text backend. Desktop-only, and only Codex exposes an MCP server
 * that VOO can be a client of; Claude Code / Antigravity are not served the
 * same way, so they are not listed here.
 */
export const ANTIGRAVITY_TEXT_MODELS = [
  { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
  { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)" },
  { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)" },
  { id: "claude-sonnet-5-5-high", label: "Claude Sonnet 5.5 (High)" },
  { id: "claude-opus-5-5-high", label: "Claude Opus 5.5 (High)" },
  { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)" },
];

export const CLI_TEXT_MODELS = [
  ...CLAUDE_MODELS.map((model) => ({
    id: `claude:${model.id}`,
    label: `Claude · ${model.label}`,
  })),
  ...CODEX_MODELS.map((model) => ({
    id: `codex:${model.id}`,
    label: `Codex · ${model.label}`,
  })),
  ...ANTIGRAVITY_TEXT_MODELS.map((model) => ({
    id: `antigravity:${model.id}`,
    label: `Antigravity · ${model.label}`,
  })),
];
export const CLI_TEXT_MODEL_ID = DEFAULT_AGENT_MODEL;

/** DeepSeek text models, OpenAI-compatible chat completions. */
export const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_TEXT_MODELS = [
  // V4.1 Flash: text + image input + tool calls. The V4 Flash and Flash
  // Vision (exp) ids below are retired aliases DeepSeek now serves with it.
  { id: "deepseek-flash", label: "DeepSeek V4.1 Flash" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  {
    id: "deepseek-v4-flash-vision-exp",
    label: "DeepSeek V4 Flash Vision (exp)",
  },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "deepseek-chat", label: "DeepSeek V3 (chat)" },
  { id: "deepseek-reasoner", label: "DeepSeek R1 (reasoner)" },
];
export const DEEPSEEK_TEXT_MODEL_ID = "deepseek-v4-flash";

/**
 * The text models that also accept images, and the one to reach for when the
 * chosen model cannot see.
 *
 * A chat model that takes images is the difference between an agent that can
 * be told "the dog on the left" and one that needs pixel coordinates. The
 * request shape is the OpenAI-compatible one — `content` as an array of
 * `{type:"text"}` / `{type:"image_url"}` blocks — so any provider on that
 * shape works; only the ids differ.
 */
export const VISION_TEXT_MODELS = {
  [PROVIDER_ID.DEEPSEEK]: "deepseek-flash",
  [PROVIDER_ID.DASHSCOPE]: "qwen-vl-max",
  [PROVIDER_ID.AI_302]: "gpt-4o",
  [PROVIDER_ID.OPENROUTER]: "openai/gpt-4o",
};

/** Whether a model id accepts image blocks in its messages. */
export function supportsVision(modelId) {
  const id = String(modelId ?? "").toLowerCase();
  if (!id) return false;
  return (
    id.includes("vision") ||
    id.includes("-vl-") ||
    id.endsWith("-vl") ||
    id.includes("gpt-4o") ||
    id.includes("gpt-5") ||
    id.includes("gpt-6") ||
    id.includes("claude-") ||
    id.startsWith("claude:") ||
    id.includes("gemini-") ||
    // DeepSeek V4.1 Flash takes images; the V4 Flash id is now its alias.
    id === "deepseek-flash" ||
    id === "deepseek-v4-flash"
  );
}

/**
 * The model to run a vision request with: the chosen one when it can see,
 * otherwise the provider's vision model. Null when that provider has none.
 */
export function visionModelFor(providerId, modelId) {
  if (supportsVision(modelId)) return modelId;
  return VISION_TEXT_MODELS[providerId] ?? null;
}

const CATALOG = {
  [PROVIDER_ID.LOCAL]: {
    [API_MEDIA_TYPE.IMAGE]: {
      models: LOCAL_IMAGE_MODELS,
      defaultId: LOCAL_IMAGE_MODEL_ID,
    },
    [API_MEDIA_TYPE.MODEL_3D]: {
      models: [
        {
          id: HUNYUAN3D_LOCAL_MODEL_ID,
          label: HUNYUAN3D_LOCAL_MODEL_LABEL,
          capabilities: [LOCAL_CAPABILITY.MODEL_3D_GENERATION],
        },
      ],
      defaultId: HUNYUAN3D_LOCAL_MODEL_ID,
    },
    [API_MEDIA_TYPE.VIDEO]: {
      models: CURATED_LOCAL_MODELS.filter((model) =>
        model.capabilities.includes(LOCAL_CAPABILITY.VIDEO_GENERATION),
      ),
      defaultId: "wan22-ti2v-5b-q2",
    },
  },
  [PROVIDER_ID.CLI]: {
    [API_MEDIA_TYPE.TEXT]: {
      models: CLI_TEXT_MODELS,
      defaultId: CLI_TEXT_MODEL_ID,
    },
  },
  [PROVIDER_ID.AI_302]: {
    [API_MEDIA_TYPE.IMAGE]: {
      models: DEFAULT_API_IMAGE_MODELS,
      defaultId: DEFAULT_API_IMAGE_MODEL_ID,
    },
    [API_MEDIA_TYPE.VIDEO]: {
      models: DEFAULT_API_VIDEO_MODELS,
      defaultId: DEFAULT_API_VIDEO_MODEL_ID,
    },
    [API_MEDIA_TYPE.AUDIO]: {
      models: DEFAULT_API_AUDIO_MODELS,
      defaultId: DEFAULT_API_AUDIO_MODEL_ID,
    },
    [API_MEDIA_TYPE.MODEL_3D]: {
      models: DEFAULT_API_3D_MODELS,
      defaultId: DEFAULT_API_3D_MODEL_ID,
    },
    // Supplied even though the list is empty (see AI_302_TEXT_MODELS). TEXT is
    // a known medium, so it must resolve here; leaving the key out sent it to
    // the `?? provider[IMAGE]` fallback below, which handed every text lookup
    // the picture catalogue.
    [API_MEDIA_TYPE.TEXT]: {
      models: AI_302_TEXT_MODELS,
      defaultId: AI_302_TEXT_MODEL_ID,
    },
  },
  [PROVIDER_ID.APIMART]: {
    [API_MEDIA_TYPE.TEXT]: {
      models: APIMART_TEXT_MODELS,
      defaultId: APIMART_TEXT_MODEL_ID,
    },
    [API_MEDIA_TYPE.IMAGE]: {
      models: APIMART_IMAGE_MODELS,
      defaultId: APIMART_IMAGE_MODEL_ID,
    },
    [API_MEDIA_TYPE.VIDEO]: {
      models: APIMART_VIDEO_MODELS,
      defaultId: APIMART_VIDEO_MODEL_ID,
    },
  },
  [PROVIDER_ID.DASHSCOPE]: {
    [API_MEDIA_TYPE.IMAGE]: {
      models: DASHSCOPE_IMAGE_MODELS,
      defaultId: DASHSCOPE_IMAGE_MODEL_ID,
    },
    [API_MEDIA_TYPE.VIDEO]: {
      models: DASHSCOPE_VIDEO_MODELS,
      defaultId: DASHSCOPE_VIDEO_MODEL_ID,
    },
    // DashScope serves 3D through its Tripo models. Listing them here without
    // also admitting DashScope to the 3D medium in provider_registry is what
    // used to make them fail on submit, so both are lifted together.
    [API_MEDIA_TYPE.MODEL_3D]: {
      models: DASHSCOPE_3D_MODELS,
      defaultId: DASHSCOPE_3D_MODEL_ID,
    },
    [API_MEDIA_TYPE.TEXT]: {
      models: DASHSCOPE_TEXT_MODELS,
      defaultId: DASHSCOPE_TEXT_MODEL_ID,
    },
  },
  [PROVIDER_ID.TRIPO_WEB]: {
    [API_MEDIA_TYPE.MODEL_3D]: {
      models: TRIPO_WEB_MODELS,
      defaultId: TRIPO_WEB_MODEL_ID,
    },
  },
  [PROVIDER_ID.CHATGPT]: {
    [API_MEDIA_TYPE.IMAGE]: {
      models: CHATGPT_IMAGE_MODELS,
      defaultId: CHATGPT_DEFAULT_IMAGE_MODEL_ID,
    },
  },
  [PROVIDER_ID.GEMINI]: {
    [API_MEDIA_TYPE.IMAGE]: {
      models: GEMINI_IMAGE_MODELS,
      defaultId: GEMINI_DEFAULT_IMAGE_MODEL_ID,
    },
    [API_MEDIA_TYPE.VIDEO]: {
      models: GEMINI_VIDEO_MODELS,
      defaultId: GEMINI_DEFAULT_VIDEO_MODEL_ID,
    },
  },
  [PROVIDER_ID.DEEPSEEK]: {
    [API_MEDIA_TYPE.TEXT]: {
      models: DEEPSEEK_TEXT_MODELS,
      defaultId: DEEPSEEK_TEXT_MODEL_ID,
    },
  },
  [PROVIDER_ID.OPENROUTER]: {
    [API_MEDIA_TYPE.TEXT]: {
      models: OPENROUTER_TEXT_MODELS,
      defaultId: OPENROUTER_TEXT_MODEL_ID,
    },
  },
  [PROVIDER_ID.VOLCENGINE]: {
    [API_MEDIA_TYPE.TEXT]: {
      models: VOLCENGINE_TEXT_MODELS,
      defaultId: VOLCENGINE_TEXT_MODEL_ID,
    },
    [API_MEDIA_TYPE.IMAGE]: {
      models: VOLCENGINE_IMAGE_MODELS,
      defaultId: VOLCENGINE_IMAGE_MODEL_ID,
    },
    [API_MEDIA_TYPE.VIDEO]: {
      models: VOLCENGINE_VIDEO_MODELS,
      defaultId: VOLCENGINE_VIDEO_MODEL_ID,
    },
  },
  [PROVIDER_ID.ZHIPU]: {
    [API_MEDIA_TYPE.TEXT]: {
      models: ZHIPU_TEXT_MODELS,
      defaultId: ZHIPU_TEXT_MODEL_ID,
    },
    [API_MEDIA_TYPE.IMAGE]: {
      models: ZHIPU_IMAGE_MODELS,
      defaultId: ZHIPU_IMAGE_MODEL_ID,
    },
    [API_MEDIA_TYPE.VIDEO]: {
      models: ZHIPU_VIDEO_MODELS,
      defaultId: ZHIPU_VIDEO_MODEL_ID,
    },
  },
  [PROVIDER_ID.MINIMAX]: {
    [API_MEDIA_TYPE.TEXT]: {
      models: MINIMAX_TEXT_MODELS,
      defaultId: MINIMAX_TEXT_MODEL_ID,
    },
  },
  [PROVIDER_ID.MODELSCOPE]: {
    [API_MEDIA_TYPE.TEXT]: {
      models: MODELSCOPE_TEXT_MODELS,
      defaultId: MODELSCOPE_TEXT_MODEL_ID,
    },
  },
};

/**
 * Local models known before any backend is probed.
 *
 * The runtime list comes from the selected backend; this table only exists so
 * the provider picker and the route editor can offer `local` for a medium
 * before a connection is made. Its keys must stay in step with
 * `LOCAL_MEDIA_CAPABILITIES` in `local_capabilities.js` — a contract test
 * enforces that, so adding a local capability here without a backend (or the
 * other way round) fails loudly.
 */
const LOCAL_STATIC_CATALOG = {
  [API_MEDIA_TYPE.MODEL_3D]:
    CATALOG[PROVIDER_ID.LOCAL][API_MEDIA_TYPE.MODEL_3D].models,
  [API_MEDIA_TYPE.VIDEO]:
    CATALOG[PROVIDER_ID.LOCAL][API_MEDIA_TYPE.VIDEO].models,
};

function catalogFor(providerId, mediaType) {
  // The local provider's static list is the only one that can grow without a
  // cloud model id, so it is checked first.
  if (providerId === PROVIDER_ID.LOCAL) {
    const localModels = LOCAL_STATIC_CATALOG[mediaType];
    if (localModels) {
      return { models: localModels, defaultId: localModels[0]?.id ?? null };
    }
  }
  // 3D is implemented by 302.AI, DashScope's Tripo models, and Tripo Studio web.
  // Listing anything else here would put picture models in a 3D node's picker,
  // which is exactly what the previous blanket fallback did.
  if (
    mediaType === API_MEDIA_TYPE.MODEL_3D &&
    providerId !== PROVIDER_ID.AI_302 &&
    providerId !== PROVIDER_ID.TRIPO_WEB &&
    providerId !== PROVIDER_ID.DASHSCOPE
  ) {
    return { models: [], defaultId: null };
  }
  // Audio runs on 302.AI only (provider_registry rejects the rest), so other
  // providers list nothing — never the image-catalog fallback below.
  if (mediaType === API_MEDIA_TYPE.AUDIO && providerId !== PROVIDER_ID.AI_302) {
    return { models: [], defaultId: null };
  }
  const provider = CATALOG[providerId] ?? CATALOG[PROVIDER_ID.AI_302];
  return provider[mediaType] ?? provider[API_MEDIA_TYPE.IMAGE];
}

/** The built-in model list for one provider and medium. */
export function defaultModelsFor(providerId, mediaType) {
  if (isCustomProviderId(providerId)) {
    const customList = getStoredCustomProviders();
    const found = customList.find((p) => p.id === providerId);
    if (
      found?.models &&
      Array.isArray(found.models) &&
      found.models.length > 0
    ) {
      return found.models;
    }
    if (found?.protocol === "dashscope") {
      return catalogFor(PROVIDER_ID.DASHSCOPE, mediaType).models;
    }
  }
  return catalogFor(providerId, mediaType).models;
}

/** The model a fresh node starts on for one provider and medium. */
export function defaultModelIdFor(providerId, mediaType) {
  if (isCustomProviderId(providerId)) {
    const customList = getStoredCustomProviders();
    const found = customList.find((p) => p.id === providerId);
    if (
      found?.models &&
      Array.isArray(found.models) &&
      found.models.length > 0
    ) {
      return found.models[0]?.id ?? null;
    }
    if (found?.protocol === "dashscope") {
      return catalogFor(PROVIDER_ID.DASHSCOPE, mediaType).defaultId;
    }
  }
  return catalogFor(providerId, mediaType).defaultId;
}

// Backwards compatibility aliases
export const DEFAULT_API_MODELS = DEFAULT_API_IMAGE_MODELS;
export const DEFAULT_API_MODEL_ID = DEFAULT_API_IMAGE_MODEL_ID;

/**
 * Resolves a model ID, label, or display name to the ID its provider expects.
 *
 * The fuzzy pass at the end is 302.AI-only: those IDs carry dated suffixes that
 * churn between releases, so a workflow saved months ago still names a model
 * that no longer exists. DashScope IDs are stable and exact — guessing at them
 * would turn a typo into a silently different model.
 */
export function resolveApiModelId(
  modelId,
  mediaType,
  providerId = PROVIDER_ID.AI_302,
) {
  if (!modelId || typeof modelId !== "string") {
    return defaultModelIdFor(providerId, mediaType);
  }
  const clean = modelId.trim();
  const models = defaultModelsFor(providerId, mediaType);

  // Exact ID match
  const exactIdMatch = models.find((m) => m.id === clean);
  if (exactIdMatch) return exactIdMatch.id;

  // Label match
  const labelMatch = models.find(
    (m) => m.label.toLowerCase() === clean.toLowerCase(),
  );
  if (labelMatch) return labelMatch.id;

  // Text is excluded along with 3D: every target in the table below is a
  // picture or video id, so running it over a text model turned a name like
  // `qwen-plus` into `qwen-image-3.0-pro` — a text request repointed at an
  // image model, silently and with no error until the call. A text id this
  // table has no successor for is passed through untouched for 302.AI to judge.
  if (
    providerId !== PROVIDER_ID.AI_302 ||
    mediaType === API_MEDIA_TYPE.MODEL_3D ||
    mediaType === API_MEDIA_TYPE.TEXT
  )
    return clean;

  // Fuzzy match for previous labels or partial names.
  //
  // Every target here must be an id that is in the default catalogue above.
  // A branch pointing at a model the catalogue no longer offers is worse than
  // no branch at all: it rewrites a saved workflow onto a dead id, which is the
  // provider error this table exists to prevent. Two consequences of the short
  // lists:
  //   - Families with no successor in them (Grok, Flux, Seedance 2.0, MiniMax,
  //     HappyHorse, Kling) lost their branch. The saved id now passes through
  //     untouched so 302.AI can judge it; repointing it would silently generate
  //     with a model the workflow never named.
  //   - The GPT family is intentionally absent even though it has a successor
  //     id: `normalizeModelFor302` already maps `gpt-image-2` / `gpt-image-1.5`
  //     onto the `-t2i` / `-i2i` wire ids that 302.AI's own index lists, and it
  //     knows whether a reference image is present. Rewriting it here would
  //     throw that away in favour of a guess.
  const lower = clean.toLowerCase();
  if (lower.includes("seedream") || lower.includes("5.0"))
    return "doubao-seedream-5-0-pro-260628";
  if (lower.includes("qwen")) return "qwen-image-3.0-pro";
  if (lower.includes("gemini")) return "gemini-3.1-flash-image-preview";
  if (lower.includes("seedance")) return "doubao-seedance-2-5-260628";

  return clean;
}
