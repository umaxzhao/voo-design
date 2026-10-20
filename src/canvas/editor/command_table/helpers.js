/**
 * Pure helpers shared by command implementations and the gesture executor.
 * These used to live inline in command_table.js before the zone split.
 */
import { NODE_KIND, findNode } from "../scene_model.js";
import {
  editorCommandError,
  noEditableImage,
  layerLocked,
} from "./errors.js";

export function layerDisplayName(node) {
  if (node?.name) return node.name;
  switch (node?.kind) {
    case NODE_KIND.TEXT:
      return "Text";
    case NODE_KIND.IMAGE:
      return "Image";
    case NODE_KIND.PATH:
      return node?.pen === true ? "Pen" : "Vector";
    case NODE_KIND.RECT:
      return "Rectangle";
    case NODE_KIND.ELLIPSE:
      return "Ellipse";
    case NODE_KIND.REGION:
      return "Region";
    case NODE_KIND.GROUP:
      return "Group";
    case NODE_KIND.BOOLEAN:
      return "Boolean";
    case NODE_KIND.ADJUSTMENT:
      return "Adjustment";
    default:
      return node?.kind ?? "Layer";
  }
}

/**
 * Shrinks an exported layer/page so it can ride in a vision request.
 *
 * A full-resolution export is several megabytes of base64; the localisation
 * answer is normalised, so the smaller picture costs nothing in accuracy.
 * Returns the original when it already fits. Kept beside the command table so
 * the two export commands can live near their descriptors (runtime-only DOM).
 */
export async function downscaleDataUrl(dataUrl, maxEdge = 1024) {
  if (!(maxEdge > 0)) return dataUrl;
  const image = await loadImageElement(dataUrl);
  const longest = Math.max(image.width, image.height);
  if (!(longest > maxEdge)) return dataUrl;
  const scale = maxEdge / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("imageDecodeFailed"));
    image.src = src;
  });
}

export function hasPixelSelection(engine) {
  return Boolean(engine?.getPixelSelection?.()?.contours?.length);
}

/**
 * Names the cause before a pixel edit is asked of the engine.
 *
 * `fillPixelSelection` and `aiRepaintPixelSelection`
 * (editor/selection_effects_inpaint.js) return a bare `false` for every
 * refusal: a missing or non-image target layer, a locked layer, an unloaded
 * bitmap, a provider that painted nothing, an undecodable or refused result.
 * The commands reported all of them as BITMAP_MISSING — "the layer may be
 * locked or the image not loaded" — so the model retried the identical call
 * instead of changing approach.
 *
 * The two causes the engine's own guard already keeps apart are re-checked
 * here from public engine state: the same `findNode` lookup and the same
 * `locked` / `lockImagePixels` flags. What is left stays BITMAP_MISSING,
 * because a boolean return cannot tell an unloaded bitmap from a provider that
 * returned nothing unless the engine's contract changes for its human callers
 * too. Keep this in step with createSelectionInpaintEffects.
 *
 * @returns {Object} the image layer the pixel selection points at.
 */
export function assertRepaintableTarget(engine) {
  const nodeId = engine?.getPixelSelection?.()?.nodeId ?? null;
  const doc = engine?.getDocument?.() ?? null;
  const node = doc && nodeId ? findNode(doc, nodeId) : null;
  if (!node || node.kind !== NODE_KIND.IMAGE) {
    throw noEditableImage(nodeId);
  }
  if (node.locked || node.lockImagePixels) {
    throw layerLocked(layerDisplayName(node), node.id);
  }
  return node;
}

export function cubicPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x:
      u * u * u * p0.x +
      3 * u * u * t * p1.x +
      3 * u * t * t * p2.x +
      t * t * t * p3.x,
    y:
      u * u * u * p0.y +
      3 * u * u * t * p1.y +
      3 * u * t * t * p2.y +
      t * t * t * p3.y,
  };
}

/** Resolves a semantic trace into document points for the paint engine. */
export function resolveTracePoints(engine, trace) {
  if (!trace?.kind) return null;
  if (trace.kind === "selectionEdge") {
    const selection = engine?.getPixelSelection?.();
    const ring = selection?.contours?.[0];
    if (!ring?.length) {
      throw editorCommandError(
        "NO_SELECTION",
        "selectionEdge trace needs an active pixel selection.",
        { selection: ["pixel"] },
      );
    }
    return ring.map(([x, y]) => ({ x, y }));
  }
  if (trace.kind === "nodePath") {
    const nodeId = trace.nodeId ?? engine?.getSelectedId?.() ?? null;
    const node = nodeId
      ? engine
          ?.getDocument?.()
          ?.nodes?.find((candidate) => candidate.id === nodeId)
      : null;
    if (!node) {
      throw editorCommandError(
        "NODE_NOT_FOUND",
        `nodePath trace references a missing node: ${nodeId ?? "(none)"}`,
        { nodes: [nodeId ?? "(none)"] },
      );
    }
    if (!Array.isArray(node.points)) {
      throw editorCommandError(
        "ARGS_INVALID",
        `nodePath trace requires a path node, got ${node.kind ?? "unknown"}.`,
        { nodeData: [`${node.id}.points`] },
      );
    }
    return node.points.map(([px, py]) => ({ x: node.x + px, y: node.y + py }));
  }
  return null;
}

/** Samples a cubic Bézier path into document points for the paint engine. */
export function sampleBezierPath(path) {
  const points = [];
  let prev = path?.start ?? null;
  if (!prev) return points;
  for (const segment of path.segments ?? []) {
    const p0 = prev;
    const p1 = segment.c1;
    const p2 = segment.c2;
    const p3 = segment.end;
    if (!p1 || !p2 || !p3) continue;
    const controlLength =
      Math.hypot(p1.x - p0.x, p1.y - p0.y) +
      Math.hypot(p2.x - p1.x, p2.y - p1.y) +
      Math.hypot(p3.x - p2.x, p3.y - p2.y);
    const steps = Math.max(1, Math.min(128, Math.ceil(controlLength / 8)));
    for (let i = 1; i <= steps; i += 1) {
      points.push(cubicPoint(p0, p1, p2, p3, i / steps));
    }
    prev = p3;
  }
  return points;
}
