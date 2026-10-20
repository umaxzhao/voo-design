/** Source-backed canvas instances and editable 3D mesh primitives. */
import { getBaseDefaults, newId, NODE_KIND } from "./scene_doc_factory.js";
import { DEFAULT_MATERIAL_COLOR } from "./three-scene-materials.js";
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
export const MESH_3D_PRIMITIVE_TYPES = Object.freeze([
  "box",
  "sphere",
  "cylinder",
  "torus",
  "helix",
  "cone",
  "pyramid",
  "icosahedron",
  "dodecahedron",
  "torusKnot",
  "plane",
]);
export const MESH_3D_PLANAR_TYPES = Object.freeze([
  "ellipse",
  "triangle",
  "polygon",
  "star",
]);
export const MESH_GEOMETRY_TYPES = Object.freeze([
  ...MESH_3D_PRIMITIVE_TYPES,
  ...MESH_3D_PLANAR_TYPES,
]);

const DEFAULT_MATERIAL = Object.freeze({
  color: DEFAULT_MATERIAL_COLOR,
  metalness: 0,
  roughness: 0.6,
});
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

function normalizeMeshGeometry(geometry) {
  const geom =
    geometry === undefined
      ? {}
      : requireRecord(geometry, "Mesh geometry");
  const type = readEnum(
    geom.type,
    "box",
    MESH_GEOMETRY_TYPES,
    "mesh geometry",
  );
  const result = { ...geom, type };

  // depth for 3D volumetric primitives
  if (["box", "cylinder", "cone", "pyramid"].includes(type)) {
    result.depth = readNumber(geom.depth, 80, "Mesh depth", { min: 1 });
  } else if (type === "torus") {
    result.depth = readNumber(geom.depth, 40, "Mesh depth", { min: 1 });
  } else if (type === "helix") {
    result.depth = readNumber(geom.depth, 100, "Mesh depth", { min: 1 });
  } else if (geom.depth !== undefined) {
    result.depth = readNumber(geom.depth, 80, "Mesh depth", { min: 0 });
  }

  // specific parameters per geometry type
  if (["cylinder", "cone"].includes(type)) {
    result.radialSegments = readNumber(
      geom.radialSegments,
      32,
      "Mesh radialSegments",
      { min: 6, max: 128 },
    );
  } else if (type === "torus") {
    result.radialSegments = readNumber(
      geom.radialSegments,
      16,
      "Mesh radialSegments",
      { min: 6, max: 64 },
    );
    result.tubularSegments = readNumber(
      geom.tubularSegments,
      48,
      "Mesh tubularSegments",
      { min: 8, max: 128 },
    );
    result.tubeRadius = readNumber(
      geom.tubeRadius,
      16,
      "Mesh tubeRadius",
      { min: 1, max: 100 },
    );
  } else if (type === "helix") {
    result.turns = readNumber(geom.turns, 3, "Mesh turns", { min: 1, max: 20 });
    result.pitch = readNumber(geom.pitch, 25, "Mesh pitch", { min: 5, max: 100 });
    result.tubeRadius = readNumber(
      geom.tubeRadius,
      6,
      "Mesh tubeRadius",
      { min: 1, max: 30 },
    );
    result.radialSegments = readNumber(
      geom.radialSegments,
      8,
      "Mesh radialSegments",
      { min: 4, max: 32 },
    );
  } else if (type === "torusKnot") {
    result.p = readNumber(geom.p, 2, "Mesh p", { min: 1, max: 16 });
    result.q = readNumber(geom.q, 3, "Mesh q", { min: 1, max: 16 });
    result.tubeRadius = readNumber(
      geom.tubeRadius,
      12,
      "Mesh tubeRadius",
      { min: 1, max: 40 },
    );
    result.tubularSegments = readNumber(
      geom.tubularSegments,
      64,
      "Mesh tubularSegments",
      { min: 16, max: 256 },
    );
    result.radialSegments = readNumber(
      geom.radialSegments,
      8,
      "Mesh radialSegments",
      { min: 4, max: 32 },
    );
  } else if (["icosahedron", "dodecahedron"].includes(type)) {
    result.detail = readNumber(geom.detail, 0, "Mesh detail", { min: 0, max: 4 });
  } else if (type === "polygon") {
    result.sides = readNumber(geom.sides, 5, "Mesh sides", { min: 3, max: 32 });
  } else if (type === "star") {
    result.points = readNumber(geom.points, 5, "Mesh points", { min: 3, max: 32 });
    result.innerRatio = readNumber(
      geom.innerRatio,
      0.5,
      "Mesh innerRatio",
      { min: 0.1, max: 0.9 },
    );
  }
  return result;
}

export function normalizeMesh3dNode(node) {
  requireRecord(node, "3D mesh node");
  requireId(node.id, "Mesh ID");
  requireNumber(node.x, "Mesh x");
  requireNumber(node.y, "Mesh y");
  requireNumber(node.width, "Mesh width", { min: Number.EPSILON });
  requireNumber(node.height, "Mesh height", { min: Number.EPSILON });
  const geometry =
    node.geometry === undefined
      ? {}
      : requireRecord(node.geometry, "Mesh geometry");
  const material =
    node.material === undefined
      ? {}
      : requireRecord(node.material, "Mesh material");
  const color = material.color ?? DEFAULT_MATERIAL.color;
  if (typeof color !== "string" || !color.trim())
    throw new TypeError("Mesh color must be a non-empty string");
  return {
    ...node,
    geometry: normalizeMeshGeometry(geometry),
    material: {
      ...material,
      color,
      metalness: readNumber(
        material.metalness,
        DEFAULT_MATERIAL.metalness,
        "Mesh metalness",
        { min: 0, max: 1 },
      ),
      roughness: readNumber(
        material.roughness,
        DEFAULT_MATERIAL.roughness,
        "Mesh roughness",
        { min: 0, max: 1 },
      ),
    },
    ...(node.materialAssetId === undefined
      ? {}
      : {
          materialAssetId: readOptionalString(
            node.materialAssetId,
            "Node material asset ID",
          ),
        }),
    ...(node.spatial === undefined
      ? {}
      : { spatial: normalizeSpatialFields(node.spatial) }),
  };
}

export function createMesh3dNode(options = {}) {
  requireRecord(options, "3D mesh options");
  return normalizeMesh3dNode({
    ...getBaseDefaults(),
    id: options.id ?? newId(),
    kind: NODE_KIND.MESH_3D,
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 100,
    height: options.height ?? 100,
    geometry: options.geometry,
    material: options.material,
    ...(options.materialAssetId !== undefined
      ? { materialAssetId: options.materialAssetId }
      : {}),
    ...(options.spatial ? { spatial: options.spatial } : {}),
    ...(options.rotation !== undefined ? { rotation: options.rotation } : {}),
    ...(options.name ? { name: options.name } : {}),
  });
}
