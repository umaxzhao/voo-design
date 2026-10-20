/** Pure material assets shared by saved scenes, live rendering, and HTML export. */
import { newId } from "./scene_doc_factory.js";
import {
  cloneJsonValue,
  readEnum,
  readNumber,
  requireId,
  requireRecord,
} from "./canvas-composition-validation.js";

export const MATERIAL_LAYER_TYPES = Object.freeze([
  "color",
  "fresnel",
  "gradient",
  "matcap",
  "noise",
  "toon",
  "depth",
  "normal",
  "rainbow",
  "outline",
]);
export const MATERIAL_MATCAP_PRESETS = Object.freeze(["chrome", "clay"]);
export const MATERIAL_BLEND_MODES = Object.freeze([
  "normal",
  "multiply",
  "screen",
  "add",
]);
export const MAX_MATERIAL_LAYERS = 8;
export const DEFAULT_MATERIAL_COLOR = "#d4d4d4";
const MATERIAL_LAYER_DEFAULTS = Object.freeze({
  color: DEFAULT_MATERIAL_COLOR,
  secondaryColor: "#ffffff",
  opacity: 1,
  blendMode: "normal",
  enabled: true,
  power: 2,
});
const MATERIAL_LAYER_DEFAULTS_BY_TYPE = Object.freeze({
  color: MATERIAL_LAYER_DEFAULTS,
  fresnel: Object.freeze({
    ...MATERIAL_LAYER_DEFAULTS,
    color: "#ffffff",
    opacity: 0.5,
    blendMode: "screen",
  }),
  gradient: MATERIAL_LAYER_DEFAULTS,
  matcap: Object.freeze({
    ...MATERIAL_LAYER_DEFAULTS,
    color: "#ffffff",
    matcapPreset: "chrome",
    matcapRotation: 0,
  }),
  noise: Object.freeze({
    ...MATERIAL_LAYER_DEFAULTS,
    color: "#202020",
    secondaryColor: "#ffffff",
    power: 2,
  }),
  toon: Object.freeze({
    ...MATERIAL_LAYER_DEFAULTS,
    color: "#31394a",
    secondaryColor: "#ffffff",
    power: 4,
  }),
  depth: Object.freeze({
    ...MATERIAL_LAYER_DEFAULTS,
    color: "#ffffff",
    secondaryColor: "#181818",
    power: 2000,
  }),
  normal: Object.freeze({
    ...MATERIAL_LAYER_DEFAULTS,
    color: "#ffffff",
  }),
  rainbow: Object.freeze({
    ...MATERIAL_LAYER_DEFAULTS,
    color: "#ffffff",
    power: 2,
  }),
  outline: Object.freeze({
    ...MATERIAL_LAYER_DEFAULTS,
    color: "#111111",
    power: 4,
  }),
});

/**
 * One `power` bound per layer type — the normalize-time (save/load) bounds,
 * matching the inline conditionals normalizeMaterialLayer relied on before
 * the type switch existed. Loading must stay exactly as strict as before the
 * power-bounds introduction: only noise, toon, depth, rainbow and outline are
 * maxed here; fresnel/matcap/color/gradient/normal keep min 0 and no max.
 */
export const MATERIAL_LAYER_POWER_BOUNDS = Object.freeze({
  fresnel: { min: 0, max: Infinity },
  matcap: { min: 0, max: Infinity },
  noise: { min: 0.1, max: 20 },
  toon: { min: 2, max: 16 },
  depth: { min: 0.1, max: 10000 },
  rainbow: { min: 0, max: 10 },
  outline: { min: 0, max: 16 },
  color: { min: 0, max: Infinity },
  gradient: { min: 0, max: Infinity },
  normal: { min: 0, max: Infinity },
});

/**
 * The tighter caps the properties-panel spinners grant. A type switch clamps
 * into these so an edited layer keeps its drag range sane while never
 * leaving the load bounds above.
 */
const MATERIAL_LAYER_UI_POWER_CAPS = Object.freeze({
  fresnel: 10,
  matcap: 10,
  rainbow: 10,
  outline: 16,
});

function requireColor(value, label) {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    throw new TypeError(`${label} must be a #RRGGBB color`);
  }
  return value.trim();
}

function readColor(value, fallback, label) {
  return value === undefined ? fallback : requireColor(value, label);
}

function readEnabled(value) {
  if (value === undefined) return MATERIAL_LAYER_DEFAULTS.enabled;
  if (typeof value !== "boolean") {
    throw new TypeError("Material layer enabled must be a boolean");
  }
  return value;
}

export function createMaterialLayer(type = "color") {
  const layerType = readEnum(
    type,
    "color",
    MATERIAL_LAYER_TYPES,
    "material layer type",
  );
  return {
    id: newId(),
    type: layerType,
    ...MATERIAL_LAYER_DEFAULTS_BY_TYPE[layerType],
  };
}

export function normalizeMaterialLayer(layer) {
  const value = cloneJsonValue(
    requireRecord(layer, "Material layer"),
    "Material layer",
  );
  const type = readEnum(
    value.type,
    undefined,
    MATERIAL_LAYER_TYPES,
    "material layer type",
  );
  const defaults = MATERIAL_LAYER_DEFAULTS_BY_TYPE[type];
  return {
    ...value,
    id: requireId(value.id, "Material layer ID"),
    type,
    color: readColor(value.color, defaults.color, "Material layer color"),
    secondaryColor: readColor(
      value.secondaryColor,
      defaults.secondaryColor,
      "Material layer secondary color",
    ),
    opacity: readNumber(
      value.opacity,
      defaults.opacity,
      "Material layer opacity",
      {
        min: 0,
        max: 1,
      },
    ),
    blendMode: readEnum(
      value.blendMode,
      defaults.blendMode,
      MATERIAL_BLEND_MODES,
      "material blend mode",
    ),
    enabled: readEnabled(value.enabled),
    power: readNumber(
      value.power,
      defaults.power,
      "Material layer power",
      MATERIAL_LAYER_POWER_BOUNDS[type],
    ),
    ...(type === "matcap"
      ? {
          matcapPreset: readEnum(
            value.matcapPreset,
            defaults.matcapPreset,
            MATERIAL_MATCAP_PRESETS,
            "material Matcap preset",
          ),
          matcapRotation: readNumber(
            value.matcapRotation,
            defaults.matcapRotation,
            "material Matcap rotation",
            { min: -360, max: 360 },
          ),
        }
      : {}),
  };
}

export function createMaterialAsset(name, baseColor = DEFAULT_MATERIAL_COLOR) {
  const layer = createMaterialLayer("color");
  layer.color = requireColor(baseColor, "Material base color");
  return {
    id: newId(),
    name: requireId(name, "Material name"),
    layers: [layer],
  };
}

/**
 * Reinterpret a layer as `nextType` when its Type select changes. The stale
 * numeric fields of the old type are adopted only where the new type's
 * bounds accept them — a depth `power` of 5000 committed as an outline
 * layer would otherwise make every later save and load throw (see the
 * serialization material-asset contract). Out-of-bounds values clamp to the
 * nearest legal bound; fields the old type did not define get the new type's
 * defaults.
 */
export function changeMaterialLayerType(layer, nextType) {
  const type = readEnum(
    nextType,
    undefined,
    MATERIAL_LAYER_TYPES,
    "material layer type",
  );
  const defaults = MATERIAL_LAYER_DEFAULTS_BY_TYPE[type];
  const bounds = MATERIAL_LAYER_POWER_BOUNDS[type];
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  // Clamp into the load bounds, then any tighter UI cap, so the value both
  // stays savable and matches the range the spinners would have granted.
  let power = clamp(
    Number.isFinite(layer.power) ? layer.power : defaults.power,
    bounds.min,
    bounds.max,
  );
  const uiCap = MATERIAL_LAYER_UI_POWER_CAPS[type];
  if (uiCap !== undefined && power > uiCap) power = uiCap;
  return normalizeMaterialLayer({ ...defaults, ...layer, type, power });
}

export function normalizeMaterialAsset(asset) {
  const value = cloneJsonValue(
    requireRecord(asset, "Material asset"),
    "Material asset",
  );
  if (!Array.isArray(value.layers)) {
    throw new TypeError("Material layers must be an array");
  }
  if (value.layers.length < 1 || value.layers.length > MAX_MATERIAL_LAYERS) {
    throw new RangeError(
      `Material assets must contain between 1 and ${MAX_MATERIAL_LAYERS} layers`,
    );
  }
  const layerIds = new Set();
  const layers = Array.from(value.layers, (layer) => {
    const normalized = normalizeMaterialLayer(layer);
    if (layerIds.has(normalized.id)) {
      throw new RangeError(`Duplicate material layer ID: ${normalized.id}`);
    }
    layerIds.add(normalized.id);
    return normalized;
  });
  return {
    ...value,
    id: requireId(value.id, "Material asset ID"),
    name: requireId(value.name, "Material name"),
    layers,
  };
}

export function normalizeMaterialAssets(assets = []) {
  if (!Array.isArray(assets)) {
    throw new TypeError("Material assets must be an array");
  }
  const ids = new Set();
  return Array.from(assets, (asset) => {
    const normalized = normalizeMaterialAsset(asset);
    if (ids.has(normalized.id)) {
      throw new RangeError(`Duplicate material asset ID: ${normalized.id}`);
    }
    ids.add(normalized.id);
    return normalized;
  });
}

function legacyColor(node) {
  const color = node.material?.color ?? node.model?.color ?? node.fill;
  return typeof color === "string" && color.trim() && color !== "transparent"
    ? color.trim()
    : DEFAULT_MATERIAL_COLOR;
}

/** Unlinked nodes retain their original color without creating a saved asset. */
export function resolveMaterialAsset(doc, node) {
  requireRecord(doc, "Canvas document");
  requireRecord(node, "Canvas node");
  const scene3d =
    doc.scene3d === undefined ? {} : requireRecord(doc.scene3d, "3D scene");
  const assets = normalizeMaterialAssets(scene3d.materialAssets);
  if (node.materialAssetId !== undefined && node.materialAssetId !== null) {
    const id = requireId(node.materialAssetId, "Node material asset ID");
    const asset = assets.find((candidate) => candidate.id === id);
    if (!asset) throw new RangeError(`Material asset not found: ${id}`);
    return asset;
  }
  const nodeId = requireId(node.id, "Canvas node ID");
  return {
    id: `legacy:${nodeId}`,
    name:
      typeof node.name === "string" && node.name.trim()
        ? node.name.trim()
        : nodeId,
    layers: [
      {
        id: `legacy:${nodeId}:color`,
        type: "color",
        ...MATERIAL_LAYER_DEFAULTS,
        color: legacyColor(node),
      },
    ],
  };
}
