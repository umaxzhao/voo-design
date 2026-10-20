// Screen-space chrome facade re-exporting the stage rendering and overlay APIs.

export { readNodeTransform } from "./scene_state_contract.js";
export {
  docToScreenPoint,
  docToScreenRect,
} from "./chrome_coords.js";
export {
  adjustmentLayerFailure,
  drawAdjustmentLayer,
  drawClippingChain,
} from "./chrome_layers.js";
export { drawRegion, drawRegions } from "./chrome_regions.js";
export {
  drawDistortMeshChrome,
  drawPerspectiveWarpChrome,
  drawPuppetWarpChrome,
} from "./chrome_warp.js";
export {
  drawGradientOverlay,
  drawSelection,
  drawSelectionSet,
} from "./chrome_selection.js";
export {
  drawCrop,
  drawGuides,
  drawMarquee,
  drawSelectionTransformBox,
  drawTextDraftRect,
} from "./chrome_stage_overlays.js";
export {
  drawLasso,
  drawMagneticLasso,
  drawPixelSelection,
  drawPolygonDraft,
} from "./chrome_pixel_selection.js";
export {
  drawBitmapPreview,
  drawGesturePathPreview,
  drawPatchDraft,
  drawPatchPreview,
  drawRemoveStroke,
} from "./chrome_retouch.js";
export {
  drawCloneAnchor,
  drawClonePreview,
  getCloneMaskCanvas,
} from "./chrome_clone.js";
export { draw } from "./chrome_draw.js";
