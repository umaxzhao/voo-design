/**
 * Turning a matte into a pixel selection and manipulating selection geometry.
 *
 * This module acts as the public facade for pixel selection routines,
 * preserving backward-compatible named exports by delegating to focused sub-modules:
 * - pixel_selection_contour.js: contour geometry, mapping, and mask rasterisation
 * - pixel_selection_morphology.js: blurring, feathering, expanding, contracting, smoothing, border
 * - pixel_selection_wand.js: boolean combinations, inversion, and flood fill (magic wand)
 * - pixel_selection_clip.js: transforms, bounds, crops, and clip masks
 */

export {
  clampContoursToRect,
  contoursToMask,
  ellipseContour,
  mapContoursToDoc,
  normaliseRect,
  rectContour,
  selectionFromMatte,
} from "./pixel_selection_contour.js";

export {
  blurMask,
  borderSelection,
  expandContractSelection,
  featherSelection,
  smoothSelection,
} from "./pixel_selection_morphology.js";

export {
  combineSelections,
  invertSelection,
  wandSelectFromBitmap,
} from "./pixel_selection_wand.js";

export {
  clipMaskToSelection,
  selectionClipRings,
  selectionCoverage,
  selectionCropRect,
  transformSelection,
  transformedSelectionBounds,
} from "./pixel_selection_clip.js";
