/**
 * Vignette calculation and hue band indexing.
 *
 * Shared between CPU path and WebGL shaders for identical output.
 * Pure maths: no canvas, no GL, no React.
 */

/** Hermite smoothstep between edge0 and edge1; GLSL uses the same formula. */
export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Which of Photoshop's six 60° hue bands a hue (0..360°) belongs to. The
 * ranges tile the wheel without overlap: reds wrap around 0, then yellows,
 * greens, cyans, blues, magentas. Shared by the CPU band lookup and the
 * shader's own bandIndex, so both paths agree.
 */
export function hueBandIndex(hue) {
  const h = ((hue % 360) + 360) % 360;
  if (h < 30 || h >= 330) return 0; // reds
  if (h < 90) return 1; // yellows
  if (h < 150) return 2; // greens
  if (h < 210) return 3; // cyans
  if (h < 270) return 4; // blues
  return 5; // magentas
}

/**
 * The vignette's radial darkening at one pixel.
 *
 * `nx`/`ny` are the pixel's normalised coordinates in [0, 1]; `amount` is the
 * slider value in [0, 100]. The centre of the frame stays untouched (factor 1)
 * and the corners darken smoothly from 70% of the half-diagonal outwards. The
 * GLSL in gl_adjustments.js replicates this formula term for term, so the GPU
 * and CPU paths multiply by the same number.
 */
export function vignetteFactor(nx, ny, amount) {
  if (!(amount > 0)) return 1;
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  // Normalise by the half-diagonal so a corner sits exactly at distance 1.
  const dn = Math.sqrt(dx * dx + dy * dy) / Math.SQRT1_2;
  return 1 - (amount / 100) * smoothstep(0.35, 1, dn);
}
