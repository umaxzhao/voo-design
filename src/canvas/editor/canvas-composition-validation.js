const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function requireRecord(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be a plain object`);
  return value;
}

export function requireId(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

export function requireNumber(
  value,
  label,
  { min = -Infinity, max = Infinity } = {},
) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(
      `${label} must be a finite number between ${min} and ${max}`,
    );
  }
  return value;
}

export function readNumber(value, fallback, label, bounds) {
  return value === undefined ? fallback : requireNumber(value, label, bounds);
}

export function readEnum(value, fallback, allowed, label) {
  const candidate = value === undefined ? fallback : value;
  if (!allowed.includes(candidate))
    throw new RangeError(`Unsupported ${label}`);
  return candidate;
}

export function readOptionalString(value, label) {
  if (value === undefined || value === null) return null;
  return requireId(value, label);
}

export function normalizeSpatialFields(value) {
  const spatial = requireRecord(value, "Node spatial transform");
  return {
    ...spatial,
    z: readNumber(spatial.z, 0, "Node z"),
    rotationX: readNumber(spatial.rotationX, 0, "Node X rotation"),
    rotationY: readNumber(spatial.rotationY, 0, "Node Y rotation"),
  };
}

export function cloneJsonValue(value, label, seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return requireNumber(value, label);
  if (Array.isArray(value)) {
    if (seen.has(value))
      throw new TypeError(`${label} must not contain a cycle`);
    seen.add(value);
    const copy = value.map((item, index) =>
      cloneJsonValue(item, `${label}[${index}]`, seen),
    );
    seen.delete(value);
    return copy;
  }
  requireRecord(value, label);
  if (seen.has(value)) throw new TypeError(`${label} must not contain a cycle`);
  seen.add(value);
  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key || FORBIDDEN_KEYS.has(key))
      throw new TypeError(`${label} has an invalid key`);
    copy[key] = cloneJsonValue(item, `${label}.${key}`, seen);
  }
  seen.delete(value);
  return copy;
}
