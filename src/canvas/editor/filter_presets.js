/**
 * One-click filter presets for the editor's image nodes.
 *
 * A preset is nothing but a complete adjustments object in the shape
 * `createDefaultAdjustments()` returns, so applying one goes through the exact
 * same commit path as the sliders: one history snapshot, and the GPU/CPU/export
 * parity holds because the renderer already keys everything off the tone
 * signature. Pure data: no DOM, no canvas, no React.
 */

import { createDefaultAdjustments } from "./scene_model.js";

/** A complete adjustments object from per-category overrides. */
function makeAdjustments(overrides = {}) {
  const adjustments = createDefaultAdjustments();
  for (const [key, value] of Object.entries(overrides)) {
    adjustments[key] = { ...adjustments[key], ...value };
  }
  return adjustments;
}

/** Curve points in the tone-curves widget's shape, as (x, y) pairs. */
function curve(...pairs) {
  return pairs.map(([x, y]) => ({ x, y }));
}

export const FILTER_PRESETS = [
  // The untouched original — the tone LUT treats this as the identity.
  {
    key: "none",
    labelKey: "editor.filters.none",
    adjustments: makeAdjustments(),
  },

  // Full desaturation with a contrast push so the monochrome stays punchy,
  // plus a slight shadow pull for deeper blacks.
  {
    key: "bw",
    labelKey: "editor.filters.bw",
    adjustments: makeAdjustments({
      saturation: { value: -100 },
      contrast: { value: 14 },
      shadows: { value: -6 },
    }),
  },

  // Warm, faded print: lifted blacks and rolled-off whites via the luminance
  // curve, desaturated, warm cast, gentle vignette.
  {
    key: "vintage",
    labelKey: "editor.filters.vintage",
    adjustments: makeAdjustments({
      temperature: { value: 28 },
      tint: { value: 10 },
      saturation: { value: -22 },
      contrast: { value: -14 },
      vignette: { value: 22 },
      curves: { luminance: curve([0, 0.07], [1, 0.94]) },
    }),
  },

  // Golden-hour cast: warm temperature with a small magenta lean and a
  // saturation lift so skin tones keep their glow.
  {
    key: "warm",
    labelKey: "editor.filters.warm",
    adjustments: makeAdjustments({
      temperature: { value: 34 },
      tint: { value: 6 },
      saturation: { value: 8 },
      brightness: { value: 4 },
    }),
  },

  // Overcast/moonlight cast: cool temperature with a faint green lean.
  {
    key: "cool",
    labelKey: "editor.filters.cool",
    adjustments: makeAdjustments({
      temperature: { value: -34 },
      tint: { value: -5 },
      saturation: { value: 4 },
      brightness: { value: 2 },
    }),
  },

  // Washed-out matte look: contrast and saturation pulled down, blacks
  // lifted hard and whites capped by the luminance curve.
  {
    key: "fade",
    labelKey: "editor.filters.fade",
    adjustments: makeAdjustments({
      contrast: { value: -24 },
      saturation: { value: -18 },
      brightness: { value: 8 },
      curves: { luminance: curve([0, 0.1], [1, 0.96]) },
    }),
  },

  // Hard, graphic punch: slider contrast plus an S-curve, with shadows and
  // highlights spread further apart.
  {
    key: "contrast",
    labelKey: "editor.filters.contrast",
    adjustments: makeAdjustments({
      contrast: { value: 42 },
      saturation: { value: 6 },
      highlights: { value: 10 },
      shadows: { value: -14 },
      curves: { luminance: curve([0, 0], [0.25, 0.18], [0.75, 0.82], [1, 1]) },
    }),
  },

  // Colour negative film: slightly warm with a magenta lean, muted palette,
  // lifted shadows, soft toe/shoulder on the curve and a light vignette.
  {
    key: "film",
    labelKey: "editor.filters.film",
    adjustments: makeAdjustments({
      temperature: { value: 12 },
      tint: { value: 6 },
      contrast: { value: -8 },
      saturation: { value: -12 },
      shadows: { value: 18 },
      vignette: { value: 18 },
      curves: { luminance: curve([0, 0.05], [0.5, 0.52], [1, 0.96]) },
    }),
  },

  // Gentle, low-tension grade: flat contrast, compressed highlights and
  // opened-up shadows — flattering for portraits.
  {
    key: "soft",
    labelKey: "editor.filters.soft",
    adjustments: makeAdjustments({
      contrast: { value: -18 },
      brightness: { value: 6 },
      saturation: { value: -8 },
      highlights: { value: -18 },
      shadows: { value: 14 },
    }),
  },

  // Maximum pop: heavy saturation with contrast and a touch of exposure to
  // keep the extra chroma from going muddy.
  {
    key: "vivid",
    labelKey: "editor.filters.vivid",
    adjustments: makeAdjustments({
      saturation: { value: 34 },
      contrast: { value: 16 },
      exposure: { value: 0.15 },
      highlights: { value: 6 },
    }),
  },

  // Bright, low-contrast Japanese-magazine look: overexposed a third of a
  // stop, cool, desaturated, shadows lifted well up.
  {
    key: "airy",
    labelKey: "editor.filters.airy",
    adjustments: makeAdjustments({
      exposure: { value: 0.4 },
      temperature: { value: -10 },
      tint: { value: 4 },
      contrast: { value: -12 },
      saturation: { value: -14 },
      shadows: { value: 24 },
      highlights: { value: 8 },
    }),
  },

  // Dense, saturated, slightly dark grade with warm mids and a vignette —
  // food and night scenes.
  {
    key: "rich",
    labelKey: "editor.filters.rich",
    adjustments: makeAdjustments({
      saturation: { value: 24 },
      contrast: { value: 12 },
      exposure: { value: -0.15 },
      temperature: { value: 8 },
      shadows: { value: -10 },
      vignette: { value: 15 },
    }),
  },
];

/**
 * One-click pixel (Photoshop-style) filters, applied on top of the tone
 * presets. Each sets a single category the CPU filter pipeline understands;
 * because the GPU has no kernel for them, these frames render on the CPU.
 */
export const PIXEL_FILTER_PRESETS = [
  // Film grain: fine noise across the frame.
  {
    key: "grain",
    labelKey: "editor.filters.grain",
    adjustments: makeAdjustments({ noise: { value: 48 } }),
  },
  // Mosaic: blocky retro pixelation.
  {
    key: "mosaic",
    labelKey: "editor.filters.mosaic",
    adjustments: makeAdjustments({ pixelate: { value: 40 } }),
  },
  // Posterize: hard quantised bands, comic-print flatness.
  {
    key: "poster",
    labelKey: "editor.filters.poster",
    adjustments: makeAdjustments({ posterize: { value: 52 } }),
  },
  // Sepia: old-photo warmth.
  {
    key: "sepia",
    labelKey: "editor.filters.sepia",
    adjustments: makeAdjustments({ sepia: { value: 72 } }),
  },
  // Emboss: raised lit edges, coin-relief look.
  {
    key: "emboss",
    labelKey: "editor.filters.emboss",
    adjustments: makeAdjustments({ emboss: { value: 58 } }),
  },
  // Soft focus: a gentle blur for dreamy portraits.
  {
    key: "soften",
    labelKey: "editor.filters.soften",
    adjustments: makeAdjustments({ blur: { value: 18 } }),
  },
  // Sharpening pass: crisper edges.
  {
    key: "crisp",
    labelKey: "editor.filters.crisp",
    adjustments: makeAdjustments({ sharpen: { value: 52 } }),
  },
];

/**
 * The filter panel's second-level drawers. Each category is its own
 * collapsible group; `presets` are the one-click swatches inside it.
 */
export const FILTER_CATEGORIES = [
  {
    key: "colour",
    labelKey: "editor.filters.category.colour",
    presets: FILTER_PRESETS,
  },
  {
    key: "pixel",
    labelKey: "editor.filters.category.pixel",
    presets: PIXEL_FILTER_PRESETS,
  },
];
