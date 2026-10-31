/**
 * Which optional capabilities a selection supports, and which of them already
 * have content. Capabilities with content show as sections by default; the
 * rest stay behind the panel's add menu until the user asks for them.
 */

import { normalizeExportPresets } from "./export-presets.js";
import { isRegionNode, supportsColour } from "../../editor/scene_model.js";
import { listConfiguredAdjustments, listConfiguredEffects } from "../../editor/adjustment_catalog.js";

export const EXTRA_KEYS = ["effects", "modifiers", "variables", "styles", "constraints", "export"];

/** True when the node sits in a frame or auto-layout parent that can resize it. */
function hasResizableParent({ object, parentLayout, parentIsFrame, parentNode, engine }) {
  if (object?.parentId == null) return true;
  if (parentLayout || parentIsFrame || parentNode?.isFrame || parentNode?.kind === "frame" || parentNode?.autoLayout) return true;
  const engineParent = engine?.getDocument?.()?.nodes?.find?.((node) => node.id === object.parentId) ?? null;
  return Boolean(engineParent?.isFrame || engineParent?.kind === "frame" || engineParent?.autoLayout);
}

export function resolveExtras(context) {
  const { object, allowed, isWarpTool, isMedia, selectionCount = 1, parentLayout, colorVariableActions, styleActions, engine } = context;
  const has = (section) => allowed.includes(section);
  const single = selectionCount <= 1;
  const fills = !isWarpTool && (has("fill") || has("stroke"));
  const eligible = {
    effects: !isWarpTool && has("effects") && object.kind !== "adjustment" && object.kind !== "region" && !isMedia,
    modifiers: !isWarpTool && single && Boolean(object?.id) && !object.isFrame && object.kind !== "frame" && object.kind !== "adjustment",
    variables: !isWarpTool && has("fill") && Boolean(colorVariableActions) && supportsColour(object) && object.kind !== "image" && selectionCount === 1,
    styles: fills && Boolean(styleActions) && object.kind !== "adjustment" && !isMedia && selectionCount === 1,
    // A flow child of an auto-layout parent is positioned by reflow, not constraints.
    constraints:
      !isWarpTool && has("constraints") && !object.isFrame && object.kind !== "adjustment" && object.kind !== "audio" &&
      !isRegionNode(object) && !(parentLayout && object.layoutPosition !== "absolute") && single && hasResizableParent(context),
    export: !isWarpTool && has("export") && Boolean(engine),
  };
  const bound = colorVariableActions?.variables?.some?.((item) => item.id === object.fillVariableId) ?? false;
  const modifiers = engine?.getDocument?.()?.modifiers;
  const hasContent = {
    effects: listConfiguredAdjustments(object.adjustments).length + listConfiguredEffects(object.effects).length > 0,
    modifiers: Array.isArray(modifiers) && modifiers.some((modifier) => modifier.targetId === object.id),
    variables: bound,
    styles: Object.values(object.styleIds ?? {}).some(Boolean),
    // Constraints are stored only once the user sets them.
    constraints: Boolean(object.constraints),
    export: normalizeExportPresets(object.exportPresets).length > 0,
  };
  return { eligible, hasContent };
}
