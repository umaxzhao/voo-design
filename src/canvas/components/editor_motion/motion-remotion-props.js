/** Serializable scene graph shared by the editor, Remotion, and desktop IPC. */
import {
  getCanvasType,
  getScene3d,
} from "../../editor/canvas-composition-model.js";
import { normalizeTimeline } from "../../editor/scene-motion.js";
import {
  isDefaultAdjustments,
  normalizeCornerRadius,
} from "../../editor/scene_model_core.js";
import { effectivePage } from "../../editor/scene_model_geometry.js";
import {
  isHiddenByGroup,
  isInsideBooleanGroup,
} from "../../editor/scene_model_groups.js";
import { estimateTextSize } from "../../editor/text_fidelity.js";

export const MOTION_REMOTION_COMPOSITION_ID = "MotionCanvasComp";
const DIRECT_KINDS = new Set([
  "rect",
  "ellipse",
  "path",
  "boolean",
  "text",
  "image",
  "video",
  "audio",
  "mesh3d",
  "model3d",
  "canvasInstance",
]);
const SPATIAL_KINDS = new Set(["mesh3d", "model3d", "canvasInstance"]);

function canRenderNodeDirectly(node) {
  if (!DIRECT_KINDS.has(node.kind)) return false;
  if (node.clipTo || node.maskId) return false;
  if (
    node.effects ||
    node.shear ||
    (node.blendMode && node.blendMode !== "source-over")
  )
    return false;
  if (node.adjustments && !isDefaultAdjustments(node.adjustments)) return false;
  if (
    ["rect", "ellipse", "text"].includes(node.kind) &&
    typeof node.fill !== "string"
  )
    return false;
  return true;
}

function paintableNodes(doc) {
  return doc.nodes.filter(
    (node) =>
      node.visible !== false &&
      node.kind !== "group" &&
      !isHiddenByGroup(doc, node) &&
      !isInsideBooleanGroup(doc, node),
  );
}

/** Spatial layers render directly in Remotion; legacy effects still use capture. */
export function canRenderMotionDirectly(doc) {
  if (!doc || !Array.isArray(doc.nodes)) return false;
  return paintableNodes(doc).every(canRenderNodeDirectly);
}

/** Canvas2D capture is safe only when every visible layer is already flattened. */
export function canCaptureMotionCanvas(doc) {
  if (!doc || !Array.isArray(doc.nodes) || getCanvasType(doc) === "3d")
    return false;
  return paintableNodes(doc).every((node) => !SPATIAL_KINDS.has(node.kind));
}

function renderNode(node, page) {
  const measured =
    node.kind === "text"
      ? estimateTextSize(node.text, node.fontSize, node.boxWidth)
      : null;
  return {
    ...node,
    x: node.x - page.x,
    y: node.y - page.y,
    width: node.width > 0 ? node.width : node.boxWidth || measured?.width || 1,
    height: node.height > 0 ? node.height : measured?.height || 1,
    rotation: node.rotation ?? 0,
    opacity: node.opacity ?? 1,
    visible: node.visible !== false,
    cornerRadius: normalizeCornerRadius(node.cornerRadius),
    animations: (node.animations ?? []).map((track) =>
      ["x", "y"].includes(track.property)
        ? {
            ...track,
            keyframes: track.keyframes.map((frame) => ({
              ...frame,
              value: frame.value - page[track.property],
            })),
          }
        : track,
    ),
  };
}

function renderDocument(doc) {
  if (!doc || !Array.isArray(doc.nodes))
    throw new TypeError("A canvas document is required");
  if (
    ![doc.width, doc.height].every((size) => Number.isFinite(size) && size > 0)
  )
    throw new TypeError("Canvas dimensions must be positive");
  const page = effectivePage(doc);
  return {
    canvasId: doc.canvasId ?? null,
    canvasType: getCanvasType(doc),
    width: Math.max(1, Math.round(page.width)),
    height: Math.max(1, Math.round(page.height)),
    backgroundColor:
      doc.backgroundColor === "transparent"
        ? "transparent"
        : doc.backgroundColor || "#000000",
    scene3d: getScene3d(doc),
    timeline: normalizeTimeline(doc.timeline),
    nodes: paintableNodes(doc).map((node) => renderNode(node, page)),
    // The existing frame evaluator expands these canonical parameters at export time.
    ...(doc.modifiers?.length ? { modifiers: doc.modifiers } : {}),
  };
}

function collectCanvases(root, resolveCanvas) {
  const canvases = {};
  const visited = new Set();
  const active = new Set();
  const visit = (doc) => {
    for (const node of paintableNodes(doc)) {
      if (node.kind !== "canvasInstance") continue;
      const sourceId = node.sourceCanvasId;
      if (active.has(sourceId))
        throw new Error(`Canvas instance cycle: ${sourceId}`);
      if (visited.has(sourceId)) continue;
      const source = resolveCanvas?.(sourceId);
      if (!source)
        throw new Error(`Canvas instance source unavailable: ${sourceId}`);
      active.add(sourceId);
      canvases[sourceId] = renderDocument(source);
      visit(source);
      active.delete(sourceId);
      visited.add(sourceId);
    }
  };
  if (root.canvasId) active.add(root.canvasId);
  visit(root);
  return canvases;
}

/**
 * One graph and one timeline drive every 2D, 3D, video, and nested layer.
 *
 * @param {object} doc
 * @param {object} [options]
 * @param {string|null} [options.captureSrc] pre-rendered frames standing in
 *   for the composition instead of its layers
 * @param {Function} [options.resolveCanvas]
 * @param {boolean} [options.canvasPainted] the caller draws each node with the
 *   2D canvas, which paints effects, adjustments and masks itself — so a layer
 *   the DOM renderer cannot draw is not a reason to demand capture frames
 */
export function buildMotionRemotionProps(
  doc,
  { captureSrc = null, resolveCanvas, canvasPainted = false } = {},
) {
  const root = renderDocument(doc);
  const { duration, fps } = normalizeTimeline(doc.timeline);
  const frameRate = Math.max(1, Math.round(fps));
  if (!Number.isInteger(doc.width) || !Number.isInteger(doc.height))
    throw new TypeError("Remotion dimensions must be whole pixels");
  if (captureSrc !== null && (typeof captureSrc !== "string" || !captureSrc))
    throw new TypeError("Capture source must be a non-empty asset ID");
  if (captureSrc && !canCaptureMotionCanvas(doc))
    throw new TypeError("Captured frames cannot contain spatial layers");
  if (!captureSrc && !canvasPainted && !canRenderMotionDirectly(doc))
    throw new TypeError("Motion document needs captured-frame fallback");
  return {
    ...root,
    fps: frameRate,
    durationInFrames: Math.max(1, Math.ceil(duration * frameRate)),
    backgroundColor:
      root.backgroundColor === "transparent" ? "#000000" : root.backgroundColor,
    nodes: captureSrc ? [] : root.nodes,
    canvases: captureSrc ? {} : collectCanvases(doc, resolveCanvas),
    captureSrc,
  };
}
