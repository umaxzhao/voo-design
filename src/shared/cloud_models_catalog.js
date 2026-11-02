/**
 * VOO Cloud models catalog client, filtering, pricing and caching.
 *
 * Contract:
 * GET {VOO}/v1/ai/models
 * Returns: { items: [{ id, label, kind: "text"|"image"|"video"|"audio", upstream, priceUnit, priceCredits, note? }], updatedAt }
 */

import {
  vooServiceBaseUrl,
  readBrowserAuthToken,
} from "./providers/provider_credentials.js";
import { isOpenAIImageModel } from "./providers/provider_openai_image.js";
import { isGoogleModel } from "./providers/provider_google_adapter.js";
import { isArkModel } from "./providers/provider_ark_adapter.js";
import { isDashScopeModel } from "./providers/provider_dashscope_adapter.js";
import {
  cloudModelReleaseDate,
  isRecentCloudReleaseDate,
} from "./cloud_model_release.js";

export const CLOUD_MODELS_CACHE_KEY = "voo.cloud_models.cached_catalog";

/**
 * Centrally maintained registry of model IDs that the client actually has adapters for
 * in credits / cloud mode. Models returned by upstream catalog without a client adapter
 * are filtered out so users cannot select a non-functional model.
 */
export const SUPPORTED_CLOUD_MODEL_IDS = new Set([
  // Text / Agent (DeepSeek, 302, Google, Ark, DashScope adapters)
  "deepseek-v4-flash",
  "deepseek-v4-flash-vision-exp",
  "deepseek-v4-pro",
  "deepseek-chat",
  "deepseek-reasoner",
  "deepseek-flash",
  "deepseek-v3",
  "deepseek-v3-250324",
  "deepseek-r1",
  "deepseek-r1-250528",
  "qwen-plus",
  "qwen-max",
  "qwen-turbo",
  "qwen-flash",
  "qwen3.8-flash",
  "qwen3.8",
  "kimi-k3",
  "kimi3",
  "kimi-k3-pro",
  "glm-5.3",
  "glm-5",
  "glm-4-plus",
  "glm-4-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "doubao-seed-2-1-pro-260628",
  "doubao-seed-2-1-turbo-260628",
  "doubao-pro-32k-241215",
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-5-sonnet-20241022",
  "claude-3.5-sonnet",
  // 302.AI's Anthropic models (ids verbatim from its catalogue, 2026-09-29).
  // Without an entry here the catalog filter drops them client-side and they
  // never reach the picker, however the server prices them.
  "claude-opus-5-5",
  "claude-sonnet-5-5",

  // Image (302 async image, OpenAI image, Google image, Ark Seedream, DashScope Qwen image)
  "doubao-seedream-5-0-pro-260628",
  "doubao-seedream-5-0-260128",
  "qwen-image-3.0-pro",
  "qwen-image-3.0",
  "qwen-image-2.0-pro",
  "qwen-image-2.0",
  "wan2.7-image-pro",
  "wan2.7-image",
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3.1-flash-image-preview",
  "Flux-2-Klein-4B",
  "Grok-Imagine-Image",
  "Z-Image-Turbo",
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare",
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",

  // Video (302 video, Ark Seedance, DashScope Wan video)
  "kling-o3",
  "kling-2.6",
  "wan3.0-video",
  "wan3.0-video-prime",
  "MiniMax-H3",
  "doubao-seedance-2-5-260628",
  "doubao-seedance-2-0-260128",
  "happyhorse-1.0-r2v",

  // Audio (302 Suno music & TTS speech adapter)
  "chirp-crow",
  "suno-v4",
  "suno-v5",
  "tts-1",

  // 3D (302 Tripo adapter)
  "v3.0-20250812",
]);

/**
 * Checks whether a model (or model ID) is supported by existing client adapters.
 *
 * @param {object|string} modelOrId
 * @returns {boolean}
 */
export function isSupportedCloudModel(modelOrId) {
  if (!modelOrId) return false;
  const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
  if (!id || typeof id !== "string") return false;
  if (SUPPORTED_CLOUD_MODEL_IDS.has(id)) return true;
  if (isOpenAIImageModel(id)) return true;
  if (isGoogleModel(id)) return true;
  if (isArkModel(id)) return true;
  if (isDashScopeModel(id)) return true;
  return false;
}

/**
 * Filters model list to only those with working client adapters.
 *
 * @param {Array} items
 * @returns {Array}
 */
export function filterSupportedCloudModels(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(isSupportedCloudModel);
}

/** Keep the public catalog, stale cache, and offline fallback on the same date policy. */
export function filterRecentCloudModels(items, now = new Date()) {
  return filterSupportedCloudModels(items).filter((item) =>
    isRecentCloudReleaseDate(cloudModelReleaseDate(item), now),
  );
}

/**
 * Hardcoded verified fallback list for offline or degraded network conditions.
 */
export const DEFAULT_FALLBACK_CLOUD_MODELS = Object.freeze([
  // Text / Agent
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    kind: "text",
    upstream: "deepseek",
    priceUnit: "token",
    priceCredits: { input: 1, output: 2 },
  },
  {
    id: "qwen3.8-flash",
    label: "Qwen 3.8 Flash",
    kind: "text",
    upstream: "dashscope",
    priceUnit: "token",
    priceCredits: { input: 1, output: 2 },
  },
  {
    id: "kimi-k3",
    label: "Kimi 3 (K3)",
    kind: "text",
    upstream: "302",
    priceUnit: "token",
    priceCredits: { input: 2, output: 8 },
  },
  {
    id: "glm-5.3",
    label: "GLM 5.3",
    kind: "text",
    upstream: "302",
    priceUnit: "token",
    priceCredits: { input: 2, output: 8 },
  },
  {
    id: "deepseek-chat",
    label: "DeepSeek Chat",
    kind: "text",
    upstream: "302",
    priceUnit: "token",
    priceCredits: { input: 2, output: 8 },
  },
  {
    id: "deepseek-reasoner",
    label: "DeepSeek R1",
    kind: "text",
    upstream: "deepseek",
    priceUnit: "token",
    priceCredits: { input: 4, output: 16 },
  },
  {
    id: "qwen-plus",
    label: "Qwen Plus",
    kind: "text",
    upstream: "dashscope",
    priceUnit: "token",
    priceCredits: { input: 1, output: 4 },
  },
  {
    id: "glm-4-plus",
    label: "GLM-4 Plus",
    kind: "text",
    upstream: "302",
    priceUnit: "token",
    priceCredits: { input: 2, output: 8 },
  },
  // Image
  {
    id: "doubao-seedream-5-0-pro-260628",
    label: "Seedream 5.0 Pro",
    kind: "image",
    upstream: "302",
    priceUnit: "image",
    priceCredits: 1,
  },
  {
    id: "qwen-image-3.0-pro",
    label: "Qwen 3.0 Pro",
    kind: "image",
    upstream: "302",
    priceUnit: "image",
    priceCredits: 2,
  },
  {
    id: "gemini-3.1-flash-image-preview",
    label: "Gemini 3.1 Flash Image",
    kind: "image",
    upstream: "302",
    priceUnit: "image",
    priceCredits: 1,
  },
  {
    id: "gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    kind: "image",
    upstream: "302",
    priceUnit: "image",
    priceCredits: 1,
  },
  // Video
  {
    id: "wan3.0-video",
    label: "Wan 3.0 Video",
    kind: "video",
    upstream: "302",
    priceUnit: "second",
    priceCredits: 1,
  },
  // Audio
  {
    id: "chirp-crow",
    label: "Suno v5 (Music)",
    kind: "audio",
    upstream: "302",
    priceUnit: "audio",
    priceCredits: 10,
  },
  {
    id: "tts-1",
    label: "TTS (Speech)",
    kind: "audio",
    upstream: "302",
    priceUnit: "audio",
    priceCredits: 1,
  },
]);

/**
 * Unified label formatter for cloud models.
 * In cloud mode, all cloud models are displayed as "VOO · {modelName}",
 * replacing upstream provider prefixes (302.AI, DashScope, OpenAI, DeepSeek, etc.).
 *
 * @param {string|object} modelOrName
 * @param {string} [platform="VOO"]
 * @returns {string}
 */
export function formatCloudModelLabel(modelOrName, platform = "VOO") {
  if (!modelOrName) return platform;
  const raw =
    typeof modelOrName === "string"
      ? modelOrName
      : modelOrName.label || modelOrName.name || modelOrName.id || "";
  if (!raw) return platform;
  if (raw.startsWith(`${platform} · `)) return raw;
  const stripped = raw.replace(
    /^(302\.AI|302|DashScope|OpenAI|DeepSeek|MiniMax|Volcengine|火山方舟|智谱|智谱 AI|魔搭|魔搭社区|Zhipu|Moonshot|Kimi|VOO 云端|VOO Cloud)\s*·\s*/i,
    "",
  );
  return `${platform} · ${stripped}`;
}

/**
 * Formats model pricing for presentation using i18n keys and tabular-nums.
 *
 * Rules:
 * - Image models with approxPerImageCredits: "约 {credits} 积分 / 张"
 * - Image models with priceUnit=image: "{credits} 积分 / 张"
 * - Image models with raw token pricing and no approxPerImageCredits: degrade to empty (do not confuse user)
 * - Video models with priceUnit=second: "{credits} 积分 / 秒"
 * - Video models with priceUnit=1m_video_tokens: "{credits} 积分 / 百万 token"
 * - Text models with token object pricing (1k_input_tokens / 1k_tokens): "输入 a / 输出 b 积分 / 千 token"
 * - Text models with token object pricing (1m_tokens): "输入 a / 输出 b 积分 / 1M tokens"
 * - Missing fields: degrade gracefully by returning empty string.
 *
 * @param {object} model
 * @param {function} t i18n lookup function
 * @returns {string}
 */
export function formatCloudModelPrice(model, t) {
  if (!model || typeof model !== "object") return "";
  const { priceUnit, priceCredits, approxPerImageCredits, kind } = model;

  const translate =
    typeof t === "function"
      ? t
      : (k, params) => {
          if (k === "settings.cloudModels.approxPricePerImage")
            return `约 ${params.credits} 积分 / 张`;
          if (k === "settings.cloudModels.priceTokensPerThousand")
            return `输入 ${params.input} / 输出 ${params.output} 积分 / 千 token`;
          if (k === "settings.cloudModels.priceTokensInOut")
            return `输入 ${params.input} / 输出 ${params.output} 积分 / 1M tokens`;
          if (k === "settings.cloudModels.priceVideoTokens")
            return `${params.credits} 积分 / 百万 token`;
          if (k === "settings.cloudModels.pricePerImage")
            return `${params.credits} 积分 / 张`;
          if (k === "settings.cloudModels.pricePerSecond")
            return `${params.credits} 积分 / 秒`;
          if (k === "settings.cloudModels.pricePerSong")
            return `${params.credits} 积分 / 首`;
          if (k === "settings.cloudModels.pricePerAudio")
            return `${params.credits} 积分 / 条`;
          return `${params?.credits ?? ""} credits`;
        };

  // 1. If approxPerImageCredits is present (e.g. gpt-image series)
  if (approxPerImageCredits !== undefined && approxPerImageCredits !== null) {
    const num = Number(approxPerImageCredits);
    const formatted = Number.isFinite(num)
      ? String(num)
      : String(approxPerImageCredits);
    return translate("settings.cloudModels.approxPricePerImage", {
      credits: formatted,
    });
  }

  // 2. Image model with token-only pricing without approx: degrade gracefully to empty string
  if (
    kind === "image" &&
    (priceUnit === "1k_input_tokens" ||
      priceUnit === "1k_tokens" ||
      priceUnit === "token")
  ) {
    return "";
  }

  if (priceCredits === undefined || priceCredits === null) {
    return "";
  }

  // 3. Object pricing: { input, output } for tokens
  if (typeof priceCredits === "object") {
    const input = priceCredits.input ?? 0;
    const output = priceCredits.output ?? 0;
    if (
      priceUnit === "1k_input_tokens" ||
      priceUnit === "1k_tokens" ||
      priceUnit === "1k"
    ) {
      return translate("settings.cloudModels.priceTokensPerThousand", {
        input,
        output,
      });
    }
    if (priceUnit === "1m_tokens" || priceUnit === "1m") {
      return translate("settings.cloudModels.priceTokensInOut", {
        input,
        output,
      });
    }
    return translate("settings.cloudModels.priceTokensInOut", {
      input,
      output,
    });
  }

  const numCredits = Number(priceCredits);
  const formattedNum = Number.isFinite(numCredits) ? String(numCredits) : "0";

  if (priceUnit === "1m_video_tokens") {
    return translate("settings.cloudModels.priceVideoTokens", {
      credits: formattedNum,
    });
  }

  if (priceUnit === "1m_tokens") {
    return translate("settings.cloudModels.pricePerTokens", {
      credits: formattedNum,
    });
  }

  if (
    priceUnit === "1k_input_tokens" ||
    priceUnit === "1k_tokens" ||
    priceUnit === "1k"
  ) {
    return translate("settings.cloudModels.priceTokensPerThousandNum", {
      credits: formattedNum,
    });
  }

  if (priceUnit === "token" || priceUnit === "tokens" || kind === "text") {
    return translate("settings.cloudModels.pricePerTokens", {
      credits: formattedNum,
    });
  }

  if (priceUnit === "second" || priceUnit === "sec" || kind === "video") {
    return translate("settings.cloudModels.pricePerSecond", {
      credits: formattedNum,
    });
  }

  if (priceUnit === "image" || priceUnit === "img" || kind === "image") {
    return translate("settings.cloudModels.pricePerImage", {
      credits: formattedNum,
    });
  }

  if (priceUnit === "song") {
    return translate("settings.cloudModels.pricePerSong", {
      credits: formattedNum,
    });
  }

  if (priceUnit === "audio" || kind === "audio") {
    if (model.id === "chirp-crow") {
      return translate("settings.cloudModels.pricePerSong", {
        credits: formattedNum,
      });
    }
    return translate("settings.cloudModels.pricePerAudio", {
      credits: formattedNum,
    });
  }

  return `${formattedNum} credits`;
}

/**
 * Groups models by kind: text, image, video, audio.
 *
 * @param {Array} items
 * @returns {{ text: Array, image: Array, video: Array, audio: Array }}
 */
export function groupCloudModels(items = []) {
  const groups = {
    text: [],
    image: [],
    video: [],
    audio: [],
  };

  for (const item of items) {
    if (!item?.id) continue;
    const kind = item.kind || "text";
    if (groups[kind]) {
      groups[kind].push(item);
    }
  }

  return groups;
}

/**
 * Loads cached catalog from localStorage with safety guard.
 */
export function loadCachedCloudCatalog() {
  try {
    const raw = globalThis.localStorage?.getItem(CLOUD_MODELS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Model pickers must recheck age even when the catalog was cached earlier. */
export function loadRecentCachedCloudCatalog(now = new Date()) {
  const cached = loadCachedCloudCatalog();
  return cached ? { ...cached, items: filterRecentCloudModels(cached.items, now) } : null;
}

/**
 * Saves successful catalog response to localStorage cache.
 */
export function saveCachedCloudCatalog(data, now = new Date()) {
  try {
    if (data && Array.isArray(data.items)) {
      globalThis.localStorage?.setItem(
        CLOUD_MODELS_CACHE_KEY,
        JSON.stringify({
          items: filterRecentCloudModels(data.items, now),
          updatedAt: data.updatedAt || new Date().toISOString(),
          cachedAt: Date.now(),
        }),
      );
    }
  } catch {
    // Non-fatal if localStorage is full or disabled
  }
}

/**
 * Fetches cloud models catalog from VOO service, falling back gracefully to cache or defaults.
 *
 * @param {object} options
 * @param {function} [options.fetchFn=globalThis.fetch]
 * @returns {Promise<{ items: Array, updatedAt: string|null, error: string|null, isCached: boolean, isFallback: boolean }>}
 */
export async function fetchCloudModelsCatalog({ fetchFn = globalThis.fetch, now = new Date() } = {}) {
  const url = vooServiceBaseUrl("ai/models");
  const token = readBrowserAuthToken();

  try {
    const headers = {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const response = await fetchFn(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawItems = Array.isArray(data?.items) ? data.items : [];
    const filteredItems = filterRecentCloudModels(rawItems, now);

    saveCachedCloudCatalog({
      items: filteredItems,
      updatedAt: data?.updatedAt,
    }, now);

    return {
      items: filteredItems,
      updatedAt: data?.updatedAt || null,
      error: null,
      isCached: false,
      isFallback: false,
    };
  } catch (err) {
    const errorMsg = err?.message || "fetch_failed";

    // 1. Try localStorage cache
    const cached = loadRecentCachedCloudCatalog(now);
    if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
      return {
        items: cached.items,
        updatedAt: cached.updatedAt || null,
        error: errorMsg,
        isCached: true,
        isFallback: false,
      };
    }

    // 2. Fall back to static defaults
    return {
      items: filterRecentCloudModels(DEFAULT_FALLBACK_CLOUD_MODELS, now),
      updatedAt: null,
      error: errorMsg,
      isCached: false,
      isFallback: true,
    };
  }
}

/**
 * Resolves the exact UTC Date corresponding to hour:minute in a specific IANA timezone
 * on the calendar day matching referenceDate in that timezone.
 * Uses Intl.DateTimeFormat iteratively; avoids manual offset arithmetic.
 *
 * @param {Date} referenceDate
 * @param {number|string} hour
 * @param {number|string} minute
 * @param {string} [targetTz="Asia/Shanghai"]
 * @returns {Date}
 */
export function getEpochForTimeInTz(
  referenceDate,
  hour,
  minute,
  targetTz = "Asia/Shanghai",
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: targetTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(referenceDate);
  const p = {};
  for (const part of parts) p[part.type] = part.value;
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);

  let guess = new Date(
    Date.UTC(year, month - 1, day, Number(hour), Number(minute)),
  );
  for (let i = 0; i < 3; i++) {
    const curParts = new Intl.DateTimeFormat("en-US", {
      timeZone: targetTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(guess);
    const cp = {};
    for (const part of curParts) cp[part.type] = part.value;
    const diffMs =
      Date.UTC(year, month - 1, day, Number(hour), Number(minute)) -
      Date.UTC(
        Number(cp.year),
        Number(cp.month) - 1,
        Number(cp.day),
        Number(cp.hour),
        Number(cp.minute),
      );
    if (diffMs === 0) break;
    guess = new Date(guess.getTime() + diffMs);
  }
  return guess;
}

/**
 * Checks whether reference moment falls in [startHHMM, endHHMM) in timezone tz.
 * Properly supports both same-day windows (e.g. 00:30 - 08:30) and
 * midnight-crossing windows (e.g. 23:00 - 07:00).
 *
 * @param {Date} now
 * @param {string} startHHMM
 * @param {string} endHHMM
 * @param {string} [tz="Asia/Shanghai"]
 * @returns {boolean}
 */
export function isTimeInScheduleWindow(
  now,
  startHHMM,
  endHHMM,
  tz = "Asia/Shanghai",
) {
  if (!startHHMM || !endHHMM) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = {};
  for (const part of parts) p[part.type] = part.value;
  const currentMinutes = Number(p.hour) * 60 + Number(p.minute);

  const [sH, sM] = startHHMM.split(":").map(Number);
  const [eH, eM] = endHHMM.split(":").map(Number);
  const startMinutes = sH * 60 + sM;
  const endMinutes = eH * 60 + eM;

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  if (startMinutes > endMinutes) {
    // Crosses midnight
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  return true;
}

/**
 * Evaluates current schedule tier for a model.
 * Returns null if model does not have a schedule (clean degradation).
 *
 * @param {object} model
 * @param {Date} [now=new Date()]
 * @returns {object|null}
 */
export function getCurrentScheduleTier(model, now = new Date()) {
  if (!model || !Array.isArray(model.schedule) || model.schedule.length === 0) {
    return null;
  }
  const defaultTz = model.schedule[0]?.tz || "Asia/Shanghai";
  for (const item of model.schedule) {
    const tz = item.tz || defaultTz;
    if (isTimeInScheduleWindow(now, item.startHHMM, item.endHHMM, tz)) {
      return {
        isOffpeak: true,
        label: item.label || "闲时",
        tier: "offpeak",
        multiplier: item.multiplier ?? 0.5,
        priceCredits: item.priceCredits,
        approxPerImageCredits: item.approxPerImageCredits,
        startHHMM: item.startHHMM,
        endHHMM: item.endHHMM,
        tz,
      };
    }
  }
  return {
    isOffpeak: false,
    label: "高峰",
    tier: "peak",
    multiplier: 1,
    priceCredits: model.priceCredits,
    approxPerImageCredits: model.approxPerImageCredits,
    tz: defaultTz,
  };
}

/**
 * Finds the earliest upcoming schedule state change (start or end of any schedule window).
 * Returns null if model does not have a schedule.
 *
 * @param {object} model
 * @param {Date} [now=new Date()]
 * @returns {{ date: Date, toTier: string, label: string, tz: string }|null}
 */
export function getNextScheduleTransition(model, now = new Date()) {
  if (!model || !Array.isArray(model.schedule) || model.schedule.length === 0) {
    return null;
  }
  const defaultTz = model.schedule[0]?.tz || "Asia/Shanghai";
  const transitions = [];

  for (const dayOffset of [-1, 0, 1, 2]) {
    const baseDate = new Date(now.getTime() + dayOffset * 86400000);
    for (const item of model.schedule) {
      const itemTz = item.tz || defaultTz;
      // A schedule entry without times is not a transition window; skipping
      // it keeps a partial/legacy catalogue payload from crashing the viewer.
      if (!item?.startHHMM || !item?.endHHMM) continue;
      const [sH, sM] = item.startHHMM.split(":").map(Number);
      const [eH, eM] = item.endHHMM.split(":").map(Number);
      transitions.push({
        date: getEpochForTimeInTz(baseDate, sH, sM, itemTz),
        toTier: "offpeak",
        label: item.label || "闲时",
        tz: itemTz,
      });
      transitions.push({
        date: getEpochForTimeInTz(baseDate, eH, eM, itemTz),
        toTier: "peak",
        label: "高峰",
        tz: itemTz,
      });
    }
  }

  const upcoming = transitions
    .filter((t) => t.date.getTime() > now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return upcoming[0] || null;
}

/**
 * Formats next switch time string (e.g. "08:30 切换" or "次日 00:30 切换").
 *
 * @param {Date} transitionDate
 * @param {Date} [now=new Date()]
 * @param {function} [t]
 * @returns {string}
 */
export function formatNextSwitchTime(transitionDate, now = new Date(), t) {
  if (!transitionDate) return "";
  const translate =
    typeof t === "function"
      ? t
      : (k, p) => {
          if (k === "settings.cloudModels.scheduleNextSwitchTomorrow")
            return `次日 ${p.time} 切换`;
          return `${p.time} 切换`;
        };

  const timeStr = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(transitionDate);

  const nowDateParts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const transDateParts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(transitionDate);

  const nowDay = nowDateParts.find((part) => part.type === "day")?.value;
  const transDay = transDateParts.find((part) => part.type === "day")?.value;

  if (nowDay !== transDay) {
    return translate("settings.cloudModels.scheduleNextSwitchTomorrow", {
      time: timeStr,
    });
  }
  return translate("settings.cloudModels.scheduleNextSwitch", {
    time: timeStr,
  });
}

/**
 * Formats detailed multi-line explanation for InfoHint tooltip.
 * Converts time windows to user local timezone, and includes original timezone.
 *
 * @param {object} model
 * @param {function} [t]
 * @param {string} [userTimezone]
 * @returns {string}
 */
export function formatScheduleDetailsHint(model, t, userTimezone = undefined) {
  if (!model || !Array.isArray(model.schedule) || model.schedule.length === 0) {
    return "";
  }
  const translate =
    typeof t === "function"
      ? t
      : (k, p) => {
          if (k === "settings.cloudModels.scheduleTierOffpeak") return "闲时";
          if (k === "settings.cloudModels.scheduleTierPeak") return "高峰";
          if (k === "settings.cloudModels.originalTimezone")
            return `原时区 ${p.tz}`;
          if (k === "settings.cloudModels.localTimezone") return `本地 ${p.tz}`;
          return k;
        };

  const localTz =
    userTimezone ||
    (typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "Asia/Shanghai") ||
    "Asia/Shanghai";
  const defaultTz = model.schedule[0]?.tz || "Asia/Shanghai";
  const now = new Date();

  const lines = [];

  for (const item of model.schedule) {
    const itemTz = item.tz || defaultTz;
    // Same guard as the transition reader: an entry without times is skipped
    // rather than parsed.
    if (!item?.startHHMM || !item?.endHHMM) continue;
    const [sH, sM] = item.startHHMM.split(":").map(Number);
    const [eH, eM] = item.endHHMM.split(":").map(Number);

    const startDate = getEpochForTimeInTz(now, sH, sM, itemTz);
    const endDate = getEpochForTimeInTz(now, eH, eM, itemTz);

    const startLocal = new Intl.DateTimeFormat("en-US", {
      timeZone: localTz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(startDate);
    const endLocal = new Intl.DateTimeFormat("en-US", {
      timeZone: localTz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(endDate);

    let timeRangeText = "";
    if (localTz === itemTz) {
      timeRangeText = `${item.startHHMM} - ${item.endHHMM} (${itemTz})`;
    } else {
      const origTzNote = translate("settings.cloudModels.originalTimezone", {
        tz: itemTz,
      });
      const localTzNote = translate("settings.cloudModels.localTimezone", {
        tz: localTz,
      });
      timeRangeText = `${startLocal} - ${endLocal} (${localTzNote}) · ${origTzNote} ${item.startHHMM} - ${item.endHHMM}`;
    }

    const tierModel = {
      ...model,
      priceCredits:
        item.priceCredits ??
        (typeof model.priceCredits === "number" && item.multiplier
          ? Math.round(model.priceCredits * item.multiplier * 100) / 100
          : model.priceCredits),
      approxPerImageCredits:
        item.approxPerImageCredits ??
        (model.approxPerImageCredits !== undefined && item.multiplier
          ? Math.round(
              Number(model.approxPerImageCredits) * item.multiplier * 100,
            ) / 100
          : model.approxPerImageCredits),
    };
    const tierPrice = formatCloudModelPrice(tierModel, t);
    const tierLabel =
      item.label || translate("settings.cloudModels.scheduleTierOffpeak");
    lines.push(`${tierLabel}: ${timeRangeText} · ${tierPrice}`);
  }

  const peakLabel = translate("settings.cloudModels.scheduleTierPeak");
  const peakPrice = formatCloudModelPrice(model, t);
  lines.push(`${peakLabel}: ${peakPrice}`);

  return lines.join("\n");
}
