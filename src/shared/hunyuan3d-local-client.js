/**
 * Hunyuan3D 2.1, driven straight from VOO instead of through ComfyUI.
 *
 * Tencent ships a first-party FastAPI server in the Hunyuan3D-2.1 repo
 * (`python api_server.py`, default `127.0.0.1:8081`) with exactly the two
 * things a canvas node needs:
 *
 *  - `POST /send` accepts one base64 image and returns `{uid}` immediately;
 *  - `GET /status/{uid}` reports `processing` → `texturing` → `completed`
 *    (with the finished GLB as `model_base64`), or `error`.
 *
 * That maps onto this codebase's submit-then-poll job shape without a local
 * ComfyUI graph, custom node pack, or multipart upload — the image is already
 * a data URL, so it is stripped and posted as JSON.
 *
 * Lifecycle is separate: Electron can install/run the MLX adapter, while a
 * user-started Tencent server remains usable without a managed installation.
 * Both implement this same health/submit/poll contract over loopback.
 */

import {
  LocalBackendError,
  localRequest,
  normaliseEndpoint,
} from "./local_transport.js";

export const HUNYUAN3D_LOCAL_DEFAULT_ENDPOINT = "http://127.0.0.1:8081";
export const HUNYUAN3D_LOCAL_MODEL_ID = "tencent/Hunyuan3D-2.1";
export const HUNYUAN3D_LOCAL_MODEL_LABEL = "Hunyuan3D 2.1";

function endpointUrl(endpoint, pathname) {
  return `${normaliseEndpoint(endpoint || HUNYUAN3D_LOCAL_DEFAULT_ENDPOINT)}${pathname}`;
}

/**
 * The server's `load_image_from_base64` calls `b64decode` on the value
 * directly, so a `data:` prefix has to come off here — passing the whole data
 * URL through produces a corrupt image rather than an error.
 */
export function toRawBase64(image) {
  if (typeof image !== "string") return null;
  const value = image.trim();
  if (!value) return null;
  if (!value.startsWith("data:")) return value;
  const comma = value.indexOf(",");
  if (comma < 0) return null;
  return value.slice(comma + 1);
}

/**
 * Pad a non-square image into a square canvas so Hunyuan3D does not stretch
 * it when it internally resizes to 512×512.
 *
 * The image is centred on a white square whose side equals the longer
 * dimension, preserving aspect ratio. Returns a PNG data-URL string.
 * In non-browser environments (node:test) the original image is returned
 * unchanged since OffscreenCanvas is unavailable.
 */
export async function padImageToSquare(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return dataUrl;
  }
  // No DOM → cannot manipulate pixels; pass through.
  if (typeof Image === "undefined" || typeof document === "undefined") {
    return dataUrl;
  }
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
    const { naturalWidth: w, naturalHeight: h } = img;
    // Already square (or degenerate): nothing to do.
    if (w === h || w === 0 || h === 0) return dataUrl;

    const side = Math.max(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    // White background so transparent areas don't turn black after the
    // model's own background-removal step.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, side, side);
    // Centre the original image.
    const dx = Math.round((side - w) / 2);
    const dy = Math.round((side - h) / 2);
    ctx.drawImage(img, dx, dy);
    return canvas.toDataURL("image/png");
  } catch {
    // If anything goes wrong, fall back to the original image rather than
    // blocking generation entirely.
    return dataUrl;
  }
}

/** True when the server answers on this endpoint. */
export async function pingHunyuan3DLocal(endpoint, { timeoutMs = 2500 } = {}) {
  const health = await localRequest(endpointUrl(endpoint, "/health"), {
    timeoutMs,
  });
  if (health?.status !== "healthy") {
    throw new LocalBackendError("localBackend.unreachable", {
      endpoint,
      health,
    });
  }
  return {
    ok: true,
    engine: "hunyuan3d",
    workerId: health.worker_id ?? null,
  };
}

/**
 * The model the server serves.
 *
 * Hunyuan3D's server loads exactly one checkpoint from `--model_path`, so
 * there is no directory to enumerate. A healthy server is the whole answer.
 */
export async function listHunyuan3DLocalCheckpoints(endpoint) {
  await pingHunyuan3DLocal(endpoint);
  return [HUNYUAN3D_LOCAL_MODEL_ID];
}

/**
 * Painting budget for the local PBR stage.
 *
 * The canvas api3d node already exposes a texture-quality choice for the hosted
 * provider, so reuse it: the local server's budget is an atlas edge length plus
 * a view count, and its own default (2048^2 / four views) is the fast path.
 * Only a real choice is sent, so an unconfigured node keeps whatever budget the
 * server defaults to instead of pinning one here.
 *
 * The node request reaches us in the provider-neutral shape, where the field is
 * snake_case (`texture_quality`); the camelCase spellings are kept for callers
 * that build the request by hand (the agent tools and the tests).
 */
const LOCAL_TEXTURE_BUDGETS = {
  standard: { texture_size: 2048, max_views: 4 },
  detailed: { texture_size: 4096, max_views: 6 },
};

function textureBudget(request = {}) {
  const quality = String(
    request.textureQuality || request.texture_quality || "",
  ).toLowerCase();
  const preset = LOCAL_TEXTURE_BUDGETS[quality] ?? {};
  const size = Number.isFinite(request.textureSize)
    ? request.textureSize
    : preset.texture_size;
  const views = Number.isFinite(request.maxViews)
    ? request.maxViews
    : preset.max_views;
  const budget = {};
  if (Number.isFinite(size) && size > 0) budget.texture_size = Math.round(size);
  if (Number.isFinite(views) && views > 0) budget.max_views = Math.round(views);
  return budget;
}

/** Queues one image-to-3D job and resolves to the server's task id. */
export async function submitHunyuan3DImageTo3D({
  endpoint,
  image,
  request = {},
} = {}) {
  // Pad non-square images to a square canvas so the model does not stretch
  // them when it internally resizes to its training resolution.
  const squared = await padImageToSquare(image);
  const rawImage = toRawBase64(squared);
  if (!rawImage) {
    throw new LocalBackendError("hunyuan3d.imageRequired");
  }
  const body = {
    image: rawImage,
    // The reference server removes the background and textures by default;
    // keeping its defaults means one less thing to drift between versions.
    remove_background: true,
    texture: true,
  };
  const faceLimit = Number(request.faceLimit ?? request.face_limit);
  if (Number.isFinite(faceLimit) && faceLimit > 0) {
    body.face_count = Math.round(faceLimit);
  }
  if (request.texture === false) {
    // Geometry only: the server returns the shape mesh and skips the PBR stage,
    // so a texture budget would only be noise on the request.
    body.texture = false;
  } else {
    Object.assign(body, textureBudget(request));
  }

  const queued = await localRequest(endpointUrl(endpoint, "/send"), {
    method: "POST",
    json: body,
    timeoutMs: 60000,
  });
  const uid = queued?.uid;
  if (typeof uid !== "string" || !uid.trim()) {
    // A 200 without a uid is a version mismatch, not a queued job.
    throw new LocalBackendError("localBackend.submitRejected", { queued });
  }
  return { uid };
}

/**
 * One poll of a queued job, in the provider's status vocabulary.
 *
 * Called repeatedly by the provider layer rather than looping here, so a Stop
 * request lands between polls instead of waiting out a multi-minute request.
 */
export async function pollHunyuan3DJob({ endpoint, uid } = {}) {
  if (typeof uid !== "string" || !uid.trim()) {
    throw new LocalBackendError("localBackend.unknownTask");
  }
  const payload = await localRequest(
    endpointUrl(endpoint, `/status/${encodeURIComponent(uid)}`),
    { timeoutMs: 30000 },
  );
  const status = String(payload?.status ?? "").toLowerCase();

  if (status === "completed") {
    const base64 = payload?.model_base64;
    if (typeof base64 !== "string" || !base64) {
      throw new LocalBackendError("localBackend.noOutput", { uid });
    }
    return {
      status: "completed",
      urls: [`data:model/gltf-binary;base64,${base64}`],
    };
  }
  if (status === "error") {
    return {
      status: "failed",
      error: "localBackend.executionFailed",
      errorMessage: payload?.message ?? null,
    };
  }
  // "processing", "texturing", and anything newer we do not know yet all mean
  // "keep waiting" — an unknown status is not proof of failure.
  return { status: "processing", phase: status || "processing" };
}
