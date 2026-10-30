import { boxBlur } from "./stroke_filter.js";

/** Shade the inside of the actual alpha silhouette, including holes and glyphs. */
export function bevelAlphaMap(alpha, width, height, effect) {
  const output = new Uint8ClampedArray(width * height * 4);
  const size = Math.max(0, Number(effect.size) || 0);
  const strength = Math.max(0, Math.min(1, (effect.depth ?? 60) / 100));
  if (!size || !strength) return output;
  const angle = (effect.angle ?? 135) * Math.PI / 180;
  const dx = Math.sin(angle) * size,
    dy = -Math.cos(angle) * size;
  const sample = (x, y) => {
    const ix = Math.round(x),
      iy = Math.round(y);
    return ix < 0 || iy < 0 || ix >= width || iy >= height ? 0 : alpha[iy * width + ix];
  };
  let light = new Uint8Array(width * height),
    dark = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const difference = sample(x - dx, y - dy) - sample(x + dx, y + dy);
    light[index] = Math.max(0, difference);
    dark[index] = Math.max(0, -difference);
  }
  const radius = Math.round(size * Math.max(0, Math.min(100, effect.softness ?? 30)) / 300);
  if (radius > 0) {
    light = boxBlur(light, width, height, radius);
    dark = boxBlur(dark, width, height, radius);
  }
  for (let index = 0; index < alpha.length; index++) {
    const shade = light[index] - dark[index];
    const colour = shade > 0 ? 255 : 0;
    output[index * 4] = colour;
    output[index * 4 + 1] = colour;
    output[index * 4 + 2] = colour;
    output[index * 4 + 3] = Math.round(Math.abs(shade) * strength * alpha[index] / 255);
  }
  return output;
}
