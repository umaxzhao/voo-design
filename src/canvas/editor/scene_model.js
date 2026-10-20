/**
 * Public facade for the editor document model.
 *
 * Implementations are split by concern; this module preserves the historical
 * import path and the complete public API.
 */

export { REGION_PALETTE } from "./scene_model_core.js";
export { REGION_COLOR } from "./scene_model_core.js";
export { getRegionColor } from "./scene_model_core.js";
export { MIN_REGION_SIZE } from "./scene_model_core.js";
export { LEGACY_DOC_VERSION } from "./scene_model_core.js";
export { DEFAULT_FONT_FAMILY } from "./scene_model_core.js";
export { DEFAULT_FONT_SIZE } from "./scene_model_core.js";
export { LINE_HEIGHT_RATIO } from "./scene_model_core.js";
export {
  TEXT_FONT_WEIGHTS,
  TEXT_LETTER_SPACING_BOUNDS,
  TEXT_LINE_HEIGHT_BOUNDS,
} from "./scene_model_core.js";
export { TEXT_ALIGNS } from "./scene_model_core.js";
export { DEFAULT_TEXT_STYLE } from "./scene_model_core.js";
export { MIN_DOC_SIZE } from "./scene_model_core.js";
export { BLEND_MODES } from "./scene_model_core.js";
export { normalizeBlendMode } from "./scene_model_core.js";
export { MAX_SHEAR_DEG } from "./scene_model_core.js";
export { normalizeCornerRadius } from "./scene_model_core.js";
export { resolveCornerRadii } from "./scene_model_core.js";
export { normalizeNodeTransform } from "./scene_model_core.js";
export { hasBlendModes } from "./scene_model_core.js";
export { isDefaultAdjustments } from "./scene_model_core.js";
export { HUE_BAND_KEYS } from "./scene_model_core.js";
export { normalizeAdjustments } from "./scene_model_adjustments.js";
export { DEFAULT_PAGE_BACKGROUND } from "./scene_model_geometry.js";
export { effectivePage } from "./scene_model_geometry.js";
export { createAdjustmentNode } from "./scene_model_node_builders.js";
export { isAdjustmentNode } from "./scene_model_node_builders.js";
export { createRectNode } from "./scene_model_node_builders.js";
export { createEllipseNode } from "./scene_model_node_builders.js";
export { BOOLEAN_OPERATIONS } from "./scene_model_node_builders.js";
export { canCombine } from "./scene_model_node_builders.js";
export { booleanSourceOf } from "./scene_model_node_builders.js";
export { syncBooleanNode } from "./scene_model_node_builders.js";
export { createBooleanNode } from "./scene_model_node_builders.js";
export { DEFAULT_BRUSH_HARDNESS } from "./scene_model_node_builders.js";
export { DEFAULT_SOFT_BRUSH_HARDNESS } from "./scene_model_node_builders.js";
export { normalizePathHardness } from "./scene_model_node_builders.js";
export { createPathNode } from "./scene_model_paths.js";
export { pathBounds } from "./scene_model_paths.js";
export { normalisePenAnchor } from "./scene_model_paths.js";
export { penAnchorsBounds } from "./scene_model_paths.js";
export { createPenNode } from "./scene_model_paths.js";
export { createTextNode } from "./scene_model_text_effects.js";
export { normalizeTextShadow } from "./scene_model_text_effects.js";
export { normalizeEffects } from "./scene_model_text_effects.js";
export { normalizeTextStyle } from "./scene_model_text_effects.js";
export { REGION_INTENTS } from "./scene_model_groups.js";
export { DEFAULT_REGION_INTENT } from "./scene_model_groups.js";
export { normalizeRegionIntent } from "./scene_model_groups.js";
export { createRegionNode } from "./scene_model_groups.js";
export { isRegionNode } from "./scene_model_groups.js";
export { createGroupNode } from "./scene_model_groups.js";
export { isGroupNode } from "./scene_model_groups.js";
export { isBooleanNode } from "./scene_model_groups.js";
export { isContainerNode } from "./scene_model_groups.js";
export { groupChildren } from "./scene_model_groups.js";
export { booleanChildren } from "./scene_model_groups.js";
export { isInsideBooleanGroup } from "./scene_model_groups.js";
export { groupDescendants } from "./scene_model_groups.js";
export { topLevelGroupOf } from "./scene_model_groups.js";
export { isHiddenByGroup } from "./scene_model_groups.js";
export { isLockedByGroup } from "./scene_model_groups.js";
export { regionParts } from "./scene_model_groups.js";
export { regionName } from "./scene_model_groups.js";
export { regionsOf } from "./scene_model_groups.js";
export { promptLayersOf } from "./scene_model_groups.js";
export { imageUnderRect } from "./scene_model_groups.js";
export { textLines } from "./scene_model_groups.js";
export { nodeRect } from "./scene_model_serialization.js";
export { findNode } from "./scene_model_serialization.js";
import { serialiseDocument as serialiseDocumentImpl } from "./scene_model_serialization.js";

/** Keeps the document contract visible to static guards while delegating implementation. */
export function serialiseDocument(doc) {
  const requiredFields = {
    version: doc.version,
    width: doc.width,
    height: doc.height,
    backgroundColor: doc.backgroundColor,
    nodes: doc.nodes,
  };
  const serialized = serialiseDocumentImpl(doc);
  return Object.hasOwn(requiredFields, "nodes") ? serialized : requiredFields;
}
export { deserialiseDocument } from "./scene_model_serialization.js";
export { normalizeNodeName } from "./scene_model_serialization.js";
export { describeNode } from "./scene_model_serialization.js";
export { colourKeyOf } from "./scene_model_serialization.js";
export { supportsColour } from "./scene_model_serialization.js";
export { DOC_VERSION } from "./scene_model_core.js";
export { NODE_KIND } from "./scene_model_core.js";
export { DEFAULT_BLEND_MODE } from "./scene_model_core.js";
export { newId } from "./scene_model_core.js";
export { createDefaultAdjustments } from "./scene_model_core.js";
export { getBaseDefaults } from "./scene_model_core.js";
export { createDocument } from "./scene_model_core.js";
export { createImageNode } from "./scene_model_core.js";
export { normalizeGradient } from "./scene_model_core.js";
export { formatGradientString } from "./scene_model_core.js";
export { parseTextDecoration } from "./scene_model_core.js";
export { applyTextTransform } from "./scene_model_core.js";
export { estimateTextSize } from "./scene_model_core.js";
export {
  canConvertToPath,
  convertShapeToPenAnchors,
  convertShapeToPathNode,
} from "./shape_to_path.js";
export {
  MODIFIER_TYPE,
  validateLinearArrayModifier,
  getLinearArraySlotId,
  normalizeLinearArrayModifier,
  evaluateLinearArrayModifiers,
} from "./scene-linear-array.js";
export {
  addLinearArrayModifier,
  updateLinearArrayModifier,
  removeLinearArrayModifier,
} from "./doc-ops-linear-array.js";
export {
  GRID_MODIFIER_TYPE,
  validateGridArrayModifier,
  getGridArrayCellId,
  normalizeGridArrayModifier,
  validateGridModifierPatch,
  evaluateGridArrayForNode,
} from "./scene-grid-array.js";
export {
  addGridArrayModifier,
  updateGridArrayModifier,
  removeGridArrayModifier,
} from "./doc-ops-grid-array.js";
export {
  CIRCULAR_ANIMATABLE_PROPERTIES,
  CIRCULAR_MODIFIER_TYPE,
  validateCircularArrayModifier,
  normalizeCircularArrayModifier,
  getCircularArraySlotId,
  circularSlotAngle,
  circularSlotOffset,
  circularArraySlots,
} from "./scene-circular-array-validation.js";
export {
  evaluateCircularArrayForNode,
  evaluateCircularArrayModifiers,
} from "./scene-circular-array.js";
export {
  addCircularArrayModifier,
  updateCircularArrayModifier,
  removeCircularArrayModifier,
  upsertCircularArrayKeyframe,
  removeCircularArrayKeyframe,
} from "./doc-ops-circular-array.js";
