/**
 * Pixel kernels and color transformations for the CPU adjustment path.
 */

import { vignetteFactor, hueBandIndex } from "./tone_lut.js";
import { HUE_BAND_KEYS } from "./scene_model_core.js";
import {
  applyBlackAndWhite,
  applyChannelMixer,
  applyColorBalance,
  applyGradientMap,
  applyPhotoFilter,
  applySelectiveColor,
  applyVibrance,
} from "./color_adjust.js";
import {
  applyClouds,
  applyEmboss,
  applyHalftone,
  applyNoise,
  applyPixelate,
  applyPosterize,
  applySepia,
  applySolarize,
} from "./pixel_filter.js";
import {
  applyBoxBlur,
  applySharpen,
  cpuBlurRadius,
  scaledRadius,
} from "./spatial_filter.js";

export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

export function hslToRgb(h, s, l) {
  h = h / 360;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [
    Math.min(255, Math.max(0, Math.round(r * 255))),
    Math.min(255, Math.max(0, Math.round(g * 255))),
    Math.min(255, Math.max(0, Math.round(b * 255))),
  ];
}

/**
 * Executes the full CPU adjustment pixel pipeline in-place on imageData buffer:
 * LUT mapping -> HSL shifts / colorize / bands -> vignette -> CPU-only color adjustments
 * -> pixel filters -> spatial blur & sharpen.
 */
export function applyAdjustmentKernels(data, width, height, naturalWidth, tone) {
  const {
    lutR,
    lutG,
    lutB,
    hueActive,
    satActive,
    lightActive,
    colorize,
    bandsActive,
    vignetteActive,
  } = tone;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    let r = lutR[data[i]];
    let g = lutG[data[i + 1]];
    let b = lutB[data[i + 2]];

    if (hueActive || satActive || lightActive || colorize || bandsActive) {
      let [h, s, l] = rgbToHsl(r, g, b);
      if (colorize) {
        // Photoshop's Colorize: the picture is desaturated and re-tinted by
        // the hue slider at full saturation (or the saturation slider's
        // level), with the pixel's own colour ignored.
        h = hueActive ? tone.hue : 0;
        s = satActive ? Math.min(1, Math.max(0, tone.satScale)) : 1;
      } else {
        if (hueActive) {
          h = (h + tone.hue) % 360;
          if (h < 0) h += 360;
        }
        if (satActive) {
          s = Math.min(1, Math.max(0, s * tone.satScale));
        }
      }
      if (bandsActive) {
        // Per-band offsets land after the master pass: only pixels whose hue
        // falls in a configured band are shifted (Photoshop's 6-colour range).
        const band = tone.bands[HUE_BAND_KEYS[hueBandIndex(h)]];
        if (band) {
          h = (h + band.h) % 360;
          if (h < 0) h += 360;
          s = Math.min(1, Math.max(0, s * (1 + band.s / 100)));
          l = Math.min(1, Math.max(0, l + band.l / 100));
        }
      }
      if (lightActive) {
        l = Math.min(1, Math.max(0, l + tone.lightness));
      }
      [r, g, b] = hslToRgb(h, s, l);
    }

    if (vignetteActive) {
      // The vignette is spatial, so it lives outside the LUT — the same
      // shared factor the shader applies to v_uv.
      const pixel = i / 4;
      const nx = ((pixel % width) + 0.5) / width;
      const ny = (Math.floor(pixel / width) + 0.5) / height;
      const factor = vignetteFactor(nx, ny, tone.vignette);
      r = Math.min(255, Math.max(0, Math.round(r * factor)));
      g = Math.min(255, Math.max(0, Math.round(g * factor)));
      b = Math.min(255, Math.max(0, Math.round(b * factor)));
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  // Colour balance and black & white are zone/hue dependent, so they run
  // per-pixel after the LUT instead of folding into it. Either active sets
  // cpuOnly, so the GL pipeline hands these frames to this path.
  if (tone.colorBalance) {
    applyColorBalance(data, width, height, tone.colorBalance);
  }
  if (tone.blackAndWhite?.enabled) {
    applyBlackAndWhite(data, width, height, tone.blackAndWhite);
  }
  if (tone.photoFilter) {
    applyPhotoFilter(data, width, height, tone.photoFilter);
  }
  if (tone.vibrance) {
    applyVibrance(data, width, height, tone.vibrance);
  }
  if (tone.channelMixer) {
    applyChannelMixer(data, width, height, tone.channelMixer);
  }
  if (tone.selectiveColor) {
    applySelectiveColor(data, width, height, tone.selectiveColor);
  }
  if (tone.gradientMap?.enabled) {
    applyGradientMap(data, width, height, tone.gradientMap);
  }

  // The one-click pixel filters, in the order Photoshop lists them: noise,
  // clouds, pixelate, posterize, solarize, halftone, sepia, emboss. They only run on the CPU path — the
  // tone LUT sets cpuOnly so the GL pipeline never claims these frames.
  if (tone.noise > 0) applyNoise(data, width, height, tone.noise);
  if (tone.clouds > 0) applyClouds(data, width, height, tone.clouds);
  if (tone.pixelate > 0) applyPixelate(data, width, height, tone.pixelate);
  if (tone.posterize > 0) applyPosterize(data, width, height, tone.posterize);
  if (tone.solarize > 0) applySolarize(data, width, height, tone.solarize);
  if (tone.halftone > 0) applyHalftone(data, width, height, tone.halftone);
  if (tone.sepia > 0) applySepia(data, width, height, tone.sepia);
  if (tone.emboss > 0) applyEmboss(data, width, height, tone.emboss);

  // Spatial convolutions come last, in the GPU pipeline's order (blur, then
  // sharpen). scaledRadius converts the slider radius from natural to working
  // pixels so a preview-resolution pass blurs the same visual amount as a
  // full-resolution one — with the CPU blur radius cap still applied (see
  // CPU_BLUR_RADIUS_CAP in spatial_filter.js for the documented degradation).
  if (tone.blur > 0) {
    applyBoxBlur(
      data,
      width,
      height,
      cpuBlurRadius(scaledRadius(tone.blur, width, naturalWidth ?? width)),
    );
  }
  if (tone.sharpen > 0) {
    applySharpen(data, width, height, tone.sharpen / 100);
  }
}
