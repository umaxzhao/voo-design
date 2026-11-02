/**
 * Channel LUT generation table math.
 *
 * Computes the 256-entry Uint8Array lookup tables for R, G, and B channels
 * folding exposure, temperature/tint, brightness, contrast, highlights/shadows,
 * levels, invert, threshold, and curves.
 */

import { buildCurveLUT } from "./tone_lut_curves.js";
import { smoothstep } from "./tone_lut_vignette.js";

/**
 * Computes 256-element LUTs for R, G, B channels based on tone parameters.
 */
export function computeChannelLuts({
  bVal,
  cVal,
  eVal,
  tVal,
  tiVal,
  hiVal,
  shVal,
  levelsActive,
  blackVal,
  whiteVal,
  gammaVal,
  outBlackVal,
  outWhiteVal,
  invertVal,
  thresholdVal,
  curvesActive,
  curvesObj,
}) {
  const levelsSpan = Math.max(0.01, (whiteVal - blackVal) / 100);
  const gammaInverse = 1 / Math.max(0.1, gammaVal);
  const outLow = outBlackVal * 2.55;
  const outScale = (outWhiteVal - outBlackVal) / 100;
  const levelsMap = (v) => {
    const x = (v / 255 - blackVal / 100) / levelsSpan;
    return outLow + Math.pow(Math.max(0, x), gammaInverse) * 255 * outScale;
  };

  const lutLum = buildCurveLUT(curvesActive ? curvesObj?.luminance : null);
  const lutRCurve = buildCurveLUT(curvesActive ? curvesObj?.r : null);
  const lutGCurve = buildCurveLUT(curvesActive ? curvesObj?.g : null);
  const lutBCurve = buildCurveLUT(curvesActive ? curvesObj?.b : null);

  const lutR = new Uint8Array(256);
  const lutG = new Uint8Array(256);
  const lutB = new Uint8Array(256);

  const bOffset = bVal * 2.55;
  const cFactor =
    cVal !== 0 ? (259 * (cVal * 2.55 + 255)) / (255 * (259 - cVal * 2.55)) : 1;
  // Exposure is photographic: +1 EV doubles the light.
  const eGain = eVal !== 0 ? Math.pow(2, eVal) : 1;
  // Temperature warms red and cools blue (or the reverse); tint slides the
  // green channel towards magenta. Both are gentle multiplicative shifts.
  const rTempScale = 1 + 0.25 * (tVal / 100);
  const bTempScale = 1 - 0.25 * (tVal / 100);
  const gTintScale = 1 - 0.2 * (tiVal / 100);
  // Highlights/shadows shift a channel weighted by where its value sits in
  // the tonal range: shadows move the dark half, highlights the bright half.
  const toneShift = (v) => {
    const x = v / 255;
    const shadowWeight = 1 - smoothstep(0, 0.5, x);
    const highlightWeight = smoothstep(0.5, 1, x);
    return (
      v +
      0.5 *
        255 *
        ((shVal / 100) * shadowWeight + (hiVal / 100) * highlightWeight)
    );
  };
  const toneActive = shVal !== 0 || hiVal !== 0;

  for (let i = 0; i < 256; i++) {
    let r = i;
    let g = i;
    let b = i;

    if (eVal !== 0) {
      r *= eGain;
      g *= eGain;
      b *= eGain;
    }
    if (tVal !== 0) {
      r *= rTempScale;
      b *= bTempScale;
    }
    if (tiVal !== 0) {
      g *= gTintScale;
    }

    r += bOffset;
    g += bOffset;
    b += bOffset;

    if (cVal !== 0) {
      r = cFactor * (r - 128) + 128;
      g = cFactor * (g - 128) + 128;
      b = cFactor * (b - 128) + 128;
    }

    if (toneActive) {
      r = toneShift(r);
      g = toneShift(g);
      b = toneShift(b);
    }

    if (levelsActive) {
      r = levelsMap(r);
      g = levelsMap(g);
      b = levelsMap(b);
    }

    if (invertVal) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    if (thresholdVal !== null) {
      r = r < thresholdVal ? 0 : 255;
      g = g < thresholdVal ? 0 : 255;
      b = b < thresholdVal ? 0 : 255;
    }

    r = Math.min(255, Math.max(0, Math.round(r)));
    g = Math.min(255, Math.max(0, Math.round(g)));
    b = Math.min(255, Math.max(0, Math.round(b)));

    if (curvesActive) {
      r = lutRCurve[lutLum[r]];
      g = lutGCurve[lutLum[g]];
      b = lutBCurve[lutLum[b]];
    }

    lutR[i] = r;
    lutG[i] = g;
    lutB[i] = b;
  }

  return { lutR, lutG, lutB };
}
