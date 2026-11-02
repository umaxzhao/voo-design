/**
 * Blend modes and effects of a Figma layer, in the editor's vocabulary.
 *
 * Mapped directly: the layer blend mode, drop and inner shadows, layer blur,
 * background blur and noise/grain. Noise is drawn as a seeded grain pattern,
 * which is a close approximation of Figma's own grain rather than a copy.
 */

import { normalizeEffects } from "../editor/scene_model_text_effects.js";
import { normalizeBlendMode } from "../editor/scene_model_core.js";

/** Figma blend mode name -> editor blend mode. */
const FIGMA_BLEND_MODES = {
  NORMAL: "source-over",
  PASS_THROUGH: "source-over",
  DARKEN: "darken",
  MULTIPLY: "multiply",
  LINEAR_BURN: "linear-burn",
  COLOR_BURN: "color-burn",
  LIGHTEN: "lighten",
  SCREEN: "screen",
  LINEAR_DODGE: "linear-dodge",
  COLOR_DODGE: "color-dodge",
  OVERLAY: "overlay",
  SOFT_LIGHT: "soft-light",
  HARD_LIGHT: "hard-light",
  VIVID_LIGHT: "vivid-light",
  LINEAR_LIGHT: "linear-light",
  PIN_LIGHT: "pin-light",
  HARD_MIX: "hard-mix",
  DIFFERENCE: "difference",
  EXCLUSION: "exclusion",
  HUE: "hue",
  SATURATION: "saturation",
  COLOR: "color",
  LUMINOSITY: "luminosity",
};

export function blendModeOf(raw) {
  return normalizeBlendMode(FIGMA_BLEND_MODES[raw.blendMode] ?? "source-over");
}

/**
 * The blend mode a layer's own fill paint carries, when the layer itself has
 * none. Figma stores blend per paint as well as per layer; the editor has one
 * blend per node, so the first visible paint's mode stands in for it.
 */
export function paintBlendOf(raw) {
  const paint = (Array.isArray(raw.fillPaints) ? raw.fillPaints : []).find((entry) => entry && entry.visible !== false);
  if (!paint || !paint.blendMode || paint.blendMode === "NORMAL") return null;
  return blendModeOf(paint);
}

function channel(unit) {
  return Math.round(Math.min(1, Math.max(0, unit)) * 255)
    .toString(16)
    .padStart(2, "0");
}

/** A Figma colour as an editor colour and opacity (0–100). */
function shadowColour(color) {
  const rgb = `#${channel(color?.r ?? 0)}${channel(color?.g ?? 0)}${channel(color?.b ?? 0)}`;
  const opacity = Math.round(Math.min(1, Math.max(0, color?.a ?? 1)) * 100);
  return { color: rgb, opacity };
}

/** One shadow record in the editor's form. Spread has no editor counterpart. */
function shadowOf(effect) {
  const { color, opacity } = shadowColour(effect.color);
  return {
    enabled: effect.visible !== false,
    color,
    blur: Number(effect.radius) || 0,
    spread: Math.max(0, Number(effect.spread) || 0),
    offsetX: Number(effect.offset?.x) || 0,
    offsetY: Number(effect.offset?.y) || 0,
    opacity,
  };
}

/** Blur radius of an enabled blur effect, or 0. */
function radiusOf(effect) {
  return Math.max(0, Number(effect.radius) || 0);
}

/** A noise/grain effect as the renderer's grain record. */
function grainOf(effect) {
  const { color } = shadowColour(effect.color);
  // A multitone grain alternates between its two colours; mono uses one.
  const multitone = effect.noiseType === "MULTITONE" && effect.secondaryColor;
  return {
    opacity: Math.min(1, Math.max(0, Number(effect.opacity ?? 1))),
    size: Math.max(1, Number(effect.noiseSize) || 1),
    density: Math.min(1, Math.max(0, Number(effect.density ?? 0.5))),
    seed: Number(effect.seed) || 0,
    color,
    secondaryColor: multitone ? shadowColour(effect.secondaryColor).color : null,
    blendMode: blendModeOf({ blendMode: effect.blendMode }),
  };
}

/**
 * The effects of a Figma layer in the editor's form: `effects` for shadows,
 * and the blur and grain fields the renderer reads directly from the node.
 */
export function effectsOf(raw) {
  const shadows = {};
  const node = {};
  for (const effect of Array.isArray(raw.effects) ? raw.effects : []) {
    if (!effect || effect.visible === false) continue;
    if (effect.type === 'DROP_SHADOW' && !shadows.shadow) shadows.shadow = shadowOf(effect);
    else if (effect.type === 'INNER_SHADOW' && !shadows.innerShadow) shadows.innerShadow = shadowOf(effect);
    else if (effect.type === 'FOREGROUND_BLUR' && !node.layerBlur) node.layerBlur = radiusOf(effect);
    else if (effect.type === 'BACKGROUND_BLUR' && !node.backgroundBlur) node.backgroundBlur = radiusOf(effect);
    else if ((effect.type === 'NOISE' || effect.type === 'GRAIN') && !node.noise) node.noise = grainOf(effect);
  }
  return { effects: normalizeEffects(shadows), ...node };
}
