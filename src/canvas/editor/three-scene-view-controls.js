/**
 * Viewport navigation in the Blender manner: hold the right (or middle) mouse
 * button to orbit, Shift + drag to pan, wheel to zoom toward the cursor, and
 * jump to the standard views. The left button is left free for selecting and
 * for the transform gizmo.
 */
import * as THREE from "three";
import { VIEW_AXES } from "./three-scene-view-axes.js";

const ORBIT_STEP_DEGREES = 15;
const POLE_EPSILON = 1e-4;
const FRAME_MARGIN = 1.4;
const MIN_FRAME_RADIUS = 1;

export const VIEW_NAMES = Object.freeze(VIEW_AXES.map((entry) => entry.view));

export function configureViewControls(controls) {
  // A plain middle or right drag orbits the selection (see
  // three-scene-orbit-gesture.js) and never reaches OrbitControls. What does
  // reach it is Shift + drag, which OrbitControls turns into a pan, and touch.
  controls.mouseButtons = {
    LEFT: null,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.enableDamping = false;
  controls.rotateSpeed = 0.9;
}

/** Put the camera on the named side of the target, keeping its distance. */
export function snapToView(camera, controls, view) {
  const entry = VIEW_AXES.find((axis) => axis.view === view);
  if (!entry) throw new RangeError(`Unknown view: ${view}`);
  const distance = Math.max(camera.position.distanceTo(controls.target), 1);
  camera.position
    .copy(controls.target)
    .addScaledVector(new THREE.Vector3(...entry.vector), distance);
}

/** Turn the view about the target by whole steps, like numpad 4/6/8/2. */
export function orbitStep(camera, controls, yawSteps, pitchSteps) {
  const offset = camera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta -= THREE.MathUtils.degToRad(yawSteps * ORBIT_STEP_DEGREES);
  spherical.phi = THREE.MathUtils.clamp(
    spherical.phi - THREE.MathUtils.degToRad(pitchSteps * ORBIT_STEP_DEGREES),
    POLE_EPSILON,
    Math.PI - POLE_EPSILON,
  );
  offset.setFromSpherical(spherical);
  camera.position.copy(controls.target).add(offset);
}

/** Centre the box in view from the current direction (Home / numpad period). */
export function frameBounds(camera, controls, box) {
  if (box.isEmpty()) return false;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, MIN_FRAME_RADIUS);
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() === 0) direction.set(0, 0, 1);
  direction.normalize();
  controls.target.copy(sphere.center);
  if (camera.isPerspectiveCamera) {
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const distance = (radius * FRAME_MARGIN) / Math.tan(halfFov);
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
  } else {
    const halfHeight = (camera.top - camera.bottom) / 2;
    camera.zoom = halfHeight / (radius * FRAME_MARGIN);
    camera.position
      .copy(sphere.center)
      .addScaledVector(direction, Math.max(radius * 2, 1));
    camera.updateProjectionMatrix();
  }
  return true;
}

export function cameraQuaternion(camera) {
  const { x, y, z, w } = camera.quaternion;
  return [x, y, z, w];
}
