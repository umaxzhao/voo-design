/** Document contract for component instances and 2D spatial fields. */
import { CANVAS_TYPE, NODE_KIND } from "./scene_doc_factory.js";
import { requireRecord, requireId, requireNumber, readNumber } from "./canvas-composition-validation.js";
import { normalizeCanvasInstanceNode } from "./canvas-composition-nodes.js";

export {
  INSTANCE_LAYOUT_MODES,
  INSTANCE_PLAYBACK_MODES,
  normalizeCanvasInstanceNode,
  createCanvasInstanceNode,
} from "./canvas-composition-nodes.js";

export const CANVAS_TYPES = Object.freeze([CANVAS_TYPE.DESIGN]);

const SPATIAL_KEYS = Object.freeze(["x", "y", "width", "height", "rotation"]);

/**
 * Every document is a design canvas. Older files may carry other canvas types
 * and their data; reading them ignores those fields.
 */
export function getCanvasType() {
  return CANVAS_TYPE.DESIGN;
}

export function getNodeSpatial(node) {
  requireRecord(node, "Canvas node");
  return {
    x: requireNumber(node.x, "Node x"),
    y: requireNumber(node.y, "Node y"),
    width: requireNumber(node.width, "Node width", { min: Number.EPSILON }),
    height: requireNumber(node.height, "Node height", { min: Number.EPSILON }),
    rotation: readNumber(node.rotation, 0, "Node rotation"),
  };
}

export function updateNodeSpatial(node, patch) {
  requireRecord(patch, "Spatial patch");
  for (const key of Object.keys(patch)) {
    if (!SPATIAL_KEYS.includes(key))
      throw new TypeError(`Unknown spatial field: ${key}`);
  }
  const next = { ...getNodeSpatial(node), ...patch };
  for (const key of SPATIAL_KEYS) {
    requireNumber(
      next[key],
      `Node ${key}`,
      key === "width" || key === "height" ? { min: Number.EPSILON } : {},
    );
  }
  return { ...node, ...next };
}

export function normalizeCanvasNode(node) {
  if (node.kind === NODE_KIND.CANVAS_INSTANCE) return normalizeCanvasInstanceNode(node);
  return node;
}

export function serializeCanvasNode(node) {
  const copy = normalizeCanvasNode(node);
  if (copy.kind !== NODE_KIND.CANVAS_INSTANCE) return copy;
  const instance = { ...copy.instance };
  if (instance.poster?.startsWith("blob:")) instance.poster = null;
  if (instance.videoSrc?.startsWith("blob:")) instance.videoSrc = null;
  return { ...copy, instance };
}

export function assertCanvasNodeReadable(node) {
  if (node?.kind === NODE_KIND.CANVAS_INSTANCE) normalizeCanvasNode(node);
  return true;
}

function canvasFields(value) {
  const result = {};
  if (value.canvasId !== undefined)
    result.canvasId = requireId(value.canvasId, "Canvas ID");
  // A component that instances itself would never resolve; catch it on load and save.
  if (
    result.canvasId &&
    Array.isArray(value.nodes) &&
    value.nodes.some(
      (node) =>
        node?.kind === NODE_KIND.CANVAS_INSTANCE &&
        typeof node.sourceCanvasId === "string" &&
        node.sourceCanvasId.trim() === result.canvasId,
    )
  ) {
    throw new RangeError("A canvas cannot contain an instance of itself");
  }
  return result;
}

export const serializeCanvasFields = canvasFields;
export const deserializeCanvasFields = canvasFields;
