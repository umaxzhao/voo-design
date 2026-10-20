import * as THREE from "three";
import { getNodeSpatial } from "./canvas-composition-model.js";
import { worldPointToEditor } from "./three-scene-model.js";

const MIN_RENDER_SIZE = 1;
const MIN_MODEL_SCALE = 0.001;
const CHANGE_EPSILON = 0.0001;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const PLANAR_GEOMETRY_TYPES = new Set([
  "plane",
  "ellipse",
  "triangle",
  "polygon",
  "star",
]);

function wrapSignedDegrees(value) {
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

function eulerDistanceDegrees(a, b) {
  return (
    Math.abs(wrapSignedDegrees(a.x - b.x)) +
    Math.abs(wrapSignedDegrees(a.y - b.y)) +
    Math.abs(wrapSignedDegrees(a.z - b.z))
  );
}

/**
 * Three's quaternion decomposition writes a |Y| > 90° orientation as the
 * flipped triple (x±180, 180-|y|, z±180) even though it is the same rotation.
 * Committing that form puts ±180 into X/Z, so a "rotate Y" drag dirties two
 * fields it never touched and the next edit jumps. Both triples are valid;
 * pick whichever is closer to the orientation the drag started from.
 */
export function canonicalEulerDegrees(rotation, reference = rotation) {
  const base = {
    x: rotation.x * RADIANS_TO_DEGREES,
    y: rotation.y * RADIANS_TO_DEGREES,
    z: rotation.z * RADIANS_TO_DEGREES,
  };
  const flipped = { x: base.x + 180, y: 180 - base.y, z: base.z + 180 };
  const refX = reference.x ?? reference._x ?? 0;
  const refY = reference.y ?? reference._y ?? 0;
  const refZ = reference.z ?? reference._z ?? 0;
  const ref = {
    x: refX * RADIANS_TO_DEGREES,
    y: refY * RADIANS_TO_DEGREES,
    z: refZ * RADIANS_TO_DEGREES,
  };
  return eulerDistanceDegrees(base, ref) <= eulerDistanceDegrees(flipped, ref)
    ? base
    : flipped;
}

function centerInEditor(position, doc, layerOffset) {
  return worldPointToEditor(
    { x: position.x, y: position.y, z: position.z - layerOffset },
    doc,
  );
}

function scaleRatio(current, initial) {
  if (!Number.isFinite(current) || !Number.isFinite(initial) || initial === 0) {
    throw new RangeError("Invalid 3D transform scale");
  }
  return Math.abs(current / initial);
}

function getModelScaleFactor(current, initial) {
  const ratios = ["x", "y", "z"].map((axis) =>
    scaleRatio(current[axis], initial[axis]),
  );
  // Imported models expose one uniform document scale. The actively dragged
  // gizmo axis has the largest departure from one; preserve the start scale.
  return ratios.reduce((selected, ratio) =>
    Math.abs(ratio - 1) > Math.abs(selected - 1) ? ratio : selected,
  );
}

export const ROTATION_SNAP_DEGREES = 15;
export const TRANSLATION_SNAP_STEP = 10;
export const SCALE_SNAP_STEP = 0.1;

/**
 * Snaps angle in degrees to the nearest multiple of step (default 15°).
 */
export function snapRotationDegrees(value, step = ROTATION_SNAP_DEGREES) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  const snapped = Math.round(value / step) * step;
  return Object.is(snapped, -0) ? 0 : snapped;
}

export function getNodeTransformPatch({
  node,
  doc,
  mode,
  position,
  rotation,
  scale,
  initialScale,
  initialRotation = rotation,
  initialPosition = null,
  layerOffset = 0,
  snapRotation = false,
  rotationSnapAngle = ROTATION_SNAP_DEGREES,
}) {
  const spatial = getNodeSpatial(node);
  const center = centerInEditor(position, doc, layerOffset);
  if (mode === "translate") {
    return {
      x: center.x - spatial.width / 2,
      y: center.y - spatial.height / 2,
      z: center.z,
    };
  }
  if (mode === "rotate") {
    const modelRotation = node.kind === "model3d" ? node.model?.rotation : null;
    // A single-axis drag must write a single-axis delta: commit the
    // orientation nearest the drag start, not Three's flipped decomposition.
    const combined = canonicalEulerDegrees(rotation, initialRotation);
    let rotX = -combined.x - (modelRotation?.x ?? 0);
    let rotY = combined.y - (modelRotation?.y ?? 0);
    let rotZ = -combined.z - (modelRotation?.z ?? 0);
    if (snapRotation) {
      const step =
        typeof snapRotation === "number" ? snapRotation : rotationSnapAngle;
      rotX = snapRotationDegrees(rotX, step);
      rotY = snapRotationDegrees(rotY, step);
      rotZ = snapRotationDegrees(rotZ, step);
    }
    const patch = {
      rotationX: rotX,
      rotationY: rotY,
      rotationZ: rotZ,
    };
    if (
      initialPosition &&
      (Math.abs(position.x - initialPosition.x) > CHANGE_EPSILON ||
        Math.abs(position.y - initialPosition.y) > CHANGE_EPSILON ||
        Math.abs(position.z - initialPosition.z) > CHANGE_EPSILON)
    ) {
      patch.x = center.x - spatial.width / 2;
      patch.y = center.y - spatial.height / 2;
      patch.z = center.z;
    }
    return patch;
  }
  if (mode === "scale") {
    if (node.kind === "model3d") {
      const factor = getModelScaleFactor(scale, initialScale);
      const patch = {
        model: {
          ...node.model,
          scale: Math.max(MIN_MODEL_SCALE, (node.model?.scale ?? 1) * factor),
        },
      };
      if (
        initialPosition &&
        (Math.abs(position.x - initialPosition.x) > CHANGE_EPSILON ||
          Math.abs(position.y - initialPosition.y) > CHANGE_EPSILON ||
          Math.abs(position.z - initialPosition.z) > CHANGE_EPSILON)
      ) {
        patch.x = center.x - spatial.width / 2;
        patch.y = center.y - spatial.height / 2;
        patch.z = center.z;
      }
      return patch;
    }
    const width = Math.max(
      MIN_RENDER_SIZE,
      spatial.width * scaleRatio(scale.x, initialScale.x),
    );
    const height = Math.max(
      MIN_RENDER_SIZE,
      spatial.height * scaleRatio(scale.y, initialScale.y),
    );
    const patch = {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
    };
    if (
      initialPosition &&
      Math.abs(position.z - initialPosition.z) > CHANGE_EPSILON
    ) {
      patch.z = center.z;
    }
    if (
      node.kind === "mesh3d" &&
      !PLANAR_GEOMETRY_TYPES.has(node.geometry?.type)
    ) {
      patch.geometry = {
        ...node.geometry,
        depth: Math.max(
          MIN_RENDER_SIZE,
          (node.geometry?.depth ?? 80) * scaleRatio(scale.z, initialScale.z),
        ),
      };
    }
    return patch;
  }
  throw new RangeError(`Unsupported 3D transform mode: ${mode}`);
}

export function hasNodeTransformChange(node, patch) {
  const spatial = getNodeSpatial(node);
  return Object.entries(patch).some(([key, value]) => {
    if (key === "geometry")
      return (
        Math.abs(value.depth - (node.geometry?.depth ?? 80)) > CHANGE_EPSILON
      );
    if (key === "model")
      return Math.abs(value.scale - (node.model?.scale ?? 1)) > CHANGE_EPSILON;
    return Math.abs(value - spatial[key]) > CHANGE_EPSILON;
  });
}

export function computeSelectionMedianPoint(objects) {
  if (!Array.isArray(objects) || objects.length === 0) return new THREE.Vector3();
  const sum = new THREE.Vector3();
  for (const obj of objects) {
    sum.add(obj.position);
  }
  return sum.divideScalar(objects.length);
}

export function computeMultiTransformLiveState({
  mode,
  pivot,
  initialPivot,
  items,
}) {
  if (!Array.isArray(items) || items.length === 0) return;
  if (mode === "translate") {
    const delta = new THREE.Vector3().subVectors(
      pivot.position,
      initialPivot.position,
    );
    for (const item of items) {
      item.object.position.copy(item.initialPosition).add(delta);
    }
  } else if (mode === "rotate") {
    const deltaQuat = new THREE.Quaternion()
      .copy(pivot.quaternion)
      .multiply(initialPivot.quaternion.clone().invert());
    for (const item of items) {
      const rotatedOffset = item.offsetFromPivot
        .clone()
        .applyQuaternion(deltaQuat);
      item.object.position.copy(initialPivot.position).add(rotatedOffset);
      item.object.quaternion.copy(deltaQuat).multiply(item.initialQuaternion);
      item.object.rotation.setFromQuaternion(item.object.quaternion);
    }
  } else if (mode === "scale") {
    const factorX =
      initialPivot.scale.x !== 0 ? pivot.scale.x / initialPivot.scale.x : 1;
    const factorY =
      initialPivot.scale.y !== 0 ? pivot.scale.y / initialPivot.scale.y : 1;
    const factorZ =
      initialPivot.scale.z !== 0 ? pivot.scale.z / initialPivot.scale.z : 1;
    for (const item of items) {
      const scaledOffset = new THREE.Vector3(
        item.offsetFromPivot.x * factorX,
        item.offsetFromPivot.y * factorY,
        item.offsetFromPivot.z * factorZ,
      );
      item.object.position.copy(initialPivot.position).add(scaledOffset);

      // Project world scale delta into the object's local frame so rotated
      // objects scale along world gizmo directions without inversion or distortion.
      const quat = item.object.quaternion;
      const lx = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
      const ly = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
      const lz = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);

      const localFactorX = Math.hypot(
        lx.x * factorX,
        lx.y * factorY,
        lx.z * factorZ,
      );
      const localFactorY = Math.hypot(
        ly.x * factorX,
        ly.y * factorY,
        ly.z * factorZ,
      );
      const localFactorZ = Math.hypot(
        lz.x * factorX,
        lz.y * factorY,
        lz.z * factorZ,
      );

      item.object.scale.set(
        item.initialScale.x * localFactorX,
        item.initialScale.y * localFactorY,
        item.initialScale.z * localFactorZ,
      );
    }
  }
}

export function getMultiNodeTransformPatches({
  mode,
  doc,
  items,
  snapRotation = false,
  rotationSnapAngle = ROTATION_SNAP_DEGREES,
}) {
  if (!Array.isArray(items)) return [];
  const patches = [];
  for (const item of items) {
    const patch = getNodeTransformPatch({
      node: item.node,
      doc,
      mode,
      position: item.object.position,
      rotation: item.object.rotation,
      scale: item.object.scale,
      initialScale: item.initialScale,
      initialRotation: item.initialRotation,
      initialPosition: item.initialPosition,
      layerOffset: item.layerOffset ?? 0,
      snapRotation,
      rotationSnapAngle,
    });
    if (hasNodeTransformChange(item.node, patch)) {
      patches.push({ id: item.node.id, patch });
    }
  }
  return patches;
}
