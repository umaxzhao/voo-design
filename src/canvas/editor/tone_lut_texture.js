/**
 * Packing tone LUT data into texture bytes for WebGL consumption.
 */

/**
 * Packs a tone LUT into RGBA bytes for a 256x1 texture.
 *
 * Texel i carries the mapped value of input i on each channel, so the shader
 * reads all three transfer functions from one sampler.
 */
export function packToneLutTexture(toneLut, target) {
  const data = target ?? new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const offset = i * 4;
    data[offset] = toneLut.lutR[i];
    data[offset + 1] = toneLut.lutG[i];
    data[offset + 2] = toneLut.lutB[i];
    data[offset + 3] = 255;
  }
  return data;
}
