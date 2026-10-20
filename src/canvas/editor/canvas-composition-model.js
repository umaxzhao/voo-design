/** Pure document contract for reversible canvas modes and source-backed instances. */
import { CANVAS_TYPE, newId, NODE_KIND } from "./scene_doc_factory.js";
import {
  requireRecord,
  requireId,
  requireNumber,
  readNumber,
  readEnum,
} from "./canvas-composition-validation.js";
import {
  normalizeCanvasInstanceNode,
  normalizeMesh3dNode,
} from "./canvas-composition-nodes.js";
import { normalizeMaterialAssets } from "./three-scene-materials.js";
import {
  createDefaultScene3dSettings,
  normalizeScene3dSettings,
} from "./three-scene-settings.js";
export {
  INSTANCE_LAYOUT_MODES,
  INSTANCE_PLAYBACK_MODES,
  MESH_GEOMETRY_TYPES,
  normalizeCanvasInstanceNode,
  createCanvasInstanceNode,
  normalizeMesh3dNode,
  createMesh3dNode,
} from "./canvas-composition-nodes.js";

export const CANVAS_TYPES = Object.freeze(Object.values(CANVAS_TYPE));
export const SCENE_ENVIRONMENT_TYPES = Object.freeze(["none", "studio"]);
const LEGACY_SCENE_BACKGROUND = "transparent";
const SPATIAL_KEYS = Object.freeze([
  "x",
  "y",
  "width",
  "height",
  "z",
  "rotationX",
  "rotationY",
  "rotationZ",
]);
function readVector(value, defaults, label) {
  if (value === undefined) return { ...defaults };
  requireRecord(value, label);
  return {
    ...value,
    x: readNumber(value.x, defaults.x, `${label}.x`),
    y: readNumber(value.y, defaults.y, `${label}.y`),
    z: readNumber(value.z, defaults.z, `${label}.z`),
  };
}

function readRgbColor(value, fallback, label) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) {
    throw new TypeError(`${label} must be a #RRGGBB color`);
  }
  return value;
}

export function getCanvasType(doc) {
  return readEnum(
    doc?.canvasType,
    CANVAS_TYPE.DESIGN,
    CANVAS_TYPES,
    "canvas type",
  );
}

export function createDefaultScene3d(width, height) {
  requireNumber(width, "Canvas width", { min: 1 });
  requireNumber(height, "Canvas height", { min: 1 });
  // Camera and nodes share document coordinates: X right, Y down, Z toward the viewer.
  const center = { x: width / 2, y: height / 2, z: 0 };
  return {
    backgroundColor: "#262626",
    camera: {
      projection: "orthographic",
      position: { ...center, z: Math.max(width, height) * 1.5 },
      target: center,
      fov: 45,
      zoom: 1,
    },
    lighting: {
      ambientIntensity: 0.8,
      ambientColor: "#ffffff",
      directionalIntensity: 1,
      directionalColor: "#ffffff",
      // Document coordinates convert to the legacy world-space light (400, 600, 800).
      directionalPosition: { x: center.x + 400, y: center.y - 600, z: 800 },
    },
    materialAssets: [],
    environment: { type: "none", intensity: 1 },
    ...createDefaultScene3dSettings(width, height),
    showGrid: true,
  };
}

export function normalizeScene3d(value, width, height) {
  const defaults = createDefaultScene3d(width, height);
  if (value === undefined) return defaults;
  requireRecord(value, "3D scene");
  const camera =
    value.camera === undefined ? {} : requireRecord(value.camera, "3D camera");
  const lighting =
    value.lighting === undefined
      ? {}
      : requireRecord(value.lighting, "3D lighting");
  // Persisted scenes without a background predate configurable creation defaults.
  // Do not recolor them when the default for newly created scenes changes.
  const backgroundColor = value.backgroundColor ?? LEGACY_SCENE_BACKGROUND;
  const environment =
    value.environment === undefined
      ? {}
      : requireRecord(value.environment, "3D environment");
  if (typeof backgroundColor !== "string" || !backgroundColor.trim()) {
    throw new TypeError("3D background color must be a non-empty string");
  }
  return {
    ...value,
    backgroundColor,
    camera: {
      ...camera,
      projection: readEnum(
        camera.projection,
        defaults.camera.projection,
        ["orthographic", "perspective"],
        "3D projection",
      ),
      position: readVector(
        camera.position,
        defaults.camera.position,
        "3D camera position",
      ),
      target: readVector(
        camera.target,
        defaults.camera.target,
        "3D camera target",
      ),
      fov: readNumber(camera.fov, defaults.camera.fov, "3D field of view", {
        min: 1,
        max: 179,
      }),
      zoom: readNumber(camera.zoom, defaults.camera.zoom, "3D camera zoom", {
        min: Number.EPSILON,
      }),
    },
    lighting: {
      ...lighting,
      ambientIntensity: readNumber(
        lighting.ambientIntensity,
        defaults.lighting.ambientIntensity,
        "Ambient light",
        { min: 0 },
      ),
      ambientColor: readRgbColor(
        lighting.ambientColor,
        defaults.lighting.ambientColor,
        "Ambient light color",
      ),
      directionalIntensity: readNumber(
        lighting.directionalIntensity,
        defaults.lighting.directionalIntensity,
        "Directional light",
        { min: 0 },
      ),
      directionalColor: readRgbColor(
        lighting.directionalColor,
        defaults.lighting.directionalColor,
        "Directional light color",
      ),
      directionalPosition: readVector(
        lighting.directionalPosition,
        defaults.lighting.directionalPosition,
        "Directional light position",
      ),
    },
    materialAssets: normalizeMaterialAssets(value.materialAssets),
    environment: {
      ...environment,
      type: readEnum(
        environment.type,
        defaults.environment.type,
        SCENE_ENVIRONMENT_TYPES,
        "3D environment type",
      ),
      intensity: readNumber(
        environment.intensity,
        defaults.environment.intensity,
        "3D environment intensity",
        { min: 0, max: 4 },
      ),
    },
    ...normalizeScene3dSettings(value, defaults, value.showGrid),
  };
}

export function getScene3d(doc) {
  return normalizeScene3d(doc?.scene3d, doc.width, doc.height);
}

/** Type switches change the editing surface; all content and animation data survive. */
export function setCanvasType(doc, canvasType) {
  requireRecord(doc, "Canvas document");
  requireNumber(doc.width, "Canvas width", { min: 1 });
  requireNumber(doc.height, "Canvas height", { min: 1 });
  readEnum(canvasType, undefined, CANVAS_TYPES, "canvas type");
  const canvasId =
    doc.canvasId === undefined ? newId() : requireId(doc.canvasId, "Canvas ID");
  const scene3d =
    doc.scene3d === undefined
      ? createDefaultScene3d(doc.width, doc.height)
      : getScene3d(doc);
  return {
    ...doc,
    canvasId,
    canvasType,
    ...(canvasType === CANVAS_TYPE.THREE_D || doc.scene3d !== undefined
      ? { scene3d }
      : {}),
  };
}

/** XY and box dimensions remain canonical; the renderer converts Y to Three.js world space. */
export function getNodeSpatial(node) {
  requireRecord(node, "Canvas node");
  const spatial =
    node.spatial === undefined
      ? {}
      : requireRecord(node.spatial, "Node spatial transform");
  return {
    x: requireNumber(node.x, "Node x"),
    y: requireNumber(node.y, "Node y"),
    width: requireNumber(node.width, "Node width", { min: Number.EPSILON }),
    height: requireNumber(node.height, "Node height", { min: Number.EPSILON }),
    z: readNumber(spatial.z, 0, "Node z"),
    rotationX: readNumber(spatial.rotationX, 0, "Node X rotation"),
    rotationY: readNumber(spatial.rotationY, 0, "Node Y rotation"),
    rotationZ: readNumber(node.rotation, 0, "Node Z rotation"),
  };
}

export function updateNodeSpatial(node, patch) {
  requireRecord(patch, "Spatial patch");
  for (const key of Object.keys(patch)) {
    if (!SPATIAL_KEYS.includes(key))
      throw new TypeError(`Unknown spatial field: ${key}`);
  }
  const before = getNodeSpatial(node);
  const next = { ...before, ...patch };
  for (const key of SPATIAL_KEYS) {
    requireNumber(
      next[key],
      `Node ${key}`,
      key === "width" || key === "height" ? { min: Number.EPSILON } : {},
    );
  }
  return {
    ...node,
    x: next.x,
    y: next.y,
    width: next.width,
    height: next.height,
    rotation: next.rotationZ,
    spatial: {
      ...node.spatial,
      z: next.z,
      rotationX: next.rotationX,
      rotationY: next.rotationY,
    },
  };
}

export function normalizeCanvasNode(node) {
  const materialAssetId =
    node.materialAssetId === undefined
      ? {}
      : {
          materialAssetId:
            node.materialAssetId === null
              ? null
              : requireId(node.materialAssetId, "Node material asset ID"),
        };
  const transform = node.spatial === undefined ? null : getNodeSpatial(node);
  const spatial = transform
    ? {
        spatial: {
          ...node.spatial,
          z: transform.z,
          rotationX: transform.rotationX,
          rotationY: transform.rotationY,
        },
      }
    : {};
  if (node.kind === NODE_KIND.CANVAS_INSTANCE)
    return {
      ...normalizeCanvasInstanceNode(node),
      ...spatial,
      ...materialAssetId,
    };
  if (node.kind === NODE_KIND.MESH_3D)
    return { ...normalizeMesh3dNode(node), ...spatial, ...materialAssetId };
  return { ...node, ...spatial, ...materialAssetId };
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
  if (
    node?.kind === NODE_KIND.CANVAS_INSTANCE ||
    node?.kind === NODE_KIND.MESH_3D ||
    node?.spatial !== undefined ||
    node?.materialAssetId !== undefined
  ) {
    normalizeCanvasNode(node);
  }
  return true;
}

function canvasFields(value) {
  const result = {};
  if (value.canvasId !== undefined)
    result.canvasId = requireId(value.canvasId, "Canvas ID");
  if (value.canvasType !== undefined) result.canvasType = getCanvasType(value);
  if (value.scene3d !== undefined)
    result.scene3d = normalizeScene3d(value.scene3d, value.width, value.height);
  // References are validated here for both save and load, after assets normalize.
  const materialIds = new Set(
    result.scene3d?.materialAssets.map((asset) => asset.id) ?? [],
  );
  if (Array.isArray(value.nodes)) {
    for (const node of value.nodes) {
      if (node?.materialAssetId === undefined || node.materialAssetId === null)
        continue;
      const assetId = requireId(node.materialAssetId, "Node material asset ID");
      if (!materialIds.has(assetId)) {
        throw new RangeError(`Material asset not found: ${assetId}`);
      }
    }
  }
  // Cross-canvas cycles need the workflow resolver; this catches local IDs here.
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
