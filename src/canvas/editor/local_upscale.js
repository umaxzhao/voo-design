/**
 * Local AI Super-Resolution (Upscale) for the Design Editor.
 *
 * Runs 2x/4x compact super-resolution models on-device through ONNX Runtime
 * Web (WebGPU, with WASM fallback). The model is fed one bounded tile at a
 * time and the tiles are blended back together (see upscale_tiling.js for the
 * geometry and the seam argument), so transient memory follows the tile size
 * rather than the photo: one whole-image pass wanted ~144 MB of input floats
 * and a ~576 MB output tensor for a 12 MP photo at 2x, which is why real
 * photos ran out of memory or quietly fell back to bicubic. That fallback now
 * has exactly one cause — no usable ONNX at all (no runtime, no model bytes,
 * no backend). A photo being large is not one, and a model that loaded but
 * failed mid-run still fails loudly.
 */

import { isLocalUpscaleSupported } from "./ai_capabilities.js";
import { loadOrtRuntime } from "./ort_runtime.js";
import { UPSCALE_MODEL_CACHE } from "./model_cache_names.js";
import {
  loadModelAssetBytes,
  isModelAssetCached,
  deleteModelAsset,
} from "./model_asset_loader.js";
import { applyBoxBlur, applySharpen } from "./spatial_filter.js";
import { blendTileInto, planTiles, tileInputRgba } from "./upscale_tiling.js";
import { resolveUpscaleModel } from "./upscale_models.js";

const MODEL_CACHE = UPSCALE_MODEL_CACHE;

/** Channels per pixel (RGBA) in every buffer this module reads or writes. */
const RGBA = 4;

/**
 * Upper bound on the pixels one tile's model output may hold: 1024x1024. At 2x
 * one tile costs: input tensor 512x512x3x4 B = 3.1 MB, output tensor 12.6 MB,
 * RGBA tile buffer 4.2 MB, filter scratch <= 12.6 MB — roughly 30 MB of
 * transients whether the user opened a 2 MP crop or a 24 MP photo. The bound
 * is on the OUTPUT because a 4x model multiplies a tile's area by 16 first.
 */
const MAX_TILE_OUTPUT_PIXELS = 1024 * 1024;

/**
 * Overlap between neighbouring tiles, in source pixels; see upscale_tiling.js
 * for why seamlessness needs overlap > 2x the model's receptive field (roughly
 * 8-16 px for these compact SR models, so 32 is the floor). It doubles as the
 * tile's padding: every side with a neighbour is extracted with this much real
 * image attached. At 2x: 64 destination pixels of crossfade.
 */
const TILE_OVERLAP = 32;

/**
 * Light unsharp after the model, through the kernel the adjustment path and
 * its GLSL twin use — the fallback path has always sharpened its bicubic
 * result, so this keeps the two paths the same operation.
 */
const TILE_SHARPEN_AMOUNT = 0.2;

/** One box-blur pass worth of denoise; see the `denoise` option. */
const TILE_DENOISE_RADIUS = 1;

/** Canvas for the current environment, or a loud failure. */
function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error("canvasUnsupported");
}

/**
 * Source-pixel tile side keeping one tile's model output inside
 * MAX_TILE_OUTPUT_PIXELS. Interior tiles stay a multiple of 8 because several
 * SR graphs pixel-unshuffle in 2x2 blocks and reject odd extents; clamped edge
 * tiles are whatever the image leaves over.
 */
function tileSizeFor(scale) {
  const side = Math.floor(Math.sqrt(MAX_TILE_OUTPUT_PIXELS) / scale);
  const tileSize = Math.max(64, Math.floor(side / 8) * 8);
  if (tileSize <= TILE_OVERLAP) throw new Error("upscaleTileOverlapTooLarge");
  return tileSize;
}

let sessionPromise = null;
let activeBackend = null;
let loadedModelId = null;

export { isLocalUpscaleSupported };

export function describeUpscaleBackend() {
  return activeBackend;
}

export async function isUpscaleModelCached(model) {
  const target = model ?? resolveUpscaleModel(2);
  const filename = target.filename || (target.url ? target.url.split("/").pop() : "realesrgan-compact-2x.onnx");
  return await isModelAssetCached({
    filename,
    fallbackUrl: target.url,
    cacheName: MODEL_CACHE,
  });
}

export { UPSCALE_MODELS, resolveUpscaleModel } from "./upscale_models.js";

export function releaseLocalUpscale() {
  sessionPromise = null;
  loadedModelId = null;
  activeBackend = null;
}

/**
 * Fetches the model into Cache Storage and reports progress. This is the same
 * download the first inference performs, so it delegates to that one path
 * rather than keeping a second copy of the streaming logic in step with it.
 */
export async function downloadUpscaleModel({ model, onProgress } = {}) {
  const target = model ?? resolveUpscaleModel(2);
  await loadModelBytes(target, onProgress);
  onProgress?.({ phase: "cached", loaded: 1, total: 1 });
  return target;
}

export async function deleteUpscaleModel(model) {
  const target = model ?? resolveUpscaleModel(2);
  if (loadedModelId === target.id) releaseLocalUpscale();
  const filename = target.filename || (target.url ? target.url.split("/").pop() : "realesrgan-compact-2x.onnx");
  return await deleteModelAsset({
    filename,
    fallbackUrl: target.url,
    cacheName: MODEL_CACHE,
  });
}

async function loadModelBytes(model, onProgress) {
  const filename = model.filename || (model.url ? model.url.split("/").pop() : "realesrgan-compact-2x.onnx");
  return await loadModelAssetBytes({
    filename,
    fallbackUrl: model.url,
    cacheName: MODEL_CACHE,
    onProgress,
  });
}

async function getSession(model, onProgress) {
  if (loadedModelId && loadedModelId !== model.id) releaseLocalUpscale();
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const ort = await loadOrtRuntime(onProgress);
    const bytes = await loadModelBytes(model, onProgress);
    onProgress?.({ phase: "compiling" });

    const providers =
      typeof navigator === "object" && navigator.gpu
        ? ["webgpu", "wasm"]
        : ["wasm"];
    for (const provider of providers) {
      try {
        const session = await ort.InferenceSession.create(bytes, {
          executionProviders: [provider],
          graphOptimizationLevel: "all",
        });
        activeBackend = provider;
        loadedModelId = model.id;
        return { ort, session };
      } catch (error) {
        console.warn(`upscale: ${provider} provider unavailable`, error);
      }
    }
    throw new Error("upscaleNoBackend");
  })().catch((error) => {
    sessionPromise = null;
    throw error;
  });
  return sessionPromise;
}

/**
 * Helper to extract Blob from OffscreenCanvas or HTMLCanvasElement across environments.
 */
export async function canvasToBlob(canvas, type = "image/png") {
  if (typeof canvas.convertToBlob === "function") {
    return await canvas.convertToBlob({ type });
  }
  if (typeof canvas.toBlob === "function") {
    return new Promise((resolve) => canvas.toBlob(resolve, type));
  }
  if (typeof canvas.toDataURL === "function") {
    const dataUrl = canvas.toDataURL(type);
    const res = await fetch(dataUrl);
    return await res.blob();
  }
  throw new Error("canvasToBlobUnsupported");
}

/**
 * Fallback high-quality bicubic & edge-sharpening upscaler when ONNX model is not available or downloads are skipped.
 */
export function upscaleWithCanvas(bitmap, scale = 2) {
  const width = bitmap.naturalWidth ?? bitmap.width;
  const height = bitmap.naturalHeight ?? bitmap.height;
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  // Subtle unsharp mask to restore the high-frequency detail bicubic softened.
  // This used to be a hand-rolled Laplacian loop that skipped the border and
  // left alpha alone; the shared kernel does the same job with edge
  // replication, and both the model path below and the GPU path use it too.
  const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  applySharpen(imgData.data, targetWidth, targetHeight, 0.35);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Runs the session over the image in bounded tiles and blends the results.
 * Per tile the pipeline is denoise (optional, on the source tile) -> model ->
 * light unsharp (on the upscaled tile): only the model gains from a cleaner
 * input, and sharpening belongs after the resample that softened the image.
 * Every failure here is a real defect and reaches the caller as one.
 *
 * @param {ImageBitmap|HTMLImageElement} bitmap
 * @param {object} options
 * @param {object} options.ort Loaded ONNX Runtime namespace
 * @param {object} options.session Inference session
 * @param {number} options.width Source width in pixels
 * @param {number} options.height Source height in pixels
 * @param {number} options.scale The model's own scale factor
 * @param {boolean} options.denoise Pre-filter each tile before the model
 * @param {(state: object) => void} [options.onProgress]
 * @returns {Promise<Blob>} Upscaled PNG blob
 */
export async function runTiledUpscale(bitmap, { ort, session, width, height, scale, denoise, onProgress, shouldStop }) {
  const tileSize = tileSizeFor(scale);
  const tiles = planTiles(width, height, { tileSize, overlap: TILE_OVERLAP });

  // The source is read once at 4 B/px — the same read the single-pass version
  // did, and the only full-image allocation left. Tiles are cut out of that
  // buffer rather than re-decoded per tile, which would re-read the overlap.
  const sourceCanvas = createCanvas(width, height);
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceCtx.drawImage(bitmap, 0, 0);
  const rgba = sourceCtx.getImageData(0, 0, width, height).data;

  let hasAlpha = false;
  for (let i = 3; i < rgba.length; i += RGBA) {
    if (rgba[i] < 255) {
      hasAlpha = true;
      break;
    }
  }

  const outWidth = width * scale;
  const outHeight = height * scale;
  const outCanvas = createCanvas(outWidth, outHeight);
  const outCtx = outCanvas.getContext("2d");
  const outImageData = outCtx.createImageData(outWidth, outHeight);
  // The destination IS the output ImageData: blending straight into it costs
  // 4 B/px for the result, where a float accumulator would cost 16 B/px. Only
  // the overlap bands are blended twice; that rounding is far below a step.
  const target = outImageData.data;

  let planar = null;
  let tileRgba = null;

  for (let index = 0; index < tiles.length; index += 1) {
    if (shouldStop?.()) {
      throw new Error("stopped");
    }
    const rect = tiles[index];
    onProgress?.({ phase: "tiling", tile: index + 1, tiles: tiles.length });

    const tilePixels = tileInputRgba(rgba, rect, width);
    if (denoise) {
      applyBoxBlur(tilePixels, rect.width, rect.height, TILE_DENOISE_RADIUS);
    }

    const pixels = rect.width * rect.height;
    if (!planar || planar.length !== pixels * 3) planar = new Float32Array(pixels * 3);
    for (let i = 0; i < pixels; i += 1) {
      planar[i] = tilePixels[i * RGBA] / 255;
      planar[pixels + i] = tilePixels[i * RGBA + 1] / 255;
      planar[pixels * 2 + i] = tilePixels[i * RGBA + 2] / 255;
    }

    const tensor = new ort.Tensor("float32", planar, [1, 3, rect.height, rect.width]);
    const output = await session.run({ [session.inputNames[0]]: tensor });
    const outTensor = output[session.outputNames[0]];
    const outH = outTensor.dims[2];
    const outW = outTensor.dims[3];
    // The geometry is built from the model's declared scale: a session that
    // returns anything else would leave gaps between tiles, so fail loudly.
    if (outW !== rect.width * scale || outH !== rect.height * scale) {
      throw new Error("upscaleTileGeometryMismatch");
    }

    const outPixels = outW * outH;
    const outData = outTensor.data;
    if (!tileRgba || tileRgba.length !== outPixels * RGBA) {
      tileRgba = new Uint8ClampedArray(outPixels * RGBA);
    }
    // Uint8ClampedArray rounds and clamps, so no manual 0..255 guard here.
    for (let i = 0; i < outPixels; i += 1) {
      tileRgba[i * RGBA] = outData[i] * 255;
      tileRgba[i * RGBA + 1] = outData[outPixels + i] * 255;
      tileRgba[i * RGBA + 2] = outData[outPixels * 2 + i] * 255;
      tileRgba[i * RGBA + 3] = 255;
    }
    applySharpen(tileRgba, outW, outH, TILE_SHARPEN_AMOUNT);
    blendTileInto(
      target,
      tileRgba,
      { x: rect.x * scale, y: rect.y * scale, width: outW, height: outH },
      { width: outWidth, height: outHeight, overlap: TILE_OVERLAP * scale },
    );
  }

  // Overlap crossfades blend alpha like any other channel; restore high-quality
  // resampled alpha for transparent images, or keep fully opaque otherwise.
  if (hasAlpha) {
    const alphaCanvas = createCanvas(outWidth, outHeight);
    const alphaCtx = alphaCanvas.getContext("2d");
    alphaCtx.imageSmoothingEnabled = true;
    alphaCtx.imageSmoothingQuality = "high";
    alphaCtx.drawImage(sourceCanvas, 0, 0, outWidth, outHeight);
    const alphaData = alphaCtx.getImageData(0, 0, outWidth, outHeight).data;
    for (let i = 3; i < target.length; i += RGBA) target[i] = alphaData[i];
  } else {
    for (let i = 3; i < target.length; i += RGBA) target[i] = 255;
  }

  outCtx.putImageData(outImageData, 0, 0);
  onProgress?.({ phase: "encoding" });
  return await canvasToBlob(outCanvas, "image/png");
}

/**
 * Runs 2x / 4x local AI Super Resolution on an image bitmap.
 *
 * @param {ImageBitmap|HTMLImageElement} bitmap Image to upscale
 * @param {object} [options]
 * @param {number} [options.scale=2] Scale factor: 2 or 4
 * @param {boolean} [options.denoise=false] Light denoise over each tile before
 *   the model. Off by default: it is a lossy pre-filter, so it belongs to a
 *   caller that knows the source is noisy (high-ISO, re-encoded), not to the
 *   default path where a clean photo would lose real detail to it.
 * @param {(state: object) => void} [options.onProgress] Progress reporting callback
 * @returns {Promise<Blob>} Upscaled PNG blob
 */
export async function runLocalUpscale(bitmap, { scale = 2, modelId = null, model: customModel = null, onProgress, denoise = false, shouldStop } = {}) {
  if (shouldStop?.()) {
    throw new Error("stopped");
  }
  const width = bitmap.naturalWidth ?? bitmap.width;
  const height = bitmap.naturalHeight ?? bitmap.height;
  const model = customModel ?? resolveUpscaleModel(modelId || scale);

  let handle;
  try {
    handle = await getSession(model, onProgress);
  } catch (error) {
    if (shouldStop?.()) {
      throw new Error("stopped");
    }
    // The one and only reason to fall back: there is no usable model. Image
    // size is not a factor any more — the tiled runner bounds its own memory.
    console.warn(
      "AI Super Resolution model unavailable, falling back to high-grade unsharp upscaling",
      error,
    );
    onProgress?.({ phase: "fallback" });
    return await canvasToBlob(upscaleWithCanvas(bitmap, scale), "image/png");
  }

  if (shouldStop?.()) {
    throw new Error("stopped");
  }
  onProgress?.({ phase: "running" });
  try {
    // The model's own scale drives the geometry, not the requested one:
    // resolveUpscaleModel answers an unsupported request with the 2x model, and
    // the tiles must be laid out for what the session will actually emit.
    return await runTiledUpscale(bitmap, {
      ort: handle.ort,
      session: handle.session,
      width,
      height,
      scale: model.scale,
      denoise,
      onProgress,
      shouldStop,
    });
  } catch (error) {
    if (shouldStop?.() || error?.message === "stopped") {
      throw error?.message === "stopped" ? error : new Error("stopped");
    }
    const failure = new Error("upscaleModelRunFailed");
    failure.cause = error;
    throw failure;
  }
}
