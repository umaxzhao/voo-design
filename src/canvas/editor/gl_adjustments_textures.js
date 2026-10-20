/**
 * WebGL texture management and memory budget eviction for adjustments.
 */

import { packToneLutTexture } from "./tone_lut.js";

/** Upper bound on texture memory before the least recently used ones go. */
export const TEXTURE_BUDGET_BYTES = 512 * 1024 * 1024;

/**
 * True when a source is too large to upload: past MAX_TEXTURE_SIZE the
 * texImage2D call fails silently and the node would draw as a solid dark
 * box, so render() hands such sources to the CPU path instead.
 */
export function exceedsTextureLimit(source, maxTextureSize) {
  const width = source.naturalWidth ?? source.width;
  const height = source.naturalHeight ?? source.height;
  return width > maxTextureSize || height > maxTextureSize;
}

/**
 * Uploads (or re-uploads) a bitmap-like source and returns its texture and byte size.
 */
export function uploadSourceTexture(gl, sourceObject, existing, clock) {
  const width = sourceObject.naturalWidth ?? sourceObject.width;
  const height = sourceObject.naturalHeight ?? sourceObject.height;
  if (!width || !height) return null;

  const texture = existing?.texture ?? gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    sourceObject,
  );

  const bytes = width * height * 4;
  return {
    texture,
    bytes,
    dirty: false,
    lastUsed: clock,
  };
}

/**
 * Ensures the 256x1 tone LUT texture is uploaded.
 */
export function uploadToneTexture(gl, toneTexture, tone, tonePixels) {
  packToneLutTexture(tone, tonePixels);
  gl.bindTexture(gl.TEXTURE_2D, toneTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    256,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    tonePixels,
  );
}

/**
 * Evicts oldest unused textures when texture memory exceeds budget.
 */
export function evictOldestTextures(gl, textures, textureBytes, clock, budget = TEXTURE_BUDGET_BYTES) {
  if (textureBytes <= budget) return textureBytes;
  const entries = [...textures.entries()].sort(
    (a, b) => a[1].lastUsed - b[1].lastUsed,
  );
  let bytes = textureBytes;
  for (const [key, entry] of entries) {
    if (bytes <= budget) break;
    // Entries touched this frame may still be bound — evicting one
    // would leave render() drawing from a deleted texture.
    if (entry.lastUsed === clock) continue;
    gl.deleteTexture(entry.texture);
    textures.delete(key);
    bytes -= entry.bytes;
  }
  return bytes;
}
