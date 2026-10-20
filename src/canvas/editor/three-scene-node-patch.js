/** Apply 3D property or gizmo edits through one document spatial contract. */
import { updateNodeSpatial } from "./canvas-composition-model.js";
import { keyframeAtTime } from "./scene-motion.js";

const SPATIAL_FIELDS = new Set([
  "x",
  "y",
  "z",
  "rotationX",
  "rotationY",
  "rotationZ",
  "width",
  "height",
]);

const ANIMATED_FIELDS = Object.freeze({
  x: "x",
  y: "y",
  z: "spatial.z",
  rotationX: "spatial.rotationX",
  rotationY: "spatial.rotationY",
  rotationZ: "rotation",
  width: "width",
  height: "height",
});

function patchTrackedValue(engine, node, property, value) {
  const track = node.animations?.find(
    (entry) => entry.property === property && entry.keyframes?.length,
  );
  if (!track) return false;
  const { time, fps } = engine.getPlaybackState();
  const frame = keyframeAtTime(node, property, time, fps ?? 30);
  engine.pause();
  engine.upsertKeyframe(
    node.id,
    property,
    {
      time: frame?.time ?? time,
      value,
      ...(frame ? { easing: frame.easing } : {}),
    },
    { commit: false },
  );
  return true;
}

function patchAnimatedFields(engine, node, spatial, other) {
  for (const [field, value] of Object.entries(spatial)) {
    const property = ANIMATED_FIELDS[field];
    if (patchTrackedValue(engine, node, property, value)) delete spatial[field];
  }
  for (const [section, field] of [
    ["model", "scale"],
    ["geometry", "depth"],
  ]) {
    const patch = other[section];
    if (!patch || !Object.hasOwn(patch, field)) continue;
    if (!patchTrackedValue(engine, node, `${section}.${field}`, patch[field]))
      continue;
    const remaining = Object.fromEntries(
      Object.entries(patch).filter(
        ([key, value]) =>
          key !== field && !Object.is(value, node[section]?.[key]),
      ),
    );
    if (Object.keys(remaining).length === 0) delete other[section];
    else other[section] = { ...node[section], ...remaining };
  }
}

export function patchThreeSceneNode(engine, id, patch) {
  if (!engine || !id) return false;
  const node = engine.getDocument().nodes.find((entry) => entry.id === id);
  if (!node) return false;
  const spatial = Object.fromEntries(
    Object.entries(patch).filter(([key]) => SPATIAL_FIELDS.has(key)),
  );
  const other = Object.fromEntries(
    Object.entries(patch).filter(([key]) => !SPATIAL_FIELDS.has(key)),
  );
  patchAnimatedFields(engine, node, spatial, other);
  if (Object.keys(spatial).length === 0 && Object.keys(other).length === 0)
    return true;
  if (Object.keys(spatial).length === 0) {
    engine.updateNode(id, other, { commit: false });
    return true;
  }
  const current = engine.getDocument().nodes.find((entry) => entry.id === id);
  const next = updateNodeSpatial(current, spatial);
  engine.updateNode(
    id,
    {
      ...other,
      x: next.x,
      y: next.y,
      width: next.width,
      height: next.height,
      rotation: next.rotation,
      spatial: next.spatial,
    },
    { commit: false },
  );
  return true;
}
