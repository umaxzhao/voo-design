/**
 * Document variables v2 — typed variables, collections and per-collection modes.
 *
 * Model (stored on the document as `doc.variablesV2`):
 *
 *   doc.variablesV2 = {
 *     version: 2,
 *     collections: [{
 *       id,                                     // stable string id
 *       name,                                   // display name ("Colors")
 *       modes: [{ id, name }],                  // first mode is the default
 *       variables: [{
 *         id,                                   // globally unique, preserved from v1
 *         name,
 *         type,                                 // "color" | "number" | "string" | "boolean"
 *         valuesByMode: { [modeId]: value },    // every mode has a value
 *       }],
 *     }],
 *     activeModeByCollection: { [collectionId]: modeId },
 *   }
 *
 * Node bindings (kept on the node so switching a mode never loses a binding):
 *   - fillVariableId    -> color variable, resolved onto `node.fill`
 *   - strokeVariableId  -> color variable, resolved onto `node.stroke`
 *   - opacityVariableId -> number variable, resolved onto `node.opacity` (0..1)
 *   - cornerRadiusVariableId -> number variable, resolved onto `node.cornerRadius`
 *   - textVariableId    -> string variable, resolved onto `node.text`
 *
 * Backwards compatibility: `doc.colorVariables` (v1: [{ id, name, value }]) is
 * kept as a *mirror* of the Color variables of the legacy collection, using
 * that collection's active mode. The old `scene_color_variables.js` API is
 * re-exported from here and operates on v2 when the document already has a v2
 * model, so both UIs stay consistent and old documents/tests keep working.
 *
 * Read tolerance: `normalizeVariablesV2` / `deserializeVariables` / all query
 * helpers never throw — malformed input is dropped or repaired. Mutating ops
 * throw on programmer error (missing ids, wrong types) like the v1 ops did.
 *
 * Resolution is pure: `resolveDocumentVariables` returns a new document and
 * only changes the resolved property values; bindings stay set.
 *
 * Deferred: aliases between variables, per-variable scopes/code syntax, and
 * binding number variables to auto-layout values (gap/padding). Text binding is
 * supported for `node.text` only.
 */

const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i;

/** The legacy collection migrated from `doc.colorVariables`. */
export const LEGACY_COLLECTION_ID = "collection:colors";
/** Mode id used for migrated / repaired collections. */
export const DEFAULT_MODE_ID = "mode:default";
/** Variable type names accepted by the model. */
export const VARIABLE_TYPES = Object.freeze([
  "color",
  "number",
  "string",
  "boolean",
]);
/** Binding target -> node binding key + required variable type + resolved prop. */
export const VARIABLE_BINDINGS = Object.freeze({
  fill: { key: "fillVariableId", type: "color", property: "fill" },
  stroke: { key: "strokeVariableId", type: "color", property: "stroke" },
  opacity: { key: "opacityVariableId", type: "number", property: "opacity" },
  cornerRadius: {
    key: "cornerRadiusVariableId",
    type: "number",
    property: "cornerRadius",
  },
  text: { key: "textVariableId", type: "string", property: "text" },
  gap: { key: "gapVariableId", type: "number", property: "gap" },
  padding: { key: "paddingVariableId", type: "number", property: "padding" },
});

const BINDING_KEYS = Object.values(VARIABLE_BINDINGS).map((entry) => entry.key);

/* ------------------------------------------------------------------ */
/* Small shared helpers                                                */
/* ------------------------------------------------------------------ */

let fallbackIdCounter = 0;

/** Stable-enough ids for documents authored without a native `crypto`. */
function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}:${uuid}`;
  fallbackIdCounter += 1;
  return `${prefix}:${Date.now().toString(36)}:${fallbackIdCounter}`;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/* ------------------------------------------------------------------ */
/* v1 helpers (kept byte-compatible with the old module)               */
/* ------------------------------------------------------------------ */

/**
 * The v1 normaliser: a flat array of `{ id, name, value(hex) }`.
 * Kept exported under its original name for `scene_model_serialization.js`.
 */
export function normalizeColorVariables(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((item) => {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const color = typeof item?.value === "string" ? item.value.trim() : "";
    if (!id || !name || !HEX_COLOR.test(color) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, value: color }];
  });
}

/** Explicit alias — the task contract names the v1 normaliser this way. */
export const normalizeColorVariablesV1 = normalizeColorVariables;

/* ------------------------------------------------------------------ */
/* Value validation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Validates a variable value for `type`.
 * Returns `{ ok: true, value }` with the canonical value, or `{ ok: false }`.
 * Tolerant coercions (numeric strings, "true"/"false") exist so old/hand-written
 * JSON loads; strict writers should pass native types.
 */
export function normalizeVariableValue(type, value) {
  if (type === "color") {
    const color = text(value);
    return HEX_COLOR.test(color) ? { ok: true, value: color } : { ok: false };
  }
  if (type === "number") {
    if (typeof value === "number" && Number.isFinite(value)) {
      return { ok: true, value };
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return { ok: true, value: parsed };
    }
    return { ok: false };
  }
  if (type === "string") {
    if (typeof value === "string") return { ok: true, value };
    if (typeof value === "number" && Number.isFinite(value)) {
      return { ok: true, value: String(value) };
    }
    return { ok: false };
  }
  if (type === "boolean") {
    if (typeof value === "boolean") return { ok: true, value };
    if (value === "true") return { ok: true, value: true };
    if (value === "false") return { ok: true, value: false };
    return { ok: false };
  }
  return { ok: false };
}

/** Throws unless `value` is a valid value for a variable of `type`. */
function assertVariableValue(type, value) {
  if (!normalizeVariableValue(type, value).ok) {
    throw new Error("variable-value-invalid");
  }
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Tolerant normaliser for the v2 model. Never throws.
 * - drops entries without a usable id, duplicate collection/variable ids
 * - drops unknown types, repairs a missing/empty mode list with a default mode
 * - drops values that are invalid for the type, falls back to the default mode
 *   value for modes without one
 * - drops unknown `activeModeByCollection` keys and repairs invalid modes
 */
export function normalizeVariablesV2(value) {
  const raw = isObject(value) ? value : {};
  const rawCollections = Array.isArray(raw.collections) ? raw.collections : [];
  const rawActive = isObject(raw.activeModeByCollection)
    ? raw.activeModeByCollection
    : {};

  const seenCollectionIds = new Set();
  const seenVariableIds = new Set();
  const collections = [];

  for (const rawCollection of rawCollections) {
    if (!isObject(rawCollection)) continue;
    const id = text(rawCollection.id);
    if (!id || seenCollectionIds.has(id)) continue;

    const modes = [];
    const seenModeIds = new Set();
    for (const rawMode of Array.isArray(rawCollection.modes)
      ? rawCollection.modes
      : []) {
      if (!isObject(rawMode)) continue;
      const modeId = text(rawMode.id);
      if (!modeId || seenModeIds.has(modeId)) continue;
      seenModeIds.add(modeId);
      modes.push({ id: modeId, name: text(rawMode.name) || modeId });
    }
    if (modes.length === 0) {
      modes.push({ id: DEFAULT_MODE_ID, name: "Default" });
    }
    const defaultModeId = modes[0].id;

    const variables = [];
    for (const rawVariable of Array.isArray(rawCollection.variables)
      ? rawCollection.variables
      : []) {
      if (!isObject(rawVariable)) continue;
      const variableId = text(rawVariable.id);
      if (!variableId || seenVariableIds.has(variableId)) continue;
      const type = text(rawVariable.type);
      if (!VARIABLE_TYPES.includes(type)) continue;

      const rawValues = isObject(rawVariable.valuesByMode)
        ? rawVariable.valuesByMode
        : {};
      const valuesByMode = {};
      for (const mode of modes) {
        const candidate = normalizeVariableValue(type, rawValues[mode.id]);
        if (candidate.ok) valuesByMode[mode.id] = candidate.value;
      }
      if (!(defaultModeId in valuesByMode)) {
        // Tolerate a legacy/simple `value` field, then any mode that had one.
        const fallback = normalizeVariableValue(type, rawVariable.value);
        let chosen;
        if (fallback.ok) chosen = fallback.value;
        else {
          for (const mode of modes) {
            if (mode.id in valuesByMode) {
              chosen = valuesByMode[mode.id];
              break;
            }
          }
        }
        if (chosen === undefined) continue;
        valuesByMode[defaultModeId] = chosen;
      }
      for (const mode of modes) {
        if (!(mode.id in valuesByMode)) {
          valuesByMode[mode.id] = valuesByMode[defaultModeId];
        }
      }

      const aliasOf = text(rawVariable.aliasOf) || null;
      seenVariableIds.add(variableId);
      variables.push({
        id: variableId,
        name: text(rawVariable.name) || variableId,
        type,
        valuesByMode,
        ...(aliasOf ? { aliasOf } : {}),
      });
    }

    seenCollectionIds.add(id);
    collections.push({ id, name: text(rawCollection.name) || id, modes, variables });
  }

  const activeModeByCollection = {};
  for (const collection of collections) {
    const requested = text(rawActive[collection.id]);
    const valid = collection.modes.some((mode) => mode.id === requested);
    activeModeByCollection[collection.id] = valid
      ? requested
      : collection.modes[0].id;
  }

  return { version: 2, collections, activeModeByCollection };
}

/** Rebuilds a v2 model from a flat v1 list (single Colors collection/Default mode). */
export function variablesFromLegacyColorVariables(value) {
  const variables = normalizeColorVariables(value).map((item) => ({
    id: item.id,
    name: item.name,
    type: "color",
    valuesByMode: { [DEFAULT_MODE_ID]: item.value },
  }));
  if (variables.length === 0) {
    return { version: 2, collections: [], activeModeByCollection: {} };
  }
  return {
    version: 2,
    collections: [
      {
        id: LEGACY_COLLECTION_ID,
        name: "Colors",
        modes: [{ id: DEFAULT_MODE_ID, name: "Default" }],
        variables,
      },
    ],
    activeModeByCollection: { [LEGACY_COLLECTION_ID]: DEFAULT_MODE_ID },
  };
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

/** The normalised model of a document (empty model when it has none). */
export function getVariablesModel(doc) {
  return normalizeVariablesV2(doc?.variablesV2);
}

/** Finds the collection mirroring v1 `doc.colorVariables` in a normalised model. */
function findLegacyCollection(model) {
  return (
    model.collections.find(
      (collection) => collection.id === LEGACY_COLLECTION_ID,
    ) ??
    model.collections.find(
      (collection) => collection.name.toLowerCase() === "colors",
    ) ??
    model.collections.find((collection) =>
      collection.variables.some((variable) => variable.type === "color"),
    ) ??
    null
  );
}

/** The collection that mirrors v1 `doc.colorVariables`, if any (read-only copy). */
export function legacyColorCollection(model) {
  return findLegacyCollection(normalizeVariablesV2(model));
}

/** v1 `doc.colorVariables` mirror for a v2 model (active mode of the Colors collection). */
export function legacyColorVariablesFromModel(model) {
  const collection = legacyColorCollection(model);
  if (!collection) return [];
  const normalized = normalizeVariablesV2(model);
  const modeId =
    normalized.activeModeByCollection[collection.id] ?? collection.modes[0].id;
  return collection.variables
    .filter((variable) => variable.type === "color")
    .map((variable) => ({
      id: variable.id,
      name: variable.name,
      value: variable.valuesByMode[modeId] ?? variable.valuesByMode[collection.modes[0].id],
    }))
    .filter((variable) => typeof variable.value === "string");
}

/** Finds a variable (and its collection) anywhere in the model. */
export function findVariable(doc, variableId) {
  const needle = text(variableId);
  if (!needle) return null;
  const model = getVariablesModel(doc);
  for (const collection of model.collections) {
    for (const variable of collection.variables) {
      if (variable.id === needle) {
        return { collection, variable, modeId: activeModeId(model, collection.id) };
      }
    }
  }
  return null;
}

/** Active mode id for a collection (falls back to its default mode). */
export function activeModeId(model, collectionId) {
  const normalized = normalizeVariablesV2(model);
  const collection = normalized.collections.find(
    (candidate) => candidate.id === collectionId,
  );
  if (!collection) return null;
  return (
    normalized.activeModeByCollection[collection.id] ?? collection.modes[0].id
  );
}

/**
 * Resolved value of a variable in the active mode of its collection,
 * following aliasOf links with cycle prevention.
 * Returns `null` when the variable/value cannot be resolved.
 */
export function variableValue(doc, variableId, seen = new Set()) {
  const needle = text(variableId);
  if (!needle || seen.has(needle)) return null;
  seen.add(needle);

  const found = findVariable(doc, needle);
  if (!found) return null;
  const { collection, variable, modeId } = found;

  if (variable.aliasOf) {
    return variableValue(doc, variable.aliasOf, seen);
  }

  const value =
    variable.valuesByMode[modeId ?? collection.modes[0].id] ??
    variable.valuesByMode[collection.modes[0].id];
  return value === undefined ? null : value;
}

/* ------------------------------------------------------------------ */
/* Resolution (pure)                                                   */
/* ------------------------------------------------------------------ */

function clampedNumber(value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

/**
 * Returns a new document with every bound node property materialised from the
 * active mode values. Bindings are preserved; unresolved bindings are left in
 * place (tolerant read) and their current property value is kept.
 * Documents without a v2 model are returned unchanged.
 */
export function resolveDocumentVariables(doc) {
  if (!isObject(doc)) return doc;
  const model = normalizeVariablesV2(doc.variablesV2);
  if (model.collections.length === 0 || !Array.isArray(doc.nodes)) return doc;

  const index = new Map();
  for (const collection of model.collections) {
    const modeId = model.activeModeByCollection[collection.id];
    for (const variable of collection.variables) {
      index.set(variable.id, {
        variable,
        value:
          variable.valuesByMode[modeId] ??
          variable.valuesByMode[collection.modes[0].id],
      });
    }
  }

  let changed = false;
  const nodes = doc.nodes.map((node) => {
    if (!isObject(node)) return node;
    let updated = node;
    const resolve = (bindingKey, expectedType) => {
      const variableId = node[bindingKey];
      if (!variableId) return null;
      const val = variableValue(doc, variableId);
      const entry = index.get(variableId);
      if (!entry || entry.variable.type !== expectedType) return null;
      return val !== null ? val : entry.value;
    };

    const fill = resolve("fillVariableId", "color");
    if (typeof fill === "string" && updated.fill !== fill) {
      updated = { ...updated, fill };
    }
    const stroke = resolve("strokeVariableId", "color");
    if (typeof stroke === "string" && updated.stroke !== stroke) {
      updated = { ...updated, stroke };
    }
    const opacity = clampedNumber(resolve("opacityVariableId", "number"), 0, 1);
    if (opacity !== null && updated.opacity !== opacity) {
      updated = { ...updated, opacity };
    }
    const cornerRadius = clampedNumber(
      resolve("cornerRadiusVariableId", "number"),
      0,
      Number.POSITIVE_INFINITY,
    );
    if (cornerRadius !== null && updated.cornerRadius !== cornerRadius) {
      updated = { ...updated, cornerRadius };
    }
    const content = resolve("textVariableId", "string");
    if (typeof content === "string" && updated.text !== content) {
      updated = { ...updated, text: content };
    }
    const gap = clampedNumber(
      resolve("gapVariableId", "number"),
      0,
      Number.POSITIVE_INFINITY,
    );
    if (gap !== null && updated.gap !== gap) {
      updated = { ...updated, gap };
    }
    const padding = clampedNumber(
      resolve("paddingVariableId", "number"),
      0,
      Number.POSITIVE_INFINITY,
    );
    if (padding !== null && updated.padding !== padding) {
      updated = { ...updated, padding };
    }
    if (updated !== node) changed = true;
    return updated;
  });

  return changed ? { ...doc, nodes } : doc;
}

/* ------------------------------------------------------------------ */
/* Internal mutation plumbing                                          */
/* ------------------------------------------------------------------ */

/** Applies a finished model: normalise, mirror v1 colorVariables, re-resolve. */
function withVariablesModel(doc, nextModel) {
  const variablesV2 = normalizeVariablesV2(nextModel);
  const withModel = {
    ...doc,
    variablesV2,
    colorVariables: legacyColorVariablesFromModel(variablesV2),
  };
  return resolveDocumentVariables(withModel);
}

function modelOrEmpty(doc) {
  const raw = doc?.variablesV2;
  if (isObject(raw) && Array.isArray(raw.collections) && raw.collections.length > 0) {
    return normalizeVariablesV2(raw);
  }
  return variablesFromLegacyColorVariables(doc?.colorVariables);
}

function requireCollection(model, collectionId) {
  const collection = model.collections.find(
    (candidate) => candidate.id === collectionId,
  );
  if (!collection) throw new Error("variable-collection-missing");
  return collection;
}

function requireVariable(model, variableId) {
  for (const collection of model.collections) {
    const variable = collection.variables.find(
      (candidate) => candidate.id === variableId,
    );
    if (variable) return { collection, variable };
  }
  throw new Error("variable-missing");
}

function requireMode(collection, modeId) {
  const mode = collection.modes.find((candidate) => candidate.id === modeId);
  if (!mode) throw new Error("variable-mode-missing");
  return mode;
}

function clearBindings(nodes, variableIds) {
  const ids = new Set(variableIds);
  return nodes.map((node) => {
    if (!isObject(node)) return node;
    let updated = node;
    for (const key of BINDING_KEYS) {
      if (ids.has(node[key])) updated = { ...updated, [key]: null };
    }
    return updated;
  });
}

/* ------------------------------------------------------------------ */
/* Migration (v1 -> v2, idempotent)                                    */
/* ------------------------------------------------------------------ */

/**
 * Converts legacy `doc.colorVariables` into the v2 model while preserving
 * variable ids and node fill/stroke bindings. Idempotent: migrating an already
 * migrated document returns an equivalent document (new legacy variables added
 * after the first migration are merged into the Colors collection).
 */
export function migrateColorVariablesV1(doc) {
  if (!isObject(doc)) return doc;
  const legacy = normalizeColorVariables(doc.colorVariables);
  const rawModel = doc.variablesV2;
  const hasModel =
    isObject(rawModel) &&
    Array.isArray(rawModel.collections) &&
    rawModel.collections.length > 0;
  if (!hasModel && legacy.length === 0) return doc;

  const model = hasModel
    ? normalizeVariablesV2(rawModel)
    : variablesFromLegacyColorVariables(legacy);

  if (legacy.length > 0) {
    let collection = findLegacyCollection(model);
    if (!collection) {
      collection = {
        id: LEGACY_COLLECTION_ID,
        name: "Colors",
        modes: [{ id: DEFAULT_MODE_ID, name: "Default" }],
        variables: [],
      };
      model.collections.push(collection);
      model.activeModeByCollection[collection.id] = DEFAULT_MODE_ID;
    }
    const existing = new Set();
    for (const candidate of model.collections) {
      for (const variable of candidate.variables) existing.add(variable.id);
    }
    for (const item of legacy) {
      if (existing.has(item.id)) continue;
      collection.variables.push({
        id: item.id,
        name: item.name,
        type: "color",
        valuesByMode: { [collection.modes[0].id]: item.value },
      });
      existing.add(item.id);
    }
  }

  return withVariablesModel(doc, model);
}

/* ------------------------------------------------------------------ */
/* Modes + values                                                      */
/* ------------------------------------------------------------------ */

/** Switches a collection's active mode and re-resolves bound properties. */
export function setActiveCollectionMode(doc, collectionId, modeId) {
  const model = modelOrEmpty(doc);
  const collection = requireCollection(model, collectionId);
  requireMode(collection, modeId);
  model.activeModeByCollection[collection.id] = modeId;
  return withVariablesModel(doc, model);
}

/**
 * Sets a variable's value for one mode and re-resolves bound nodes.
 * Throws `variable-value-invalid` when the value does not match the type.
 */
export function setVariableValue(doc, variableId, modeId, value) {
  const model = modelOrEmpty(doc);
  const { collection, variable } = requireVariable(model, variableId);
  const mode = requireMode(collection, modeId ?? collection.modes[0].id);
  assertVariableValue(variable.type, value);
  const normalized = normalizeVariableValue(variable.type, value);
  variable.valuesByMode[mode.id] = normalized.value;
  return withVariablesModel(doc, model);
}

/* ------------------------------------------------------------------ */
/* CRUD: collections                                                   */
/* ------------------------------------------------------------------ */

export function addCollection(doc, { id, name } = {}) {
  const model = modelOrEmpty(doc);
  const collectionId = text(id) || makeId("collection");
  if (model.collections.some((collection) => collection.id === collectionId)) {
    throw new Error("variable-collection-duplicate");
  }
  const displayName = text(name) || "Collection";
  model.collections.push({
    id: collectionId,
    name: displayName,
    modes: [{ id: DEFAULT_MODE_ID, name: "Default" }],
    variables: [],
  });
  model.activeModeByCollection[collectionId] = DEFAULT_MODE_ID;
  return withVariablesModel(doc, model);
}

export function renameCollection(doc, collectionId, name) {
  const model = modelOrEmpty(doc);
  const collection = requireCollection(model, collectionId);
  const displayName = text(name);
  if (!displayName) throw new Error("variables-invalid");
  collection.name = displayName;
  return withVariablesModel(doc, model);
}

/** Deletes a collection and clears bindings to every variable it owned. */
export function deleteCollection(doc, collectionId) {
  const model = modelOrEmpty(doc);
  const collection = requireCollection(model, collectionId);
  const removedIds = collection.variables.map((variable) => variable.id);
  model.collections = model.collections.filter(
    (candidate) => candidate.id !== collection.id,
  );
  delete model.activeModeByCollection[collection.id];
  const nodes = clearBindings(Array.isArray(doc.nodes) ? doc.nodes : [], removedIds);
  return withVariablesModel({ ...doc, nodes }, model);
}

/* ------------------------------------------------------------------ */
/* CRUD: modes                                                         */
/* ------------------------------------------------------------------ */

/** Adds a mode; its values start as a copy of the default mode's values. */
export function addMode(doc, collectionId, { id, name } = {}) {
  const model = modelOrEmpty(doc);
  const collection = requireCollection(model, collectionId);
  const modeId = text(id) || makeId("mode");
  if (collection.modes.some((mode) => mode.id === modeId)) {
    throw new Error("variable-mode-duplicate");
  }
  const defaultModeId = collection.modes[0].id;
  collection.modes.push({ id: modeId, name: text(name) || "Mode" });
  for (const variable of collection.variables) {
    variable.valuesByMode[modeId] =
      variable.valuesByMode[defaultModeId] ?? null;
  }
  return withVariablesModel(doc, model);
}

export function renameMode(doc, collectionId, modeId, name) {
  const model = modelOrEmpty(doc);
  const collection = requireCollection(model, collectionId);
  const mode = requireMode(collection, modeId);
  const displayName = text(name);
  if (!displayName) throw new Error("variables-invalid");
  mode.name = displayName;
  return withVariablesModel(doc, model);
}

/**
 * Deletes a mode. Variables lose that mode's values; an active deleted mode
 * falls back to the collection's default (first) mode. The last mode cannot be
 * deleted (`variable-mode-invalid`) — a collection always needs one mode.
 */
export function deleteMode(doc, collectionId, modeId) {
  const model = modelOrEmpty(doc);
  const collection = requireCollection(model, collectionId);
  const mode = requireMode(collection, modeId);
  if (collection.modes.length <= 1) throw new Error("variable-mode-invalid");
  collection.modes = collection.modes.filter(
    (candidate) => candidate.id !== mode.id,
  );
  for (const variable of collection.variables) {
    delete variable.valuesByMode[mode.id];
  }
  const defaultModeId = collection.modes[0].id;
  if (model.activeModeByCollection[collection.id] === mode.id) {
    model.activeModeByCollection[collection.id] = defaultModeId;
  }
  return withVariablesModel(doc, model);
}

/* ------------------------------------------------------------------ */
/* CRUD: variables                                                     */
/* ------------------------------------------------------------------ */

/**
 * Adds a variable. `value` seeds every mode; `valuesByMode` may override modes.
 */
export function addVariable(
  doc,
  collectionId,
  { id, name, type, value, valuesByMode } = {},
) {
  const model = modelOrEmpty(doc);
  const collection = requireCollection(model, collectionId);
  const variableType = text(type);
  if (!VARIABLE_TYPES.includes(variableType)) {
    throw new Error("variable-type-invalid");
  }
  const variableId = text(id) || makeId("variable");
  for (const candidate of model.collections) {
    if (candidate.variables.some((variable) => variable.id === variableId)) {
      throw new Error("variable-duplicate");
    }
  }
  const defaultModeId = collection.modes[0].id;
  const seeded = {};
  for (const mode of collection.modes) {
    const candidate = normalizeVariableValue(
      variableType,
      isObject(valuesByMode) ? valuesByMode[mode.id] : undefined,
    );
    if (candidate.ok) seeded[mode.id] = candidate.value;
  }
  if (!(defaultModeId in seeded)) {
    const fallback = normalizeVariableValue(variableType, value);
    if (!fallback.ok) throw new Error("variable-value-invalid");
    seeded[defaultModeId] = fallback.value;
  }
  for (const mode of collection.modes) {
    if (!(mode.id in seeded)) seeded[mode.id] = seeded[defaultModeId];
  }
  collection.variables.push({
    id: variableId,
    name: text(name) || variableId,
    type: variableType,
    valuesByMode: seeded,
  });
  return withVariablesModel(doc, model);
}

export function setVariableAlias(doc, variableId, targetVariableId) {
  const model = modelOrEmpty(doc);
  const { variable } = requireVariable(model, variableId);
  const targetId = text(targetVariableId) || null;
  if (targetId) {
    if (targetId === variable.id) throw new Error("variable-alias-cycle");
    const { variable: target } = requireVariable(model, targetId);
    if (target.type !== variable.type) throw new Error("variable-type-mismatch");
    // Check transitive cycles
    let current = target;
    const visited = new Set([variable.id, target.id]);
    while (current.aliasOf) {
      if (visited.has(current.aliasOf)) throw new Error("variable-alias-cycle");
      visited.add(current.aliasOf);
      current = requireVariable(model, current.aliasOf).variable;
    }
    variable.aliasOf = targetId;
  } else {
    delete variable.aliasOf;
  }
  return withVariablesModel(doc, model);
}

export function renameVariable(doc, variableId, name) {
  const model = modelOrEmpty(doc);
  const { variable } = requireVariable(model, variableId);
  const displayName = text(name);
  if (!displayName) throw new Error("variables-invalid");
  variable.name = displayName;
  return withVariablesModel(doc, model);
}

/** Deletes a variable and clears every node binding that referenced it. */
export function deleteVariable(doc, variableId) {
  const model = modelOrEmpty(doc);
  const { variable } = requireVariable(model, variableId);
  for (const collection of model.collections) {
    collection.variables = collection.variables.filter(
      (candidate) => candidate.id !== variable.id,
    );
  }
  const nodes = clearBindings(
    Array.isArray(doc.nodes) ? doc.nodes : [],
    [variable.id],
  );
  return withVariablesModel({ ...doc, nodes }, model);
}

/* ------------------------------------------------------------------ */
/* Node bindings                                                       */
/* ------------------------------------------------------------------ */

/**
 * Binds (or, with `variableId = null`, unbinds) a node property to a variable.
 * The value is materialised immediately from the active mode.
 * `target` is one of `fill`, `stroke`, `opacity`, `cornerRadius`, `text`.
 */
export function bindVariable(doc, nodeId, variableId, target = "fill") {
  const binding = VARIABLE_BINDINGS[target];
  if (!binding) throw new Error("variable-binding-invalid");
  const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
  if (!nodes.some((node) => node.id === nodeId)) {
    throw new Error("variable-node-missing");
  }
  if (!variableId) {
    return {
      ...doc,
      nodes: nodes.map((node) =>
        node.id === nodeId ? { ...node, [binding.key]: null } : node,
      ),
    };
  }
  const model = modelOrEmpty(doc);
  const { collection, variable } = requireVariable(model, variableId);
  if (variable.type !== binding.type) throw new Error("variable-type-mismatch");
  const modeId = model.activeModeByCollection[collection.id] ?? collection.modes[0].id;
  const value =
    variable.valuesByMode[modeId] ?? variable.valuesByMode[collection.modes[0].id];
  return resolveDocumentVariables({
    ...doc,
    nodes: nodes.map((node) =>
      node.id === nodeId
        ? { ...node, [binding.key]: variable.id, [binding.property]: value }
        : node,
    ),
  });
}

/* ------------------------------------------------------------------ */
/* Serialisation helpers (Lead wires these into scene_model_serialization) */
/* ------------------------------------------------------------------ */

/**
 * Serialisable the lead can spread into the document record:
 * `{ variablesV2 }`, or `{}` when the document has no variables.
 */
export function serializeVariables(doc) {
  const model = normalizeVariablesV2(doc?.variablesV2);
  return model.collections.length > 0 ? { variablesV2: model } : {};
}

/**
 * Reads variables from a raw (JSON) document record. Migrates v1 documents and
 * normalises v2 ones. Returns `{ variablesV2, colorVariables }` — the v1
 * mirror keeps the existing fill/stroke `*VariableId` resolution path working —
 * or `{}` when there are no variables. Never throws.
 *
 * Call `resolveDocumentVariables(doc)` after merging this patch if the
 * document also binds number/string variables.
 */
export function deserializeVariables(rawDoc) {
  if (!isObject(rawDoc)) return {};
  const legacy = normalizeColorVariables(rawDoc.colorVariables);
  const hasModel =
    isObject(rawDoc.variablesV2) &&
    Array.isArray(rawDoc.variablesV2.collections) &&
    rawDoc.variablesV2.collections.length > 0;
  if (!hasModel && legacy.length === 0) return {};
  // Only the variable tables are needed here; skipping nodes keeps this cheap
  // on large documents (the caller resolves node bindings separately).
  const migrated = migrateColorVariablesV1({
    colorVariables: legacy,
    variablesV2: rawDoc.variablesV2,
  });
  return {
    variablesV2: migrated.variablesV2,
    colorVariables: migrated.colorVariables,
  };
}

/* ------------------------------------------------------------------ */
/* Panel action factory (engine commit glue)                           */
/* ------------------------------------------------------------------ */

const DEFAULT_VARIABLE_VALUES = Object.freeze({
  color: "#000000",
  number: 0,
  string: "",
  boolean: false,
});
const DEFAULT_VARIABLE_NAMES = Object.freeze({
  color: "Color",
  number: "Number",
  string: "Text",
  boolean: "Boolean",
});

/**
 * Builds the `actions` object `VariablesPanel` expects on top of an engine-like
 * commit path, so each panel action becomes exactly one undo entry:
 *
 *   const actions = createVariablesPanelActions({
 *     getDocument: () => engine.getDocument(),
 *     commit: (nextDoc, options) => engine.setDoc(nextDoc, options),
 *     getNodeId: () => selectedNodeId,          // enables the bind control
 *     historyName: "editor.history.entry.variables",
 *   });
 *
 * `commit(nextDoc, { name } | undefined)` may return a promise; this factory
 * does not wait for it.
 */
export function createVariablesPanelActions({
  getDocument,
  commit,
  getNodeId = null,
  historyName = null,
} = {}) {
  const run = (reduce) => {
    const current = getDocument?.();
    if (!isObject(current)) return undefined;
    // First-use support: mutating a document that has no v2 model seeds one
    // from `doc.colorVariables` (idempotent). The first panel action therefore
    // creates `variablesV2` — preserving legacy ids/bindings — in the same
    // document replacement, i.e. one undo entry.
    const seeded = migrateColorVariablesV1(current);
    const next = reduce(seeded);
    if (next && next !== current) {
      commit?.(next, historyName ? { name: historyName } : undefined);
      return next;
    }
    return undefined;
  };
  const nextVariableName = (doc, collectionId, type) => {
    const model = normalizeVariablesV2(doc.variablesV2);
    const collection = model.collections.find(
      (candidate) => candidate.id === collectionId,
    );
    const count = collection
      ? collection.variables.filter((variable) => variable.type === type).length
      : 0;
    return `${DEFAULT_VARIABLE_NAMES[type] ?? "Variable"} ${count + 1}`;
  };
  return {
    setActiveMode: (collectionId, modeId) =>
      run((doc) => setActiveCollectionMode(doc, collectionId, modeId)),
    addCollection: (collection = {}) => run((doc) => addCollection(doc, collection)),
    renameCollection: (collectionId, name) =>
      run((doc) => renameCollection(doc, collectionId, name)),
    deleteCollection: (collectionId) =>
      run((doc) => deleteCollection(doc, collectionId)),
    addMode: (collectionId, mode = {}) =>
      run((doc) => addMode(doc, collectionId, mode)),
    deleteMode: (collectionId, modeId) =>
      run((doc) => deleteMode(doc, collectionId, modeId)),
    addVariable: (collectionId, type) =>
      run((doc) =>
        addVariable(doc, collectionId, {
          name: nextVariableName(doc, collectionId, type),
          type,
          value: DEFAULT_VARIABLE_VALUES[type] ?? "",
        }),
      ),
    renameVariable: (variableId, name) =>
      run((doc) => renameVariable(doc, variableId, name)),
    updateValue: (variableId, modeId, value) =>
      run((doc) => setVariableValue(doc, variableId, modeId, value)),
    deleteVariable: (variableId) =>
      run((doc) => deleteVariable(doc, variableId)),
    bind:
      typeof getNodeId === "function"
        ? (variableId) =>
            run((doc) => {
              const nodeId = getNodeId();
              if (!nodeId) return null;
              return bindVariable(doc, nodeId, variableId, "fill");
            })
        : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Legacy v1 API (re-exported by scene_color_variables.js)              */
/* ------------------------------------------------------------------ */

function hasV2Variables(doc) {
  return (
    isObject(doc?.variablesV2) &&
    Array.isArray(doc.variablesV2.collections) &&
    doc.variablesV2.collections.length > 0
  );
}

function colorsCollectionForMutation(model) {
  let collection = findLegacyCollection(model);
  if (!collection) {
    collection = {
      id: LEGACY_COLLECTION_ID,
      name: "Colors",
      modes: [{ id: DEFAULT_MODE_ID, name: "Default" }],
      variables: [],
    };
    model.collections.push(collection);
    model.activeModeByCollection[collection.id] = DEFAULT_MODE_ID;
  }
  return collection;
}

export function addColorVariable(doc, variable) {
  const [valid] = normalizeColorVariables([variable]);
  if (!valid) throw new Error("color-variable-invalid");
  if (hasV2Variables(doc)) {
    const model = modelOrEmpty(doc);
    const collection = colorsCollectionForMutation(model);
    if (
      model.collections.some((candidate) =>
        candidate.variables.some((item) => item.id === valid.id),
      )
    ) {
      throw new Error("color-variable-invalid");
    }
    collection.variables.push({
      id: valid.id,
      name: valid.name,
      type: "color",
      valuesByMode: {
        [collection.modes[0].id]: valid.value,
        ...Object.fromEntries(
          collection.modes.slice(1).map((mode) => [mode.id, valid.value]),
        ),
      },
    });
    return withVariablesModel(doc, model);
  }
  const existing = normalizeColorVariables(doc.colorVariables);
  if (existing.some((item) => item.id === valid.id)) {
    throw new Error("color-variable-invalid");
  }
  return { ...doc, colorVariables: [...existing, valid] };
}

export function bindColorVariable(doc, nodeId, variableId, target = "fill") {
  if (hasV2Variables(doc)) {
    if (variableId) {
      const found = findVariable(doc, variableId);
      if (!found || found.variable.type !== "color") {
        throw new Error("color-variable-missing");
      }
    }
    if (!doc.nodes.some((node) => node.id === nodeId)) {
      throw new Error("color-variable-node-missing");
    }
    return bindVariable(doc, nodeId, variableId, target === "stroke" ? "stroke" : "fill");
  }
  const variable = normalizeColorVariables(doc.colorVariables).find(
    (item) => item.id === variableId,
  );
  if (variableId && !variable) throw new Error("color-variable-missing");
  if (!doc.nodes.some((node) => node.id === nodeId)) {
    throw new Error("color-variable-node-missing");
  }
  const isStroke = target === "stroke";
  const propKey = isStroke ? "stroke" : "fill";
  const idKey = isStroke ? "strokeVariableId" : "fillVariableId";
  return {
    ...doc,
    nodes: doc.nodes.map((node) =>
      node.id === nodeId
        ? variable
          ? { ...node, [propKey]: variable.value, [idKey]: variable.id }
          : { ...node, [idKey]: null }
        : node,
    ),
  };
}

export function deleteColorVariable(doc, variableId) {
  if (hasV2Variables(doc)) {
    const found = findVariable(doc, variableId);
    if (!found || found.variable.type !== "color") {
      throw new Error("color-variable-missing");
    }
    return deleteVariable(doc, variableId);
  }
  const variables = normalizeColorVariables(doc.colorVariables);
  if (!variables.some((item) => item.id === variableId)) {
    throw new Error("color-variable-missing");
  }
  return {
    ...doc,
    colorVariables: variables.filter((item) => item.id !== variableId),
    nodes: doc.nodes.map((node) => {
      let updated = node;
      if (node.fillVariableId === variableId) {
        updated = { ...updated, fillVariableId: null };
      }
      if (node.strokeVariableId === variableId) {
        updated = { ...updated, strokeVariableId: null };
      }
      return updated;
    }),
  };
}

export function updateColorVariable(doc, variableId, patch) {
  if (hasV2Variables(doc)) {
    const model = modelOrEmpty(doc);
    const { collection, variable } = requireVariable(model, variableId);
    if (variable.type !== "color") throw new Error("color-variable-missing");
    const nextName =
      patch && typeof patch.name === "string" ? patch.name.trim() : "";
    if (nextName) variable.name = nextName;
    if (patch && patch.value !== undefined) {
      assertVariableValue("color", patch.value);
      const value = normalizeVariableValue("color", patch.value).value;
      const modeId =
        model.activeModeByCollection[collection.id] ?? collection.modes[0].id;
      variable.valuesByMode[modeId] = value;
    }
    if (!nextName && (patch?.value === undefined || !patch)) {
      throw new Error("color-variable-invalid");
    }
    return withVariablesModel(doc, model);
  }
  const variables = normalizeColorVariables(doc.colorVariables);
  const current = variables.find((item) => item.id === variableId);
  if (!current) throw new Error("color-variable-missing");
  const [next] = normalizeColorVariables([{ ...current, ...patch }]);
  if (!next) throw new Error("color-variable-invalid");
  return {
    ...doc,
    colorVariables: variables.map((item) =>
      item.id === variableId ? next : item,
    ),
    nodes: doc.nodes.map((node) => {
      let updated = node;
      if (node.fillVariableId === variableId) {
        updated = { ...updated, fill: next.value };
      }
      if (node.strokeVariableId === variableId) {
        updated = { ...updated, stroke: next.value };
      }
      return updated;
    }),
  };
}

/** Materialized designs keep their selected system palette editable as tokens. */
export function seedDesignSystemColorVariables(doc, system) {
  const colors = system?.tokens?.primitive?.colors;
  if (!colors || !system.id) return doc;
  const variables = Object.entries(colors).map(([name, value]) => ({
    id: `system:${system.id}:${name}`,
    name,
    value,
  }));
  const firstByColor = new Map();
  for (const variable of variables) {
    const color = variable.value.toLowerCase();
    if (!firstByColor.has(color)) firstByColor.set(color, variable);
  }
  return {
    ...doc,
    colorVariables: variables,
    nodes: doc.nodes.map((node) => {
      const matched = firstByColor.get(String(node.fill ?? "").toLowerCase());
      return matched ? { ...node, fillVariableId: matched.id } : node;
    }),
  };
}
