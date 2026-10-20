/**
 * Background removal that runs in the page, with no third-party service.
 *
 * BiRefNet produces the alpha matte; everything after that — feathering,
 * erase/restore, compositing, export — is the editor's existing mask
 * pipeline, because this module hands back exactly what `engine.applyMask`
 * already takes: a PNG whose alpha channel is the matte.
 *
 * Three things are deliberate:
 *
 * - **Nothing loads until it is used.** onnxruntime-web unpacks to well over a
 *   hundred megabytes and the weights are another hundred, so both arrive
 *   through dynamic import and fetch, never through the main bundle.
 * - **The weights are cached by the browser's Cache Storage**, so the download
 *   is a one-time cost per profile rather than per cutout.
 * - **WebGPU first, WASM second.** On CPU this model takes tens of seconds;
 *   the fallback exists so the feature degrades instead of disappearing, and
 *   `describeBackend` says which one ran so the UI can be honest about it.
 */

import { getSettingAsync } from "../../shared/settings.js";
import { MATTING_MODEL_KEY, resolveMattingModel } from "./matting_models.js";
import {
  isLocalMattingSupported,
  appRendererUsesSingleThreadedWasm,
  ensureMattingModule,
  isMattingModuleInstalled,
} from "./ai_capabilities.js";
import { loadOrtRuntime } from "./ort_runtime.js";
import { MATTING_MODEL_CACHE } from "./model_cache_names.js";
import {
  loadModelAssetBytes,
  isModelAssetCached,
  deleteModelAsset,
} from "./model_asset_loader.js";
import {
  clipMaskToPolygon,
  cropMask,
  padRegion,
  placeRegionMask,
  polygonBounds,
  hardenMask,
  normaliseMask,
  fitToModelInput,
  looksLikeProbabilities,
  maskToRgba,
  resampleMask,
  sigmoid,
  toNormalisedTensor,
} from "./matting_transform.js";
import { featherMatte, refineMatte } from "./matte_refine.js";

/**
 * The chosen model, resolved from settings at the moment it is needed.
 *
 * Read per call rather than captured once: changing the setting has to take
 * effect on the next cutout, and the session cache below keys off the id so a
 * change also retires the loaded session.
 */
async function currentModel() {
  const id = await getSettingAsync(MATTING_MODEL_KEY).catch(() => null);
  return resolveMattingModel(id);
}

const MODEL_CACHE = MATTING_MODEL_CACHE;

/** Reused across cutouts; building a session costs seconds. */
let sessionPromise = null;
let activeBackend = null;
/** Which model the cached session was built for, so a setting change retires it. */
let loadedModelId = null;

/**
 * Providers ruled out for this model at run time, not at load time.
 *
 * A provider can build a session happily and then refuse an operator once the
 * graph actually executes — WebGPU rejects U^2-Net's ceil-mode MaxPool that
 * way. Recording the refusal lets the next run skip straight to a provider
 * that works instead of paying for the same failure again.
 */
const refusedProviders = new Set();

function availableProviders() {
  const all =
    typeof navigator === "object" && navigator.gpu
      ? ["webgpu", "wasm"]
      : ["wasm"];
  const usable = all.filter((name) => !refusedProviders.has(name));
  // Never strand the caller with nothing: if everything has been refused, try
  // the list again rather than reporting no backend at all.
  return usable.length > 0 ? usable : all;
}

export { isLocalMattingSupported };

/** Which execution provider the loaded session ended up on, or null. */
export function describeBackend() {
  return activeBackend;
}

/**
 * True when a model's weights are already in Cache Storage.
 *
 * Takes the model rather than assuming the chosen one, because the settings
 * panel asks about every model it lists, not just the active one.
 */
export async function isModelCached(model) {
  const target = model ?? (await currentModel());
  const filename = target.filename || (target.url ? target.url.split("/").pop() : "rmbg-1.4-fp16.onnx");
  return await isModelAssetCached({
    filename,
    fallbackUrl: target.url,
    cacheName: MODEL_CACHE,
  });
}

/**
 * Downloads a model's weights into the cache without running anything.
 *
 * What the settings panel calls: fetching a hundred megabytes should be a
 * decision the user makes when it suits them, not a surprise the first time
 * they reach for the cutout button.
 */
export async function downloadModel(model, { onProgress } = {}) {
  const target = model ?? (await currentModel());
  await loadModelBytes(target, onProgress);
  return true;
}

/** Drops a model's weights, freeing the disk it took. */
export async function deleteModel(model) {
  const target = model ?? (await currentModel());
  if (loadedModelId === target.id) releaseLocalMatting();
  const filename = target.filename || (target.url ? target.url.split("/").pop() : "rmbg-1.4-fp16.onnx");
  return await deleteModelAsset({
    filename,
    fallbackUrl: target.url,
    cacheName: MODEL_CACHE,
  });
}

/**
 * Fetches the weights, reporting progress, and keeps them in Cache Storage.
 *
 * Progress matters here: this is a hundred-megabyte download and a UI that
 * only says "working" for two minutes reads as a hang.
 */
async function loadModelBytes(model, onProgress) {
  const filename = model.filename || (model.url ? model.url.split("/").pop() : "rmbg-1.4-fp16.onnx");
  return await loadModelAssetBytes({
    filename,
    fallbackUrl: model.url,
    cacheName: MODEL_CACHE,
    onProgress,
  });
}

export { appRendererUsesSingleThreadedWasm, ensureMattingModule, isMattingModuleInstalled };

/** Builds (once) the inference session, preferring WebGPU. */
async function getSession(model, onProgress, options = {}) {
  // A different model than the session was built for makes it useless.
  if (loadedModelId && loadedModelId !== model.id) releaseLocalMatting();
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const ort = await loadOrtRuntime(onProgress, options);
    const bytes = await loadModelBytes(model, onProgress);
    onProgress?.({ phase: "compiling" });

    const providers = availableProviders();
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
        // A WebGPU failure is worth reporting but not worth failing on: the
        // WASM path below still produces a matte, just slower.
        console.warn(`matting: ${provider} provider unavailable`, error);
      }
    }
    throw new Error("mattingNoBackend");
  })().catch((error) => {
    // A failed build must not poison every later attempt.
    sessionPromise = null;
    throw error;
  });
  return sessionPromise;
}

/** Draws a bitmap letterboxed into a square canvas and reads its pixels back. */
function rasteriseForModel(bitmap, box, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // Padding is black rather than transparent: the model sees RGB only, and a
  // transparent edge would otherwise read as an arbitrary colour.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bitmap, box.offsetX, box.offsetY, box.width, box.height);
  return ctx.getImageData(0, 0, size, size).data;
}

/**
 * Above this many pixels the edge refinement is skipped.
 *
 * It costs a handful of float buffers the size of the matte, and the workspace
 * accepts pictures up to 32MP (`workspace_cap.js`) where those buffers run to
 * hundreds of megabytes: a cutout that runs out of memory is worse than one
 * whose edge is merely left as the model drew it. Everything a camera or a
 * video frame produces in practice is well under this.
 *
 * A skip is not silent: the entry points below return the reason alongside the
 * matte (`MATTE_REFINE_TOO_LARGE`), so a caller whose user is owed an
 * explanation can give one.
 */
export const MATTE_REFINE_MAX_PIXELS = 16_000_000;

/**
 * Why the edge refinement did not run, as codes rather than prose.
 *
 * The same shape as `RETOUCH_TOO_LARGE` in `portrait_retouch_plan.js`: the
 * engine states the fact and the caller picks the words — the engine has no
 * locale and no opinion about what the user should read. Neither code is an
 * error: the matte is returned either way, and a caller that ignores them
 * still has a usable cutout.
 */
export const MATTE_REFINE_TOO_LARGE = "matteRefineTooLarge";
/** The caller asked for the model's raw matte (`refine: false`). */
export const MATTE_REFINE_DISABLED = "matteRefineDisabled";

/**
 * Why the edge refinement will not run, or null when it will.
 *
 * Separate from `refineCutoutMask` so the decision is testable at the
 * boundary without allocating the buffers it is protecting against.
 *
 * @param {number} width
 * @param {number} height
 * @param {object|false} settings refinement options, or false when the caller
 *   turned the stage off.
 * @returns {string|null} one of the codes above, or null.
 */
export function refineSkipReason(width, height, settings) {
  if (!settings) return MATTE_REFINE_DISABLED;
  return width * height > MATTE_REFINE_MAX_PIXELS
    ? MATTE_REFINE_TOO_LARGE
    : null;
}

/** What the refinement stage did: `ran` false carries the `reason` why. */
function refinementOutcome(reason) {
  return reason ? { ran: false, reason } : { ran: true, reason: null };
}

/** The picture's own pixels at the matte's size — the guide for refinement. */
function rasteriseOriginal(bitmap, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // Drawn at the identity mapping: this is the picture as the matte sees it,
  // not the letterboxed square the model was fed.
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

/**
 * Cleans up the matte the model produced, at the picture's own resolution.
 *
 * Done here rather than after the model because the model's answer arrives on
 * its own square and is resampled on the way out: a transition that was one
 * pixel wide at 1024 is four wide at 4096, with a staircase on every diagonal.
 * Refining against the full-size colours is what puts the edge back where the
 * picture's colours say it is.
 *
 * There is no colour-decontamination stage here, and there is nowhere else for
 * one to go: a matte's RGB is white by construction (`maskToRgba`), so this
 * image does not carry the old background's colour to unmix, and the only
 * stage that holds the picture's RGBA beside a matte — `applyMatte`'s
 * render-time composite — is the editor's hottest per-frame path, where a
 * float-plane unmix of every pixel would be a freeze. A cutout edge therefore
 * keeps whatever fringe the model's own resolution left on it.
 *
 * @param {object|false} settings refinement options, or false to skip.
 * @returns {{mask: Float32Array, refinement: {ran: boolean, reason: string|null}}}
 *   the matte, and what this stage actually did to it. A skipped refinement
 *   is indistinguishable from a good one in the pixels alone, which is why
 *   the reason travels back with them.
 */
function refineCutoutMask(bitmap, mask, width, height, settings) {
  const reason = refineSkipReason(width, height, settings);
  if (reason) return { mask, refinement: refinementOutcome(reason) };
  const refined = refineMatte(mask, width, height, {
    ...settings,
    guide: rasteriseOriginal(bitmap, width, height),
  });
  return {
    mask: featherMatte(refined, width, height, {
      radius: settings.featherRadius,
    }),
    refinement: refinementOutcome(null),
  };
}

/** Encodes the matte as a PNG, the shape `engine.applyMask` stores. */
async function encodeMatte(mask, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(
    new ImageData(maskToRgba(mask, width, height), width, height),
    0,
    0,
  );
  return canvas.convertToBlob({ type: "image/png" });
}

/**
 * Runs background removal on one bitmap.
 *
 * @param {ImageBitmap|HTMLImageElement} bitmap the picture to cut out.
 * @param {object} [options]
 * @param {Function} [options.onProgress]
 * @param {object} [options.host] - Optional EditorHost boundary
 * @param {object} [options._deps] - Optional test overrides
 * @param {object|false} [options.refine] - Edge-refinement settings from
 *   `matte_refine.js`, defaulting to its conservative ones, or false to take
 *   the model's matte as it came back.
 * @returns {Promise<{blob: Blob, refinement: {ran: boolean, reason: string|null}>}>
 *   a PNG matte, ready for `engine.applyMask`, and what the edge refinement
 *   did to it — `ran: false` means the picture was over
 *   `MATTE_REFINE_MAX_PIXELS` (or the caller turned it off), which the matte
 *   itself cannot tell anyone.
 */
export async function runLocalMatting(bitmap, { onProgress, host, _deps, refine = {} } = {}) {
  if (!isLocalMattingSupported()) throw new Error("mattingUnsupported");

  const moduleCheck = await ensureMattingModule({ host, onProgress, _deps });
  if (moduleCheck && !moduleCheck.ok) {
    throw new Error(moduleCheck.reason || "mattingModuleUnavailable");
  }

  const width = bitmap.naturalWidth ?? bitmap.width;
  const height = bitmap.naturalHeight ?? bitmap.height;
  const model = await currentModel();
  const size = model.inputSize;
  const box = fitToModelInput(width, height, size);

  const { ort, session } = await getSession(model, onProgress, { host, _deps });
  onProgress?.({ phase: "running" });

  const rgba = rasteriseForModel(bitmap, box, size);
  const tensor = new ort.Tensor(
    "float32",
    toNormalisedTensor(rgba, size, model.mean, model.std),
    [1, 3, size, size],
  );

  const feeds = { [session.inputNames[0]]: tensor };
  let output;
  try {
    output = await session.run(feeds);
  } catch (error) {
    // An operator the provider cannot execute only shows up here. Retire that
    // provider, drop the session built on it, and let the caller's retry pick
    // the next one — silently returning a broken matte would be worse.
    if (activeBackend && !refusedProviders.has(activeBackend)) {
      console.warn(
        `matting: ${activeBackend} refused the graph, retrying`,
        error,
      );
      refusedProviders.add(activeBackend);
      releaseLocalMatting();
      // Every option is carried across: the retry is a second attempt at the
      // same cutout, not a different one.
      return runLocalMatting(bitmap, { onProgress, host, _deps, refine });
    }
    throw error;
  }
  // BiRefNet emits several supervision maps; the last is the refined one.
  const names = session.outputNames;
  const raw = output[names[names.length - 1]].data;

  const probabilities = looksLikeProbabilities(raw);
  const square = new Float32Array(size * size);
  for (let i = 0; i < square.length; i += 1) {
    square[i] = probabilities ? raw[i] : sigmoid(raw[i]);
  }

  const cropped = cropMask(square, box, size);
  // Only stretch/harden if the output has poor dynamic range (e.g. low-confidence unnormalised logits).
  // RMBG-1.4 produces clean 0..1 probabilities directly, where re-normalising damages dark regions.
  const processed = probabilities
    ? cropped
    : hardenMask(normaliseMask(cropped));
  const full = resampleMask(
    processed,
    { width: box.width, height: box.height },
    { width, height },
  );
  onProgress?.({ phase: "encoding" });
  const { mask, refinement } = refineCutoutMask(
    bitmap,
    full,
    width,
    height,
    refine,
  );
  return { blob: await encodeMatte(mask, width, height), refinement };
}

/**
 * Cuts out only what sits inside a region the user drew.
 *
 * The salient-object models keep whatever they find interesting, which on a
 * busy picture means scenery survives the cut. A region says which object was
 * meant, and running the model on that crop alone both answers the question
 * and removes the ambiguity: outside the box the matte is transparent because
 * the user said so, not because the model agreed.
 *
 * The crop is padded first — a box drawn tight against a subject hides the
 * boundary the model needs in order to find it.
 *
 * A lasso is the same idea with a tighter boundary: the model still runs on
 * the polygon's box, because that is the shape a picture has, and the polygon
 * then clears what the box included but the user did not.
 *
 * @param {ImageBitmap|HTMLImageElement} bitmap the whole picture.
 * @param {{x: number, y: number, width: number, height: number} |
 *   {points: Array<{x: number, y: number}>}} selection a rectangle or a lasso,
 *   in the picture's own pixels.
 * @returns {Promise<{blob: Blob, refinement: {ran: boolean, reason: string|null}>}>
 *   a full-size PNG matte. The refinement outcome is the crop's own — the
 *   region is what got refined, so a report about it has to be read as a
 *   statement about the region rather than about the whole frame.
 */
export async function runRegionMatting(bitmap, selection, { onProgress, host, _deps, refine = {} } = {}) {
  if (!isLocalMattingSupported()) throw new Error("mattingUnsupported");

  const moduleCheck = await ensureMattingModule({ host, onProgress, _deps });
  if (moduleCheck && !moduleCheck.ok) {
    throw new Error(moduleCheck.reason || "mattingModuleUnavailable");
  }

  const width = bitmap.naturalWidth ?? bitmap.width;
  const height = bitmap.naturalHeight ?? bitmap.height;
  const polygon = Array.isArray(selection?.points) ? selection.points : null;
  const region = polygon ? polygonBounds(polygon) : selection;
  const box = padRegion(region, width, height);
  if (!(box.width > 0) || !(box.height > 0))
    throw new Error("mattingEmptyRegion");

  // Rasterise just the region, then treat it as a picture in its own right.
  const canvas = new OffscreenCanvas(box.width, box.height);
  canvas.getContext("2d").drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  const crop = await createImageBitmap(canvas);
  try {
    // The crop is a picture in its own right, so the refinement runs on it at
    // the region's own resolution rather than on the whole frame.
    const { blob: regionMatte, refinement } = await runLocalMatting(crop, {
      onProgress,
      host,
      _deps,
      refine,
    });
    const decoded = await createImageBitmap(regionMatte);
    const read = new OffscreenCanvas(box.width, box.height);
    const ctx = read.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(decoded, 0, 0);
    decoded.close?.();
    const pixels = ctx.getImageData(0, 0, box.width, box.height).data;

    const regionMask = new Float32Array(box.width * box.height);
    for (let i = 0; i < regionMask.length; i += 1) {
      regionMask[i] = pixels[i * 4 + 3] / 255;
    }
    onProgress?.({ phase: "encoding" });
    const placed = placeRegionMask(regionMask, box, width, height);
    // The box was padded to give the model context; the lasso is what the user
    // actually asked for, so it has the final say on what survives.
    const full = polygon
      ? clipMaskToPolygon(placed, polygon, width, height)
      : placed;
    return { blob: await encodeMatte(full, width, height), refinement };
  } finally {
    crop.close?.();
  }
}

/** Frees the session; the cached weights stay for the next run. */
export function releaseLocalMatting() {
  sessionPromise = null;
  activeBackend = null;
  loadedModelId = null;
}
