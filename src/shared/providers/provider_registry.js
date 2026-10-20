import {
  API_MEDIA_TYPE,
  MINIMAX_DEFAULT_BASE_URL,
  MINIMAX_TEXT_MODELS,
  MODELSCOPE_DEFAULT_BASE_URL,
  MODELSCOPE_TEXT_MODELS,
  MOONSHOT_DEFAULT_BASE_URL,
  MOONSHOT_TEXT_MODELS,
  PROVIDER_ID,
} from "../providers.js";
import * as localEngine from "./provider_local.js";
import * as cliEngine from "./provider_cli.js";
import * as ai302 from "./provider_302.js";
import * as dashscope from "./provider_dashscope.js";
import { createDashscopeProvider } from "./provider_dashscope.js";
import { getStoredCustomProviders } from "../custom_providers.js";
import * as deepseek from "./provider_deepseek.js";
import * as openrouter from "./provider_openrouter.js";
import * as volcengine from "./provider_volcengine.js";
import * as zhipu from "./provider_zhipu.js";
import { createGenericProvider } from "./provider_generic_factory.js";

function adapt(module) {
  return {
    getConfig: module.getProviderConfig,
    saveConfig: module.saveProviderConfig,
    clearConfig: module.clearProviderConfig,
    test: module.testProvider,
    listModels: module.listProviderModels,
    submitJob: module.submitProviderJob,
    /** Only providers with a real SSE endpoint expose this. */
    streamJob: module.streamProviderJob,
    fetchJob: module.fetchProviderJob,
    submitAsr: module.submitAsrJob,
    fetchAsr: module.fetchAsrJob,
  };
}

const PROVIDERS = new Map([
  [PROVIDER_ID.LOCAL, adapt(localEngine)],
  [PROVIDER_ID.CLI, adapt(cliEngine)],
  [PROVIDER_ID.AI_302, adapt(ai302)],
  [PROVIDER_ID.DASHSCOPE, adapt(dashscope)],
  [PROVIDER_ID.DEEPSEEK, adapt(deepseek)],
  [PROVIDER_ID.OPENROUTER, adapt(openrouter)],
  [PROVIDER_ID.VOLCENGINE, adapt(volcengine)],
  [PROVIDER_ID.ZHIPU, adapt(zhipu)],
  [
    PROVIDER_ID.MINIMAX,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.MINIMAX,
        defaultBaseUrl: MINIMAX_DEFAULT_BASE_URL,
        defaultModels: {
          [API_MEDIA_TYPE.TEXT]: MINIMAX_TEXT_MODELS,
        },
      }),
    ),
  ],
  [
    PROVIDER_ID.MOONSHOT,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.MOONSHOT,
        defaultBaseUrl: MOONSHOT_DEFAULT_BASE_URL,
        defaultModels: {
          [API_MEDIA_TYPE.TEXT]: MOONSHOT_TEXT_MODELS,
        },
      }),
    ),
  ],
  [
    PROVIDER_ID.APIMART,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.APIMART,
        defaultBaseUrl: "https://api.apimart.ai/v1",
      }),
    ),
  ],
  [
    PROVIDER_ID.XAI,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.XAI,
        defaultBaseUrl: "https://api.x.ai/v1",
      }),
    ),
  ],
  [
    PROVIDER_ID.NOVITA,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.NOVITA,
        defaultBaseUrl: "https://api.novita.ai/v3/openai",
      }),
    ),
  ],
  [
    PROVIDER_ID.BAIDU,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.BAIDU,
        defaultBaseUrl: "https://qianfan.baidubce.com/v2",
      }),
    ),
  ],
  [
    PROVIDER_ID.OPENAI,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.OPENAI,
        defaultBaseUrl: "https://api.openai.com/v1",
      }),
    ),
  ],
  [
    PROVIDER_ID.ANTHROPIC,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.ANTHROPIC,
        defaultBaseUrl: "https://api.anthropic.com/v1",
      }),
    ),
  ],
  [
    PROVIDER_ID.GEMINI,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.GEMINI,
        defaultBaseUrl:
          "https://generativelanguage.googleapis.com/v1beta/openai",
      }),
    ),
  ],
  [
    PROVIDER_ID.QINIU,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.QINIU,
        defaultBaseUrl: "https://openai.qiniu.com/v1",
      }),
    ),
  ],
  [
    PROVIDER_ID.MODELSCOPE,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.MODELSCOPE,
        defaultBaseUrl: MODELSCOPE_DEFAULT_BASE_URL,
        defaultModels: {
          [API_MEDIA_TYPE.TEXT]: MODELSCOPE_TEXT_MODELS,
        },
      }),
    ),
  ],
  [
    PROVIDER_ID.STEPFUN,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.STEPFUN,
        defaultBaseUrl: "https://api.stepfun.com/v1",
      }),
    ),
  ],
  [
    PROVIDER_ID.YI,
    adapt(
      createGenericProvider({
        providerId: PROVIDER_ID.YI,
        defaultBaseUrl: "https://api.lingyiwanwu.com/v1",
      }),
    ),
  ],
]);

export function invalidateCustomProvider(providerId) {
  if (providerId) {
    PROVIDERS.delete(providerId);
  } else {
    for (const key of PROVIDERS.keys()) {
      if (
        typeof key === "string" &&
        (key.startsWith("custom:") || key.startsWith("custom_"))
      ) {
        PROVIDERS.delete(key);
      }
    }
  }
}

if (typeof globalThis.window !== "undefined") {
  globalThis.window.addEventListener("ciw-custom-providers-changed", () => {
    invalidateCustomProvider();
  });
}

function providerFor(providerId = PROVIDER_ID.AI_302) {
  const provider = PROVIDERS.get(providerId);
  if (provider) return provider;
  if (
    typeof providerId === "string" &&
    (providerId.startsWith("custom:") || providerId.startsWith("custom_"))
  ) {
    let customDef = null;
    try {
      const list = getStoredCustomProviders();
      customDef = list.find((p) => p.id === providerId) ?? null;
    } catch {
      // fallback
    }
    const isDashscope =
      customDef?.protocol === "dashscope" ||
      customDef?.defaultBaseUrl?.includes("uiodesign.com") ||
      customDef?.defaultBaseUrl?.includes("dashscope");

    const dynamic = isDashscope
      ? adapt(
          createDashscopeProvider({
            providerId,
            defaultBaseUrl: customDef?.defaultBaseUrl || "",
            defaultModels: customDef?.models || {},
          }),
        )
      : adapt(
          createGenericProvider({
            providerId,
            defaultBaseUrl: customDef?.defaultBaseUrl || "",
          }),
        );
    PROVIDERS.set(providerId, dynamic);
    return dynamic;
  }
  const error = new Error(`Unsupported provider: ${providerId}`);
  error.code = "providerUnsupported";
  throw error;
}

export async function getRegisteredProviderConfig(message) {
  try {
    return await providerFor(message?.providerId).getConfig(message);
  } catch {
    return { configured: false, persistence: "session" };
  }
}

export function saveRegisteredProviderConfig(message) {
  return providerFor(message?.providerId).saveConfig(message);
}

export function clearRegisteredProviderConfig(message) {
  return providerFor(message?.providerId).clearConfig(message);
}

export function testRegisteredProvider(message) {
  return providerFor(message?.providerId).test(message);
}

/**
 * Which providers implement a restricted medium.
 *
 * Audio is 302.AI-only; every other medium is open to any provider.
 */
function isMediaProviderAllowed(providerId, mediaType) {
  if (mediaType === API_MEDIA_TYPE.AUDIO) {
    return providerId === PROVIDER_ID.AI_302;
  }
  if (mediaType === API_MEDIA_TYPE.MODEL_3D) {
    // DashScope's Tripo models are a real 3D path; listing them in the
    // catalogue without admitting the provider here is what once left them
    // selectable but rejected on submit.
    return (
      providerId === PROVIDER_ID.AI_302 ||
      providerId === PROVIDER_ID.DASHSCOPE ||
      providerId === PROVIDER_ID.LOCAL
    );
  }
  return true;
}

export function listRegisteredProviderModels(message) {
  if (
    message?.providerId &&
    !isMediaProviderAllowed(message.providerId, message?.mediaType)
  ) {
    return Promise.resolve({ models: [] });
  }
  return providerFor(message?.providerId).listModels(message);
}

export function submitRegisteredProviderJob(message) {
  assertMediaProvider(message);
  return providerFor(message?.providerId).submitJob(message);
}

function assertMediaProvider(message) {
  if (
    message?.providerId &&
    !isMediaProviderAllowed(message.providerId, message.mediaType)
  ) {
    const error = new Error("providerUnsupportedMedia");
    error.code = "providerUnsupportedMedia";
    throw error;
  }
}

/**
 * Runs a text job as a stream, calling `onChunk({ text, reasoning })` with the
 * accumulated answer as it arrives.
 *
 * A provider without an SSE endpoint still answers here: its buffered result
 * is reported as a single chunk, so callers never need two code paths.
 */
export async function streamRegisteredProviderJob(message, { onChunk } = {}) {
  const provider = providerFor(message?.providerId);
  if (typeof provider.streamJob === "function") {
    // The two callbacks report their own half of the answer; the merged pair
    // is what a listener wants, so the halves are held here.
    let text = "";
    let reasoning = "";
    return provider.streamJob({
      mediaType: message?.mediaType,
      request: message?.request,
      onChunk: (accumulated) => {
        text = accumulated ?? text;
        onChunk?.({ text, reasoning });
      },
      onReasoning: (_delta, accumulated) => {
        reasoning = accumulated ?? reasoning;
        onChunk?.({ text, reasoning });
      },
    });
  }
  const result = await provider.submitJob(message);
  const text = result?.text?.trim() ?? "";
  if (text) onChunk?.({ text });
  return { ...result, text };
}

export function fetchRegisteredProviderJob(message) {
  assertMediaProvider(message);
  return providerFor(message?.providerId).fetchJob(message);
}

/** ASR transcription: only DashScope implements it (paraformer). */
export function submitRegisteredAsrJob(message) {
  return providerFor(PROVIDER_ID.DASHSCOPE).submitAsr(message);
}

export function fetchRegisteredAsrJob(message) {
  return providerFor(PROVIDER_ID.DASHSCOPE).fetchAsr(message);
}
