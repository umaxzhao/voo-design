/**
 * The VOO Local Engine: stable-diffusion.cpp's `sd-server`, driven directly.
 *
 * This is the backend that makes VOO a local inference platform rather than a
 * client of one. `sd-server` is a single native binary (CUDA / Vulkan / Metal /
 * CPU), so VOO can install it, point it at a model file, and own the whole
 * local stack without a Python environment.
 *
 * It speaks three APIs; this client uses the native one:
 *
 *  - `GET  /sdcpp/v1/capabilities`   what the loaded model can do
 *  - `POST /sdcpp/v1/img_gen`        submit an async image job (202 → job id)
 *  - `POST /sdcpp/v1/vid_gen`        submit an async video job
 *  - `GET  /sdcpp/v1/jobs/{id}`      poll it (`queued`/`generating`/…)
 *  - `POST /sdcpp/v1/jobs/{id}/cancel`
 *
 * The async job shape is exactly what the local capability contract models, so
 * the provider does not need to know anything engine-specific. `img_gen` covers
 * text-to-image and image-to-image: a request with `init_image` edits, one
 * without generates. That is what lets one backend row declare both
 * `image-generation` and `image-edit`.
 */

import {
  LocalBackendError,
  localRequest,
  normaliseEndpoint,
} from "./local_transport.js";
import { LOCAL_CAPABILITY } from "./local_capabilities.js";

export const VOO_ENGINE_DEFAULT_ENDPOINT = "http://127.0.0.1:1234";
export const VOO_ENGINE_LABEL = "VOO Local Engine";

function endpointUrl(endpoint, pathname) {
  return `${normaliseEndpoint(endpoint || VOO_ENGINE_DEFAULT_ENDPOINT)}${pathname}`;
}

/** The engine's own description of itself. */
export function engineModelName(capabilities) {
  return capabilities?.model?.stem ?? capabilities?.model?.name ?? null;
}

/**
 * The engine modes the loaded model serves. Older builds report only
 * `current_mode`, which counts too.
 */
function servedModes(capabilities) {
  return Array.isArray(capabilities?.supported_modes)
    ? capabilities.supported_modes
    : capabilities?.current_mode
      ? [capabilities.current_mode]
      : [];
}

/** True when the loaded model serves a given engine mode. */
function supportsMode(capabilities, mode) {
  return servedModes(capabilities).includes(mode);
}

/** True when the loaded model accepts a source image / mask. */
function supportsImageEdit(capabilities) {
  const features =
    capabilities?.features_by_mode?.img_gen ?? capabilities?.features ?? {};
  return Boolean(features?.init_image);
}

/** Reads `/sdcpp/v1/capabilities`, the engine's identity and feature set. */
export async function readEngineCapabilities(
  endpoint,
  { timeoutMs = 2500, fetch: fetchImpl } = {},
) {
  return localRequest(endpointUrl(endpoint, "/sdcpp/v1/capabilities"), {
    timeoutMs,
    fetch: fetchImpl,
  });
}

/** True when a VOO engine answers on this endpoint. */
export async function pingVooEngine(
  endpoint,
  { timeoutMs = 2500, fetch: fetchImpl } = {},
) {
  const capabilities = await readEngineCapabilities(endpoint, {
    timeoutMs,
    fetch: fetchImpl,
  });
  if (
    servedModes(capabilities).length === 0 ||
    !engineModelName(capabilities)
  ) {
    throw new LocalBackendError("localBackend.unreachable", { capabilities });
  }
  return {
    ok: true,
    engine: "sdcpp",
    model: engineModelName(capabilities),
    modes: capabilities?.supported_modes ?? null,
  };
}

/**
 * The loaded model's names, for one capability.
 *
 * `sd-server` serves one model per process, so the "library" is really the
 * model the engine is currently running; the settings library is what switches
 * it. A model that cannot take a source image is not listed under `image-edit`,
 * which is what keeps it out of the editor's edit picker.
 */
export async function listVooEngineModels(
  endpoint,
  capability,
  { fetch: fetchImpl } = {},
) {
  const capabilities = await readEngineCapabilities(endpoint, {
    fetch: fetchImpl,
  });
  const name = engineModelName(capabilities);
  const mode =
    capability === LOCAL_CAPABILITY.VIDEO_GENERATION ? "vid_gen" : "img_gen";
  if (!name || !supportsMode(capabilities, mode)) {
    return [];
  }
  if (
    capability === LOCAL_CAPABILITY.IMAGE_EDIT &&
    !supportsImageEdit(capabilities)
  ) {
    return [];
  }
  return [name];
}

/** The `img_gen` body for one job; a source image turns it into an edit. */
export function buildEngineGenerationBody({ request = {}, image, mask } = {}) {
  const body = {
    prompt: request.prompt ?? "",
    negative_prompt: request.negative_prompt ?? "",
    output_format: "png",
  };
  if (Number.isFinite(request.width)) body.width = Math.round(request.width);
  if (Number.isFinite(request.height)) body.height = Math.round(request.height);
  if (Number.isFinite(request.seed)) body.seed = Math.round(request.seed);
  if (Number.isFinite(request.n)) {
    body.batch_count = Math.max(1, Math.round(request.n));
  }

  const sample = {};
  if (Number.isFinite(request.steps)) {
    sample.sample_steps = Math.round(request.steps);
  }
  if (Number.isFinite(request.cfg)) {
    sample.guidance = { txt_cfg: request.cfg };
  }
  if (Object.keys(sample).length > 0) body.sample_params = sample;

  if (image) {
    body.init_image = image;
    if (mask) body.mask_image = mask;
    if (Number.isFinite(request.strength)) body.strength = request.strength;
  }
  return body;
}

/** Queues one image job and resolves to the engine's job id. */
export async function submitVooEngineJob({
  endpoint,
  request,
  image,
  mask,
} = {}) {
  const submitted = await localRequest(
    endpointUrl(endpoint, "/sdcpp/v1/img_gen"),
    {
      method: "POST",
      json: buildEngineGenerationBody({ request, image, mask }),
      timeoutMs: 60000,
    },
  );
  const uid = submitted?.id;
  if (typeof uid !== "string" || !uid.trim()) {
    throw new LocalBackendError("localBackend.submitRejected", { submitted });
  }
  return { uid };
}

/** The native video API accepts one sequence, optionally conditioned on images. */
export function buildEngineVideoBody({
  request = {},
  image,
  outputFormat = "avi",
} = {}) {
  const body = {
    prompt: request.prompt ?? "",
    negative_prompt: request.negative_prompt ?? "",
    output_format: outputFormat,
  };
  if (image) body.init_image = image;
  if (request.end_image) body.end_image = request.end_image;
  if (Number.isFinite(request.width)) body.width = Math.round(request.width);
  if (Number.isFinite(request.height)) body.height = Math.round(request.height);
  if (Number.isFinite(request.seed)) body.seed = Math.round(request.seed);
  if (Number.isFinite(request.fps) && request.fps > 0) {
    body.fps = Math.round(request.fps);
  }
  if (Number.isFinite(request.duration) && request.duration > 0) {
    const fps = body.fps ?? 16;
    body.video_frames = Math.max(1, Math.round(request.duration * fps));
  }
  return body;
}

export async function submitVooEngineVideoJob({
  endpoint,
  request,
  image,
} = {}) {
  const capabilities = await readEngineCapabilities(endpoint);
  const formats =
    capabilities?.output_formats_by_mode?.vid_gen ??
    (capabilities?.current_mode === "vid_gen"
      ? capabilities.output_formats
      : []);
  // AVI is built into sd-server. WebM depends on a build flag, so request it
  // only when the running engine advertises support.
  const outputFormat =
    Array.isArray(formats) && formats.includes("webm") ? "webm" : "avi";
  const submitted = await localRequest(
    endpointUrl(endpoint, "/sdcpp/v1/vid_gen"),
    {
      method: "POST",
      json: buildEngineVideoBody({ request, image, outputFormat }),
      timeoutMs: 60000,
    },
  );
  if (typeof submitted?.id !== "string" || !submitted.id.trim()) {
    throw new LocalBackendError("localBackend.submitRejected", { submitted });
  }
  return { uid: submitted.id };
}

const JOB_STATUS = {
  queued: "pending",
  generating: "processing",
  processing: "processing",
};

/**
 * One poll, in the provider's status vocabulary.
 *
 * Called repeatedly by the provider layer rather than looping here, so a Stop
 * request lands between polls instead of waiting out a generation.
 */
export async function pollVooEngineJob({ endpoint, uid } = {}) {
  if (typeof uid !== "string" || !uid.trim()) {
    throw new LocalBackendError("localBackend.unknownTask");
  }
  const job = await localRequest(
    endpointUrl(endpoint, `/sdcpp/v1/jobs/${encodeURIComponent(uid)}`),
    { timeoutMs: 30000 },
  );
  const status = String(job?.status ?? "").toLowerCase();

  if (status === "completed") {
    const images = Array.isArray(job?.result?.images) ? job.result.images : [];
    const urls = images
      .map((image) =>
        typeof image?.b64_json === "string" && image.b64_json
          ? `data:image/png;base64,${image.b64_json}`
          : null,
      )
      .filter(Boolean);
    if (urls.length === 0) {
      throw new LocalBackendError("localBackend.noOutput", { job });
    }
    return { status: "completed", urls };
  }
  if (status === "failed" || status === "cancelled") {
    return {
      status: "failed",
      error: job?.error?.code ?? "localBackend.executionFailed",
      errorMessage: job?.error?.message ?? null,
    };
  }
  return {
    status: JOB_STATUS[status] ?? "processing",
    phase: status || "processing",
  };
}

export async function pollVooEngineVideoJob({ endpoint, uid } = {}) {
  if (typeof uid !== "string" || !uid.trim()) {
    throw new LocalBackendError("localBackend.unknownTask");
  }
  const job = await localRequest(
    endpointUrl(endpoint, `/sdcpp/v1/jobs/${encodeURIComponent(uid)}`),
    { timeoutMs: 30000 },
  );
  const status = String(job?.status ?? "").toLowerCase();
  if (status === "completed") {
    const base64 = job?.result?.b64_json;
    const format = job?.result?.output_format;
    const mime = {
      webm: "video/webm",
      avi: "video/x-msvideo",
      webp: "image/webp",
    }[format];
    if (typeof base64 !== "string" || !base64 || !mime) {
      throw new LocalBackendError("localBackend.noOutput", { job });
    }
    return { status: "completed", urls: [`data:${mime};base64,${base64}`] };
  }
  if (status === "failed" || status === "cancelled") {
    return {
      status: "failed",
      error: job?.error?.code ?? "localBackend.executionFailed",
      errorMessage: job?.error?.message ?? null,
    };
  }
  return {
    status: JOB_STATUS[status] ?? "processing",
    phase: status || "processing",
  };
}

/** Best-effort server-side cancel; the provider's Stop stays UI-driven. */
export async function cancelVooEngineJob({ endpoint, uid } = {}) {
  if (typeof uid !== "string" || !uid.trim()) return { ok: false };
  try {
    await localRequest(
      endpointUrl(endpoint, `/sdcpp/v1/jobs/${encodeURIComponent(uid)}/cancel`),
      { method: "POST", timeoutMs: 15000 },
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, code: error?.code ?? "localBackend.failed" };
  }
}
