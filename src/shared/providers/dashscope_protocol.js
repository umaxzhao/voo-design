/**
 * Translates the canvas's flat request shape into DashScope's `{input, parameters}`
 * bodies, and reads results back out.
 *
 * Kept apart from the transport in `provider_dashscope.js` so the shape rules —
 * which differ per model family — can be unit-tested without a network stub.
 */

import { API_MEDIA_TYPE, REMOTE_JOB_STATUS } from "../providers.js";

/**
 * `x ?? []` guards only null/undefined, not a wrong-type value. A remote may
 * return a single object (or a number) where the contract says "array"; treating
 * any non-array as empty keeps the extractor from throwing a "not iterable"
 * TypeError on a malformed 200 response, and matches the module's "no result =>
 * empty array" contract instead of inventing a third behaviour.
 */
const asArray = (value) => (Array.isArray(value) ? value : []);

const IMAGE_PATH = "/api/v1/services/aigc/multimodal-generation/generation";
const VIDEO_PATH = "/api/v1/services/aigc/video-generation/video-synthesis";
/** Paraformer file transcription (offline ASR, submit-then-poll). */
const ASR_PATH = "/api/v1/services/asr/transcription";
/** 3D model generation (Tripo, submit-then-poll). */
const MODEL_3D_PATH = "/api/v1/services/aigc/3d-generation/generation";

/** Qwen Image accepts at most three reference images per request. */
const MAX_IMAGE_REFERENCES = 3;

const DEFAULT_VIDEO_RESOLUTION = "720P";

/** `size` is 宽*高; these are the safe defaults for each ratio the node offers. */
const IMAGE_SIZE_BY_RATIO = {
  "1:1": "1024*1024",
  "16:9": "1280*720",
  "9:16": "720*1280",
  "4:3": "1024*768",
  "3:4": "768*1024",
};

/**
 * PixVerse and Vidu name a lone starting image `image`; Wan, HappyHorse and
 * 可灵 name the same thing `first_frame`. A first+last pair is always
 * `first_frame` then `last_frame`, on every family.
 */
const PLAIN_IMAGE_FAMILIES = ["pixverse", "vidu"];

export function imagePath() {
  return IMAGE_PATH;
}

export function videoPath() {
  return VIDEO_PATH;
}

export function asrPath() {
  return ASR_PATH;
}

export function model3dPath() {
  return MODEL_3D_PATH;
}

/**
 * Builds the DashScope body for paraformer file transcription.
 *
 * @param {object} request
 * @param {string} request.fileUrl - public URL of the audio/video to transcribe.
 * @param {string} [request.model] - defaults to paraformer-v2.
 * @param {string} [request.language] - defaults to zh (or zh|en for bilingual).
 * @returns {object} DashScope `{model, input, parameters}` body.
 */
export function buildAsrBody({ fileUrl, model, language }) {
  return {
    model: model || "paraformer-v2",
    input: { file_urls: [fileUrl] },
    parameters: compact({
      language_hints: language ? [language] : null,
      // Full-text result alongside per-sentence timestamps.
      transcription: { utterance_id: false },
    }),
  };
}

/**
 * Extracts timed sentences from a paraformer task payload.
 *
 * DashScope answers with `output.results[].transcripts[].sentence[]`, each
 * `{text, begin_time, end_time}` in milliseconds; some shapes nest inside
 * `output.results[].transcripts[].sentence_info` or use `sentence_info[]`
 * with `begin`/`end` seconds. All shapes are read.
 *
 * @returns {Array<{startMs: number, endMs: number, text: string}>}
 */
export function extractAsrSentences(payload) {
  const output = payload?.output ?? {};
  const sentences = [];
  for (const result of asArray(output.results)) {
    for (const transcript of asArray(result?.transcripts)) {
      const list = transcript.sentence ?? transcript.sentence_info ?? [];
      for (const item of asArray(list)) {
        const text = String(item?.text ?? "").trim();
        if (!text) continue;
        // sentence[] uses millisecond begin_time/end_time; sentence_info[]
        // uses whole-second begin/end. Normalize both to ms, then drop any
        // record whose timestamps are missing or not finite numbers — a remote
        // that sends a non-numeric `begin`/`end` coerces to NaN, which a bare
        // `== null` guard would let through as a garbage timestamp.
        let startMs =
          item.begin_time ?? (item.begin != null ? item.begin * 1000 : null);
        let endMs =
          item.end_time ?? (item.end != null ? item.end * 1000 : null);
        if (startMs != null) startMs = Number(startMs);
        if (endMs != null) endMs = Number(endMs);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
        sentences.push({ startMs, endMs, text });
      }
    }
  }
  return sentences;
}

function compact(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== "" && value != null),
  );
}

/** Accepts `1024*1024`, `1024x1024`, or spaced variants; rejects anything else. */
function parseSize(resolution) {
  const match = /^(\d{2,5})\s*[*xX×]\s*(\d{2,5})$/.exec(
    (resolution ?? "").trim(),
  );
  return match ? `${match[1]}*${match[2]}` : null;
}

function imageSize(request) {
  return (
    parseSize(request.resolution) ??
    IMAGE_SIZE_BY_RATIO[request.aspect_ratio] ??
    IMAGE_SIZE_BY_RATIO["1:1"]
  );
}

/** DashScope wants `480P` / `720P` / `1080P`; the node's field is free text. */
function videoResolution(resolution) {
  const match = /^(\d{3,4})\s*[pP]$/.exec((resolution ?? "").trim());
  return match ? `${match[1]}P` : DEFAULT_VIDEO_RESOLUTION;
}

function firstFrameType(model) {
  const lower = (model ?? "").toLowerCase();
  return PLAIN_IMAGE_FAMILIES.some((family) => lower.includes(family))
    ? "image"
    : "first_frame";
}

function referenceImages(request) {
  if (Array.isArray(request.images)) return request.images.filter(Boolean);
  const { image } = request;
  if (Array.isArray(image)) return image.filter(Boolean);
  return image ? [image] : [];
}

function buildImageBody(request) {
  const content = referenceImages(request)
    .slice(0, MAX_IMAGE_REFERENCES)
    .map((url) => ({ image: url }));
  // The instruction goes last: editing models read the images that precede it
  // as the subject the text is talking about.
  content.push({ text: request.prompt ?? "" });

  return {
    model: request.model,
    input: { messages: [{ role: "user", content }] },
    parameters: compact({
      size: imageSize(request),
      n: request.n,
      // The canvas prompt is written deliberately, so leave it alone rather
      // than letting the service rewrite it behind the user's back.
      prompt_extend: false,
      watermark: false,
    }),
  };
}

function buildVideoMedia(request) {
  const images = referenceImages(request);
  const first = images[0];
  if (!first) return null;
  const model = (request.model ?? "").toLowerCase();
  if (model.includes("happyhorse")) {
    // HappyHorse's three capabilities are strict: t2v rejects media, i2v
    // accepts one first_frame only, and r2v accepts 1–9 reference images.
    if (model.includes("t2v")) return null;
    if (model.includes("r2v")) {
      return images.slice(0, 9).map((url) => ({
        type: "reference_image",
        url,
      }));
    }
    return [{ type: "first_frame", url: first }];
  }
  if (!request.end_image) {
    return [{ type: firstFrameType(request.model), url: first }];
  }
  return [
    { type: "first_frame", url: first },
    { type: "last_frame", url: request.end_image },
  ];
}

function buildVideoBody(request) {
  const media = buildVideoMedia(request);
  const model = (request.model ?? "").toLowerCase();
  const isReferenceToVideo = model.includes("r2v");
  const isWan3 = model.startsWith("wan3.0-video");
  return {
    model: request.model,
    input: compact({ prompt: request.prompt, media }),
    parameters: compact({
      resolution: videoResolution(request.resolution),
      // First-frame models inherit the frame's proportions. Reference-to-video
      // models instead accept an explicit output ratio even when media exists.
      ratio: media && !isReferenceToVideo ? null : request.aspect_ratio,
      duration: request.duration,
      audio: isWan3 ? request.audio : null,
      seed: isWan3 ? request.seed : null,
      prompt_extend: isWan3 ? request.prompt_extend : false,
      watermark: isWan3 ? request.watermark : false,
    }),
  };
}

function build3dBody(request) {
  const images = referenceImages(request);
  const first = images[0];
  return {
    model: request.model || "Tripo/Tripo-H3.1",
    input: compact({
      prompt: request.prompt || undefined,
      image_url: first || request.image || undefined,
    }),
    parameters: compact({
      texture_quality: request.textureQuality || request.texture_quality,
      quad: request.quad,
      face_limit: request.faceLimit || request.face_limit,
    }),
  };
}

/**
 * @param {object} request - the flat shape from `buildApiRequest`
 * @param {string} mediaType - one of `API_MEDIA_TYPE`
 */
export function buildDashscopeBody(request, mediaType) {
  if (mediaType === API_MEDIA_TYPE.MODEL_3D) return build3dBody(request);
  return mediaType === API_MEDIA_TYPE.VIDEO
    ? buildVideoBody(request)
    : buildImageBody(request);
}

const STATUS_MAP = {
  PENDING: REMOTE_JOB_STATUS.PENDING,
  RUNNING: REMOTE_JOB_STATUS.PROCESSING,
  SUCCEEDED: REMOTE_JOB_STATUS.COMPLETED,
  FAILED: REMOTE_JOB_STATUS.FAILED,
  CANCELED: REMOTE_JOB_STATUS.FAILED,
  UNKNOWN: REMOTE_JOB_STATUS.FAILED,
};

export function normalizeDashscopeStatus(status) {
  if (!status) return REMOTE_JOB_STATUS.PROCESSING;
  return (
    STATUS_MAP[String(status).toUpperCase()] ?? REMOTE_JOB_STATUS.PROCESSING
  );
}

function pushUrl(urls, value) {
  if (typeof value === "string" && value) urls.push(value);
}

/**
 * Collects result URLs across the shapes DashScope uses.
 *
 * Video answers with a single `output.video_url`; Qwen Image answers inside a
 * chat-style `output.choices[].message.content[]`; the older image endpoints
 * answer with `output.results[]`. All three are read, because a model can be
 * typed into the node's custom-ID field and land on any of them.
 */
export function extractDashscopeUrls(payload, mediaType) {
  const output = payload?.output ?? {};
  const urls = [];

  if (mediaType === API_MEDIA_TYPE.VIDEO) {
    pushUrl(urls, output.video_url);
  }

  if (mediaType === API_MEDIA_TYPE.MODEL_3D) {
    pushUrl(urls, output.model_url);
    pushUrl(urls, output.output_url);
    pushUrl(urls, output.file_url);
    pushUrl(urls, output.glb_url);
    if (Array.isArray(output.render_urls)) {
      for (const u of output.render_urls) pushUrl(urls, u);
    }
    for (const val of Object.values(output)) {
      if (
        typeof val === "string" &&
        (val.endsWith(".glb") ||
          val.endsWith(".obj") ||
          val.endsWith(".fbx") ||
          val.includes(".glb?"))
      ) {
        pushUrl(urls, val);
      }
    }
  }

  for (const choice of asArray(output.choices)) {
    for (const part of asArray(choice?.message?.content)) {
      pushUrl(urls, part?.image);
      pushUrl(urls, part?.video);
      pushUrl(urls, part?.model);
    }
  }

  for (const result of asArray(output.results)) {
    pushUrl(urls, result?.url);
    pushUrl(urls, result?.image);
    pushUrl(urls, result?.video_url);
    pushUrl(urls, result?.model_url);
  }

  return [...new Set(urls)];
}
