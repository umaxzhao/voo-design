/** Document variable tools. */
import { VARIABLE_TYPES, addCollection, addMode, addVariable, findVariable, getVariablesModel, migrateColorVariablesV1, setActiveCollectionMode, setVariableValue } from "../editor/scene_variables.js";
import { invalidArgs, mapEngineError, requireEditor, requireId, requireNode, getDocument, commitDocument, BINDING_KEYS } from "./canvas_tools_component_shared.js";

function variableDoc(editor) {
  return migrateColorVariablesV1(getDocument(editor));
}

function normalizeModeSpecs(modes) {
  if (modes === undefined || modes === null) return [];
  if (!Array.isArray(modes)) invalidArgs(`Invalid argument "modes": expected an array, got ${JSON.stringify(modes)}`);
  return modes.map((mode) => {
    if (typeof mode === "string") return { name: mode };
    if (mode && typeof mode === "object" && !Array.isArray(mode)) {
      if (mode.id !== undefined && typeof mode.id !== "string") invalidArgs(`Invalid argument "modes[].id": expected a string, got ${JSON.stringify(mode.id)}`);
      if (mode.name !== undefined && typeof mode.name !== "string") invalidArgs(`Invalid argument "modes[].name": expected a string, got ${JSON.stringify(mode.name)}`);
      return mode;
    }
    invalidArgs(`Invalid argument "modes[]": expected a mode name string or an object with id/name, got ${JSON.stringify(mode)}`);
  });
}

function requireVariableCollection(model, collectionId) {
  const collection = model.collections.find(
    (candidate) => candidate.id === collectionId,
  );
  if (!collection) {
    invalidArgs(`Invalid argument "collectionId": no variable collection ${JSON.stringify(collectionId)}`);
  }
  return collection;
}

export function createVariableCollection(args = {}) {
  const editor = requireEditor();
  if (typeof args.name !== "string" || args.name.trim() === "") invalidArgs(`Invalid argument "name": expected a non-empty string, got ${JSON.stringify(args.name)}`);
  const modeSpecs = normalizeModeSpecs(args.modes);

  const doc = variableDoc(editor);
  const before = new Set(
    getVariablesModel(doc).collections.map((collection) => collection.id),
  );
  let next = addCollection(doc, { name: args.name });
  const model = getVariablesModel(next);
  const collection = model.collections.find(
    (candidate) => !before.has(candidate.id),
  );
  if (!collection) invalidArgs("Failed to create the variable collection");
  for (const modeSpec of modeSpecs) {
    next = addMode(next, collection.id, modeSpec);
  }
  commitDocument(editor, next, "AI: Create variable collection");
  const committed = getVariablesModel(next).collections.find(
    (candidate) => candidate.id === collection.id,
  );
  return {
    ok: true,
    collectionId: collection.id,
    name: committed?.name ?? args.name,
    modes: committed?.modes ?? collection.modes,
  };
}

export function addVariableMode(args = {}) {
  const editor = requireEditor();
  const collectionId = requireId(args.collectionId, "collectionId");
  const name = args.name;
  if (name !== undefined && typeof name !== "string") {
    invalidArgs(`Invalid argument "name": expected a string, got ${JSON.stringify(name)}`);
  }

  const doc = variableDoc(editor);
  let next;
  try {
    next = addMode(doc, collectionId, typeof name === "string" ? { name } : {});
  } catch (error) {
    mapEngineError(error, '"collectionId"/"name"');
  }
  const collection = requireVariableCollection(
    getVariablesModel(next),
    collectionId,
  );
  const mode = collection.modes[collection.modes.length - 1];
  commitDocument(editor, next, "AI: Add variable mode");
  return { ok: true, collectionId, modeId: mode.id, modeName: mode.name };
}

export function createVariable(args = {}) {
  const editor = requireEditor();
  const collectionId = requireId(args.collectionId, "collectionId");
  if (!VARIABLE_TYPES.includes(args.type)) {
    invalidArgs(`Invalid argument "type": expected one of ${VARIABLE_TYPES.join(", ")}, got ${JSON.stringify(args.type)}`);
  }
  if (typeof args.name !== "string" || args.name.trim() === "") invalidArgs(`Invalid argument "name": expected a non-empty string, got ${JSON.stringify(args.name)}`);
  if (args.valuesByMode !== undefined) {
    if (!args.valuesByMode || typeof args.valuesByMode !== "object" ||
        Array.isArray(args.valuesByMode)) {
      invalidArgs(`Invalid argument "valuesByMode": expected a plain object, got ${JSON.stringify(args.valuesByMode)}`);
    }
  }

  const doc = variableDoc(editor);
  const before = new Set(
    getVariablesModel(doc).collections.flatMap((collection) =>
      collection.variables.map((variable) => variable.id),
    ),
  );
  let next;
  try {
    next = addVariable(doc, collectionId, {
      name: args.name,
      type: args.type,
      value: args.value,
      valuesByMode: args.valuesByMode,
    });
  } catch (error) {
    mapEngineError(error, '"collectionId"/"type"/"name"/"valuesByMode"/"value"');
  }
  const variable = getVariablesModel(next)
    .collections.flatMap((collection) => collection.variables)
    .find((candidate) => !before.has(candidate.id));
  if (!variable) invalidArgs("Failed to create the variable");
  commitDocument(editor, next, "AI: Create variable");
  return {
    ok: true,
    variableId: variable.id,
    collectionId,
    type: args.type,
    name: variable.name,
    valuesByMode: variable.valuesByMode,
  };
}

export function setVariableValueTool(args = {}) {
  const editor = requireEditor();
  const variableId = requireId(args.variableId, "variableId");
  if (args.modeId !== undefined && typeof args.modeId !== "string") invalidArgs(`Invalid argument "modeId": expected a string, got ${JSON.stringify(args.modeId)}`);
  if (args.value === undefined || args.value === null) invalidArgs(`Invalid argument "value": expected a non-null value`);

  const doc = variableDoc(editor);
  let next;
  try {
    next = setVariableValue(doc, variableId, args.modeId, args.value);
  } catch (error) {
    mapEngineError(error, '"variableId"/"modeId"/"value"');
  }
  commitDocument(editor, next, "AI: Set variable value");
  return { ok: true, variableId, modeId: args.modeId ?? null, value: args.value };
}

export function setActiveMode(args = {}) {
  const editor = requireEditor();
  const modeId = requireId(args.modeId, "modeId");
  const doc = variableDoc(editor);
  let collectionId = null;
  let layerId = null;

  if (args.layerId === undefined && args.collectionId === undefined) {
    invalidArgs(`Invalid arguments: "layerId" or "collectionId" is required`);
  }
  if (args.collectionId !== undefined) {
    if (args.layerId !== undefined) {
      invalidArgs('Invalid arguments: give either "collectionId" or "layerId", not both');
    }
    collectionId = requireId(args.collectionId, "collectionId");
    requireVariableCollection(getVariablesModel(doc), collectionId);
  } else {
    // No collection given: switch the mode of the collection that this
    // layer's bound variable lives in (fill/stroke/opacity/... binding).
    layerId = requireId(args.layerId, "layerId");
    const node = requireNode(editor, layerId);
    const boundId = BINDING_KEYS.map((key) => node[key]).find(Boolean);
    if (!boundId) {
      invalidArgs(`Invalid argument "layerId": layer ${JSON.stringify(layerId)} is not bound to a variable`);
    }
    const found = findVariable(doc, boundId);
    if (!found) {
      invalidArgs(`Invalid argument "layerId": layer ${JSON.stringify(layerId)} is bound to unknown variable ${JSON.stringify(boundId)}`);
    }
    collectionId = found.collection.id;
  }

  let next;
  try {
    next = setActiveCollectionMode(doc, collectionId, modeId);
  } catch (error) {
    mapEngineError(error, '"collectionId"/"layerId"/"modeId"');
  }
  commitDocument(editor, next, "AI: Set active variable mode");
  return {
    ok: true,
    collectionId,
    modeId,
    ...(layerId ? { layerId } : {}),
  };
}

