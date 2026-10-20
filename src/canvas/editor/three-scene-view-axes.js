/**
 * Where the six world axes land on the screen for a camera orientation, for
 * the navigation gizmo in the corner of the 3D view. Plain math, no three:
 * the gizmo is drawn by React and must not pull the renderer into its chunk.
 */

/** Axis colours shared by the navigation gizmo and the transform gizmo. */
export const AXIS_COLORS = Object.freeze({
  x: 0xf06060,
  y: 0x5ddcb0,
  z: 0x4696ff,
});

/** View names follow Blender: the camera sits on the named side of the scene. */
export const VIEW_AXES = Object.freeze([
  { view: "right", axis: "x", positive: true, vector: [1, 0, 0] },
  { view: "left", axis: "x", positive: false, vector: [-1, 0, 0] },
  { view: "top", axis: "y", positive: true, vector: [0, 1, 0] },
  { view: "bottom", axis: "y", positive: false, vector: [0, -1, 0] },
  { view: "front", axis: "z", positive: true, vector: [0, 0, 1] },
  { view: "back", axis: "z", positive: false, vector: [0, 0, -1] },
]);

/** Rotate `vector` by the inverse of unit quaternion `[x, y, z, w]`. */
function rotateByInverse([qx, qy, qz, qw], [vx, vy, vz]) {
  // The inverse of a unit quaternion is its conjugate (-x, -y, -z, w).
  const px = -qx;
  const py = -qy;
  const pz = -qz;
  const tx = 2 * (py * vz - pz * vy);
  const ty = 2 * (pz * vx - px * vz);
  const tz = 2 * (px * vy - py * vx);
  return [
    vx + qw * tx + (py * tz - pz * ty),
    vy + qw * ty + (pz * tx - px * tz),
    vz + qw * tz + (px * ty - py * tx),
  ];
}

/**
 * Camera-space position of each axis tip: x right, y up, `depth` toward the
 * viewer. Sorted far to near so drawing in order paints nearer dots on top.
 */
export function projectViewAxes(cameraQuaternion) {
  if (!Array.isArray(cameraQuaternion) || cameraQuaternion.length !== 4) {
    throw new TypeError("A camera quaternion [x, y, z, w] is required");
  }
  return VIEW_AXES.map((entry) => {
    const [x, y, depth] = rotateByInverse(cameraQuaternion, entry.vector);
    return { ...entry, x, y, depth };
  }).sort((a, b) => a.depth - b.depth);
}
