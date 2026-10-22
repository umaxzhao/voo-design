import { MODEL_BASE_URL } from "../../shared/app_endpoints.js";

/**
 * The Super-Resolution (Upscale) models the editor can run.
 *
 * Compact Real-ESRGAN / Compact SR models optimized for edge execution.
 * Includes WebGPU and WASM support, Cache Storage retention, and scale factors (2x, 4x).
 */

export const UPSCALE_MODELS = [
  {
    id: "realesrgan-compact-2x",
    scale: 2,
    category: "general",
    url: `${MODEL_BASE_URL}/realesrgan-compact-2x.onnx`,
    bytes: 16_800_000,
    labelKey: "editor.upscale.2x",
    hintKey: "editor.upscale.2xHint",
  },
  {
    id: "realesrgan-compact-4x",
    scale: 4,
    category: "general",
    url: `${MODEL_BASE_URL}/realesrgan-compact-4x.onnx`,
    bytes: 17_100_000,
    labelKey: "editor.upscale.4x",
    hintKey: "editor.upscale.4xHint",
  },
  {
    id: "realesrgan-anime-4x",
    scale: 4,
    category: "anime",
    url: `${MODEL_BASE_URL}/realesrgan-anime-4x.onnx`,
    bytes: 17_500_000,
    labelKey: "editor.upscale.anime",
    hintKey: "editor.upscale.animeHint",
  },
];

export function resolveUpscaleModel(target = 2) {
  if (typeof target === "string") {
    return UPSCALE_MODELS.find((m) => m.id === target) ?? UPSCALE_MODELS[0];
  }
  if (typeof target === "object" && target !== null) {
    if (target.modelId) {
      return (
        UPSCALE_MODELS.find((m) => m.id === target.modelId) ?? UPSCALE_MODELS[0]
      );
    }
    if (typeof target.scale === "number") {
      return (
        UPSCALE_MODELS.find((m) => m.scale === target.scale) ?? UPSCALE_MODELS[0]
      );
    }
  }
  return UPSCALE_MODELS.find((m) => m.scale === target) ?? UPSCALE_MODELS[0];
}
