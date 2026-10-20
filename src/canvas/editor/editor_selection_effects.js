/**
 * Pixel effects driven by the active pixel selection: delete, content-aware
 * fill, AI repaint, layer-via-copy, stroke, fill, gradient, and turning a
 * pen path into a selection.
 *
 * This module acts as the public facade, delegating to focused sub-modules:
 * - selection_effects_modify.js: pixel erasure, extraction, and layer-from-selection
 * - selection_effects_inpaint.js: content-aware fill and AI repaint
 * - selection_effects_paint.js: stroke, fill, gradient, and path-to-selection
 */

import {
  commitEditorAction,
  commitEditorDocument,
} from "../undo-action-contracts.js";
import { createSelectionModifyEffects } from "./selection_effects_modify.js";
import { createSelectionInpaintEffects } from "./selection_effects_inpaint.js";
import { createSelectionPaintEffects } from "./selection_effects_paint.js";

export function createSelectionEffects(context) {
  const commitPaintBucket = (fn) =>
    commitEditorAction("editor.paint.bucket", fn);
  const commitSelectionEffect = (nextDoc) =>
    commitEditorDocument("editor.selection.effect", context.setDoc, nextDoc);

  const modifyEffects = createSelectionModifyEffects({
    ...context,
    commitSelectionEffect,
  });
  const inpaintEffects = createSelectionInpaintEffects(context);
  const paintEffects = createSelectionPaintEffects({
    ...context,
    commitPaintBucket,
    commitSelectionEffect,
  });

  return {
    deleteSelectionPixels: modifyEffects.deleteSelectionPixels,
    fillPixelSelection: inpaintEffects.fillPixelSelection,
    aiRepaintPixelSelection: inpaintEffects.aiRepaintPixelSelection,
    extractSelectionImageNode: modifyEffects.extractSelectionImageNode,
    layerFromSelection: modifyEffects.layerFromSelection,
    strokeSelection: paintEffects.strokeSelection,
    fillSelection: paintEffects.fillSelection,
    applyGradientSelection: paintEffects.applyGradientSelection,
    pathToSelection: paintEffects.pathToSelection,
  };
}
