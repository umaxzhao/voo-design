/**
 * A per-instance view of a 3D main component: each instance can turn the
 * object to its own angle while the main component stays as authored.
 * Stored on the instance as `overrides.view` (degrees, editor conventions),
 * and applied when the instance renders by rotating the scene's content.
 * Camera settings live beside it as `overrides.camera`; unlike view rotation,
 * they replace only the source scene camera for this instance.
 */

export const VIEW_FIELDS = Object.freeze([
  "rotationX",
  "rotationY",
  "rotationZ",
]);

const CAMERA_FIELDS = Object.freeze([
  "projection",
  "position",
  "target",
  "fov",
  "zoom",
]);
const CAMERA_PROJECTIONS = new Set(["orthographic", "perspective"]);
const VECTOR_FIELDS = Object.freeze(["x", "y", "z"]);

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

export function getInstanceView(instance) {
  const view = instance?.overrides?.view ?? {};
  return Object.fromEntries(
    VIEW_FIELDS.map((field) => [
      field,
      isFiniteNumber(view[field]) ? view[field] : 0,
    ]),
  );
}

export function hasInstanceView(instance) {
  return VIEW_FIELDS.some((field) => getInstanceView(instance)[field] !== 0);
}

/** Merge rotation fields into the instance. An all-zero view is removed. */
export function setInstanceView(instance, patch) {
  for (const [field, value] of Object.entries(patch)) {
    if (!VIEW_FIELDS.includes(field))
      throw new TypeError(`Unknown view field: ${field}`);
    if (!isFiniteNumber(value))
      throw new TypeError(`View ${field} must be a finite number`);
  }
  const next = { ...getInstanceView(instance), ...patch };
  const rest = { ...instance?.overrides };
  delete rest.view;
  const overrides = VIEW_FIELDS.some((field) => next[field] !== 0)
    ? { ...rest, view: next }
    : rest;
  return { ...instance, overrides };
}

/** The main component's document as this instance should draw it. */
export function withInstanceView(doc, instance) {
  if (!hasInstanceView(instance)) return doc;
  return {
    ...doc,
    scene3d: { ...doc.scene3d, contentRotation: getInstanceView(instance) },
  };
}

function validatedVector(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be a coordinate object`);
  for (const key of Object.keys(value)) {
    if (!VECTOR_FIELDS.includes(key))
      throw new TypeError(`Unknown ${label} field: ${key}`);
  }
  const vector = {};
  for (const field of VECTOR_FIELDS) {
    if (!isFiniteNumber(value[field]))
      throw new TypeError(`${label}.${field} must be a finite number`);
    vector[field] = value[field];
  }
  return vector;
}

function validatedCamera(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Camera override must be an object");
  for (const key of Object.keys(value)) {
    if (!CAMERA_FIELDS.includes(key))
      throw new TypeError(`Unknown camera field: ${key}`);
  }
  if (!CAMERA_PROJECTIONS.has(value.projection))
    throw new TypeError(
      "Camera projection must be orthographic or perspective",
    );
  if (!isFiniteNumber(value.fov) || value.fov <= 0 || value.fov >= 180)
    throw new TypeError("Camera fov must be between 0 and 180 degrees");
  if (!isFiniteNumber(value.zoom) || value.zoom <= 0)
    throw new TypeError("Camera zoom must be greater than zero");
  return {
    projection: value.projection,
    position: validatedVector(value.position, "Camera position"),
    target: validatedVector(value.target, "Camera target"),
    fov: value.fov,
    zoom: value.zoom,
  };
}

export function getInstanceCamera(instance) {
  const camera = instance?.overrides?.camera;
  return camera === undefined ? null : validatedCamera(camera);
}

export function hasInstanceCamera(instance) {
  return instance?.overrides?.camera !== undefined;
}

export function setInstanceCamera(instance, camera) {
  const nextCamera = validatedCamera(camera);
  return {
    ...instance,
    overrides: { ...instance?.overrides, camera: nextCamera },
  };
}

export function clearInstanceCamera(instance) {
  if (!hasInstanceCamera(instance)) return instance;
  const overrides = { ...instance?.overrides };
  delete overrides.camera;
  return { ...instance, overrides };
}

export function setInstanceViewLocked(instance, locked) {
  if (typeof locked !== "boolean")
    throw new TypeError("Instance view lock must be a boolean");
  const overrides = { ...instance?.overrides };
  if (locked) overrides.viewLocked = true;
  else delete overrides.viewLocked;
  return { ...instance, overrides };
}

export function withInstanceCamera(doc, instance) {
  const camera = getInstanceCamera(instance);
  if (!camera) return doc;
  return { ...doc, scene3d: { ...doc.scene3d, camera } };
}
