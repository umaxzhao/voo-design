/**
 * Blender-style orbit for the 3D viewport.
 *
 * The camera turns about a pivot: the selected object's centre, or the world
 * centre when nothing is selected. Rotating the whole rig (camera and its
 * target) about the pivot keeps the pivot at the same place on screen, so the
 * object you are looking at does not slide away while you turn the view.
 *
 * The maths is plain three vectors so it can be tested without a renderer;
 * `attachOrbitGesture` wires it to the mouse:
 *   middle (or right) drag  orbit          Shift + drag  pan
 *   Ctrl + middle drag      zoom           Alt + drag    snap to an axis view
 */
import * as THREE from "three";
import { snapToView } from "./three-scene-view-controls.js";
import { VIEW_AXES } from "./three-scene-view-axes.js";

const UP = new THREE.Vector3(0, 1, 0);
const MAX_PITCH = THREE.MathUtils.degToRad(89);
const RADIANS_PER_HEIGHT = Math.PI * 2;
const ROTATE_SPEED = 0.9;
const SNAP_MIN_DRAG_PX = 6;

/**
 * Turn the rig about `pivot`: `yaw` about world Y, then `pitch` about the
 * camera's right axis, clamped so the view never flips over a pole.
 * Angles are in radians; positive yaw carries the camera to the right.
 */
export function rotateRigAboutPivot({ position, target }, pivot, yaw, pitch) {
  const nextPosition = position.clone().sub(pivot);
  const nextTarget = target.clone().sub(pivot);
  const turn = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  nextPosition.applyQuaternion(turn);
  nextTarget.applyQuaternion(turn);

  const forward = nextTarget.clone().sub(nextPosition).normalize();
  const current = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
  // A downward drag tips the view down: the forward direction pitches by -pitch.
  const wanted = THREE.MathUtils.clamp(current - pitch, -MAX_PITCH, MAX_PITCH);
  const right = new THREE.Vector3().crossVectors(forward, UP);
  if (right.lengthSq() > 1e-10) {
    right.normalize();
    const tip = new THREE.Quaternion().setFromAxisAngle(
      right,
      wanted - current,
    );
    nextPosition.applyQuaternion(tip);
    nextTarget.applyQuaternion(tip);
  }
  return {
    position: nextPosition.add(pivot),
    target: nextTarget.add(pivot),
  };
}

/** The axis view whose direction is closest to where the camera is looking. */
export function nearestAxisView(forward) {
  let best = VIEW_AXES[0];
  let bestDot = -Infinity;
  for (const entry of VIEW_AXES) {
    // The camera sits on the named side, so it looks along the opposite vector.
    const dot = -(
      entry.vector[0] * forward.x +
      entry.vector[1] * forward.y +
      entry.vector[2] * forward.z
    );
    if (dot > bestDot) {
      bestDot = dot;
      best = entry;
    }
  }
  return best.view;
}

export function radiansForPixels(pixels, height) {
  return ((RADIANS_PER_HEIGHT * pixels) / Math.max(1, height)) * ROTATE_SPEED;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.canvas
 * @param {() => object|null} options.getRig  { camera, controls } or null
 * @param {() => THREE.Vector3} options.getPivot
 * @param {() => boolean} options.isEnabled
 * @param {() => void} options.onStart  called once when a gesture begins
 * @param {() => void} options.onChange  called after the camera moved
 * @param {() => void} options.onEnd  called when the gesture is released
 */
export function attachOrbitGesture({
  canvas,
  getRig,
  getPivot,
  isEnabled,
  onStart,
  onChange,
  onEnd,
}) {
  let gesture = null;
  let restoreMiddle = null;

  function begin(event) {
    const rig = getRig();
    if (!rig || !isEnabled()) return;
    // Only middle and right buttons navigate; the left button selects.
    if (event.button !== 1 && event.button !== 2) return;
    const { controls } = rig;
    // Ctrl + middle zooms and Shift + drag pans: OrbitControls does both, it
    // just needs to be told which action Ctrl selects for this press.
    if (event.button === 1 && event.ctrlKey) {
      restoreMiddle = controls.mouseButtons.MIDDLE;
      controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey) return;
    // A plain press is ours alone: keep OrbitControls (and the transform
    // gizmo) from also reacting to it.
    event.preventDefault();
    event.stopImmediatePropagation();
    canvas.setPointerCapture?.(event.pointerId);
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      snap: event.altKey,
      pivot: getPivot().clone(),
      // The rig as the drag began, for the snapped (absolute) mode.
      start: {
        position: rig.camera.position.clone(),
        target: rig.controls.target.clone(),
      },
    };
    onStart();
  }

  function move(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const rig = getRig();
    if (!rig) return;
    const { camera, controls } = rig;
    const height = canvas.clientHeight;
    if (gesture.snap) {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      // Below a few pixels the view stays where it was.
      const free =
        Math.hypot(dx, dy) < SNAP_MIN_DRAG_PX
          ? gesture.start
          : rotateRigAboutPivot(
              gesture.start,
              gesture.pivot,
              -radiansForPixels(dx, height),
              radiansForPixels(dy, height),
            );
      const forward = free.target.clone().sub(free.position).normalize();
      controls.target.copy(free.target);
      camera.position.copy(free.position);
      snapToView(camera, controls, nearestAxisView(forward));
    } else {
      const dx = event.clientX - gesture.lastX;
      const dy = event.clientY - gesture.lastY;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      const next = rotateRigAboutPivot(
        { position: camera.position, target: controls.target },
        gesture.pivot,
        -radiansForPixels(dx, height),
        radiansForPixels(dy, height),
      );
      camera.position.copy(next.position);
      controls.target.copy(next.target);
    }
    controls.update();
    onChange();
  }

  function end(event) {
    if (restoreMiddle !== null) {
      const rig = getRig();
      if (rig) rig.controls.mouseButtons.MIDDLE = restoreMiddle;
      restoreMiddle = null;
    }
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture = null;
    if (canvas.hasPointerCapture?.(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    onEnd();
  }

  // Capture phase: this must see the press before OrbitControls does.
  canvas.addEventListener("pointerdown", begin, true);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  return {
    dispose() {
      canvas.removeEventListener("pointerdown", begin, true);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", end);
    },
  };
}
