/**
 * Contract for AI-generated editor output.
 *
 * Generation code returns this value without mutating the live document.
 * The caller owns the sink and materialises the result through the workflow's
 * Group output pipeline without mutating the source editor document.
 */

import { outpaintPlacementForRect } from "./outpaint_geometry.js";

export const EDITOR_GENERATED_OPERATION = Object.freeze({
  AI_REPAIR: "aiRepair",
  AI_REPAINT: "aiRepaint",
  OUTPAINT: "outpaint",
  UPSCALE: "upscale",
});

export const EDITOR_SCENE_PATCH = Object.freeze({
  REPLACE_BITMAP: "replaceBitmap",
  OUTPAINT_BITMAP: "outpaintBitmap",
});

const OPERATIONS = new Set(Object.values(EDITOR_GENERATED_OPERATION));
const PATCH_TYPES = new Set(Object.values(EDITOR_SCENE_PATCH));

function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required`);
  }
}

function requireRect(rect, field) {
  if (
    !rect ||
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new Error(`${field} is invalid`);
  }
}

function normalizeScenePatch(scenePatch) {
  if (!scenePatch || !PATCH_TYPES.has(scenePatch.type)) {
    throw new Error("scenePatch.type is invalid");
  }
  if (scenePatch.type !== EDITOR_SCENE_PATCH.OUTPAINT_BITMAP) {
    return { type: scenePatch.type };
  }
  const { nodeRect, documentGrowth } = scenePatch;
  requireRect(nodeRect, "scenePatch.nodeRect");
  if (
    !documentGrowth ||
    !Number.isFinite(documentGrowth.width) ||
    !Number.isFinite(documentGrowth.height) ||
    !Number.isFinite(documentGrowth.shiftX) ||
    !Number.isFinite(documentGrowth.shiftY) ||
    documentGrowth.width <= 0 ||
    documentGrowth.height <= 0 ||
    documentGrowth.shiftX < 0 ||
    documentGrowth.shiftY < 0
  ) {
    throw new Error("scenePatch.documentGrowth is invalid");
  }
  return {
    type: scenePatch.type,
    nodeRect: {
      x: nodeRect.x,
      y: nodeRect.y,
      width: nodeRect.width,
      height: nodeRect.height,
    },
    documentGrowth: {
      width: documentGrowth.width,
      height: documentGrowth.height,
      shiftX: documentGrowth.shiftX,
      shiftY: documentGrowth.shiftY,
    },
  };
}

export function createOutpaintScenePatch(sourceSnapshot, rect) {
  requireRect(rect, "outpaintRect");
  if (
    !sourceSnapshot ||
    !Number.isFinite(sourceSnapshot.width) ||
    !Number.isFinite(sourceSnapshot.height) ||
    sourceSnapshot.width <= 0 ||
    sourceSnapshot.height <= 0
  ) {
    throw new Error("sourceSnapshot dimensions are invalid");
  }
  return {
    type: EDITOR_SCENE_PATCH.OUTPAINT_BITMAP,
    ...outpaintPlacementForRect(sourceSnapshot, rect),
  };
}

/**
 * Creates one image candidate result at the editor/workflow boundary.
 * Cross-candidate state is intentionally absent: Group owns it upstream.
 */
export function createEditorGeneratedOutput({
  dataUrl,
  operation,
  parameters = {},
  scenePatch = { type: EDITOR_SCENE_PATCH.REPLACE_BITMAP },
  sourceSceneNodeId,
  sourceSnapshot,
  sourceWorkflowNodeId,
}) {
  requireNonEmptyString(dataUrl, "asset.dataUrl");
  requireNonEmptyString(sourceSceneNodeId, "sourceSceneNodeId");
  requireNonEmptyString(sourceWorkflowNodeId, "sourceWorkflowNodeId");
  if (!OPERATIONS.has(operation)) {
    throw new Error("operation is invalid");
  }
  if (!sourceSnapshot || typeof sourceSnapshot !== "object") {
    throw new Error("sourceSnapshot is required");
  }
  if (
    !parameters ||
    typeof parameters !== "object" ||
    Array.isArray(parameters)
  ) {
    throw new Error("parameters must be an object");
  }

  return {
    asset: {
      mediaKind: "image",
      dataUrl,
    },
    sourceWorkflowNodeId,
    sourceSceneNodeId,
    sourceSnapshot,
    scenePatch: normalizeScenePatch(scenePatch),
    operation,
    parameters: { ...parameters },
  };
}
