/**
 * Structural signature generators for adjustments caching and cache invalidation.
 *
 * Compact structural keys computed per frame to detect changes in adjustments.
 */

import { HUE_BAND_KEYS } from "./scene_model_core.js";

/** Packs the per-band Hue/Saturation config into the cache signature. */
export function hueSatBandsSignature(bands) {
  if (!bands) return "0";
  let out = "";
  for (const key of HUE_BAND_KEYS) {
    const b = bands[key];
    out += b ? `${b.h}|${b.s}|${b.l}|` : "0|0|0|";
  }
  return out;
}

/** Packs a channel-mixer object into the cache signature. */
export function channelMixerSignature(cm) {
  const row = (r) =>
    r
      ? `${r.red ?? 0}|${r.green ?? 0}|${r.blue ?? 0}|${r.constant ?? 0}`
      : "0|0|0|0";
  return `${cm?.monochrome ? 1 : 0}|${row(cm?.red)}|${row(cm?.green)}|${row(cm?.blue)}|${row(cm?.gray)}`;
}

/** Packs a selective-color object into the cache signature. */
export function selectiveColorSignature(sc) {
  const row = (r) =>
    r ? `${r.c ?? 0}|${r.m ?? 0}|${r.y ?? 0}|${r.k ?? 0}` : "0|0|0|0";
  const targets = [
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
  return `${sc?.mode === "absolute" ? 1 : 0}|${targets.map((name) => row(sc?.[name])).join("|")}`;
}

/** Packs a gradient-map object into the cache signature. */
export function gradientMapSignature(gm) {
  const stops = Array.isArray(gm?.stops)
    ? gm.stops.map((s) => `${s.color}@${s.location}`).join(",")
    : "0";
  return `${gm?.reverse ? 1 : 0}|${stops}`;
}

/** Packs a colour-balance object into the cache signature. */
export function colorBalanceSignature(cb) {
  const zone = (z) =>
    z
      ? `${z.cyanRed ?? 0}|${z.magentaGreen ?? 0}|${z.yellowBlue ?? 0}`
      : "0|0|0";
  return `${cb?.preserveLuminosity !== false ? 1 : 0}|${zone(cb?.shadows)}|${zone(cb?.midtones)}|${zone(cb?.highlights)}`;
}
