/**
 * Visual style for the 3D transform gizmo, after Blender's.
 *
 * - Move: three thin arrows toward +X/+Y/+Z, small plane squares, and a white
 *   ring at the centre that moves in the view plane.
 * - Rotate: three axis rings (the half facing the camera, as Three already
 *   turns them) and an outer white ring that rotates about the view axis.
 * - Scale: three lines ending in cubes, the plane squares, a small white ring
 *   at the centre and an outer white ring, both uniform scale.
 *
 * TransformControls bakes each handle's position and rotation into its
 * geometry (setupGizmo), so a replacement geometry must carry its own
 * placement — every builder below places itself along its axis.
 *
 * It reaches into TransformControls' private `_gizmo`; three is pinned, and a
 * missing structure throws instead of silently leaving the default look.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Mesh,
  Quaternion,
  TorusGeometry,
  Vector3,
} from "three";
import { AXIS_COLORS } from "./three-scene-view-axes.js";

export const GIZMO_COLORS = Object.freeze({
  ...AXIS_COLORS,
  active: 0xffffff,
});

// An arrow stays about this long on screen whatever the viewport height;
// the clamp keeps it legible in a small embedded frame without letting it
// cover a large one.
const ARROW_SCREEN_PX = 72;
// TransformControls draws a unit handle over about 0.12 of the viewport
// height per unit of `size` (orthographic: 0.125; perspective: ~0.119).
const HANDLE_VIEWPORT_FRACTION = 0.12;
const MIN_SIZE = 0.45;
const MAX_SIZE = 1.6;

const AXIS_LENGTH = 0.5;
// Lines start clear of the centre ring, as in Blender.
const LINE_START = 0.13;
const LINE_RADIUS = 0.006;
const CONE_RADIUS = 0.032;
const CONE_HEIGHT = 0.1;
const CUBE_SIZE = 0.055;
const PLANE_SIZE = 0.07;
const PLANE_OFFSET = 0.26;
const PLANE_PICKER_SIZE = 0.12;
const CENTER_RING_RADIUS = 0.085;
const RING_TUBE = 0.006;
const AXIS_RING_RADIUS = 0.5;
const OUTER_RING_RADIUS = 0.62;
const RING_PICKER_TUBE = 0.06;
const RING_OPACITY = 0.85;

const UNIT_Y = new Vector3(0, 1, 0);
const AXIS_VECTORS = Object.freeze({
  X: new Vector3(1, 0, 0),
  Y: new Vector3(0, 1, 0),
  Z: new Vector3(0, 0, 1),
});
// Plane handles: the two axes they span and the Euler that turns an XY square
// onto that plane (the same rotations TransformControls uses).
const PLANES = Object.freeze({
  XY: { offset: [1, 1, 0], rotation: [0, 0, 0] },
  YZ: { offset: [0, 1, 1], rotation: [0, Math.PI / 2, 0] },
  XZ: { offset: [1, 0, 1], rotation: [-Math.PI / 2, 0, 0] },
});
// TransformControls' own per-axis turn of its rotate rings.
const RING_ROTATIONS = Object.freeze({
  X: [0, 0, 0],
  Y: [0, 0, -Math.PI / 2],
  Z: [0, Math.PI / 2, 0],
});

/** The `size` that keeps an arrow near ARROW_SCREEN_PX in this viewport. */
export function gizmoSizeFor(viewportHeight) {
  if (!(viewportHeight > 0)) return 1;
  const size = ARROW_SCREEN_PX / (HANDLE_VIEWPORT_FRACTION * viewportHeight);
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
}

/** Turn a geometry built along +Y so it runs along `axis`. */
function alongAxis(geometry, axis) {
  const turn = new Quaternion().setFromUnitVectors(UNIT_Y, AXIS_VECTORS[axis]);
  geometry.applyMatrix4(new Matrix4().makeRotationFromQuaternion(turn));
  return geometry;
}

function axisLine(axis) {
  const length = AXIS_LENGTH - LINE_START;
  const geometry = new CylinderGeometry(LINE_RADIUS, LINE_RADIUS, length, 8);
  geometry.translate(0, LINE_START + length / 2, 0);
  return alongAxis(geometry, axis);
}

function axisCone(axis) {
  const geometry = new CylinderGeometry(0, CONE_RADIUS, CONE_HEIGHT, 16);
  geometry.translate(0, AXIS_LENGTH + CONE_HEIGHT / 2, 0);
  return alongAxis(geometry, axis);
}

function axisCube(axis) {
  const geometry = new BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  geometry.translate(0, AXIS_LENGTH, 0);
  return alongAxis(geometry, axis);
}

function planeSquare(name, size, depth) {
  const { offset, rotation } = PLANES[name];
  const geometry = new BoxGeometry(size, size, depth);
  geometry.applyMatrix4(
    new Matrix4().makeRotationFromEuler(new Euler(...rotation)),
  );
  geometry.translate(
    offset[0] * PLANE_OFFSET,
    offset[1] * PLANE_OFFSET,
    offset[2] * PLANE_OFFSET,
  );
  return geometry;
}

/** A ring in the XY plane; billboarded rings face the camera from there. */
function flatRing(radius, tube) {
  return new TorusGeometry(radius, tube, 6, 96);
}

/** An axis rotate ring placed exactly like TransformControls' own. */
function axisRing(name, tube, radialSegments, arc) {
  const geometry = new TorusGeometry(
    AXIS_RING_RADIUS,
    tube,
    radialSegments,
    64,
    arc,
  );
  geometry.rotateY(Math.PI / 2);
  geometry.rotateX(Math.PI / 2);
  geometry.applyMatrix4(
    new Matrix4().makeRotationFromEuler(new Euler(...RING_ROTATIONS[name])),
  );
  return geometry;
}

/** A white, see-through-proof material for the view rings. */
function ringMaterial(source) {
  const material = source.clone();
  material.color.set(0xffffff);
  material.opacity = RING_OPACITY;
  material.transparent = true;
  return material;
}

function addMesh(group, name, geometry, material, billboard = false) {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.billboard = billboard;
  group.add(mesh);
  return mesh;
}

function replaceChildren(group, names) {
  const removed = new Map();
  for (const child of [...group.children]) {
    if (!names.includes(child.name)) continue;
    if (!removed.has(child.name)) removed.set(child.name, child.material);
    group.remove(child);
    child.geometry.dispose();
  }
  return removed;
}

function styleArrows(gizmo, tip) {
  const materials = replaceChildren(gizmo, ["X", "Y", "Z"]);
  for (const axis of ["X", "Y", "Z"]) {
    const material = materials.get(axis);
    addMesh(gizmo, axis, axisLine(axis), material);
    addMesh(gizmo, axis, tip(axis), material);
  }
}

function stylePlanes(gizmo, picker) {
  for (const group of [gizmo, picker]) {
    for (const child of group.children) {
      if (!PLANES[child.name]) continue;
      child.geometry.dispose();
      child.geometry =
        group === gizmo
          ? planeSquare(child.name, PLANE_SIZE, 0.004)
          : planeSquare(child.name, PLANE_PICKER_SIZE, 0.01);
    }
  }
}

function styleCenterRing(gizmo, radius) {
  const materials = replaceChildren(gizmo, ["XYZ"]);
  const material = ringMaterial(materials.get("XYZ"));
  addMesh(gizmo, "XYZ", flatRing(radius, RING_TUBE), material, true);
  return material;
}

function styleTranslate(gizmo, picker) {
  styleArrows(gizmo, axisCone);
  stylePlanes(gizmo, picker);
  styleCenterRing(gizmo, CENTER_RING_RADIUS);
}

function styleScale(gizmo, picker) {
  styleArrows(gizmo, axisCube);
  stylePlanes(gizmo, picker);
  const material = styleCenterRing(gizmo, CENTER_RING_RADIUS);
  // The outer ring is uniform scale too, like Blender's.
  addMesh(gizmo, "XYZ", flatRing(OUTER_RING_RADIUS, RING_TUBE), material, true);
  addMesh(
    picker,
    "XYZ",
    flatRing(OUTER_RING_RADIUS, RING_PICKER_TUBE),
    picker.children.find((child) => child.name === "XYZ").material,
    true,
  );
}

function styleRotate(gizmo, picker) {
  for (const child of gizmo.children) {
    if (!RING_ROTATIONS[child.name]) continue;
    child.geometry.dispose();
    child.geometry = axisRing(child.name, RING_TUBE, 6, Math.PI);
  }
  // The grey trackball circle stays a hit area only; the view ring is white
  // and sits just outside the axis rings.
  const materials = replaceChildren(gizmo, ["XYZE", "E"]);
  addMesh(
    gizmo,
    "E",
    flatRing(OUTER_RING_RADIUS, RING_TUBE),
    ringMaterial(materials.get("E")),
    true,
  );
  for (const child of picker.children) {
    if (child.name !== "E") continue;
    child.geometry.dispose();
    child.geometry = flatRing(OUTER_RING_RADIUS, RING_PICKER_TUBE);
  }
}

const LOOK_AT = new Matrix4();
const ORIGIN = new Vector3();

export function styleTransformGizmo(controls) {
  const root = controls._gizmo;
  const gizmo = root?.gizmo;
  const picker = root?.picker;
  if (
    !gizmo?.translate ||
    !gizmo.rotate ||
    !gizmo.scale ||
    !picker?.translate ||
    !picker.rotate ||
    !picker.scale
  ) {
    throw new Error("TransformControls gizmo structure changed; restyle it");
  }
  controls.setColors(
    GIZMO_COLORS.x,
    GIZMO_COLORS.y,
    GIZMO_COLORS.z,
    GIZMO_COLORS.active,
  );
  styleTranslate(gizmo.translate, picker.translate);
  styleRotate(gizmo.rotate, picker.rotate);
  styleScale(gizmo.scale, picker.scale);

  const stockUpdate = root.updateMatrixWorld;
  root.updateMatrixWorld = function updateStyledGizmo(force) {
    controls.size = gizmoSizeFor(controls.domElement?.clientHeight);
    stockUpdate.call(this, force);
    // Rings Three does not turn itself face the camera, like Blender's.
    for (const group of [this.gizmo[this.mode], this.picker[this.mode]]) {
      for (const handle of group.children) {
        if (!handle.userData.billboard) continue;
        handle.quaternion.setFromRotationMatrix(
          LOOK_AT.lookAt(this.eye, ORIGIN, UNIT_Y),
        );
        handle.updateMatrixWorld(true);
      }
    }
  };
}
