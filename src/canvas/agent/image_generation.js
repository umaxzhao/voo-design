/**
 * Generates an image straight through a model provider and places the result
 * as an image layer in the open design editor. No graph node is involved.
 */

import { abortable } from "./abortable.js";

import {
  fetchRegisteredProviderJob,
  submitRegisteredProviderJob,
} from "../../shared/providers/provider_registry.js";
import { REMOTE_JOB_STATUS } from "../../shared/providers.js";

const DEFAULT_MAX_POLLS = 90;
const DEFAULT_POLL_INTERVAL_MS = 2000;

export const IMAGE_GENERATION_ERROR = Object.freeze({
  NO_EDITOR: "generateImageNoEditor",
  FAILED: "generateImageFailed",
  TIMEOUT: "generateImageTimeout",
  NO_RESULT: "generateImageNoResult",
});

function generationError(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Submits one image job and polls until it completes. Fails fast on a provider
 * failure, a job that never finishes, or a completed job with no image.
 */
export async function runImageJob({
  providerId,
  request,
  submit = submitRegisteredProviderJob,
  fetch = fetchRegisteredProviderJob,
  maxPolls = DEFAULT_MAX_POLLS,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  sleep = wait,
  signal,
}) {
  const submitted = await abortable(() => submit({ mediaType: "image", providerId, request, ...(signal ? { signal } : {}) }), signal);
  const taskId = submitted?.taskId ?? null;
  let state = submitted;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    signal?.throwIfAborted();
    if (state?.status === REMOTE_JOB_STATUS.FAILED) {
      throw generationError(IMAGE_GENERATION_ERROR.FAILED, state.error ?? "");
    }
    if (state?.status === REMOTE_JOB_STATUS.COMPLETED) {
      const urls = Array.isArray(state.urls) ? state.urls.filter(Boolean) : [];
      if (urls.length === 0) {
        throw generationError(IMAGE_GENERATION_ERROR.NO_RESULT);
      }
      return { taskId, urls };
    }
    if (!taskId) {
      throw generationError(IMAGE_GENERATION_ERROR.NO_RESULT);
    }
    await abortable(() => sleep(intervalMs), signal);
    state = await abortable(() => fetch({ mediaType: "image", providerId, taskId, ...(signal ? { signal } : {}) }), signal);
  }
  throw generationError(IMAGE_GENERATION_ERROR.TIMEOUT, taskId);
}

/**
 * Places the first generated image into the open editor at `point`.
 * `editor` is the live engine (window.__vooEditor); without one the image has
 * nowhere to go, so the call fails instead of pretending it was placed.
 */
export async function placeImageInEditor(editor, url, point = null) {
  if (!editor || typeof editor.insertImage !== "function") {
    throw generationError(IMAGE_GENERATION_ERROR.NO_EDITOR);
  }
  const node = await editor.insertImage(url, point);
  return { placed: true, url, layerId: node?.id ?? null };
}
