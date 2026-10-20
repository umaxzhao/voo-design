/**
 * Draws a document onto a 2D context.
 *
 * Facade over the split renderer (ROADMAP 1.13): node painting lives in
 * render_nodes.js, screen-space chrome in render_chrome.js. Every symbol the
 * rest of the codebase imported from this module is re-exported here, so the
 * split changes no call sites.
 */

export {
  HANDLE_GRAB_RADIUS,
  HANDLE_SIZE,
  PAGE_BACKGROUND,
  arrowheadPoints,
  arrowheadSize,
  drawBooleanNode,
  drawEllipseNode,
  drawImageNode,
  drawNode,
  drawPathNode,
  resizeCanvas,
} from "./render_nodes.js";
export {
  adjustmentLayerFailure,
  docToScreenPoint,
  docToScreenRect,
  draw,
} from "./render_chrome.js";
export { measureText } from "./text_metrics.js";
export {
  colourWithAlpha,
  quadraticPointAt,
  softBrushAlpha,
  softBrushGradientStops,
  softBrushSprite,
  softBrushStampSpacing,
  stampQuadraticSegment,
} from "./soft_brush.js";
export {
  applyAdjustments,
  buildCurveLUT,
  evaluateMonotoneCubicSpline,
  invalidateAdjustmentCache,
  invalidateBitmapComposite,
  invalidateMatteComposite,
} from "./cpu_adjustments.js";
export {
  PYRAMID_TIERS,
  PYRAMID_SETTINGS,
  selectPyramidTier,
  ensureImagePyramid,
  invalidateImagePyramid,
  getPyramidSource,
  releaseImagePyramid,
} from "./image_pyramid.js";
