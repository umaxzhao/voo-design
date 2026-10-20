/**
 * Page-side thumbnail generation for the asset library.
 *
 * Library tiles render at ~150px, so shipping the multi-megabyte original as
 * the preview is pure waste — worst case (hosted editor, bridge mode) the
 * whole library crosses one JSON message as base64. A bounded thumbnail is
 * generated once at ingestion and stored next to the original, and the
 * paginated read path only ever moves thumbnails.
 *
 * This module runs in pages only (canvas tab, side panel, hosted editor);
 * the service worker never imports it — it has no DOM canvas, and ingestion
 * happens page-side anyway.
 */

import { dataUrlToBlob } from "../../shared/db_wire.js";
import { thumbnailDimensions } from "../../content/image-thumbnail.js";

// Keep canvas previews visually useful at the 768px bound shared with the
// content-side thumbnail path, without paying the cost of full originals.
const THUMB_QUALITY = 0.88;

/** True for sources that hold a clip rather than a picture. */
export function isVideoSource(source) {
  if (typeof source === "string") return source.startsWith("data:video/");
  return Boolean(source.type?.startsWith("video/"));
}

/** True for sound files, which cannot be decoded as image thumbnails. */
export function isAudioSource(source) {
  if (typeof source === "string") return source.startsWith("data:audio/");
  return Boolean(source.type?.startsWith("audio/"));
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encodeCanvas(canvas) {
  if (typeof canvas.convertToBlob === "function") {
    // OffscreenCanvas rejects mime types it cannot encode; HTMLCanvasElement
    // silently falls back to png, so only this path needs the retry.
    return canvas
      .convertToBlob({ type: "image/webp", quality: THUMB_QUALITY })
      .catch(() => canvas.convertToBlob({ type: "image/png" }));
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("thumbnail encoding failed"));
      },
      "image/webp",
      THUMB_QUALITY,
    );
  });
}

/**
 * Renders a source picture down to a bounded thumbnail Blob.
 *
 * Fail-fast by design: a source that cannot be decoded or encoded rejects,
 * and the caller decides whether the whole batch fails or the entry goes in
 * without a thumbnail (the read path falls back to the full blob either way).
 *
 * @param {string | Blob} source - data URL or typed Blob of the original
 * @returns {Promise<Blob>} the encoded thumbnail
 */
export async function makeThumbnail(source) {
  const blob = typeof source === "string" ? dataUrlToBlob(source) : source;
  try {
    let bitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      // SVGs cannot be decoded by createImageBitmap in Chromium; decode via Image element
      const url = URL.createObjectURL(blob);
      try {
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = url;
        });
        const { width, height } = thumbnailDimensions(
          img.naturalWidth || 512,
          img.naturalHeight || 512,
        );
        const canvas = makeCanvas(width, height);
        const context = canvas.getContext("2d");
        if (context) {
          context.drawImage(img, 0, 0, width, height);
          return await encodeCanvas(canvas);
        }
      } finally {
        URL.revokeObjectURL(url);
      }
      return blob;
    }

    try {
      const { width, height } = thumbnailDimensions(
        bitmap.width,
        bitmap.height,
      );
      const canvas = makeCanvas(width, height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("thumbnail canvas is unavailable");
      context.drawImage(bitmap, 0, 0, width, height);
      return await encodeCanvas(canvas);
    } finally {
      bitmap.close();
    }
  } catch {
    // If thumbnail creation fails completely, return the original blob as thumbnail
    return blob;
  }
}
