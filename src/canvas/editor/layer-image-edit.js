import { decodeImageSource } from "./bitmap_cache.js";

export const TRANSPARENT_LAYER_INSTRUCTION =
  "Edit the supplied layer only. Return a PNG with a real alpha channel. " +
  "Keep the background transparent; do not add a backdrop, a solid color, " +
  "or a checkerboard. Preserve the subject and transparent edges unless the " +
  "requested edit changes them.";

function imageCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("noContext");
  return { canvas, context };
}

export function hasTransparentPixels(rgba) {
  for (let index = 3; index < rgba.length; index += 4) {
    if (rgba[index] < 255) return true;
  }
  return false;
}

/** Capture only layer pixels, never the page/background or adjacent layers. */
export function captureLayerImage(engine, layerId, { encode = true } = {}) {
  const layer = engine.getDocument()?.nodes.find((node) => node.id === layerId);
  if (layer?.kind !== "image") throw new Error("bitmapMissing");
  const bitmap = engine.getNodeBitmap?.(layer);
  if (!bitmap) throw new Error("bitmapMissing");
  const width = bitmap.naturalWidth ?? bitmap.width;
  const height = bitmap.naturalHeight ?? bitmap.height;
  if (!(width > 0 && height > 0)) throw new Error("bitmapMissing");
  const mask = engine.getNodeMask?.(layer);
  // Mask loading is lazy. Sending raw pixels before it loads would expose
  // hidden content and mistake a cutout for an opaque image.
  if (layer.maskId && !mask) {
    const error = new Error("layerMaskNotReady");
    error.code = error.message;
    throw error;
  }
  const { canvas, context } = imageCanvas(width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  const original = context.getImageData(0, 0, width, height).data;
  let maskPixels = null;
  if (mask) {
    const maskSurface = imageCanvas(width, height);
    maskSurface.context.drawImage(mask, 0, 0, width, height);
    maskPixels = maskSurface.context.getImageData(0, 0, width, height).data;
    context.globalCompositeOperation = "destination-in";
    context.drawImage(maskSurface.canvas, 0, 0);
  }
  const visible = context.getImageData(0, 0, width, height).data;
  return {
    layerId,
    width,
    height,
    original,
    maskPixels,
    hasTransparency: hasTransparentPixels(visible),
    dataUrl: encode ? canvas.toDataURL("image/png") : null,
    sourceIdentity: layerImageIdentity(layer),
  };
}

/** A response may arrive after another edit, delete, mask change or undo. */
export function layerImageIdentity(layer) {
  return JSON.stringify([
    layer?.id,
    layer?.imageId ?? null,
    layer?.src ?? null,
    layer?.maskId ?? null,
  ]);
}

/** Metadata IDs stay stable while a live matte canvas is being painted. */
export function layerImagePixelsMatch(source, current) {
  const samePixels = (left, right) => {
    if (left === null || right === null) return left === right;
    if (!left || !right || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return false;
    }
    return true;
  };
  return (
    samePixels(source?.original, current?.original) &&
    samePixels(source?.maskPixels, current?.maskPixels)
  );
}

/**
 * Keep a separate editable mask. A transparent model output includes that
 * mask already, so divide its alpha out before the original mask is reapplied.
 * An opaque answer instead reuses the original alpha; never white-fill a cutout.
 */
export function restoreLayerAlpha(result, source) {
  if (result.length !== source.original.length)
    throw new RangeError("Layer result dimensions do not match the source");
  const output = new Uint8ClampedArray(result);
  const nativeAlpha = hasTransparentPixels(result);
  const restoreSource = source.hasTransparency && !nativeAlpha;
  for (let index = 3; index < output.length; index += 4) {
    if (source.maskPixels?.[index] === 0) {
      // The model never saw masked-out pixels. Keep the original hidden image
      // so painting the editable mask back in cannot reveal transparent black.
      output.set(source.original.subarray(index - 3, index + 1), index - 3);
    } else if (restoreSource) {
      output[index] = source.original[index];
    } else if (source.maskPixels) {
      const maskAlpha = source.maskPixels[index];
      output[index] = maskAlpha
        ? Math.min(255, Math.round((result[index] * 255) / maskAlpha))
        : source.original[index];
    }
  }
  return {
    rgba: output,
    alphaMode: restoreSource ? "source" : nativeAlpha ? "model" : "opaque",
  };
}

export async function prepareLayerEditResult(source, dataUrl) {
  const bitmap = await decodeImageSource(dataUrl);
  if (!bitmap) throw new Error("bitmapMissing");
  const { canvas, context } = imageCanvas(source.width, source.height);
  context.drawImage(bitmap, 0, 0, source.width, source.height);
  const pixels = context.getImageData(0, 0, source.width, source.height);
  const { rgba, alphaMode } = restoreLayerAlpha(pixels.data, source);
  pixels.data.set(rgba);
  context.putImageData(pixels, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), alphaMode };
}
