/**
 * Local semantic repair for the AI Repair healing mode.
 *
 * LaMa receives a 512px square around the painted mask, so inference stays
 * bounded and the full-resolution source is left untouched outside that area.
 * The model is fetched once, retained in Cache Storage, then runs fully on the
 * user's GPU/WASM runtime without sending artwork to a service.
 */

import { MODEL_BASE_URL } from "../../shared/app_endpoints.js";
import { isLocalAiRepairSupported } from "./ai_capabilities.js";
import { createAiRepairWorkerClient } from "./ai-repair-worker-client.js";
import { AI_REPAIR_MODEL_CACHE } from "./model_cache_names.js";
import {
  loadModelAssetBytes,
  isModelAssetCached,
  deleteModelAsset,
} from "./model_asset_loader.js";

const MODEL_CACHE = AI_REPAIR_MODEL_CACHE;
const INPUT_SIZE = 512;
const MASK_THRESHOLD = 30;

/** Local AI Repair models, selected by the browser's available backend. */
export const AI_REPAIR_MODELS = [
  {
    id: "lama-512-fp16",
    url: `${MODEL_BASE_URL}/lama_512_fp16.onnx`,
    bytes: 110_000_000,
    licence: "Apache-2.0",
    labelKey: "settings.aiRepair.lamaFast",
    hintKey: "settings.aiRepair.lamaFastHint",
    backend: "webgpu",
  },
  {
    id: "lama-512-int8",
    url: `${MODEL_BASE_URL}/lama_512_int8.onnx`,
    bytes: 62_100_000,
    licence: "Apache-2.0",
    labelKey: "settings.aiRepair.lamaCompatible",
    hintKey: "settings.aiRepair.lamaCompatibleHint",
    backend: "wasm",
  },
];

/** Compatibility export for consumers that only need a no-WebGPU fallback. */
export const AI_REPAIR_MODEL = AI_REPAIR_MODELS[1];

export function preferredAiRepairModel() {
  const hasWebGpu = typeof navigator === "object" && Boolean(navigator.gpu) && !failedModels.has("lama-512-fp16");
  return (
    AI_REPAIR_MODELS.find(
      (model) => model.backend === (hasWebGpu ? "webgpu" : "wasm"),
    ) ?? AI_REPAIR_MODEL
  );
}

const workerClient = createAiRepairWorkerClient();
const failedModels = new Set();
let adapterProbe = null;

/** An exposed WebGPU API does not prove the browser can supply an adapter. */
export async function prepareAiRepairModel() {
  if (!adapterProbe) adapterProbe = (async () => {
    if (typeof navigator !== "object" || !navigator.gpu?.requestAdapter) {
      failedModels.add("lama-512-fp16");
      return;
    }
    let timer;
    try {
      const adapter = await Promise.race([
        navigator.gpu.requestAdapter(),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), 1500); }),
      ]);
      if (!adapter?.features?.has("shader-f16")) failedModels.add("lama-512-fp16");
    } catch (error) {
      console.warn("AI Repair GPU probe failed; using the compatible model", error);
      failedModels.add("lama-512-fp16");
    } finally { clearTimeout(timer); }
  })();
  await adapterProbe;
  return preferredAiRepairModel();
}

export { isLocalAiRepairSupported };

export function describeLocalAiRepairBackend() {
  return workerClient.backend();
}

export function releaseLocalAiRepair() {
  workerClient.release();
}

/** Whether the optional AI Repair weights are already available offline. */
export async function isAiRepairModelCached(model = preferredAiRepairModel()) {
  const filename = model.filename || (model.url ? model.url.split("/").pop() : "lama_512_int8.onnx");
  return await isModelAssetCached({
    filename,
    fallbackUrl: model.url,
    cacheName: MODEL_CACHE,
  });
}

/** Downloads and caches the optional model before the user starts editing. */
export async function downloadAiRepairModel({
  model = preferredAiRepairModel(),
  onProgress, signal,
} = {}) {
  await modelBytes(model, onProgress, signal);
  return true;
}

/** Removes the locally cached model and releases any live inference session. */
export async function deleteAiRepairModel(model = preferredAiRepairModel()) {
  releaseLocalAiRepair();
  const filename = model.filename || (model.url ? model.url.split("/").pop() : "lama_512_int8.onnx");
  return await deleteModelAsset({
    filename,
    fallbackUrl: model.url,
    cacheName: MODEL_CACHE,
  });
}

async function modelBytes(model, onProgress, signal) {
  const filename = model.filename || (model.url ? model.url.split("/").pop() : "lama_512_int8.onnx");
  return await loadModelAssetBytes({
    filename,
    fallbackUrl: model.url,
    cacheName: MODEL_CACHE,
    onProgress, signal,
  });
}

function maskBounds(data, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] <= MASK_THRESHOLD && data[offset] <= MASK_THRESHOLD)
        continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, top, right, bottom };
}

export function repairCropForMask(maskData, width, height) {
  const bounds = maskBounds(maskData, width, height);
  if (!bounds) return null;
  const damagedSide = Math.max(
    bounds.right - bounds.left + 1,
    bounds.bottom - bounds.top + 1,
  );
  const side = Math.min(
    Math.max(64, Math.ceil(damagedSide * 2)),
    Math.max(width, height),
  );
  const centreX = (bounds.left + bounds.right + 1) / 2;
  const centreY = (bounds.top + bounds.bottom + 1) / 2;
  return {
    side,
    x: Math.max(0, Math.min(width - side, Math.round(centreX - side / 2))),
    y: Math.max(0, Math.min(height - side, Math.round(centreY - side / 2))),
  };
}

function canvas(width, height) {
  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  return result;
}

export function createAiRepairInput(image, mask) {
  const values = new Float32Array(4 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let index = 0; index < plane; index += 1) {
    const pixel = index * 4;
    const covered =
      mask[pixel + 3] > MASK_THRESHOLD || mask[pixel] > MASK_THRESHOLD;
    values[index] = covered ? 0 : image[pixel] / 255;
    values[plane + index] = covered ? 0 : image[pixel + 1] / 255;
    values[plane * 2 + index] = covered ? 0 : image[pixel + 2] / 255;
    values[plane * 3 + index] = covered ? 1 : 0;
  }
  return values;
}

function patchImage(output, mask) {
  const plane = INPUT_SIZE * INPUT_SIZE;
  const result = new ImageData(INPUT_SIZE, INPUT_SIZE);
  for (let index = 0; index < plane; index += 1) {
    const pixel = index * 4;
    const alpha = Math.max(mask[pixel], mask[pixel + 3]);
    result.data[pixel] = Math.round(
      Math.max(0, Math.min(1, output[index])) * 255,
    );
    result.data[pixel + 1] = Math.round(
      Math.max(0, Math.min(1, output[plane + index])) * 255,
    );
    result.data[pixel + 2] = Math.round(
      Math.max(0, Math.min(1, output[plane * 2 + index])) * 255,
    );
    result.data[pixel + 3] = alpha;
  }
  return result;
}

/**
 * Repairs a masked part of a source canvas and returns a PNG data URL.
 * Outside the mask, the original backing pixels are retained byte-for-byte.
 */
export async function inpaintWithLocalAi(
  sourceCanvas,
  maskCanvas,
  { onProgress, signal } = {},
) {
  if (!isLocalAiRepairSupported()) throw new Error("aiRepairUnsupported");
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  if (!(width > 0 && height > 0)) throw new Error("aiRepairInvalidCanvas");
  const sourceContext = sourceCanvas.getContext("2d");
  const maskContext = maskCanvas.getContext("2d");
  if (!sourceContext || !maskContext)
    throw new Error("aiRepairCanvasUnavailable");

  const fullMask = maskContext.getImageData(0, 0, width, height);
  const crop = repairCropForMask(fullMask.data, width, height);
  if (!crop) return sourceCanvas.toDataURL("image/png");

  const inputCanvas = canvas(INPUT_SIZE, INPUT_SIZE);
  const inputContext = inputCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  const maskInputCanvas = canvas(INPUT_SIZE, INPUT_SIZE);
  const maskInputContext = maskInputCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!inputContext || !maskInputContext)
    throw new Error("aiRepairCanvasUnavailable");
  inputContext.drawImage(
    sourceCanvas,
    crop.x,
    crop.y,
    crop.side,
    crop.side,
    0,
    0,
    INPUT_SIZE,
    INPUT_SIZE,
  );
  maskInputContext.drawImage(
    maskCanvas,
    crop.x,
    crop.y,
    crop.side,
    crop.side,
    0,
    0,
    INPUT_SIZE,
    INPUT_SIZE,
  );
  const image = inputContext.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  const mask = maskInputContext.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;

  signal?.throwIfAborted();
  const model = await prepareAiRepairModel();
  const input = createAiRepairInput(image, mask);
  const bytes = workerClient.hasModel(model.id) ? undefined : await modelBytes(model, onProgress, signal);
  signal?.throwIfAborted();
  let repaired;
  try {
    repaired = await workerClient.run({
      model, bytes, input, wasmPaths: new URL("ort/", document.baseURI).href,
    }, { signal, onProgress });
  } catch (error) {
    if (error.name !== "AbortError" && model.backend === "webgpu") failedModels.add(model.id);
    throw error;
  }
  signal?.throwIfAborted();

  const patchCanvas = canvas(INPUT_SIZE, INPUT_SIZE);
  const patchContext = patchCanvas.getContext("2d");
  if (!patchContext) throw new Error("aiRepairCanvasUnavailable");
  patchContext.putImageData(patchImage(repaired, mask), 0, 0);
  const result = canvas(width, height);
  const resultContext = result.getContext("2d");
  if (!resultContext) throw new Error("aiRepairCanvasUnavailable");
  resultContext.drawImage(sourceCanvas, 0, 0);
  resultContext.drawImage(
    patchCanvas,
    0,
    0,
    INPUT_SIZE,
    INPUT_SIZE,
    crop.x,
    crop.y,
    crop.side,
    crop.side,
  );
  return result.toDataURL("image/png");
}
