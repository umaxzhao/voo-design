/**
 * The local backends VOO can drive, as data.
 *
 * One table rather than branching in the provider, for the same reason
 * `matting_models.js` exists: adding a backend is a row here. Each row says how
 * to detect it, and which capabilities it offers — each an asynchronous job
 * pair (`async.submit` + `async.poll`) that may list its own models. The
 * provider, the routes and the settings UI all read that declaration, so a new
 * medium or model does not add an `if` anywhere else.
 *
 * VOO Local Engine runs stable-diffusion.cpp for installed image and video
 * checkpoints. Hunyuan3D is a separate, optional image-to-3D runtime.
 */

import {
  VOO_ENGINE_DEFAULT_ENDPOINT,
  listVooEngineModels,
  pingVooEngine,
  pollVooEngineJob,
  submitVooEngineJob,
  pollVooEngineVideoJob,
  submitVooEngineVideoJob,
} from "./voo_engine_client.js";
import { LOCAL_CAPABILITY } from "./local_capabilities.js";
import {
  HUNYUAN3D_LOCAL_DEFAULT_ENDPOINT,
  HUNYUAN3D_LOCAL_MODEL_ID,
  listHunyuan3DLocalCheckpoints,
  pingHunyuan3DLocal,
  pollHunyuan3DJob,
  submitHunyuan3DImageTo3D,
} from "./hunyuan3d-local-client.js";

/** Settings keys. Kept together so nothing invents a near-miss spelling. */
export const LOCAL_BACKEND_KIND_KEY = "voo.localBackendKind";
export const LOCAL_ENDPOINT_KEY = "voo.localInferenceUrl";

export const LOCAL_BACKEND_KIND = {
  VOO_ENGINE: "voo-engine",
  HUNYUAN3D: "hunyuan3d",
};

/**
 * Capability entry shape:
 *
 *   { models?: (endpoint) => string[], async: { submit, poll } }
 *
 * `async.submit` resolves to `{ uid }`, `async.poll` resolves to
 * `{ status, urls?, error?, errorMessage? }` in `REMOTE_JOB_STATUS` terms.
 */
export const LOCAL_BACKENDS = [
  {
    /**
     * VOO's own engine: stable-diffusion.cpp's `sd-server`, installed and
     * launched by the desktop app. One model per process, so the model list is
     * "whatever the engine currently has loaded" — the settings model library
     * is what switches it.
     *
     * `img_gen` does text-to-image and image-to-image with the same endpoint,
     * which is why this row declares both image capabilities with the same
     * async job pair.
     */
    kind: LOCAL_BACKEND_KIND.VOO_ENGINE,
    lifecycle: { kind: "native", bridge: "localEngine" },
    label: "VOO Local Engine",
    defaultEndpoint: VOO_ENGINE_DEFAULT_ENDPOINT,
    downloadUrl: "https://github.com/leejet/stable-diffusion.cpp",
    ping: pingVooEngine,
    capabilities: {
      [LOCAL_CAPABILITY.IMAGE_GENERATION]: {
        models: (endpoint) =>
          listVooEngineModels(endpoint, LOCAL_CAPABILITY.IMAGE_GENERATION),
        async: { submit: submitVooEngineJob, poll: pollVooEngineJob },
      },
      [LOCAL_CAPABILITY.IMAGE_EDIT]: {
        models: (endpoint) =>
          listVooEngineModels(endpoint, LOCAL_CAPABILITY.IMAGE_EDIT),
        async: { submit: submitVooEngineJob, poll: pollVooEngineJob },
      },
      [LOCAL_CAPABILITY.VIDEO_GENERATION]: {
        models: (endpoint) =>
          listVooEngineModels(endpoint, LOCAL_CAPABILITY.VIDEO_GENERATION),
        async: {
          submit: submitVooEngineVideoJob,
          poll: pollVooEngineVideoJob,
        },
      },
    },
  },
  {
    kind: LOCAL_BACKEND_KIND.HUNYUAN3D,
    lifecycle: { kind: "uv-python", bridge: "hunyuan3d" },
    label: "Hunyuan3D 2.1",
    defaultEndpoint: HUNYUAN3D_LOCAL_DEFAULT_ENDPOINT,
    modelId: HUNYUAN3D_LOCAL_MODEL_ID,
    ping: pingHunyuan3DLocal,
    capabilities: {
      [LOCAL_CAPABILITY.MODEL_3D_GENERATION]: {
        models: listHunyuan3DLocalCheckpoints,
        async: {
          submit: submitHunyuan3DImageTo3D,
          poll: pollHunyuan3DJob,
        },
      },
    },
  },
];

export const DEFAULT_LOCAL_BACKEND_KIND = LOCAL_BACKEND_KIND.VOO_ENGINE;

/**
 * Resolves a stored kind to a backend.
 *
 * Falls back rather than throwing, on the same reasoning as
 * `resolveMattingModel`: a setting can outlive the backend it names. That also
 * migrates the retired `qwen-local` kind onto the engine that replaced it.
 */
export function resolveLocalBackend(kind) {
  return (
    LOCAL_BACKENDS.find((backend) => backend.kind === kind) ??
    LOCAL_BACKENDS.find(
      (backend) => backend.kind === DEFAULT_LOCAL_BACKEND_KIND,
    ) ??
    LOCAL_BACKENDS[0]
  );
}
