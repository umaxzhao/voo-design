import { DEFAULT_API_AUDIO_MODELS, REMOTE_JOB_STATUS } from "../providers.js";
import { ProviderError } from "./provider_302_error.js";

const SPEECH_TIMEOUT_MS = 120000;
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const BASE64_CHUNK_BYTES = 0x8000;

/** Speech is binary and synchronous; no artificial remote task is created. */
export async function audioResponseDataUrl(response) {
  const mime = response.headers?.get("content-type")?.split(";")[0]?.trim();
  if (
    mime &&
    !mime.startsWith("audio/") &&
    mime !== "application/octet-stream"
  ) {
    throw new ProviderError("providerInvalidResponse");
  }
  if (Number(response.headers?.get("content-length")) > MAX_AUDIO_BYTES)
    throw new ProviderError("providerInvalidResponse");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_AUDIO_BYTES)
    throw new ProviderError("providerInvalidResponse");
  let binary = "";
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + BASE64_CHUNK_BYTES),
    );
  }
  return `data:${mime?.startsWith("audio/") ? mime : "audio/mpeg"};base64,${btoa(binary)}`;
}

function sunoData(payload) {
  // The current gateway returns 200; its documented legacy envelope uses success.
  if (payload?.code !== 200 && payload?.code !== "success") {
    throw new ProviderError(
      "providerRequestFailed",
      typeof payload?.message === "string" ? payload.message : undefined,
    );
  }
  return payload.data;
}

export async function submitAudioJob(request, apiRequest) {
  const model = DEFAULT_API_AUDIO_MODELS.find(
    (item) => item.id === request?.model,
  );
  if (!model || typeof request?.prompt !== "string" || !request.prompt.trim())
    throw new ProviderError("providerModelRequired");
  if (request.audioMode && request.audioMode !== model.audioMode)
    throw new ProviderError("providerUnsupportedMedia");
  if (model.audioMode === "tts") {
    // https://doc.302.ai/147522051e0
    const url = await apiRequest("/v1/audio/speech", {
      method: "POST",
      timeoutMs: SPEECH_TIMEOUT_MS,
      responseType: "audio",
      retryNetworkErrors: false,
      body: {
        model: model.id,
        input: request.prompt,
        voice: request.voice?.trim() || "alloy",
        response_format: "mp3",
      },
    });
    return {
      status: REMOTE_JOB_STATUS.COMPLETED,
      urls: [url],
      errorMessage: null,
      submittedAt: Date.now(),
    };
  }
  // https://doc.302.ai/api-192310067
  const taskId = sunoData(
    await apiRequest("/suno/submit/music", {
      method: "POST",
      retryNetworkErrors: false,
      body: {
        gpt_description_prompt: request.prompt,
        mv: model.id,
        make_instrumental: Boolean(request.make_instrumental),
      },
    }),
  );
  if (typeof taskId !== "string" || !taskId.trim())
    throw new ProviderError("providerInvalidResponse");
  return {
    taskId,
    status: REMOTE_JOB_STATUS.PENDING,
    urls: [],
    errorMessage: null,
    submittedAt: Date.now(),
  };
}

function songUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol) ? value : null;
  } catch {
    return null;
  }
}

export async function fetchAudioJob(taskId, apiRequest) {
  if (typeof taskId !== "string" || !taskId.trim())
    throw new ProviderError("providerInvalidResponse");
  // TTS has no polling path. Only Suno submissions produce task IDs.
  // https://doc.302.ai/192310084e0
  const data = sunoData(
    await apiRequest(`/suno/fetch/${encodeURIComponent(taskId)}`),
  );
  if (!data || typeof data !== "object" || data.task_id !== taskId)
    throw new ProviderError("providerInvalidResponse");
  const state = String(data.status ?? "").toUpperCase();
  let status;
  if (["SUCCESS", "COMPLETED"].includes(state))
    status = REMOTE_JOB_STATUS.COMPLETED;
  else if (["FAILURE", "FAILED", "CANCELLED", "CANCELED"].includes(state))
    status = REMOTE_JOB_STATUS.FAILED;
  else if (["IN_PROGRESS", "RUNNING"].includes(state))
    status = REMOTE_JOB_STATUS.PROCESSING;
  else if (["NOT_START", "SUBMITTED", "QUEUED", "PENDING"].includes(state))
    status = REMOTE_JOB_STATUS.PENDING;
  else throw new ProviderError("providerInvalidResponse");
  // URLs can appear while Suno is still streaming; wait for terminal success.
  const urls =
    status === REMOTE_JOB_STATUS.COMPLETED && Array.isArray(data.data)
      ? [
          ...new Set(
            data.data.map((song) => songUrl(song?.audio_url)).filter(Boolean),
          ),
        ]
      : [];
  if (status === REMOTE_JOB_STATUS.COMPLETED && urls.length === 0)
    throw new ProviderError("providerInvalidResponse");
  return {
    taskId,
    status,
    urls,
    errorMessage:
      status === REMOTE_JOB_STATUS.FAILED
        ? (typeof data.fail_reason === "string" && data.fail_reason.trim()) ||
          "providerRequestFailed"
        : null,
  };
}
