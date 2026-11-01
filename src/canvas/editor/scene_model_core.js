// Seam: Core document constants, palette, transforms, and adjustment primitives.
/**
 * The editor's document model.
 *
 * A document is a size plus a flat, bottom-to-top list of nodes. Every node
 * stores its box in document pixels with the top-left corner at `x, y` — there
 * is no origin flag and no scale factor, so what the numbers say is what the
 * renderer draws.
 *
 * Pure data: no DOM, no canvas, no React. Bitmaps are attached at runtime by
 * the engine and deliberately never serialised.
 */

import { DOC_VERSION, NODE_KIND, DEFAULT_BLEND_MODE, newId, createDefaultAdjustments, getBaseDefaults, createDocument, createImageNode } from "./scene_doc_factory.js";
import { createDefaultValueMatcher } from "./default-value-matcher.js";

export { DOC_VERSION, NODE_KIND, DEFAULT_BLEND_MODE, newId, createDefaultAdjustments, getBaseDefaults, createDocument, createImageNode };

export { normalizeGradient, formatGradientString } from "./gradient_model.js";
export { parseLineHeight, parseTextDecoration, applyTextTransform, estimateTextSize } from "./text_fidelity.js";

/** High-contrast semantic segmentation palette for multi-region prompting. */
export const REGION_PALETTE = [
  { hex: "#FF0000", name: "Red", nameZh: "红色" },
  { hex: "#00FF00", name: "Green", nameZh: "绿色" },
  { hex: "#0000FF", name: "Blue", nameZh: "蓝色" },
  { hex: "#FFFF00", name: "Yellow", nameZh: "黄色" },
  { hex: "#FF00FF", name: "Magenta", nameZh: "洋红" },
  { hex: "#00FFFF", name: "Cyan", nameZh: "青色" },
  { hex: "#FF8800", name: "Orange", nameZh: "橙色" },
  { hex: "#8800FF", name: "Purple", nameZh: "紫色" },
  { hex: "#00FF88", name: "Spring Green", nameZh: "春绿" },
  { hex: "#FF0088", name: "Rose", nameZh: "玫瑰红" },
];

/** Default fallback chrome color when no palette index is assigned. */
export const REGION_COLOR = "#FF0000";

/** Gets assigned distinct color for a region index. */
export function getRegionColor(regionIndex = 0) {
  const item = REGION_PALETTE[Math.abs(regionIndex) % REGION_PALETTE.length];
  return item;
}

/** Smallest drag that counts as a region rather than a stray click, in doc px. */
export const MIN_REGION_SIZE = 12;

/** The legacy document version, which stored warp/perspective controls as
 * absolute document-space coordinates and is re-anchored on read. Kept so a
 * document written before the node-local-ratio migration still loads. */
export const LEGACY_DOC_VERSION = 1;

export const DEFAULT_FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export const DEFAULT_FONT_SIZE = 32;

/** Line height as a multiple of the font size, shared by renderer and overlay. */
export const LINE_HEIGHT_RATIO = 1.25;

/**
 * The values a text node's fontWeight field may take. Numeric weights 100–900
 * run a variable/loaded Google font's real intermediate faces ("normal" and
 * "bold" stay for the CSS keywords and legacy documents).
 */
export const TEXT_FONT_WEIGHTS = [
  "100",
  "200",
  "300",
  "400",
  "normal",
  "500",
  "600",
  "700",
  "800",
  "900",
  "bold",
];

/** The `letterSpacing` bounds normalizeTextStyle and the panel share. */
export const TEXT_LETTER_SPACING_BOUNDS = { min: -10, max: 40 };

/** The `lineHeight` bounds normalizeTextStyle and the panel share. */
export const TEXT_LINE_HEIGHT_BOUNDS = { min: 0.8, max: 3 };

/** The values a text node's align field may take. */
export const TEXT_ALIGNS = ["left", "center", "right"];

/**
 * The additive text-styling fields and their defaults.
 *
 * Documents written before these fields existed carry none of them; both the
 * deserialiser and the renderer fall back to these values, and `lineHeight`
 * defaults to the historical LINE_HEIGHT_RATIO so old documents render
 * pixel-identically.
 */
export const DEFAULT_TEXT_STYLE = {
  fontWeight: "normal",
  italic: false,
  underline: false,
  align: "left",
  letterSpacing: 0,
  lineHeight: LINE_HEIGHT_RATIO,
  /** Extra gap after a hard paragraph break ("\n"). */
  paragraphSpacing: 0,
  /** Vertical glyph offset in px (Photoshop's Baseline Shift); the line box itself does not move. */
  baselineShift: 0,
  stroke: null,
  strokeWidth: 2,
  shadow: null,
  highlight: null,
  /** "vertical" writes 直排: characters stack top-to-bottom, lines go right. */
  direction: "horizontal",
};

/** Smallest document edge the resize handles allow. */
export const MIN_DOC_SIZE = 64;

/**
 * The compositing modes a node may use. The first sixteen are canvas-native
 * `globalCompositeOperation` values; the last nine have no GCO equivalent and
 * composite per-pixel through blend_math.js. Kept as a whitelist so a
 * document written by a newer build (or hand-edited) degrades to the default
 * instead of throwing on an unknown mode.
 */
export const BLEND_MODES = [
  "source-over",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
  // PSD-only modes, composited per-pixel (see blend_math.js).
  "dissolve",
  "linear-burn",
  "linear-dodge",
  "vivid-light",
  "linear-light",
  "pin-light",
  "hard-mix",
  "subtract",
  "divide",
];

export function normalizeBlendMode(value) {
  return BLEND_MODES.includes(value) ? value : DEFAULT_BLEND_MODE;
}

/** Shear never reaches ±90°, where the box would flatten into a line. */
export const MAX_SHEAR_DEG = 80;

/**
 * A rect (or image) node's corner radius, in px.
 * Can be a finite non-negative number, or a 4-corner object { tl, tr, br, bl }.
 * When all 4 corners are equal, it normalizes to a single scalar number.
 * Returns 0 for invalid, negative, or non-finite scalar values.
 */
export function normalizeCornerRadius(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (value && typeof value === "object") {
    const tl = Number.isFinite(value.tl) && value.tl > 0 ? value.tl : 0;
    const tr = Number.isFinite(value.tr) && value.tr > 0 ? value.tr : 0;
    const br = Number.isFinite(value.br) && value.br > 0 ? value.br : 0;
    const bl = Number.isFinite(value.bl) && value.bl > 0 ? value.bl : 0;
    if (tl === tr && tr === br && br === bl) {
      return tl;
    }
    return { tl, tr, br, bl };
  }
  return 0;
}

/**
 * Resolves any cornerRadius value (scalar number or { tl, tr, br, bl }) into
 * canonical geometry with per-corner radii clamped to width/height.
 */
export function resolveCornerRadii(value, width = null, height = null) {
  let tl = 0;
  let tr = 0;
  let br = 0;
  let bl = 0;

  if (typeof value === "number") {
    const r = Number.isFinite(value) && value > 0 ? value : 0;
    tl = r;
    tr = r;
    br = r;
    bl = r;
  } else if (value && typeof value === "object") {
    tl = Number.isFinite(value.tl) && value.tl > 0 ? value.tl : 0;
    tr = Number.isFinite(value.tr) && value.tr > 0 ? value.tr : 0;
    br = Number.isFinite(value.br) && value.br > 0 ? value.br : 0;
    bl = Number.isFinite(value.bl) && value.bl > 0 ? value.bl : 0;
  }

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    const maxR = Math.min(width / 2, height / 2);
    tl = Math.min(tl, maxR);
    tr = Math.min(tr, maxR);
    br = Math.min(br, maxR);
    bl = Math.min(bl, maxR);
    const topSum = tl + tr;
    const bottomSum = bl + br;
    const leftSum = tl + bl;
    const rightSum = tr + br;
    let factor = 1;
    if (topSum > width) factor = Math.min(factor, width / topSum);
    if (bottomSum > width) factor = Math.min(factor, width / bottomSum);
    if (leftSum > height) factor = Math.min(factor, height / leftSum);
    if (rightSum > height) factor = Math.min(factor, height / rightSum);
    if (factor < 1) {
      tl *= factor;
      tr *= factor;
      br *= factor;
      bl *= factor;
    }
  }

  const isUniform = tl === tr && tr === br && br === bl;
  return {
    tl,
    tr,
    br,
    bl,
    isUniform,
    uniformRadius: isUniform ? tl : 0,
    asArray: [tl, tr, br, bl],
  };
}

/** Wraps degrees into (-180, 180]: 270 reads as -90, and -180 as 180. */
export function normalizeRotationDeg(degrees) {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/**
 * The render-time transform of a node: `rotation` and `shear`, both in
 * degrees, pivoting on the box centre (see scene_geometry.js for the matrix).
 *
 * Additive fields — documents written before they existed carry neither and
 * read back as 0. Anything non-finite resets to 0, the shear clamps to
 * ±MAX_SHEAR_DEG, and region nodes are always 0/0: a region compiles into
 * prompt percentages, which have no words for a rotated box.
 */
export function normalizeNodeTransform(node) {
  if (!node || node.kind === NODE_KIND.REGION) {
    return { rotation: 0, shear: 0 };
  }
  const rotation = Number.isFinite(node.rotation) ? node.rotation : 0;
  const shear = Number.isFinite(node.shear) ? node.shear : 0;
  return {
    rotation: normalizeRotationDeg(rotation),
    shear: Math.max(-MAX_SHEAR_DEG, Math.min(MAX_SHEAR_DEG, shear)),
  };
}

/**
 * True when any node composites non-trivially. Blend modes mix with whatever
 * is underneath, so an export needs the page backdrop the preview shows
 * instead of the usual transparent canvas.
 */
export function hasBlendModes(doc) {
  return (doc?.nodes ?? []).some((node) => (node.blendMode ?? DEFAULT_BLEND_MODE) !== DEFAULT_BLEND_MODE);
}

// The neutral adjustment baseline, built once and reused for READING default
// fallback values inside `normalizeAdjustments`. Building it per call (and per
// deserialised node) was the hot allocation in the deserialise path: a node's
// `adjustments` is always normalised through `normalizeAdjustments`, and the
// defaults object is needed only as a source of fallback values when a stored
// field is missing. It is never returned from `normalizeAdjustments` and never
// mutated, so sharing one read-only baseline is safe. The `createDefaultAdjustments`
// factory above still returns a FRESH object each call for any caller that stores
// or mutates it.
export const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();
const matchesDefaultAdjustments = createDefaultValueMatcher(DEFAULT_ADJUSTMENTS);

/**
 * Whether `adj` is the neutral baseline (equal to the shared default).
 *
 * The v2 write path drops a node's `adjustments` when it is exactly the
 * default — an unchanged layer carries no signal, and persisting the full
 * neutral object per node is what bloated the JSON record. A document written
 * this way still round-trips, because `deserialiseDocument` fills the default
 * back in via `normalizeAdjustments` when the field is absent.
 *
 * Recursive structural compare (not object identity), so a node that owns its
 * own fresh default instance still matches.
 */
export function isDefaultAdjustments(adj) {
  if (adj === DEFAULT_ADJUSTMENTS) return true;
  if (!adj || typeof adj !== "object") return false;
  return matchesDefaultAdjustments(adj);
}

/** Structural equality of two JSON-like values, ignoring property order. */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const key of ak) {
      if (!(key in b) || !deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

export function normalizePoints(points, defaultPoints) {
  if (!Array.isArray(points) || points.length < 2) return defaultPoints;
  const valid = points
    .filter((p) => p && typeof p === "object" && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({
      x: Math.max(0, Math.min(1, p.x)),
      y: Math.max(0, Math.min(1, p.y)),
    }))
    .sort((a, b) => a.x - b.x);

  const deduped = [];
  for (const p of valid) {
    if (deduped.length === 0 || Math.abs(deduped[deduped.length - 1].x - p.x) > 1e-6) {
      deduped.push(p);
    } else {
      deduped[deduped.length - 1] = p;
    }
  }

  return deduped.length >= 2 ? deduped : defaultPoints;
}

export function parseAdjustmentValue(val, min, max, fallback) {
  const num = typeof val === "number" ? val : Number(val);
  return Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : fallback;
}

/**
 * The six Photoshop hue bands a per-band Hue/Saturation tweak can target.
 * Band membership is decided by the pixel's hue (see hueBandIndex in
 * tone_lut.js); a band here carries relative hue/saturation/lightness offsets.
 */
export const HUE_BAND_KEYS = ["reds", "yellows", "greens", "cyans", "blues", "magentas"];

/**
 * Normalises a per-band Hue/Saturation config: only bands with at least one
 * non-zero offset survive, and offsets are clamped to Photoshop's ranges.
 * Returns null when every band is neutral — the common case, so the render
 * paths can skip the band lookup entirely.
 */
export function normalizeHueSatBands(value) {
  if (!value || typeof value !== "object") return null;
  const bands = {};
  let any = false;
  for (const key of HUE_BAND_KEYS) {
    const band = value[key];
    if (!band || typeof band !== "object") continue;
    const h = Number(band.h) || 0;
    const s = Number(band.s) || 0;
    const l = Number(band.l) || 0;
    if (h === 0 && s === 0 && l === 0) continue;
    bands[key] = {
      h: Math.max(-180, Math.min(180, h)),
      s: Math.max(-100, Math.min(100, s)),
      l: Math.max(-100, Math.min(100, l)),
    };
    any = true;
  }
  return any ? bands : null;
}
