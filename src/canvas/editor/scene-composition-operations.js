import {
  createCanvasInstanceNode,
  INSTANCE_LAYOUT_MODES,
  INSTANCE_PLAYBACK_MODES,
  normalizeCanvasNode,
  normalizeCanvasInstanceNode,
} from "./canvas-composition-model.js";

const NUMBER_PATHS = new Set([
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "opacity",
  "timing.start",
  "timing.end",
  "media.inPoint",
  "media.outPoint",
  "media.speed",
  "media.volume",
  "model.rotation.x",
  "model.rotation.y",
  "model.rotation.z",
  "model.scale",
  "model.metalness",
  "model.roughness",
  "model.exposure",
  "model.camera.azimuth",
  "model.camera.elevation",
  "model.camera.distance",
  "model.camera.fov",
  "spatial.z",
  "spatial.rotationX",
  "spatial.rotationY",
  "geometry.depth",
  "geometry.radialSegments",
  "geometry.tubularSegments",
  "geometry.tubeRadius",
  "geometry.turns",
  "geometry.pitch",
  "geometry.p",
  "geometry.q",
  "geometry.detail",
  "geometry.sides",
  "geometry.points",
  "geometry.innerRatio",
  "material.metalness",
  "material.roughness",
  "instance.playbackStart",
]);
const BOOLEAN_PATHS = new Set(["visible", "locked", "media.muted"]);
const STRING_PATHS = new Set([
  "name",
  "model.color",
  "model.environment",
  "material.color",
  "geometry.type",
  "instance.layoutMode",
  "instance.playbackMode",
  "instance.cameraId",
  "instance.poster",
  "instance.videoSrc",
]);
const NULLABLE_PATHS = new Set([
  "timing.end",
  "media.outPoint",
  "model.color",
  "model.metalness",
  "model.roughness",
  "instance.cameraId",
  "instance.poster",
  "instance.videoSrc",
]);

function assertValue(layer, path, value) {
  if (path.startsWith("model.") && layer.kind !== "model3d")
    throw new TypeError("A 3D layer is required");
  if (
    (path.startsWith("geometry.") || path.startsWith("material.")) &&
    layer.kind !== "mesh3d"
  )
    throw new TypeError("An editable 3D mesh is required");
  if (path.startsWith("media.") && layer.kind !== "video")
    throw new TypeError("A video layer is required");
  if (path.startsWith("instance.") && layer.kind !== "canvasInstance")
    throw new TypeError("A canvas instance layer is required");
  if (value === null && NULLABLE_PATHS.has(path)) return;
  if (NUMBER_PATHS.has(path) && Number.isFinite(value)) {
    if (
      [
        "width",
        "height",
        "media.speed",
        "model.scale",
        "model.camera.distance",
        "model.camera.fov",
      ].includes(path) &&
      value <= 0
    )
      throw new RangeError(`${path} must be positive`);
    if (
      [
        "opacity",
        "media.volume",
        "model.metalness",
        "model.roughness",
        "material.metalness",
        "material.roughness",
      ].includes(path) &&
      (value < 0 || value > 1)
    )
      throw new RangeError(`${path} must be between 0 and 1`);
    if (
      [
        "timing.start",
        "timing.end",
        "media.inPoint",
        "media.outPoint",
        "model.exposure",
        "instance.playbackStart",
      ].includes(path) &&
      value < 0
    )
      throw new RangeError(`${path} must be non-negative`);
    if (path === "model.camera.fov" && value >= 180)
      throw new RangeError("Field of view must be below 180 degrees");
    if (path === "geometry.depth" && value < 0)
      throw new RangeError("Mesh depth must be non-negative");
    if (path.startsWith("geometry.") && value < 0)
      throw new RangeError(`${path} must be non-negative`);
    return;
  }
  if (BOOLEAN_PATHS.has(path) && typeof value === "boolean") return;
  if (STRING_PATHS.has(path) && typeof value === "string") {
    if (
      ["model.color", "material.color"].includes(path) &&
      !/^#[0-9a-f]{6}$/i.test(value)
    )
      throw new TypeError("Model color must be a six-digit hex color");
    if (path === "model.environment" && !["studio", "neutral"].includes(value))
      throw new TypeError("Unknown lighting environment");
    if (
      path === "instance.layoutMode" &&
      !INSTANCE_LAYOUT_MODES.includes(value)
    )
      throw new TypeError("Unknown canvas instance layout mode");
    if (
      path === "instance.playbackMode" &&
      !INSTANCE_PLAYBACK_MODES.includes(value)
    )
      throw new TypeError("Unknown canvas instance playback mode");
    return;
  }
  throw new TypeError(`Invalid scene property: ${path}`);
}

function setPath(layer, path, value) {
  assertValue(layer, path, value);
  const parts = path.split(".");
  const result = { ...layer };
  let output = result;
  let source = layer;
  for (const part of parts.slice(0, -1)) {
    output[part] = { ...(source?.[part] ?? {}) };
    output = output[part];
    source = source?.[part];
  }
  output[parts.at(-1)] = value;
  return result;
}

function assertIntervals(layer) {
  if (
    Number.isFinite(layer.timing?.end) &&
    layer.timing.end <= (layer.timing.start ?? 0)
  )
    throw new RangeError("Layer end must follow its start");
  if (
    Number.isFinite(layer.media?.outPoint) &&
    layer.media.outPoint <= (layer.media.inPoint ?? 0)
  )
    throw new RangeError("Video out point must follow its in point");
}

/** Stable IDs let an Agent update a nested canvas without duplicating it. */
function insertCanvasInstance(doc, operation) {
  if (typeof operation.layerId !== "string" || !operation.layerId.trim())
    throw new TypeError("A stable layerId is required");
  if (
    typeof operation.sourceCanvasId !== "string" ||
    !operation.sourceCanvasId.trim()
  )
    throw new TypeError("A source canvas ID is required");
  const sourceCanvasId = operation.sourceCanvasId.trim();
  if (doc.canvasId === sourceCanvasId)
    throw new RangeError("A canvas cannot contain an instance of itself");
  const previous = doc.nodes.find((node) => node.id === operation.layerId);
  if (previous && previous.kind !== "canvasInstance")
    throw new TypeError("Layer id already belongs to a different kind");
  const options = {
    id: operation.layerId,
    sourceCanvasId,
    x: operation.x ?? previous?.x ?? 0,
    y: operation.y ?? previous?.y ?? 0,
    width: operation.width ?? previous?.width ?? 320,
    height: operation.height ?? previous?.height ?? 180,
    name: operation.name ?? previous?.name,
    instance: { ...previous?.instance, ...operation.instance },
    ...(operation.spatial || previous?.spatial
      ? { spatial: { ...previous?.spatial, ...operation.spatial } }
      : {}),
  };
  const instance = normalizeCanvasNode(
    previous
      ? normalizeCanvasInstanceNode({ ...previous, ...options })
      : createCanvasInstanceNode(options),
  );
  return {
    ...doc,
    nodes: previous
      ? doc.nodes.map((node) => (node.id === instance.id ? instance : node))
      : [...doc.nodes, instance],
  };
}

/** Validate every operation before the caller commits; failures never mutate the input. */
export function applySceneOperations(document, operations) {
  if (!document || !Array.isArray(document.nodes))
    throw new TypeError("An editable scene document is required");
  if (
    !Array.isArray(operations) ||
    !operations.length ||
    operations.length > 100
  )
    throw new TypeError("Provide between 1 and 100 scene operations");
  return operations.reduce((doc, operation) => {
    if (!operation || typeof operation !== "object")
      throw new TypeError("Invalid scene operation");
    if (operation.type === "insert_canvas_instance")
      return insertCanvasInstance(doc, operation);
    const layer = doc.nodes.find((node) => node.id === operation.layerId);
    if (!layer) throw new TypeError(`Layer not found: ${operation.layerId}`);
    let next;
    if (operation.type === "set_properties") {
      if (
        !operation.properties ||
        typeof operation.properties !== "object" ||
        Array.isArray(operation.properties)
      )
        throw new TypeError("Properties must be an object of dotted paths");
      next = Object.entries(operation.properties).reduce(
        (node, [path, value]) => setPath(node, path, value),
        layer,
      );
      assertIntervals(next);
      next = normalizeCanvasNode(next);
    } else throw new TypeError(`Unknown scene operation: ${operation.type}`);
    return {
      ...doc,
      nodes: doc.nodes.map((node) => (node.id === layer.id ? next : node)),
    };
  }, document);
}
