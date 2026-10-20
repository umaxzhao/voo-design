/**
 * Video duration capabilities, profile resolution and validation across providers.
 *
 * Grounded in provider API documentation and channel contracts:
 * - DashScope Wan 2.1 / Wan 3.0 / Pixverse: fixed 5s (Aliyun DashScope API).
 * - DashScope Vidu: 4s or 8s (Vidu API).
 * - DashScope Kling / HappyHorse: 5s or 10s (DashScope API).
 * - 302.AI MiniMax: fixed 6s (MiniMax Video-01 API).
 * - 302.AI Seedance / Kling / HappyHorse / Runway: 5s or 10s.
 * - 302.AI Sora: 5s, 10s, 15s, 20s.
 * - 302.AI generic video: range 1-30s with 3s/5s/10s presets.
 * - Jimeng (即梦) Web: 5s or 10s (standard 5s, extended 10s).
 * - General Web/Chat (ChatGPT, Gemini): range 1-60s with 3s/5s/10s presets.
 * - Unsupported providers (no video capability): not supported, no parameter sent.
 *
 * @module shared/providers/video_duration
 */

import { PROVIDER_ID } from "../providers.js";
import { EXECUTION_MODE, PLATFORM_TARGET } from "../../canvas/nodes/types.js";

/**
 * Returns the duration profile for a video generation target.
 *
 * @param {object} params
 * @param {string} [params.providerId]
 * @param {string} [params.modelId]
 * @param {string} [params.executionMode]
 * @param {string} [params.platform]
 * @returns {{ supported: boolean, type: "options"|"range"|"none", options: number[], min?: number, max?: number, defaultDuration: null, unit: string }}
 */
export function getVideoDurationProfile({
  providerId,
  modelId,
  executionMode,
  platform,
} = {}) {
  // Web / Chat channels (prompt-directed or browser automation)
  if (executionMode && executionMode !== EXECUTION_MODE.API) {
    if (platform === PLATFORM_TARGET.JIMENG) {
      return {
        supported: true,
        type: "options",
        options: [5, 10],
        defaultDuration: null,
        unit: "s",
      };
    }
    return {
      supported: true,
      type: "range",
      min: 1,
      max: 60,
      options: [3, 5, 10],
      defaultDuration: null,
      unit: "s",
    };
  }

  const pId = providerId ?? PROVIDER_ID.AI_302;
  const mId = (modelId ?? "").toLowerCase();

  if (pId === PROVIDER_ID.LOCAL) {
    return {
      supported: true,
      type: "range",
      min: 1,
      max: 10,
      options: [3, 5, 10],
      defaultDuration: null,
      unit: "s",
    };
  }

  // DashScope video synthesis endpoint
  if (pId === PROVIDER_ID.DASHSCOPE) {
    if (mId.includes("vidu")) {
      return {
        supported: true,
        type: "options",
        options: [4, 8],
        defaultDuration: null,
        unit: "s",
      };
    }
    if (mId.includes("happyhorse") || mId.includes("kling")) {
      return {
        supported: true,
        type: "options",
        options: [5, 10],
        defaultDuration: null,
        unit: "s",
      };
    }
    if (
      mId.includes("wan2.1") ||
      mId.includes("wan2.7") ||
      mId.includes("wan3.0") ||
      mId.includes("wanx") ||
      mId.includes("pixverse")
    ) {
      return {
        supported: true,
        type: "options",
        options: [5],
        defaultDuration: null,
        unit: "s",
      };
    }
    return {
      supported: true,
      type: "options",
      options: [5, 10],
      defaultDuration: null,
      unit: "s",
    };
  }

  // 302.AI video creation endpoint
  if (pId === PROVIDER_ID.AI_302) {
    if (mId.includes("minimax")) {
      return {
        supported: true,
        type: "options",
        options: [6],
        defaultDuration: null,
        unit: "s",
      };
    }
    if (mId.includes("sora")) {
      return {
        supported: true,
        type: "options",
        options: [5, 10, 15, 20],
        defaultDuration: null,
        unit: "s",
      };
    }
    if (
      mId.includes("seedance") ||
      mId.includes("kling") ||
      mId.includes("happyhorse") ||
      mId.includes("runway")
    ) {
      return {
        supported: true,
        type: "options",
        options: [5, 10],
        defaultDuration: null,
        unit: "s",
      };
    }
    if (mId.includes("luma") || mId.includes("wan")) {
      return {
        supported: true,
        type: "options",
        options: [5],
        defaultDuration: null,
        unit: "s",
      };
    }
    return {
      supported: true,
      type: "range",
      min: 1,
      max: 30,
      options: [3, 5, 10],
      defaultDuration: null,
      unit: "s",
    };
  }

  // APIMART
  if (pId === PROVIDER_ID.APIMART) {
    if (mId.includes("kling") || mId.includes("sora")) {
      return {
        supported: true,
        type: "options",
        options: [5, 10],
        defaultDuration: null,
        unit: "s",
      };
    }
    return {
      supported: true,
      type: "options",
      options: [5],
      defaultDuration: null,
      unit: "s",
    };
  }

  // Unsupported providers (for example, text and image-only providers)
  return {
    supported: false,
    type: "none",
    options: [],
    defaultDuration: null,
    unit: "s",
  };
}

/**
 * Validates a video duration value against the target profile.
 *
 * @param {number|string|null|undefined} duration
 * @param {object} context Target options passed to getVideoDurationProfile
 * @returns {{ valid: boolean, duration?: number|null, code?: string, message?: string, allowed?: number[], min?: number, max?: number }}
 */
export function validateVideoDuration(duration, context = {}) {
  // Omitted / null / empty means platform default — always valid
  if (duration === undefined || duration === null || duration === "") {
    return { valid: true, duration: null };
  }

  const sec =
    typeof duration === "string"
      ? Number(duration.replace(/s$/i, "").trim())
      : Number(duration);
  if (!Number.isFinite(sec) || sec <= 0) {
    return {
      valid: false,
      code: "videoDurationInvalid",
      message: "Duration must be a positive number",
      duration: sec,
    };
  }

  const profile = getVideoDurationProfile(context);
  if (!profile.supported) {
    return {
      valid: false,
      code: "videoDurationUnsupported",
      message: "Duration is not supported for this provider or model",
      duration: sec,
    };
  }

  if (profile.type === "options") {
    if (profile.options.includes(sec)) {
      return { valid: true, duration: sec };
    }
    return {
      valid: false,
      code: "videoDurationInvalid",
      message: `Duration must be one of: ${profile.options.map((o) => `${o}s`).join(", ")}`,
      allowed: profile.options,
      duration: sec,
    };
  }

  if (profile.type === "range") {
    if (sec >= profile.min && sec <= profile.max) {
      return { valid: true, duration: sec };
    }
    return {
      valid: false,
      code: "videoDurationInvalid",
      message: `Duration must be between ${profile.min}s and ${profile.max}s`,
      min: profile.min,
      max: profile.max,
      duration: sec,
    };
  }

  return { valid: true, duration: sec };
}

/**
 * Normalizes duration before submitting to a provider.
 * Returns null/undefined if unset or unsupported.
 */
export function sanitizeVideoDuration(duration, context = {}) {
  const result = validateVideoDuration(duration, context);
  if (!result.valid) {
    const error = new Error(result.message);
    error.code = result.code;
    throw error;
  }
  return result.duration != null ? result.duration : undefined;
}
