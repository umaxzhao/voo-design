/**
 * Deformation metadata that must be cleared after rendered pixels are baked
 * into a replacement bitmap. Every bitmap-producing action shares this patch
 * so the pixels and their now-stale transform metadata commit atomically.
 */
export const BAKED_BITMAP_DEFORMATION_PATCH = Object.freeze({
  warpMesh: null,
  puppetPins: null,
  perspectiveCorners: null,
  perspectiveQuad: null,
});
