const DEGREES_PER_PIXEL = 0.35;
const MAX_ELEVATION = 89;

/** Map a 2D drag to an orbit camera without changing distance or field of view. */
export function orbitCameraFromDrag(camera, deltaX, deltaY) {
  const azimuth = Number.isFinite(camera?.azimuth) ? camera.azimuth : 0;
  const elevation = Number.isFinite(camera?.elevation) ? camera.elevation : 15;
  return {
    ...camera,
    azimuth: azimuth - deltaX * DEGREES_PER_PIXEL,
    elevation: Math.max(
      -MAX_ELEVATION,
      Math.min(MAX_ELEVATION, elevation + deltaY * DEGREES_PER_PIXEL),
    ),
  };
}
