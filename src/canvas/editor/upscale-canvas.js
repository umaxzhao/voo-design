import { applySharpen } from "./spatial_filter.js";

/** Canvas for the current environment, or a loud failure. */
export function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error("canvasUnsupported");
}

/**
 * Helper to extract Blob from OffscreenCanvas or HTMLCanvasElement across environments.
 */
export async function canvasToBlob(canvas, type = "image/png") {
  if (typeof canvas.convertToBlob === "function") {
    return await canvas.convertToBlob({
      type
    });
  }
  if (typeof canvas.toBlob === "function") {
    return new Promise(resolve => canvas.toBlob(resolve, type));
  }
  if (typeof canvas.toDataURL === "function") {
    const dataUrl = canvas.toDataURL(type);
    const res = await fetch(dataUrl);
    return await res.blob();
  }
  throw new Error("canvasToBlobUnsupported");
}

/**
 * Fallback high-quality bicubic & edge-sharpening upscaler when ONNX model is not available or downloads are skipped.
 */
export function upscaleWithCanvas(bitmap, scale = 2) {
  const width = bitmap.naturalWidth ?? bitmap.width;
  const height = bitmap.naturalHeight ?? bitmap.height;
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);
  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true
  });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  // Subtle unsharp mask to restore the high-frequency detail bicubic softened.
  // This used to be a hand-rolled Laplacian loop that skipped the border and
  // left alpha alone; the shared kernel does the same job with edge
  // replication, and both the model path below and the GPU path use it too.
  const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  applySharpen(imgData.data, targetWidth, targetHeight, 0.35);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
