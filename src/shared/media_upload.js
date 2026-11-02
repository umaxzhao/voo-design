import { BG } from "./messages.js";
import { bytesToBase64 } from "./db_wire.js";
import { MEDIA_UPLOAD_URL } from "./vps_origin.js";

/**
 * Where the editor uploads a generation's reference media. Raw bytes go to
 * the hosted upload endpoint, which keeps them in a temporary directory and
 * returns a public URL for the upstream video or image API. Expired files are
 * removed after the configured TTL.
 */
export const MEDIA_UPLOAD_BASE_URL = MEDIA_UPLOAD_URL;

class MediaUploadError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "MediaUploadError";
    this.code = code;
  }
}

/** Retries one transient connection closure before surfacing an actionable error. */
async function uploadFetch(url, options) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (attempt === 1) {
        throw new MediaUploadError("mediaUploadNetworkError", error?.message);
      }
    }
  }
  throw new MediaUploadError("mediaUploadNetworkError");
}

function extensionFor(type) {
  return type?.split("/")[1]?.replace("jpeg", "jpg") || "bin";
}

function inferContentType(blob, filename) {
  if (
    blob?.type &&
    (blob.type.startsWith("image/") || blob.type.startsWith("video/"))
  ) {
    return blob.type;
  }
  if (filename) {
    const cleanName = filename.split("/").pop().split("\\").pop().toLowerCase();
    const ext = cleanName.split(".").pop();
    const map = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
    };
    if (map[ext]) return map[ext];
  }
  return blob?.type || "application/octet-stream";
}

export async function uploadMediaBlobDirect(blob, filename, contentType) {
  const resolvedType = contentType || inferContentType(blob, filename);
  const ext = extensionFor(resolvedType);
  const buffer = await blob.arrayBuffer();
  // POST raw bytes to the VOO host. The upload endpoint stores the file in a
  // temporary directory and returns its public URL.
  const response = await uploadFetch(
    `${MEDIA_UPLOAD_BASE_URL}?ext=${encodeURIComponent(ext)}`,
    { method: "POST", headers: { "Content-Type": resolvedType }, body: buffer },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `media upload HTTP ${response.status}`);
  }
  if (!payload.url) throw new Error("mediaUploadMissingUrl");
  return payload.url;
}

export async function uploadMediaBlob(blob, filename) {
  const contentType = inferContentType(blob, filename);
  const baseName = (filename || "").split("/").pop().split("\\").pop();
  const safeName =
    baseName || `asset-${crypto.randomUUID()}.${extensionFor(contentType)}`;

  if (typeof window !== "undefined" && window.vooDesktop?.callBackground) {
    const buffer = await blob.arrayBuffer();
    const base64 = bytesToBase64(buffer);
    const response = await window.vooDesktop.callBackground(BG.MEDIA_UPLOAD, {
      base64,
      filename: safeName,
      contentType,
    });
    if (response?.url) return response.url;
    if (response?.ok === false) {
      throw new MediaUploadError(
        response.error || "mediaUploadFailed",
        response.message,
      );
    }
  }

  return uploadMediaBlobDirect(blob, safeName, contentType);
}
