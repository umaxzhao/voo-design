/**
 * Facade re-exporting document node rendering APIs, viewport sizing, and canvas helpers.
 *
 * Extracted from scene_renderer.js (ROADMAP 1.13) and decomposed into cohesive modules
 * next to this file:
 *   - render_canvas_base.js: canvas sizing, background and checkerboard helpers
 *   - render_warp_geometry.js: mesh subdivision caching and coordinate transforms
 *   - render_basic_shapes.js: paint styles (solid, gradient, image) and basic shapes
 *   - render_image_node.js: multi-tier bitmap and vector-fill image rendering
 *   - render_boolean_node.js: composite boolean operation silhouette rendering
 *   - render_path_node.js: freehand paths, soft brushes, and arrowhead geometry
 *   - render_pen_node.js: vector pen bezier paths, ribbons, and selection tints
 *   - render_pen_overlay.js: interactive pen tool drafting and anchor overlays
 *   - render_text_node.js: typography layout, decorations, and text warp routing
 *   - render_custom_blend.js: per-pixel PSD custom blend modes and caching
 *   - render_node_dispatch.js: per-node draw dispatch and layer effects stack
 */

export {
  HANDLE_GRAB_RADIUS,
  HANDLE_SIZE,
  PAGE_BACKGROUND,
  SELECTION_COLOR,
  getCheckerboardSource,
  resizeCanvas,
} from "./render_canvas_base.js";

export {
  textWarpRoute,
  warpPointTransformed,
} from "./render_warp_geometry.js";

export {
  drawEllipseNode,
} from "./render_basic_shapes.js";

export {
  drawImageNode,
} from "./render_image_node.js";

export {
  drawBooleanNode,
} from "./render_boolean_node.js";

export {
  arrowheadPoints,
  arrowheadSize,
  drawPathNode,
} from "./render_path_node.js";

export {
  drawPenSelectionTint,
} from "./render_pen_node.js";

export {
  drawPenOverlay,
} from "./render_pen_overlay.js";

export {
  compositeCustomBlend,
} from "./render_custom_blend.js";

export {
  drawNode,
} from "./render_node_dispatch.js";

export { measureText } from "./text_metrics.js";

// The renderer has always been the public address for the adjustment maths,
// so the split keeps every existing import working from here.
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

// Scene state contract & consumer registry compliance anchors
export { readNodeTransform } from "./scene_state_contract.js";
export { resolveRasterLevelFromPyramid } from "./raster_level.js";
