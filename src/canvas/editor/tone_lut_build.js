/**
 * Tone LUT builder and cache.
 *
 * Normalises adjustments and folds exposure, temperature/tint, brightness,
 * contrast, highlights/shadows, levels, and curves into a single 256-entry
 * per-channel lookup table.
 */

import { normalizeAdjustments } from "./scene_model.js";
import {
  normalizeLiveFilterStack,
} from "./live_filter_stack.js";
import {
  hasCustomCurve,
  curveSignature,
} from "./tone_lut_curves.js";
import {
  hueSatBandsSignature,
  channelMixerSignature,
  selectiveColorSignature,
  gradientMapSignature,
  colorBalanceSignature,
} from "./tone_lut_signatures.js";
import { computeChannelLuts } from "./tone_lut_tables.js";

const toneLutCache = new WeakMap();
let emptyToneLut = null;

export function buildToneLut(adjustments) {
  if (!adjustments || typeof adjustments !== "object") {
    if (emptyToneLut) return emptyToneLut;
    const result = buildToneLutUncached(adjustments);
    emptyToneLut = result;
    return result;
  }
  const cached = toneLutCache.get(adjustments);
  // Editor nodes are immutable, but this inexpensive fingerprint keeps the
  // helper safe for importers and tests that still mutate an adjustment object.
  const fingerprint = JSON.stringify(adjustments);
  if (cached?.fingerprint === fingerprint) return cached.result;
  const result = buildToneLutUncached(adjustments);
  toneLutCache.set(adjustments, { fingerprint, result });
  return result;
}

function buildToneLutUncached(adjustments) {
  const normalized = normalizeAdjustments(adjustments);

  const bVal = normalized.brightness?.enabled
    ? (normalized.brightness.value ?? 0)
    : 0;
  const cVal = normalized.contrast?.enabled
    ? (normalized.contrast.value ?? 0)
    : 0;
  const hVal = normalized.hue?.enabled ? (normalized.hue.value ?? 0) : 0;
  const colorizeActive = Boolean(normalized.hue?.colorize);
  /** Per-band Hue/Saturation offsets; null when every band is neutral. */
  const hueSatBands = normalized.hue?.bands ?? null;
  const bandsActive = hueSatBands !== null;
  const sVal = normalized.saturation?.enabled
    ? (normalized.saturation.value ?? 0)
    : 0;
  const lVal =
    normalized.lightness?.enabled !== false
      ? (normalized.lightness?.value ?? 0)
      : 0;
  const eVal = normalized.exposure?.enabled
    ? (normalized.exposure.value ?? 0)
    : 0;
  const tVal = normalized.temperature?.enabled
    ? (normalized.temperature.value ?? 0)
    : 0;
  const tiVal = normalized.tint?.enabled ? (normalized.tint.value ?? 0) : 0;
  const hiVal = normalized.highlights?.enabled
    ? (normalized.highlights.value ?? 0)
    : 0;
  const shVal = normalized.shadows?.enabled
    ? (normalized.shadows.value ?? 0)
    : 0;
  const vVal = normalized.vignette?.enabled
    ? (normalized.vignette.value ?? 0)
    : 0;
  // Blur and sharpen are spatial convolutions: they never enter the LUT, but
  // the signature doubles as the spatial result-cache key, so they belong in
  // it exactly like the vignette.
  const blurVal = normalized.blur?.enabled ? (normalized.blur.value ?? 0) : 0;
  const sharpenVal = normalized.sharpen?.enabled
    ? (normalized.sharpen.value ?? 0)
    : 0;
  // High Pass, Clarity, and Motion Blur are spatial too: they never enter the
  // LUT, and like the pixel filters they have no GPU twin, so they join the
  // signature (as the spatial cache key) and force the CPU path.
  const highPassVal = normalized.highPass?.enabled
    ? (normalized.highPass.value ?? 0)
    : 0;
  const clarityVal = normalized.clarity?.enabled
    ? (normalized.clarity.value ?? 0)
    : 0;
  const motionBlurVal = normalized.motionBlur?.enabled
    ? (normalized.motionBlur.value ?? 0)
    : 0;
  const motionBlurAngle = normalized.motionBlur?.enabled
    ? (normalized.motionBlur.angle ?? 0)
    : 0;

  // The one-click pixel filters (noise, clouds, pixelate, posterize, solarize, halftone, sepia, emboss)
  // are pure CPU: the GPU shader has no kernel for them, so when any is active
  // the pipeline must run the CPU path end to end. They live in the signature
  // like every other category so caches and the active-preset comparison stay
  // correct.
  const noiseVal = normalized.noise?.enabled
    ? (normalized.noise.value ?? 0)
    : 0;
  const cloudsVal = normalized.clouds?.enabled
    ? (normalized.clouds.value ?? 0)
    : 0;
  const pixelateVal = normalized.pixelate?.enabled
    ? (normalized.pixelate.value ?? 0)
    : 0;
  const posterizeVal = normalized.posterize?.enabled
    ? (normalized.posterize.value ?? 0)
    : 0;
  const solarizeVal = normalized.solarize?.enabled
    ? (normalized.solarize.value ?? 0)
    : 0;
  const halftoneVal = normalized.halftone?.enabled
    ? (normalized.halftone.value ?? 0)
    : 0;
  const sepiaVal = normalized.sepia?.enabled
    ? (normalized.sepia.value ?? 0)
    : 0;
  const embossVal = normalized.emboss?.enabled
    ? (normalized.emboss.value ?? 0)
    : 0;
  // Affinity-style filters: median (denoise), bloom, zoom blur and twirl.
  const medianVal = normalized.median?.enabled
    ? (normalized.median.value ?? 0)
    : 0;
  const bloomVal = normalized.bloom?.enabled
    ? (normalized.bloom.value ?? 0)
    : 0;
  const zoomBlurVal = normalized.zoomBlur?.enabled
    ? (normalized.zoomBlur.value ?? 0)
    : 0;
  const twirlVal = normalized.twirl?.enabled
    ? (normalized.twirl.value ?? 0)
    : 0;
  const denoiseVal = normalized.denoise?.enabled
    ? (normalized.denoise.value ?? 0)
    : 0;
  const defringeVal = normalized.defringe?.enabled
    ? (normalized.defringe.value ?? 0)
    : 0;
  const hazeRemovalVal = normalized.hazeRemoval?.enabled
    ? (normalized.hazeRemoval.value ?? 0)
    : 0;
  const diffuseGlowVal = normalized.diffuseGlow?.enabled
    ? (normalized.diffuseGlow.value ?? 0)
    : 0;
  const unsharpMaskVal = normalized.unsharpMask?.enabled
    ? (normalized.unsharpMask.value ?? 0)
    : 0;

  const curvesObj = normalized.curves;
  const curvesEnabled = curvesObj?.enabled ?? true;
  const curvesActive =
    curvesEnabled &&
    (hasCustomCurve(curvesObj?.luminance) ||
      hasCustomCurve(curvesObj?.r) ||
      hasCustomCurve(curvesObj?.g) ||
      hasCustomCurve(curvesObj?.b));

  // Levels: input black/white points rescaled, then a gamma curve, then the
  // output black/white remap. Folds into the same per-channel LUT as
  // brightness and contrast.
  const levelsEnabled = normalized.levels?.enabled ?? true;
  const blackVal = levelsEnabled ? (normalized.levels?.black ?? 0) : 0;
  const whiteVal = levelsEnabled ? (normalized.levels?.white ?? 100) : 100;
  const gammaVal = levelsEnabled ? (normalized.levels?.gamma ?? 1) : 1;
  const outBlackVal = levelsEnabled ? (normalized.levels?.outBlack ?? 0) : 0;
  const outWhiteVal = levelsEnabled
    ? (normalized.levels?.outWhite ?? 100)
    : 100;
  const levelsActive =
    blackVal !== 0 ||
    whiteVal !== 100 ||
    gammaVal !== 1 ||
    outBlackVal !== 0 ||
    outWhiteVal !== 100;

  // Invert is binary; threshold is a hard cut at a level.
  const invertVal = Boolean(normalized.invert?.enabled);
  const thresholdVal = normalized.threshold?.enabled
    ? (normalized.threshold?.value ?? 128)
    : null;

  // Colour balance and black & white are zone/hue dependent, so they cannot
  // fold into the per-channel LUT; they run per-pixel on the CPU path. The
  // whole objects ride on the tone so cpu_adjustments can apply them, and
  // either being active forces the CPU path (cpuOnly) like the pixel filters.
  const colorBalance = normalized.colorBalance;
  const colorBalanceActive =
    colorBalance?.enabled !== false &&
    ["shadows", "midtones", "highlights"].some((zone) => {
      const z = colorBalance?.[zone];
      return (
        z && (z.cyanRed !== 0 || z.magentaGreen !== 0 || z.yellowBlue !== 0)
      );
    });
  const blackAndWhite = normalized.blackAndWhite;
  const bwActive = Boolean(blackAndWhite?.enabled);

  // Photo filter (a per-channel gel tint) and vibrance (a saturation lift
  // weighted by how dull the pixel is) are also zone/value dependent on the
  // pixel as a whole, so they join the CPU-only per-pixel pass.
  const photoFilter = normalized.photoFilter;
  const photoFilterActive =
    photoFilter?.enabled !== false && (photoFilter?.density ?? 0) > 0;
  const vibrance = normalized.vibrance;
  const vibranceActive =
    vibrance?.enabled !== false && (vibrance?.value ?? 0) !== 0;

  // Channel mixer rebuilds each output channel from all three inputs, so it
  // joins the CPU-only per-pixel pass; a neutral identity matrix is inert.
  const channelMixer = normalized.channelMixer;
  const cmRowNeutral = (row, r, g, b) =>
    !row ||
    ((row.red ?? r) === r &&
      (row.green ?? g) === g &&
      (row.blue ?? b) === b &&
      (row.constant ?? 0) === 0);
  const channelMixerActive =
    channelMixer?.enabled !== false &&
    (channelMixer?.monochrome
      ? true
      : !(
          cmRowNeutral(channelMixer.red, 100, 0, 0) &&
          cmRowNeutral(channelMixer.green, 0, 100, 0) &&
          cmRowNeutral(channelMixer.blue, 0, 0, 100)
        ));

  // Selective color tunes CMY(K) ink per colour target; per-pixel like the
  // other CPU-only adjustments, inert when every target is zero.
  const selectiveColor = normalized.selectiveColor;
  const scTargets = [
    "reds",
    "yellows",
    "greens",
    "cyans",
    "blues",
    "magentas",
    "whites",
    "neutrals",
    "blacks",
  ];
  const selectiveColorActive =
    selectiveColor?.enabled !== false &&
    scTargets.some((name) => {
      const row = selectiveColor?.[name];
      return row && (row.c !== 0 || row.m !== 0 || row.y !== 0 || row.k !== 0);
    });

  // Gradient map recolours each pixel by its luma through a gradient; even
  // the default black→white gradient is a grayscale conversion, so enabling
  // it is always an active adjustment.
  const gradientMap = normalized.gradientMap;
  const gradientMapActive = Boolean(gradientMap?.enabled);

  // The live filter stack rides the adjustments object (see
  // normalizeAdjustments); supported spatial entries can run in the existing
  // GPU spatial stage, after the scalar adjustment pass.
  const liveFilters = normalizeLiveFilterStack(normalized.liveFilters);
  const liveFiltersStack = liveFilters.filter((entry) => entry.enabled);
  const liveFiltersActive = liveFiltersStack.length > 0;
  const liveFiltersGpuSupported = liveFiltersStack.every(
    (entry) =>
      ["blur", "sharpen", "highPass", "clarity", "motionBlur"].includes(entry.kind) &&
      entry.opacity === 1,
  );

  const lutIdentity =
    bVal === 0 &&
    cVal === 0 &&
    eVal === 0 &&
    tVal === 0 &&
    tiVal === 0 &&
    hiVal === 0 &&
    shVal === 0 &&
    !levelsActive &&
    !curvesActive &&
    !invertVal &&
    thresholdVal === null &&
    !colorBalanceActive &&
    !bwActive &&
    !photoFilterActive &&
    !vibranceActive &&
    !channelMixerActive &&
    !selectiveColorActive &&
    !gradientMapActive;
  const active =
    !lutIdentity ||
    hVal !== 0 ||
    sVal !== 0 ||
    lVal !== 0 ||
    colorizeActive ||
    bandsActive ||
    vVal > 0 ||
    blurVal > 0 ||
    sharpenVal > 0 ||
    highPassVal > 0 ||
    clarityVal !== 0 ||
    motionBlurVal > 0 ||
    noiseVal > 0 ||
    cloudsVal > 0 ||
    pixelateVal > 0 ||
    posterizeVal > 0 ||
    solarizeVal > 0 ||
    halftoneVal > 0 ||
    sepiaVal > 0 ||
    embossVal > 0 ||
    medianVal > 0 ||
    bloomVal > 0 ||
    zoomBlurVal > 0 ||
    twirlVal !== 0 ||
    denoiseVal > 0 ||
    defringeVal > 0 ||
    hazeRemovalVal > 0 ||
    diffuseGlowVal > 0 ||
    unsharpMaskVal > 0 ||
    liveFiltersActive;

  // True when any cpu-only adjustment is active — the GL pipeline bails out
  // on this so the CPU path handles the whole frame.
  // highPass / clarity / motionBlur have GL twins in gl_spatial.js — they no
    // longer force the CPU path. Unsupported live filters and pixel ops do.
  const cpuOnly =
    noiseVal > 0 ||
    cloudsVal > 0 ||
    pixelateVal > 0 ||
    posterizeVal > 0 ||
    solarizeVal > 0 ||
    halftoneVal > 0 ||
    sepiaVal > 0 ||
    embossVal > 0 ||
    medianVal > 0 ||
    bloomVal > 0 ||
    zoomBlurVal > 0 ||
    twirlVal !== 0 ||
    denoiseVal > 0 ||
    defringeVal > 0 ||
    hazeRemovalVal > 0 ||
    diffuseGlowVal > 0 ||
    unsharpMaskVal > 0 ||
    colorBalanceActive ||
    bwActive ||
    photoFilterActive ||
    vibranceActive ||
    channelMixerActive ||
    selectiveColorActive ||
    gradientMapActive ||
    liveFiltersActive && !liveFiltersGpuSupported;

  const signature = `${bVal}|${cVal}|${hVal}|${sVal}|${lVal}|${colorizeActive ? 1 : 0}|${hueSatBandsSignature(hueSatBands)}|${
    curvesActive
      ? curveSignature(curvesObj?.luminance) +
        curveSignature(curvesObj?.r) +
        curveSignature(curvesObj?.g) +
        curveSignature(curvesObj?.b)
      : "0"
  }|${eVal}|${tVal}|${tiVal}|${hiVal}|${shVal}|${vVal}|${blurVal}|${sharpenVal}|${highPassVal}|${clarityVal}|${motionBlurVal}|${motionBlurAngle}|${noiseVal}|${cloudsVal}|${pixelateVal}|${posterizeVal}|${solarizeVal}|${halftoneVal}|${sepiaVal}|${embossVal}|${medianVal}|${bloomVal}|${zoomBlurVal}|${twirlVal}|${denoiseVal}|${defringeVal}|${hazeRemovalVal}|${diffuseGlowVal}|${unsharpMaskVal}|${levelsActive ? `${blackVal}|${whiteVal}|${gammaVal}|${outBlackVal}|${outWhiteVal}` : "0"}|${invertVal ? "1" : "0"}|${thresholdVal === null ? "0" : thresholdVal}|${colorBalanceActive ? colorBalanceSignature(colorBalance) : "0"}|${bwActive ? `${blackAndWhite.reds}|${blackAndWhite.yellows}|${blackAndWhite.greens}|${blackAndWhite.cyans}|${blackAndWhite.blues}|${blackAndWhite.magentas}|${blackAndWhite.useTint ? blackAndWhite.tintColor : "0"}` : "0"}|${photoFilterActive ? `${photoFilter.density}|${photoFilter.color}|${photoFilter.preserveLuminosity !== false ? 1 : 0}` : "0"}|${vibranceActive ? vibrance.value : "0"}|${channelMixerActive ? channelMixerSignature(channelMixer) : "0"}|${selectiveColorActive ? selectiveColorSignature(selectiveColor) : "0"}|${gradientMapActive ? gradientMapSignature(gradientMap) : "0"}${liveFiltersActive ? `|${liveFiltersStack.map((entry) => `${entry.kind}@${entry.params?.value ?? entry.params?.amount ?? entry.params?.radius ?? 0}@${entry.params?.angle ?? 0}@${entry.opacity}`).join(";")}` : "|0"}`;

  const { lutR, lutG, lutB } = computeChannelLuts({
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
  });

  return {
    active,
    cpuOnly,
    lutIdentity,
    lutR,
    lutG,
    lutB,
    hue: hVal,
    satScale: 1 + sVal / 100,
    hueActive: hVal !== 0,
    satActive: sVal !== 0,
    colorize: colorizeActive,
    bands: hueSatBands,
    bandsActive,
    lightness: lVal / 100,
    lightActive: lVal !== 0,
    vignette: vVal,
    vignetteActive: vVal > 0,
    blur: blurVal,
    sharpen: sharpenVal,
    highPass: highPassVal,
    clarity: clarityVal,
    motionBlur: motionBlurVal,
    motionBlurAngle,
    noise: noiseVal,
    clouds: cloudsVal,
    pixelate: pixelateVal,
    posterize: posterizeVal,
    solarize: solarizeVal,
    halftone: halftoneVal,
    sepia: sepiaVal,
    emboss: embossVal,
    median: medianVal,
    bloom: bloomVal,
    zoomBlur: zoomBlurVal,
    twirl: twirlVal,
    denoise: denoiseVal,
    defringe: defringeVal,
    hazeRemoval: hazeRemovalVal,
    diffuseGlow: diffuseGlowVal,
    unsharpMask: unsharpMaskVal,
    colorBalance,
    blackAndWhite,
    photoFilter,
    vibrance,
    channelMixer,
    selectiveColor,
    gradientMap,
    liveFilters: liveFiltersStack,
    signature,
  };
}
