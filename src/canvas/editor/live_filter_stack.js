/**
 * Non-destructive live filter stack (Affinity Live Filters–style).
 *
 * Ordered, toggleable, opacity-blendable filter entries applied as pure
 * buffer ops. The stack persists on the node's `adjustments.liveFilters`
 * field (normalized/serialized by the scene model); render integration:
 * buildToneLut passes enabled entries on `tone.liveFilters`, forcing the CPU
 * path, and applyAdjustmentKernels runs applyLiveFilterStack dead last on the
 * RGBA buffer. Callers outside render (export, bake, tests) can also run
 * `applyLiveFilterStack` directly.
 */
import { FILTER_KINDS } from "./adjustment_kinds.js";
import {
  applyBoxBlur,
  applySharpen,
  applyHighPass,
  applyClarity,
  applyMotionBlur,
  scaledRadius,
  cpuBlurRadius,
} from "./spatial_filter.js";
import {
  applyNoise,
  applyPixelate,
  applySepia,
  applyClouds,
  applyPosterize,
  applySolarize,
  applyHalftone,
  applyEmboss,
} from "./pixel_filter.js";
import {
  applyMedianFilter,
  applyBloomFilter,
  applyZoomBlurFilter,
  applyTwirlFilter,
  applyDenoiseFilter,
  applyDefringeFilter,
  applyHazeRemovalFilter,
  applyDiffuseGlowFilter,
  applyUnsharpMaskFilter,
} from "./affinity_filters.js";
import { vignetteFactor } from "./tone_lut_vignette.js";

/**
 * Every filter kind is a stack entry now. `FILTER_KINDS` is the single source
 * of truth; the old eight-kind list stays exported for the live-filter i18n
 * tests and for callers that still ask for the GPU-compatible subset.
 */
export const STACK_FILTER_KINDS = Object.freeze([...FILTER_KINDS]);

/** Blend modes a stack entry can composite with (same names as node blends). */
export const STACK_BLEND_MODES = Object.freeze([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
]);

/** Backwards-compatible alias for the original eight-kind stack. */
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
    blendMode = "normal",
    ...rest
  } = params;
  return {
    id,
    kind,
    enabled: Boolean(enabled),
    opacity: clamp01(opacity),
    blendMode: STACK_BLEND_MODES.includes(blendMode) ? blendMode : "normal",
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
        STACK_FILTER_KINDS.includes(entry.kind),
    )
    .map((entry) => ({
      id:
        typeof entry.id === "string" && entry.id
          ? entry.id
          : crypto.randomUUID(),
      kind: entry.kind,
      enabled: entry.enabled !== false,
      opacity: clamp01(entry.opacity ?? 1),
      blendMode: STACK_BLEND_MODES.includes(entry.blendMode)
        ? entry.blendMode
        : "normal",
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
export function applyLiveFilterStack(data, width, height, stack, naturalWidth = width) {
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
    const blendMode = entry.blendMode ?? "normal";
    const needsPre = opacity < 1 || blendMode !== "normal";
    const pre = needsPre ? Uint8ClampedArray.from(data) : null;

    switch (entry.kind) {
      case "blur":
        applyBoxBlur(
          data,
          width,
          height,
          cpuBlurRadius(scaledRadius(Math.max(0, value), width, naturalWidth)),
        );
        break;
      case "sharpen":
        // applySharpen expects a 0..1-ish gain factor (same as CPU tone path).
        applySharpen(data, width, height, Math.max(0, value) / 100);
        break;
      case "noise":
        applyNoise(data, width, height, value);
        break;
      case "clouds":
        applyClouds(data, width, height, value);
        break;
      case "pixelate":
        applyPixelate(data, width, height, value);
        break;
      case "posterize":
        applyPosterize(data, width, height, value);
        break;
      case "solarize":
        applySolarize(data, width, height, value);
        break;
      case "halftone":
        applyHalftone(data, width, height, value);
        break;
      case "sepia":
        applySepia(data, width, height, value);
        break;
      case "emboss":
        applyEmboss(data, width, height, value);
        break;
      case "median":
        applyMedianFilter(data, width, height, value);
        break;
      case "bloom":
        applyBloomFilter(data, width, height, value, naturalWidth);
        break;
      case "zoomBlur":
        applyZoomBlurFilter(data, width, height, value);
        break;
      case "twirl":
        applyTwirlFilter(data, width, height, value);
        break;
      case "denoise":
        applyDenoiseFilter(data, width, height, value);
        break;
      case "defringe":
        applyDefringeFilter(data, width, height, value);
        break;
      case "hazeRemoval":
        applyHazeRemovalFilter(data, width, height, value);
        break;
      case "diffuseGlow":
        applyDiffuseGlowFilter(data, width, height, value, naturalWidth);
        break;
      case "unsharpMask":
        applyUnsharpMaskFilter(data, width, height, value, naturalWidth);
        break;
      case "highPass":
        applyHighPass(data, width, height, value, naturalWidth);
        break;
      case "clarity":
        applyClarity(data, width, height, value, naturalWidth);
        break;
      case "motionBlur":
        applyMotionBlur(
          data,
          width,
          height,
          value,
          Number(params.angle ?? 0),
          naturalWidth,
        );
        break;
      case "vignette":
        applyVignetteFilter(data, width, height, value);
        break;
      default:
        break;
    }

    if (pre && blendMode !== "normal") {
      blendFilterResult(data, pre, blendMode);
    }
    if (pre && opacity < 1) {
      for (let i = 0; i < expected; i += 1) {
        data[i] = Math.round(data[i] * opacity + pre[i] * (1 - opacity));
      }
    }
  }
  return data;
}

/**
 * Composites the filtered buffer (src) over the pre-filter buffer (dst) with
 * one of the standard blend modes. Alpha is untouched; both buffers carry the
 * layer's own coverage, so only RGB is blended.
 */
function blendFilterResult(data, pre, mode) {
  const fn = BLEND_FNS[mode];
  if (!fn) return;
  for (let i = 0; i < data.length; i += 4) {
    const d = [pre[i] / 255, pre[i + 1] / 255, pre[i + 2] / 255];
    const s = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
    data[i] = Math.round(fn(d[0], s[0]) * 255);
    data[i + 1] = Math.round(fn(d[1], s[1]) * 255);
    data[i + 2] = Math.round(fn(d[2], s[2]) * 255);
  }
}

const BLEND_FNS = {
  multiply: (d, s) => d * s,
  screen: (d, s) => 1 - (1 - d) * (1 - s),
  overlay: (d, s) => (d < 0.5 ? 2 * d * s : 1 - 2 * (1 - d) * (1 - s)),
  darken: (d, s) => Math.min(d, s),
  lighten: (d, s) => Math.max(d, s),
  "color-dodge": (d, s) => (d === 0 ? 0 : s >= 1 ? 1 : Math.min(1, d / (1 - s))),
  "color-burn": (d, s) => (d >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - d) / s)),
  "hard-light": (d, s) => (s < 0.5 ? 2 * d * s : 1 - 2 * (1 - d) * (1 - s)),
  "soft-light": (d, s) =>
    s < 0.5
      ? d - (1 - 2 * s) * d * (1 - d)
      : d + (2 * s - 1) * ((d <= 0.25 ? ((16 * d - 12) * d + 4) * d : Math.sqrt(d)) - d),
  difference: (d, s) => Math.abs(d - s),
  exclusion: (d, s) => d + s - 2 * d * s,
};

/** Vignette in the same radial formula the tone LUT and GLSL use. */
function applyVignetteFilter(data, width, height, amount) {
  if (!(amount > 0) || width < 1 || height < 1) return;
  for (let i = 0; i < data.length; i += 4) {
    const pixel = i / 4;
    const nx = ((pixel % width) + 0.5) / width;
    const ny = (Math.floor(pixel / width) + 0.5) / height;
    const factor = vignetteFactor(nx, ny, amount);
    if (factor !== 1) {
      data[i] = Math.min(255, Math.max(0, Math.round(data[i] * factor)));
      data[i + 1] = Math.min(255, Math.max(0, Math.round(data[i + 1] * factor)));
      data[i + 2] = Math.min(255, Math.max(0, Math.round(data[i + 2] * factor)));
    }
  }
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
