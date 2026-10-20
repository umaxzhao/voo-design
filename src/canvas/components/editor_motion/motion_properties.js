/** Numeric scene paths that the unified keyframe API can interpolate. */
import { keyframeAtTimeForModifier } from "../../editor/scene-motion.js";
export { keyframeAtTime } from "../../editor/scene-motion.js";

export const BASE_PROPERTIES = Object.freeze([
  ["x", "editor.motion.propertyX"],
  ["y", "editor.motion.propertyY"],
  ["width", "editor.motion.propertyWidth"],
  ["height", "editor.motion.propertyHeight"],
  ["rotation", "editor.motion.propertyRotation"],
  ["opacity", "editor.motion.propertyOpacity"],
]);

export const SPATIAL_PROPERTIES = Object.freeze([
  ["spatial.z", "editor.three.positionZ"],
  ["spatial.rotationX", "editor.media.rotationX"],
  ["spatial.rotationY", "editor.media.rotationY"],
]);

export const MODEL_PROPERTIES = Object.freeze([
  ["model.rotation.x", "editor.media.rotationX"],
  ["model.rotation.y", "editor.media.rotationY"],
  ["model.rotation.z", "editor.media.rotationZ"],
  ["model.scale", "editor.media.scale"],
  ["model.camera.azimuth", "editor.media.azimuth"],
  ["model.camera.elevation", "editor.media.elevation"],
  ["model.camera.distance", "editor.media.distance"],
  ["model.camera.fov", "editor.media.fov"],
  ["model.exposure", "editor.media.exposure"],
  ["model.metalness", "editor.media.metalness"],
  ["model.roughness", "editor.media.roughness"],
]);

export const MESH_PROPERTIES = Object.freeze([
  ["geometry.depth", "editor.three.depth"],
  ["material.metalness", "editor.media.metalness"],
  ["material.roughness", "editor.media.roughness"],
]);

export const MODIFIER_STEP_PROPERTIES = Object.freeze([
  ["step.x", "editor.linearArray.stepX"],
  ["step.y", "editor.linearArray.stepY"],
  ["step.z", "editor.linearArray.stepZ"],
]);

export function propertiesForNode(node) {
  if (!node) return BASE_PROPERTIES;
  const base =
    node.kind === "model3d" || node.kind === "mesh3d"
      ? BASE_PROPERTIES.map(([path, label]) =>
          path === "rotation"
            ? [path, "editor.media.rotationZ"]
            : [path, label],
        )
      : BASE_PROPERTIES;
  if (node.kind === "model3d")
    return [...base, ...SPATIAL_PROPERTIES, ...MODEL_PROPERTIES];
  if (node.kind === "mesh3d")
    return [...base, ...SPATIAL_PROPERTIES, ...MESH_PROPERTIES];
  return [...base, ...SPATIAL_PROPERTIES];
}

export function propertiesForModifier(modifier, is3d = false) {
  if (!modifier) return [];
  if (is3d) return [...MODIFIER_STEP_PROPERTIES];
  return MODIFIER_STEP_PROPERTIES.filter(([path]) => path !== "step.z");
}

export function numericPropertyValue(node, property) {
  if (!node) return null;
  // Modifier step properties
  if (property.startsWith("step.")) {
    const axis = property.slice("step.".length);
    const stepVal = node?.step?.[axis];
    return stepVal === undefined
      ? axis === "z"
        ? 0
        : null
      : finiteNumber(stepVal);
  }
  // Nodes migrated from 2D have an implicit XY plane until their first 3D edit.
  if (SPATIAL_PROPERTIES.some(([path]) => path === property)) {
    const spatialValue = node?.spatial?.[property.slice("spatial.".length)];
    return spatialValue === undefined ? 0 : finiteNumber(spatialValue);
  }
  // Imported model materials inherit their asset values until a control is set.
  // The editor presents these values when an explicit animation first overrides them.
  if (property === "model.metalness" && node.model?.metalness == null) return 0;
  if (property === "model.roughness" && node.model?.roughness == null)
    return 0.8;
  const value = property
    .split(".")
    .reduce((current, key) => current?.[key], node);
  return finiteNumber(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Read action-time state: a seek can precede the inspector's next React render. */
export function modifierMotionFieldState(engine, modifierId, property) {
  const { time, fps } = engine.getPlaybackState();
  const modifier = engine
    .getDocument()
    .modifiers?.find((entry) => entry.id === modifierId);
  if (!modifier) throw new TypeError(`Unknown modifier: ${modifierId}`);
  const evaluated = engine
    .getEvaluatedDocument(time)
    .modifiers?.find((entry) => entry.id === modifierId);
  return {
    modifier,
    time,
    keyframe: keyframeAtTimeForModifier(modifier, property, time, fps),
    track: modifier.animations?.find((entry) => entry.property === property),
    value: numericPropertyValue(evaluated ?? modifier, property),
  };
}

/** Commit only an existing spacing track; static spacing remains the caller's update. */
export function editModifierMotionField(
  engine,
  modifierId,
  property,
  value,
  upsert,
) {
  engine.pause?.();
  const live = modifierMotionFieldState(engine, modifierId, property);
  if (!live.track?.keyframes?.length) return false;
  upsert(engine, live.modifier.id, property, {
    time: live.keyframe?.time ?? live.time,
    value,
    ...(live.keyframe ? { easing: live.keyframe.easing } : {}),
  });
  return true;
}

/** Toggle against the live clock and sample the evaluated value for a new key. */
export function toggleModifierMotionField(
  engine,
  modifierId,
  property,
  upsert,
  remove,
) {
  engine.pause?.();
  const live = modifierMotionFieldState(engine, modifierId, property);
  if (live.keyframe)
    remove(engine, live.modifier.id, property, live.keyframe.time);
  else
    upsert(engine, live.modifier.id, property, {
      time: live.time,
      value: live.value,
    });
}
