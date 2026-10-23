/**
 * Non-destructive live filter stack (Affinity Live Filters–style).
 *
 * Ordered, toggleable, opacity-blendable filter entries applied as pure
 * buffer ops. Render integration is optional: callers that already hold an
 * RGBA buffer (export, bake, tests) can run `applyLiveFilterStack` after the
 * tone adjustment path. Hot scene render does not call this yet — wire it
 * through `tone.liveFilters` only once a node field is persisted.
 */
import {
  applyBoxBlur,
  applySharpen,
  applyHighPass,
  applyClarity,
  applyMotionBlur,
} from "./spatial_filter.js";
import { applyNoise, applyPixelate, applySepia } from "./pixel_filter.js";

/** Kinds we support as stack entries (must have a matching apply*). */
export const LIVE_FILTER_KINDS = Object.freeze([
  "blur",
  "sharpen",
  "noise",
  "highPass",
  "clarity",
  "motionBlur",
  "sepia",
  "pixelate",
]);

/**
 * @param {string} kind
 * @param {object} [params]
 * @returns {{id: string, kind: string, enabled: boolean, opacity: number, params: object}}
 */
export function createLiveFilterEntry(kind, params = {}) {
  const {
    id = crypto.randomUUID(),
    enabled = true,
    opacity = 1,
    ...rest
  } = params;
  return {
    id,
    kind,
    enabled: Boolean(enabled),
    opacity: clamp01(opacity),
    params: rest,
  };
}

/** Drop unknown kinds; clamp opacity; ensure id/enabled/params. */
export function normalizeLiveFilterStack(stack) {
  if (!Array.isArray(stack)) return [];
  return stack
    .filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        LIVE_FILTER_KINDS.includes(entry.kind),
    )
    .map((entry) => ({
      id:
        typeof entry.id === "string" && entry.id
          ? entry.id
          : crypto.randomUUID(),
      kind: entry.kind,
      enabled: entry.enabled !== false,
      opacity: clamp01(entry.opacity ?? 1),
      params:
        entry.params && typeof entry.params === "object" ? entry.params : {},
    }));
}

/**
 * Apply enabled stack entries in order to an RGBA buffer (in place).
 * Opacity < 1 blends each entry's result with the pre-entry buffer.
 *
 * @param {Uint8ClampedArray|Uint8Array} data
 * @param {number} width
 * @param {number} height
 * @param {Array} stack
 * @returns {Uint8ClampedArray|Uint8Array}
 */
export function applyLiveFilterStack(data, width, height, stack) {
  if (!data || !width || !height || !Array.isArray(stack) || stack.length === 0) {
    return data;
  }
  const expected = width * height * 4;
  if (data.length < expected) {
    throw new Error(
      `applyLiveFilterStack: buffer length ${data.length} < ${expected}`,
    );
  }

  for (const entry of stack) {
    if (!entry?.enabled) continue;
    const opacity = clamp01(entry.opacity ?? 1);
    const params = entry.params || {};
    const value = Number(params.value ?? params.amount ?? params.radius ?? 50);
    const pre = opacity < 1 ? Uint8ClampedArray.from(data) : null;

    switch (entry.kind) {
      case "blur":
        applyBoxBlur(data, width, height, Math.max(0, value));
        break;
      case "sharpen":
        // applySharpen expects a 0..1-ish gain factor (same as CPU tone path).
        applySharpen(data, width, height, Math.max(0, value) / 100);
        break;
      case "noise":
        applyNoise(data, width, height, value);
        break;
      case "highPass":
        applyHighPass(data, width, height, value);
        break;
      case "clarity":
        applyClarity(data, width, height, value);
        break;
      case "motionBlur":
        applyMotionBlur(
          data,
          width,
          height,
          value,
          Number(params.angle ?? 0),
        );
        break;
      case "sepia":
        applySepia(data, width, height, value);
        break;
      case "pixelate":
        applyPixelate(data, width, height, value);
        break;
      default:
        break;
    }

    if (pre && opacity < 1) {
      for (let i = 0; i < expected; i += 1) {
        data[i] = Math.round(data[i] * opacity + pre[i] * (1 - opacity));
      }
    }
  }
  return data;
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
