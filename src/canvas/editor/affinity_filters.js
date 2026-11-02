/**
 * Affinity-style filters that have no GPU twin: Median Blur, Bloom, Zoom Blur
 * and Twirl. They run on the CPU adjustment path like the existing pixel
 * filters, on a copy-safe ImageData buffer.
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Median of a sliding window (per channel) — Affinity's Median Blur / denoise. */
export function applyMedianFilter(data, width, height, amount) {
  const radius = clamp(1 + Math.round((Number(amount) || 0) / 25), 1, 3);
  if (!(radius >= 1) || width < 1 || height < 1) return;
  const source = new Uint8ClampedArray(data);
  const window = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const reds = [];
      const greens = [];
      const blues = [];
      for (let oy = -radius; oy <= radius; oy += 1) {
        const sy = clamp(y + oy, 0, height - 1);
        for (let ox = -radius; ox <= radius; ox += 1) {
          const sx = clamp(x + ox, 0, width - 1);
          const index = (sy * width + sx) * 4;
          reds.push(source[index]);
          greens.push(source[index + 1]);
          blues.push(source[index + 2]);
        }
      }
      window.length = 0;
      reds.sort((a, b) => a - b);
      greens.sort((a, b) => a - b);
      blues.sort((a, b) => a - b);
      const middle = Math.floor(reds.length / 2);
      const index = (y * width + x) * 4;
      data[index] = reds[middle];
      data[index + 1] = greens[middle];
      data[index + 2] = blues[middle];
    }
  }
}

/** Bright-pass blur added back with screen blending — Affinity's Bloom. */
export function applyBloomFilter(data, width, height, amount, naturalWidth = width) {
  const strength = clamp((Number(amount) || 0) / 100, 0, 1);
  if (!(strength > 0) || width < 1 || height < 1) return;
  const radius = clamp(Math.round((naturalWidth / 120) * (1 + strength * 3)), 1, 24);
  const bright = new Uint8ClampedArray(data.length);
  for (let index = 0; index < data.length; index += 4) {
    const luminance = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    if (luminance > 170) {
      bright[index] = data[index];
      bright[index + 1] = data[index + 1];
      bright[index + 2] = data[index + 2];
      bright[index + 3] = 255;
    }
  }
  // Two box passes approximate the glow falloff without a Gaussian kernel.
  boxBlur(bright, width, height, radius);
  boxBlur(bright, width, height, Math.max(1, Math.round(radius / 2)));
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const base = data[index + channel];
      const glow = bright[index + channel] * strength;
      data[index + channel] = 255 - ((255 - base) * (255 - glow)) / 255;
    }
  }
}

function boxBlur(data, width, height, radius) {
  if (radius < 1) return;
  const source = new Uint8ClampedArray(data);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sx = clamp(x + offset, 0, width - 1);
        const index = (y * width + sx) * 4;
        red += source[index];
        green += source[index + 1];
        blue += source[index + 2];
        alpha += source[index + 3];
      }
      const index = (y * width + x) * 4;
      data[index] = red / span;
      data[index + 1] = green / span;
      data[index + 2] = blue / span;
      data[index + 3] = alpha / span;
    }
  }
  const horizontal = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sy = clamp(y + offset, 0, height - 1);
        const index = (sy * width + x) * 4;
        red += horizontal[index];
        green += horizontal[index + 1];
        blue += horizontal[index + 2];
        alpha += horizontal[index + 3];
      }
      const index = (y * width + x) * 4;
      data[index] = red / span;
      data[index + 1] = green / span;
      data[index + 2] = blue / span;
      data[index + 3] = alpha / span;
    }
  }
}

function sampleNearest(data, width, height, x, y, channel) {
  const sx = clamp(Math.round(x), 0, width - 1);
  const sy = clamp(Math.round(y), 0, height - 1);
  return data[(sy * width + sx) * 4 + channel];
}

/** Radial blur toward the centre — Affinity's Zoom Blur. */
export function applyZoomBlurFilter(data, width, height, amount) {
  const strength = clamp((Number(amount) || 0) / 100, 0, 1);
  if (!(strength > 0) || width < 1 || height < 1) return;
  const source = new Uint8ClampedArray(data);
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const samples = 3 + Math.round(strength * 9);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const index = (y * width + x) * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let sample = 0; sample < samples; sample += 1) {
        const factor = 1 - (sample / samples) * strength;
        const sx = centerX + dx * factor;
        const sy = centerY + dy * factor;
        const sourceIndex =
          (clamp(Math.round(sy), 0, height - 1) * width + clamp(Math.round(sx), 0, width - 1)) * 4;
        red += source[sourceIndex];
        green += source[sourceIndex + 1];
        blue += source[sourceIndex + 2];
        alpha += source[sourceIndex + 3];
      }
      data[index] = red / samples;
      data[index + 1] = green / samples;
      data[index + 2] = blue / samples;
      data[index + 3] = alpha / samples;
    }
  }
}

/** Twirl around the centre; negative values turn the other way (Affinity Twirl). */
export function applyTwirlFilter(data, width, height, amount) {
  const angle = (clamp(Number(amount) || 0, -100, 100) / 100) * Math.PI;
  if (Math.abs(angle) < 0.001 || width < 1 || height < 1) return;
  const source = new Uint8ClampedArray(data);
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const radius = Math.min(width, height) / 2 || 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.hypot(dx, dy);
      const falloff = Math.max(0, 1 - distance / radius);
      const theta = angle * falloff * falloff;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const sx = centerX + dx * cos - dy * sin;
      const sy = centerY + dx * sin + dy * cos;
      const index = (y * width + x) * 4;
      data[index] = sampleNearest(source, width, height, sx, sy, 0);
      data[index + 1] = sampleNearest(source, width, height, sx, sy, 1);
      data[index + 2] = sampleNearest(source, width, height, sx, sy, 2);
      data[index + 3] = sampleNearest(source, width, height, sx, sy, 3);
    }
  }
}

/** Edge-preserving smoothing — Affinity's Denoise / Bilateral approximation. */
export function applyDenoiseFilter(data, width, height, amount) {
  const strength = clamp((Number(amount) || 0) / 100, 0, 1);
  if (!(strength > 0) || width < 2 || height < 2) return;
  const radius = strength > 0.6 ? 2 : 1;
  const sigmaSpace = radius + 0.5;
  const sigmaColor = 6 + strength * 26;
  const source = new Uint8ClampedArray(data);
  const colorWeight = (delta) => Math.exp(-(delta * delta) / (2 * sigmaColor * sigmaColor));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const baseR = source[index];
      const baseG = source[index + 1];
      const baseB = source[index + 2];
      let red = 0;
      let green = 0;
      let blue = 0;
      let total = 0;
      for (let oy = -radius; oy <= radius; oy += 1) {
        const sy = clamp(y + oy, 0, height - 1);
        for (let ox = -radius; ox <= radius; ox += 1) {
          const sx = clamp(x + ox, 0, width - 1);
          const sIndex = (sy * width + sx) * 4;
          const sr = source[sIndex];
          const sg = source[sIndex + 1];
          const sb = source[sIndex + 2];
          const spatial = Math.exp(-(ox * ox + oy * oy) / (2 * sigmaSpace * sigmaSpace));
          const colour = colorWeight(Math.max(Math.abs(sr - baseR), Math.abs(sg - baseG), Math.abs(sb - baseB)));
          const weight = spatial * colour;
          red += sr * weight;
          green += sg * weight;
          blue += sb * weight;
          total += weight;
        }
      }
      if (total > 0) {
        data[index] = red / total;
        data[index + 1] = green / total;
        data[index + 2] = blue / total;
      }
    }
  }
}

/** Reduces purple/green fringes on high-contrast edges — Affinity's Defringe. */
export function applyDefringeFilter(data, width, height, amount) {
  const strength = clamp((Number(amount) || 0) / 100, 0, 1);
  if (!(strength > 0) || width < 3 || height < 3) return;
  const source = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const red = source[index];
      const green = source[index + 1];
      const blue = source[index + 2];
      // Edge magnitude from the luminance gradient: fringes live on edges.
      const luminance = (px, py) => {
        const i = (py * width + px) * 4;
        return 0.299 * source[i] + 0.587 * source[i + 1] + 0.114 * source[i + 2];
      };
      const gradient =
        Math.abs(luminance(x + 1, y) - luminance(x - 1, y)) +
        Math.abs(luminance(x, y + 1) - luminance(x, y - 1));
      if (gradient < 24) continue;
      const purple = blue >= red && red > green + 8 && blue > green + 8;
      const greenFringe = green > red + 8 && green > blue + 8;
      if (!purple && !greenFringe) continue;
      const mean = (red + green + blue) / 3;
      const pull = strength * 0.85;
      data[index] = red + (mean - red) * pull;
      data[index + 1] = green + (mean - green) * pull;
      data[index + 2] = blue + (mean - blue) * pull;
    }
  }
}

/** Dark-channel dehaze — Haze Removal, simplified for local pixels. */
export function applyHazeRemovalFilter(data, width, height, amount) {
  const strength = clamp((Number(amount) || 0) / 100, 0, 1);
  if (!(strength > 0) || width < 3 || height < 3) return;
  const source = new Uint8ClampedArray(data);
  const dark = new Uint8ClampedArray(width * height);
  let airlight = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let minimum = 255;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const index = ((y + oy) * width + (x + ox)) * 4;
          minimum = Math.min(minimum, source[index], source[index + 1], source[index + 2]);
        }
      }
      dark[y * width + x] = minimum;
      if (minimum > airlight) airlight = minimum;
    }
  }
  const safeAirlight = Math.max(32, airlight);
  const omega = 0.65 + strength * 0.3;
  const minimumTransmission = 0.25;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const transmission = Math.max(
        minimumTransmission,
        1 - omega * (dark[y * width + x] / safeAirlight),
      );
      for (let channel = 0; channel < 3; channel += 1) {
        const value =
          (source[index + channel] - safeAirlight) / transmission + safeAirlight;
        data[index + channel] = source[index + channel] + (value - source[index + channel]) * strength;
      }
    }
  }
}

/** Blurred copy screened back over the image — Affinity's Diffuse Glow. */
export function applyDiffuseGlowFilter(data, width, height, amount, naturalWidth = width) {
  const strength = clamp((Number(amount) || 0) / 100, 0, 1);
  if (!(strength > 0) || width < 2 || height < 2) return;
  const radius = clamp(Math.round((naturalWidth / 160) * (2 + strength * 4)), 1, 24);
  const glow = new Uint8ClampedArray(data);
  boxBlur(glow, width, height, radius);
  const lift = 18 * strength;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const base = data[index + channel];
      const blurred = Math.min(255, glow[index + channel] + lift);
      data[index + channel] = 255 - ((255 - base) * (255 - blurred)) / 255;
    }
  }
}

/** Unsharp mask: original + amount × (original − blurred). */
export function applyUnsharpMaskFilter(data, width, height, amount, naturalWidth = width) {
  const strength = clamp((Number(amount) || 0) / 100, 0, 1);
  if (!(strength > 0) || width < 2 || height < 2) return;
  const radius = clamp(Math.round((naturalWidth / 800) * 2), 1, 4);
  const blurred = new Uint8ClampedArray(data);
  boxBlur(blurred, width, height, radius);
  const factor = strength * 1.6;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = data[index + channel];
      data[index + channel] = value + (value - blurred[index + channel]) * factor;
    }
  }
}
