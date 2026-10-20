import { DEFAULT_API_3D_MODELS, REMOTE_JOB_STATUS } from "../providers.js";
import { ProviderError } from "./provider_302_error.js";

// 302 gateway protocol, not Tripo's direct v3 API:
// https://doc.302.ai/243932232e0 and https://doc.302.ai/243939269e0
const TASK_PATH = "/tripo3d/v2/openapi/task";

function taskData(payload) {
  if (payload?.code !== 0) {
    throw new ProviderError(
      typeof payload?.code === "number"
        ? "providerRequestFailed"
        : "providerInvalidResponse",
      typeof payload?.message === "string" ? payload.message : undefined,
    );
  }
  if (
    !payload.data ||
    typeof payload.data !== "object" ||
    Array.isArray(payload.data)
  ) {
    throw new ProviderError("providerInvalidResponse");
  }
  return payload.data;
}

function modelUrl(value) {
  const candidate = typeof value === "string" ? value : value?.url;
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  try {
    const url = new URL(candidate);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    if (value?.type !== "glb" && !url.pathname.toLowerCase().endsWith(".glb"))
      return null;
    return candidate;
  } catch {
    return null;
  }
}

export function extractTripoModelUrls(data) {
  const slots = ["pbr_model", "model", "base_model"];
  return [
    ...new Set(
      slots
        .flatMap((key) => [data?.output?.[key], data?.result?.[key]])
        .map(modelUrl)
        .filter(Boolean),
    ),
  ];
}

function normalizedStatus(status) {
  const value = String(status ?? "").toLowerCase();
  if (value === "success") return REMOTE_JOB_STATUS.COMPLETED;
  if (["failed", "cancelled", "canceled", "banned", "expired"].includes(value))
    return REMOTE_JOB_STATUS.FAILED;
  if (["running", "processing", "in_progress"].includes(value))
    return REMOTE_JOB_STATUS.PROCESSING;
  if (["queued", "pending"].includes(value)) return REMOTE_JOB_STATUS.PENDING;
  throw new ProviderError("providerInvalidResponse");
}

// Tripo names the upload format rather than reading it back off the URL, so the
// extension has to be mapped onto the set the gateway accepts. Anything else
// falls back to png, which is what the media upload gateway emits by default.
const IMAGE_TYPE_BY_EXTENSION = {
  png: "png",
  jpg: "jpg",
  jpeg: "jpg",
  webp: "webp",
};

/** Resolves a reference image URL into Tripo's `{type, url}` file descriptor. */
function referenceFile(image) {
  if (typeof image !== "string" || !image.trim()) return null;
  let url;
  try {
    url = new URL(image);
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(url.protocol)) return null;
  const extension = url.pathname.split(".").pop()?.toLowerCase() ?? "";
  return { type: IMAGE_TYPE_BY_EXTENSION[extension] ?? "png", url: image };
}

/**
 * Copies the optional geometry controls onto a submit body.
 *
 * Field names come from Tripo's v2 openapi doc; whether the 302 gateway
 * forwards each one has NOT been verified against the live service. Only keys
 * present on the request are copied, so a workflow that never touched these
 * controls submits the exact body shape that shipped before they existed.
 */
function withGeometryOptions(body, request) {
  const options = {
    // `texture: false` is the geometry-only mode; when it is set the quality
    // level is meaningless, so `buildApiRequest` never sends both.
    texture: request.texture,
    texture_quality: request.texture_quality,
    quad: request.quad,
    face_limit: request.face_limit,
  };
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== null && value !== "")
      body[key] = value;
  }
  return body;
}

export async function submitTripoJob(request, apiRequest) {
  if (!DEFAULT_API_3D_MODELS.some((model) => model.id === request?.model)) {
    throw new ProviderError("providerModelRequired");
  }
  const file = referenceFile(request?.image);
  // A reference image carries the shape on its own, so image_to_model does not
  // need a prompt. text_to_model has nothing else to work from and still does.
  const hasPrompt =
    typeof request?.prompt === "string" && Boolean(request.prompt.trim());
  if (!file && !hasPrompt) {
    throw new ProviderError("providerModelRequired");
  }
  const body = file
    ? { type: "image_to_model", file, model_version: request.model }
    : {
        type: "text_to_model",
        prompt: request.prompt,
        model_version: request.model,
      };
  const data = taskData(
    await apiRequest(TASK_PATH, {
      method: "POST",
      retryNetworkErrors: false,
      body: withGeometryOptions(body, request ?? {}),
    }),
  );
  if (typeof data.task_id !== "string" || !data.task_id.trim())
    throw new ProviderError("providerInvalidResponse");
  return {
    taskId: data.task_id,
    status: REMOTE_JOB_STATUS.PENDING,
    urls: [],
    errorMessage: null,
    submittedAt: Date.now(),
  };
}

export async function fetchTripoJob(taskId, apiRequest) {
  if (typeof taskId !== "string" || !taskId.trim())
    throw new ProviderError("providerInvalidResponse");
  const data = taskData(
    await apiRequest(`${TASK_PATH}/${encodeURIComponent(taskId)}`),
  );
  if (data.task_id !== taskId)
    throw new ProviderError("providerInvalidResponse");
  const status = normalizedStatus(data.status);
  const urls =
    status === REMOTE_JOB_STATUS.COMPLETED ? extractTripoModelUrls(data) : [];
  if (status === REMOTE_JOB_STATUS.COMPLETED && urls.length === 0)
    throw new ProviderError("providerInvalidResponse");
  const message = [data.error?.message, data.error, data.message].find(
    (value) => typeof value === "string" && value.trim(),
  );
  return {
    taskId,
    status,
    urls,
    errorMessage:
      status === REMOTE_JOB_STATUS.FAILED
        ? (message ?? "providerRequestFailed")
        : null,
  };
}
