/**
 * Mesh transformation and perspective warp engine facade.
 *
 * Re-exports the modular engine slices:
 * - mesh_transform_render.js: WebGL2 GPU pipeline + Canvas 2D fallback
 * - mesh_transform_grid.js: default mesh, bilinear resampling, perspective quad & bicubic patch subdivision
 * - mesh_transform_presets.js: Photoshop & Photopea-compatible 16-point warp presets
 */

export {
  drawTexturedTriangle,
  renderWarpMesh,
} from "./mesh_transform_render.js";

export {
  createDefaultMesh,
  resampleMeshGrid,
  subdividePerspectiveQuad,
  subdivideBicubicWarpPatch,
} from "./mesh_transform_grid.js";

export {
  PHOTOSHOP_WARP_PRESETS,
  generatePhotoshopWarpPreset,
} from "./mesh_transform_presets.js";
