/**
 * One-click keyframe presets (Lottielab's "Add animation", Spline's
 * Modifiers). A preset writes ordinary keyframe tracks, so the result is
 * editable on the timeline like anything the user keyed by hand.
 */
import { getNodeSpatial } from "./canvas-composition-model.js";
import { isAnimatableProperty, upsertNodeKeyframe } from "./scene-motion.js";

const FADE_SECONDS = 0.8;
const SLIDE_DISTANCE = 160;
const FLOAT_DISTANCE = 24;
const PULSE_SCALE = 1.1;
const MIN_SIZE_FACTOR = 0.01;

export const ANIMATION_PRESETS = Object.freeze([
  { id: "spin", labelKey: "editor.motion.preset.spin", loops: true },
  { id: "float", labelKey: "editor.motion.preset.float", loops: true },
  { id: "pulse", labelKey: "editor.motion.preset.pulse", loops: true },
  { id: "fadeIn", labelKey: "editor.motion.preset.fadeIn", loops: false },
  { id: "fadeOut", labelKey: "editor.motion.preset.fadeOut", loops: false },
  { id: "slideIn", labelKey: "editor.motion.preset.slideIn", loops: false },
  { id: "grow", labelKey: "editor.motion.preset.grow", loops: false },
]);

const is3d = (node) => node.kind === "mesh3d" || node.kind === "model3d";

/** Every preset returns [{ property, frames: [{ time, value, easing }] }]. */
function presetFrames(node, id, duration) {
  const spatial = getNodeSpatial(node);
  const opacity = Number.isFinite(node.opacity) ? node.opacity : 1;
  const span = Math.min(FADE_SECONDS, duration);
  switch (id) {
    case "spin": {
      const property = is3d(node) ? "spatial.rotationY" : "rotation";
      const base = is3d(node) ? spatial.rotationY : spatial.rotationZ;
      return [
        {
          property,
          frames: [
            { time: 0, value: base, easing: "linear" },
            { time: duration, value: base + 360, easing: "linear" },
          ],
        },
      ];
    }
    case "float":
      return [
        {
          property: "y",
          frames: [
            { time: 0, value: spatial.y, easing: "ease-in-out" },
            {
              time: duration / 2,
              value: spatial.y - FLOAT_DISTANCE,
              easing: "ease-in-out",
            },
            { time: duration, value: spatial.y, easing: "ease-in-out" },
          ],
        },
      ];
    case "pulse":
      return ["width", "height"].map((property) => ({
        property,
        frames: [
          { time: 0, value: spatial[property], easing: "ease-in-out" },
          {
            time: duration / 2,
            value: spatial[property] * PULSE_SCALE,
            easing: "ease-in-out",
          },
          { time: duration, value: spatial[property], easing: "ease-in-out" },
        ],
      }));
    case "fadeIn":
      return [
        {
          property: "opacity",
          frames: [
            { time: 0, value: 0, easing: "ease-out" },
            { time: span, value: opacity, easing: "linear" },
          ],
        },
      ];
    case "fadeOut":
      return [
        {
          property: "opacity",
          frames: [
            { time: duration - span, value: opacity, easing: "ease-in" },
            { time: duration, value: 0, easing: "linear" },
          ],
        },
      ];
    case "slideIn":
      return [
        {
          property: "x",
          frames: [
            { time: 0, value: spatial.x - SLIDE_DISTANCE, easing: "ease-out" },
            { time: span, value: spatial.x, easing: "linear" },
          ],
        },
      ];
    case "grow":
      return ["width", "height"].map((property) => ({
        property,
        frames: [
          {
            time: 0,
            value: Math.max(1, spatial[property] * MIN_SIZE_FACTOR),
            easing: "ease-out",
          },
          { time: span, value: spatial[property], easing: "linear" },
        ],
      }));
    default:
      throw new RangeError(`Unknown animation preset: ${id}`);
  }
}

/**
 * The node with the preset's tracks written in. A preset replaces the whole
 * track of each property it touches; other tracks are left alone.
 */
export function applyAnimationPreset(node, presetId, duration) {
  if (!(duration > 0)) throw new RangeError("Preset needs a positive duration");
  let next = { ...node, animations: (node.animations ?? []).slice() };
  for (const { property, frames } of presetFrames(node, presetId, duration)) {
    if (!isAnimatableProperty(node, property)) continue;
    next = {
      ...next,
      animations: next.animations.filter(
        (track) => track.property !== property,
      ),
    };
    for (const frame of frames)
      next = upsertNodeKeyframe(next, property, frame);
  }
  return next;
}
