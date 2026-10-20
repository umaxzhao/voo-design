/**
 * WebGL shaders and uniform packing for adjustments.
 *
 * Implements GPU-accelerated tone mapping and color transformations.
 */

import { HUE_BAND_KEYS } from "./scene_model_core.js";

/**
 * Flattens the per-band Hue/Saturation config into the shader's vec3[6]
 * uniform: one {h, s, l} triple per band, in the same order hueBandIndex
 * uses. A neutral band packs as zeros, which the shader skips.
 */
export function packBands(bands) {
  const out = new Float32Array(18);
  if (!bands) return out;
  for (let i = 0; i < HUE_BAND_KEYS.length; i += 1) {
    const band = bands[HUE_BAND_KEYS[i]];
    if (!band) continue;
    out[i * 3] = band.h ?? 0;
    out[i * 3 + 1] = band.s ?? 0;
    out[i * 3 + 2] = band.l ?? 0;
  }
  return out;
}

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform sampler2D u_matte;
uniform sampler2D u_tone;
uniform bool u_hasMatte;
uniform bool u_hueActive;
uniform bool u_satActive;
uniform bool u_lightActive;
uniform bool u_colorizeActive;
uniform bool u_bandsActive;
uniform float u_hue;
uniform float u_satScale;
uniform float u_lightDelta;
uniform vec3 u_bands[6];
uniform float u_vignette;

/** Same formula as vignetteFactor() in tone_lut.js — keep the two identical. */
float vignetteMask(vec2 uv, float amount) {
  vec2 d = uv - 0.5;
  float dn = length(d) / 0.70710678;
  float t = clamp((dn - 0.35) / 0.65, 0.0, 1.0);
  float s = t * t * (3.0 - 2.0 * t);
  return 1.0 - amount * s;
}

/** Centre of texel i in a 256-wide NEAREST LUT, so it matches integer table lookup. */
vec2 lutCoord(float value) {
  return vec2((value * 255.0 + 0.5) / 256.0, 0.5);
}

vec3 rgbToHsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float l = (maxC + minC) * 0.5;
  float h = 0.0;
  float s = 0.0;
  if (maxC != minC) {
    float d = maxC - minC;
    s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    if (maxC == c.r) {
      h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    } else if (maxC == c.g) {
      h = (c.b - c.r) / d + 2.0;
    } else {
      h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
  }
  return vec3(h * 360.0, s, l);
}

/** Which of the six 60° hue bands a hue (degrees) belongs to — mirrors hueBandIndex. */
int bandIndex(float hue) {
  if (hue < 30.0 || hue >= 330.0) return 0; // reds
  if (hue < 90.0) return 1; // yellows
  if (hue < 150.0) return 2; // greens
  if (hue < 210.0) return 3; // cyans
  if (hue < 270.0) return 4; // blues
  return 5; // magentas
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hslToRgb(float hDeg, float s, float l) {
  float h = hDeg / 360.0;
  if (s == 0.0) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(
    hue2rgb(p, q, h + 1.0 / 3.0),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1.0 / 3.0)
  );
}

void main() {
  vec4 src = texture(u_image, v_uv);
  float alpha = src.a;
  if (u_hasMatte) alpha *= texture(u_matte, v_uv).a;
  if (alpha <= 0.0) {
    outColor = vec4(0.0);
    return;
  }

  // Brightness, contrast, exposure, temperature/tint, highlights/shadows and
  // all four curves are already folded into the LUT.
  vec3 rgb = vec3(
    texture(u_tone, lutCoord(src.r)).r,
    texture(u_tone, lutCoord(src.g)).g,
    texture(u_tone, lutCoord(src.b)).b
  );

  if (u_hueActive || u_satActive || u_lightActive || u_colorizeActive || u_bandsActive) {
    vec3 hsl = rgbToHsl(rgb);
    if (u_colorizeActive) {
      // Colorize: desaturate and re-tint with the hue slider at full
      // saturation (or the saturation slider's level), Photoshop-style.
      hsl.x = u_hueActive ? u_hue : 0.0;
      hsl.y = u_satActive ? clamp(u_satScale, 0.0, 1.0) : 1.0;
    } else {
      if (u_hueActive) {
        hsl.x = mod(hsl.x + u_hue, 360.0);
        if (hsl.x < 0.0) hsl.x += 360.0;
      }
      if (u_satActive) {
        hsl.y = clamp(hsl.y * u_satScale, 0.0, 1.0);
      }
    }
    if (u_bandsActive) {
      // Per-band offsets land after the master pass, only for pixels whose
      // hue falls in a configured band (Photoshop's 6-colour range).
      vec3 band = u_bands[bandIndex(hsl.x)];
      if (band.x != 0.0 || band.y != 0.0 || band.z != 0.0) {
        hsl.x = mod(hsl.x + band.x, 360.0);
        if (hsl.x < 0.0) hsl.x += 360.0;
        hsl.y = clamp(hsl.y * (1.0 + band.y / 100.0), 0.0, 1.0);
        hsl.z = clamp(hsl.z + band.z / 100.0, 0.0, 1.0);
      }
    }
    if (u_lightActive) {
      hsl.z = clamp(hsl.z + u_lightDelta, 0.0, 1.0);
    }
    rgb = hslToRgb(hsl.x, hsl.y, hsl.z);
  }

  // The vignette is spatial, so it cannot live in the LUT.
  if (u_vignette > 0.0) {
    rgb *= vignetteMask(v_uv, u_vignette);
  }

  outColor = vec4(rgb * alpha, alpha);
}`;
