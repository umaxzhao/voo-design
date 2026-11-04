/**
 * Pixel-level blend modes the 2D context cannot express.
 *
 * Canvas globalCompositeOperation covers the sixteen Photoshop modes the
 * renderer already speaks. PSD files also use ten more — dissolve, linear
 * burn/dodge, vivid/linear/pin light, hard mix, subtract, divide, and pass
 * through (a group default) — which have no GCO equivalent. Those composite
 * per-pixel here, with the W3C compositing formulas, so an imported PSD keeps
 * its look rather than silently falling back to normal.
 *
 * Each function takes the backdrop (dst, already on the page) and the source
 * (src, the node's own pixels) as 0..1 RGBA and returns the blended RGB with
 * the source's alpha applied the way the compositing spec does.
 */

/** 0..1 value, normalised. */
const n = (v) => (v > 1 ? 1 : v < 0 ? 0 : v);

/** alpha-aware result: the blended colour composited over the backdrop. */
function over(dst, src, blended) {
  const a = n(src.a + dst.a * (1 - src.a));
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  if (src.a === 0) return { r: dst.r, g: dst.g, b: dst.b, a };
  return {
    r: (blended.r * src.a + dst.r * dst.a * (1 - src.a)) / a,
    g: (blended.g * src.a + dst.g * dst.a * (1 - src.a)) / a,
    b: (blended.b * src.a + dst.b * dst.a * (1 - src.a)) / a,
    a,
  };
}

/** Linear burn: B + S − 1, the W3C separable mode. */
function linearBurn(dst, src) {
  return {
    r: n(dst.r + src.r - 1),
    g: n(dst.g + src.g - 1),
    b: n(dst.b + src.b - 1),
  };
}

/** Linear dodge (add): B + S. */
function linearDodge(dst, src) {
  return { r: n(dst.r + src.r), g: n(dst.g + src.g), b: n(dst.b + src.b) };
}

/** Vivid light: hard light with the roles of dodge/burn swapped per channel. */
function vividLight(dst, src) {
  const chan = (b, s) => {
    // Burn/dodge endpoints have defined limits; avoid 0/0 contaminating alpha.
    if (s <= 0.5) return b === 1 ? 1 : s === 0 ? 0 : n(1 - (1 - b) / (2 * s));
    return b === 0 ? 0 : s === 1 ? 1 : n(b / (2 * (1 - s)));
  };
  return {
    r: chan(dst.r, src.r),
    g: chan(dst.g, src.g),
    b: chan(dst.b, src.b),
  };
}

/** Linear light: linear dodge or burn chosen by the source channel. */
function linearLight(dst, src) {
  const chan = (b, s) => (s <= 0.5 ? n(b + 2 * s - 1) : n(b + 2 * (s - 0.5)));
  return {
    r: chan(dst.r, src.r),
    g: chan(dst.g, src.g),
    b: chan(dst.b, src.b),
  };
}

/** Pin light: keeps the backdrop except where the source is mid-tone. */
function pinLight(dst, src) {
  const chan = (b, s) =>
    s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1);
  return {
    r: chan(dst.r, src.r),
    g: chan(dst.g, src.g),
    b: chan(dst.b, src.b),
  };
}

/** Hard mix: posterise each blended channel to 0 or 1. */
function hardMix(dst, src) {
  const vivid = vividLight(dst, src);
  const bin = (v) => (v >= 0.5 ? 1 : 0);
  return { r: bin(vivid.r), g: bin(vivid.g), b: bin(vivid.b) };
}

/** Subtract: B − S. */
function subtract(dst, src) {
  return { r: n(dst.r - src.r), g: n(dst.g - src.g), b: n(dst.b - src.b) };
}

/** Divide: B / S, capped. */
function divide(dst, src) {
  const chan = (b, s) => (s <= 0 ? (b > 0 ? 1 : 0) : n(b / s));
  return {
    r: chan(dst.r, src.r),
    g: chan(dst.g, src.g),
    b: chan(dst.b, src.b),
  };
}

/**
 * Dissolve dithers the source pixel on or off by a hash of its position, so
 * the layer reads as scattered dots. Deterministic per coordinate — the page
 * does not flicker while editing.
 */
function dissolve(dst, src, x, y) {
  const threshold = src.a;
  // A small deterministic hash of the position in [0, 1).
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  const keep = h - Math.floor(h) < threshold;
  return keep
    ? { r: src.r, g: src.g, b: src.b, a: 1 }
    : { r: dst.r, g: dst.g, b: dst.b, a: dst.a };
}

/**
 * The blend modes the 2D context cannot express, keyed by the editor's
 * blend-mode string (see BLEND_MODES in scene_model.js).
 */
export const CUSTOM_BLEND_MODES = {
  "linear-burn": linearBurn,
  "linear-dodge": linearDodge,
  "vivid-light": vividLight,
  "linear-light": linearLight,
  "pin-light": pinLight,
  "hard-mix": hardMix,
  subtract,
  divide,
  dissolve,
};

/**
 * Blends a source pixel over a backdrop pixel for any custom mode.
 *
 * @param {string} mode a CUSTOM_BLEND_MODES key
 * @param {{r:number,g:number,b:number,a:number}} dst backdrop, 0..1
 * @param {{r:number,g:number,b:number,a:number}} src source, 0..1
 * @param {number} x source pixel x (for dissolve's dither)
 * @param {number} y source pixel y
 * @returns {{r:number,g:number,b:number,a:number}} the composite
 */
export function blendPixel(mode, dst, src, x = 0, y = 0) {
  const fn = CUSTOM_BLEND_MODES[mode];
  if (!fn) return src;
  if (mode === "dissolve") return dissolve(dst, src, x, y);
  const blended = fn(dst, src);
  return over(dst, src, blended);
}

/** True when a mode has no canvas GCO equivalent and needs per-pixel work. */
export function isCustomBlendMode(mode) {
  return Object.prototype.hasOwnProperty.call(CUSTOM_BLEND_MODES, mode);
}
