/** Source-backed canvas instances. */
import { getBaseDefaults, newId, NODE_KIND } from "./scene_doc_factory.js";
import {
  requireRecord,
  requireId,
  requireNumber,
  readNumber,
  readEnum,
  readOptionalString,
  cloneJsonValue,
  normalizeSpatialFields,
} from "./canvas-composition-validation.js";

export const INSTANCE_LAYOUT_MODES = Object.freeze(["fixed", "fill"]);
export const INSTANCE_PLAYBACK_MODES = Object.freeze(["live", "video"]);
function normalizeInstance(instance) {
  const value =
    instance === undefined
      ? {}
      : requireRecord(instance, "Canvas instance settings");
  return {
    ...value,
    layoutMode: readEnum(
      value.layoutMode,
      "fixed",
      INSTANCE_LAYOUT_MODES,
      "instance layout mode",
    ),
    playbackMode: readEnum(
      value.playbackMode,
      "live",
      INSTANCE_PLAYBACK_MODES,
      "instance playback mode",
    ),
    playbackStart: readNumber(
      value.playbackStart,
      0,
      "Instance playback start",
      { min: 0 },
    ),
    cameraId: readOptionalString(value.cameraId, "Instance camera ID"),
    poster: readOptionalString(value.poster, "Instance poster"),
    videoAssetId: readOptionalString(
      value.videoAssetId,
      "Instance video asset ID",
    ),
    videoSrc: readOptionalString(value.videoSrc, "Instance video source"),
    parameters: cloneJsonValue(
      requireRecord(value.parameters ?? {}, "Instance parameters"),
      "Instance parameters",
    ),
    overrides: cloneJsonValue(
      requireRecord(value.overrides ?? {}, "Instance overrides"),
      "Instance overrides",
    ),
  };
}

export function normalizeCanvasInstanceNode(node) {
  requireRecord(node, "Canvas instance node");
  requireId(node.id, "Instance ID");
  requireNumber(node.x, "Instance x");
  requireNumber(node.y, "Instance y");
  requireNumber(node.width, "Instance width", { min: Number.EPSILON });
  requireNumber(node.height, "Instance height", { min: Number.EPSILON });
  return {
    ...node,
    sourceCanvasId: requireId(node.sourceCanvasId, "Source canvas ID"),
    instance: normalizeInstance(node.instance),
    ...(node.spatial === undefined
      ? {}
      : { spatial: normalizeSpatialFields(node.spatial) }),
  };
}

export function createCanvasInstanceNode(options) {
  requireRecord(options, "Canvas instance options");
  return normalizeCanvasInstanceNode({
    ...getBaseDefaults(),
    id: options.id ?? newId(),
    kind: NODE_KIND.CANVAS_INSTANCE,
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 320,
    height: options.height ?? 180,
    sourceCanvasId: options.sourceCanvasId,
    instance: options.instance,
    ...(options.spatial ? { spatial: options.spatial } : {}),
    ...(options.name ? { name: options.name } : {}),
  });
}
