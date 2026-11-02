/**
 * Off-thread image compression and ArrayBuffer preparation for WebRTC P2P transfers.
 *
 * Running image decoding, downscaling, WebP re-encoding, and ArrayBuffer extraction
 * inside a Web Worker prevents UI stutters on the main thread and leverages multi-core CPU.
 */

import {
  COMPRESS_THRESHOLD_BYTES,
  IMAGE_QUALITY,
  MAX_IMAGE_DIM,
} from "./document_bridge.js";

const WORKER_SOURCE = `
self.onmessage = async (e) => {
  const { jobId, id, blob, maxDimension, quality, threshold, original } = e.data;
  try {
    let wireBlob = blob;
    if (!original && blob && blob.type && blob.type.startsWith("image/") && blob.size > threshold) {
      if (typeof createImageBitmap === "function" && typeof OffscreenCanvas === "function") {
        const bitmap = await createImageBitmap(blob);
        try {
          const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
          if (scale < 1 || blob.size > threshold) {
            const outW = Math.max(1, Math.round(bitmap.width * scale));
            const outH = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = new OffscreenCanvas(outW, outH);
            const ctx = canvas.getContext("2d");
            ctx.drawImage(bitmap, 0, 0, outW, outH);
            let out = null;
            try {
              out = await canvas.convertToBlob({ type: "image/webp", quality });
            } catch {
              out = await canvas.convertToBlob({ type: "image/jpeg", quality });
            }
            if (out && out.size < blob.size) wireBlob = out;
          }
        } finally {
          bitmap.close();
        }
      }
    }
    const buffer = await wireBlob.arrayBuffer();
    self.postMessage(
      { jobId, id, mime: wireBlob.type || "image/png", buffer },
      [buffer]
    );
  } catch (err) {
    self.postMessage({ jobId, id, error: String(err?.message || err) });
  }
};
`;

let workerInstance = null;
let jobIdCounter = 0;
const pendingJobs = new Map();

function getWorker() {
  if (workerInstance) return workerInstance;
  if (
    typeof Worker === "undefined" ||
    typeof Blob === "undefined" ||
    typeof URL === "undefined"
  ) {
    return null;
  }
  try {
    const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    workerInstance = new Worker(url);
    workerInstance.onmessage = (e) => {
      const { jobId, id, mime, buffer, error } = e.data;
      const callback = pendingJobs.get(jobId);
      if (callback) {
        pendingJobs.delete(jobId);
        callback({ id, mime, buffer, error });
      }
    };
    workerInstance.onerror = () => {
      // Fallback to main thread if worker fails
    };
  } catch {
    workerInstance = null;
  }
  return workerInstance;
}

/**
 * Offloads image downscaling, WebP re-encoding, and ArrayBuffer extraction to a Worker.
 *
 * @returns {Promise<{id: string, mime: string, bytes: Uint8Array}|null>}
 */
export async function processImageForWire(
  id,
  blob,
  {
    maxDimension = MAX_IMAGE_DIM,
    quality = IMAGE_QUALITY,
    threshold = COMPRESS_THRESHOLD_BYTES,
    original = false,
  } = {},
) {
  const worker = getWorker();
  if (!worker) return null;
  const jobId = ++jobIdCounter;
  return new Promise((resolve) => {
    pendingJobs.set(jobId, (res) => {
      if (res.error || !res.buffer) {
        resolve(null);
      } else {
        resolve({
          id,
          mime: res.mime,
          bytes: new Uint8Array(res.buffer),
        });
      }
    });
    worker.postMessage({
      jobId,
      id,
      blob,
      maxDimension,
      quality,
      threshold,
      original,
    });
  });
}
