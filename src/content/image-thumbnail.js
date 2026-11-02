import { blobToDataUrl, mediaUrlToDataUrl } from "./dom-utils.js";

// Gallery tiles can be viewed much larger than a compact browser panel, and
// 360px WebP previews visibly break down on high-density desktop displays.
const DEFAULT_MAX_EDGE = 768;
const DEFAULT_QUALITY = 0.88;

/** Calculates a bounded size without enlarging small images. */
export function thumbnailDimensions(width, height, maxEdge = DEFAULT_MAX_EDGE) {
  if (width <= 0 || height <= 0 || maxEdge <= 0) {
    throw new Error("thumbnail dimensions must be positive");
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("thumbnail encoding failed"));
      },
      "image/webp",
      DEFAULT_QUALITY,
    );
  });
}

/**
 * Creates a small browser-local preview suitable for extension messaging.
 * The source is resolved in the conversation page first, preserving access to
 * temporary blob URLs and authenticated image responses.
 */
export async function createImageThumbnail(sourceUrl, backgroundFetch) {
  const dataUrl = await mediaUrlToDataUrl(sourceUrl, backgroundFetch);
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("thumbnail source could not be decoded");

  const bitmap = await createImageBitmap(await response.blob());
  try {
    const dimensions = thumbnailDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("thumbnail canvas is unavailable");
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    return blobToDataUrl(await canvasToBlob(canvas));
  } finally {
    bitmap.close();
  }
}
