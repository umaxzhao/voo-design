// Seam: Gradient, page backdrop, and geometry-adjacent node helpers.
/* eslint-disable no-unused-vars */
import {
  REGION_PALETTE,
  REGION_COLOR,
  getRegionColor,
  MIN_REGION_SIZE,
  LEGACY_DOC_VERSION,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  LINE_HEIGHT_RATIO,
  TEXT_FONT_WEIGHTS,
  TEXT_ALIGNS,
  DEFAULT_TEXT_STYLE,
  MIN_DOC_SIZE,
  BLEND_MODES,
  normalizeBlendMode,
  MAX_SHEAR_DEG,
  normalizeCornerRadius,
  normalizeRotationDeg,
  normalizeNodeTransform,
  hasBlendModes,
  DEFAULT_ADJUSTMENTS,
  isDefaultAdjustments,
  deepEqual,
  normalizePoints,
  parseAdjustmentValue,
  HUE_BAND_KEYS,
  normalizeHueSatBands,
  DOC_VERSION,
  NODE_KIND,
  DEFAULT_BLEND_MODE,
  newId,
  createDefaultAdjustments,
  getBaseDefaults,
  createDocument,
  createImageNode,
} from "./scene_model_core.js";
import { normalizeAdjustments } from "./scene_model_adjustments.js";

/* eslint-enable no-unused-vars */
export { normalizeGradientStops, normalizeMixerRow, normalizeInkRow, normalizeColorBalanceZone, normalizeHexColor } from "./scene_model_adjustments.js";

export const BASE_DEFAULTS = getBaseDefaults();

/**
 * The backdrop a fresh, blank page starts with.
 *
 * Only ever applied when there is no artwork to wrap. A document opened
 * around an existing picture keeps a transparent backdrop, because that
 * picture's own alpha is the artwork — filling it would flatten a cut-out
 * into a black rectangle on the way out.
 */
export const DEFAULT_PAGE_BACKGROUND = "#262626";

/**
 * The visible page: the crop rect when the document carries one, otherwise
 * the full canvas. A non-destructive crop keeps the original document intact
 * (nothing is deleted), and this is what the renderer, viewport and exports
 * treat as the sheet the user is looking at.
 */
export function effectivePage(doc) {
  const crop = doc.crop;
  if (crop && crop.width > 0 && crop.height > 0) {
    return { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
  }
  return { x: 0, y: 0, width: doc.width, height: doc.height };
}

/**
 * A dedicated Adjustment Layer (Photoshop-style).
 * Applies its adjustments and blend modes to everything rendered below it in the layer stack.
 */
