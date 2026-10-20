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
    url: `${MODEL_BASE_URL}/realesrgan-compact-2x.onnx`,
    bytes: 16_800_000,
    labelKey: "editor.upscale.2x",
    hintKey: "editor.upscale.2xHint",
  },
  {
    id: "realesrgan-compact-4x",
    scale: 4,
    url: `${MODEL_BASE_URL}/realesrgan-compact-4x.onnx`,
    bytes: 17_100_000,
    labelKey: "editor.upscale.4x",
    hintKey: "editor.upscale.4xHint",
  },
];

export function resolveUpscaleModel(scale = 2) {
  return UPSCALE_MODELS.find((m) => m.scale === scale) ?? UPSCALE_MODELS[0];
}
