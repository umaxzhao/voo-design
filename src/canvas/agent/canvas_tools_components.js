/** Agent tools: component instances (overrides, swap) and document variables. */

import {
  OVERRIDE_FIELDS,
  clearAllOverrides,
  overridableNodes,
  setNodeOverride,
} from "../editor/instance-overrides.js";
import { wouldCreateCanvasCycle } from "../editor/canvas-instance-graph.js";
import {
  INSTANCE_LAYOUT_MODES,
  INSTANCE_PLAYBACK_MODES,
} from "../editor/canvas-composition-nodes.js";
import {
  VARIABLE_BINDINGS,
  VARIABLE_TYPES,
  addCollection,
  addMode,
  addVariable,
  findVariable,
  getVariablesModel,
  migrateColorVariablesV1,
  setActiveCollectionMode,
  setVariableValue,
} from "../editor/scene_variables.js";

const TOOL_ERROR = Object.freeze({
  NO_EDITOR: "agentNoEditor",
  NODE_NOT_FOUND: "agentNodeNotFound",
  INVALID_ARGS: "agentInvalidArgs",
  API_MISSING: "agentApiMissing",
});

const INSTANCE_NODE_KIND = "canvasInstance";
const INSTANCE_RECORD_FIELDS = Object.freeze([
  "layoutMode",
  "playbackMode",
  "playbackStart",
  "cameraId",
  "poster",
]);
const BINDING_KEYS = Object.values(VARIABLE_BINDINGS).map((entry) => entry.key);

function invalidArgs(message) {
  const base = message || TOOL_ERROR.INVALID_ARGS;
  const full = base === TOOL_ERROR.INVALID_ARGS ? base : `${TOOL_ERROR.INVALID_ARGS}: ${base}`;
  throw Object.assign(new Error(full), {
    code: TOOL_ERROR.INVALID_ARGS,
  });
}

function nodeNotFound(message) {
  throw Object.assign(new Error(message || TOOL_ERROR.NODE_NOT_FOUND), {
    code: TOOL_ERROR.NODE_NOT_FOUND,
  });
}

function apiMissing(message) {
  throw Object.assign(new Error(message || TOOL_ERROR.API_MISSING), {
    code: TOOL_ERROR.API_MISSING,
  });
}

function mapEngineError(error) {
  throw Object.assign(new Error(error?.message || TOOL_ERROR.INVALID_ARGS), {
    code: TOOL_ERROR.INVALID_ARGS,
  });
}

function requireEditor() {
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) throw Object.assign(new Error(TOOL_ERROR.NO_EDITOR), { code: TOOL_ERROR.NO_EDITOR });
  return editor;
}

function requireId(value) {
  if (typeof value !== "string" || value.trim() === "") invalidArgs();
  return value;
}

function getDocument(editor) {
  const doc = editor.getDocument?.() ?? editor.getDoc?.() ?? null;
  if (!doc || !Array.isArray(doc.nodes)) invalidArgs();
  return doc;
}

function requireNode(editor, layerId) {
  const node =
    editor.getNode?.(layerId) ??
    getDocument(editor).nodes.find((node) => node.id === layerId) ??
    null;
  if (!node) nodeNotFound();
  return node;
}

function commitDocument(editor, next, message) {
  if (typeof editor.setDoc === "function") {
    editor.setDoc(next, { name: message });
    return true;
  }
  if (typeof editor.updateDocument === "function") {
    editor.updateDocument(next, { name: message });
    return true;
  }
  if (typeof editor.setDocument === "function") {
    editor.setDocument(next, { name: message });
    return true;
  }
  if (typeof editor.applyDocument === "function") {
    editor.applyDocument(next, { name: message });
    return true;
  }
  const current = editor.getDocument?.() ?? editor.getDoc?.() ?? null;
  if (current && typeof current === "object") {
    for (const [key, value] of Object.entries(next)) current[key] = value;
    if (typeof editor.commitEditorDocument === "function") {
      editor.commitEditorDocument({ message });
    }
    editor.requestRender?.();
    return true;
  }
  invalidArgs();
}

/** Resolves a main component's document through the editor or the host doc. */
function resolveComponentDocument(editor, componentId) {
  for (const name of [
    "getComponentDoc",
    "resolveComponent",
    "resolveCanvas",
    "getCanvas",
  ]) {
    if (typeof editor[name] !== "function") continue;
    try {
      const doc = editor[name](componentId);
      if (doc?.nodes) return doc;
    } catch {
      // A missing resolver entry is not an error; try the next source.
    }
  }
  const host = getDocumentSafe(editor) ?? null;
  if (host?.components?.[componentId]?.nodes) return host.components[componentId];
  if (host && host.canvasId === componentId) return host;
  return null;
}

function getDocumentSafe(editor) {
  try {
    return getDocument(editor);
  } catch {
    return null;
  }
}

function requireInstance(editor, instanceId) {
  const node = requireNode(editor, instanceId);
  if (node.kind !== INSTANCE_NODE_KIND) {
    invalidArgs(`${instanceId} is not a component instance`);
  }
  return node;
}

function replaceInstanceNode(doc, instanceId, patch) {
  return {
    ...doc,
    nodes: doc.nodes.map((node) =>
      node.id === instanceId ? { ...node, ...patch } : node,
    ),
  };
}

/** Engine-provided instance override/swap methods take precedence, when wired. */
function normalizeInstanceResult(result, instanceId) {
  if (!result) return null;
  if (result === true || typeof result !== "object") {
    return { ok: true, instanceId, layerId: instanceId };
  }
  const id = result.instanceId ?? result.id ?? instanceId;
  return { ok: true, instanceId: id, layerId: id };
}

function setInstanceOverride(args = {}) {
  const editor = requireEditor();
  const instanceId = requireId(args.instanceId);
  const patch = args.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) invalidArgs(`Invalid argument "patch": expected a plain object, got ${JSON.stringify(patch)}`);
  const keys = Object.keys(patch);
  if (keys.length === 0) invalidArgs(`Invalid argument "patch": expected a non-empty object`);
  const instance = requireInstance(editor, instanceId);

  if (typeof editor.setInstanceOverride === "function") {
    try {
      const result = editor.setInstanceOverride({
        instanceId,
        childId: args.childId ?? null,
        patch,
      });
      const normalized = normalizeInstanceResult(result, instanceId);
      if (normalized) return normalized;
    } catch (error) {
      mapEngineError(error);
    }
  }

  const childId = args.childId === undefined || args.childId === null
    ? null
    : requireId(args.childId);
  const doc = getDocument(editor);
  let targetChildId = childId;
  let next;

  if (childId || keys.every((key) => OVERRIDE_FIELDS.includes(key))) {
    if (!childId) {
      // A single overridable layer is unambiguous; otherwise the agent must
      // name the component layer the patch belongs to.
      const master = resolveComponentDocument(editor, instance.sourceCanvasId);
      const target = master ? overridableNodes(master) : [];
      if (target.length !== 1) {
        invalidArgs(`Invalid argument "childId": required to override a component layer`);
      }
      targetChildId = target[0].node.id;
    } else {
      const master = resolveComponentDocument(editor, instance.sourceCanvasId);
      if (master && !master.nodes.some((node) => node.id === childId)) {
        nodeNotFound(childId);
      }
    }
    let overrides;
    try {
      overrides = setNodeOverride(instance.instance ?? {}, targetChildId, patch);
    } catch (error) {
      mapEngineError(error);
    }
    next = replaceInstanceNode(doc, instanceId, { instance: overrides });
  } else {
    if (!keys.every((key) => INSTANCE_RECORD_FIELDS.includes(key))) {
      invalidArgs(`Invalid argument "patch": expected keys within ${INSTANCE_RECORD_FIELDS.join(", ")}, got ${keys.join(", ")}`);
    }
    for (const key of keys) {
      const value = patch[key];
      if (key === "layoutMode" && !INSTANCE_LAYOUT_MODES.includes(value)) {
        invalidArgs(`Invalid argument "patch.layoutMode": expected one of ${INSTANCE_LAYOUT_MODES.join(", ")}, got ${JSON.stringify(value)}`);
      }
      if (key === "playbackMode" && !INSTANCE_PLAYBACK_MODES.includes(value)) {
        invalidArgs(`Invalid argument "patch.playbackMode": expected one of ${INSTANCE_PLAYBACK_MODES.join(", ")}, got ${JSON.stringify(value)}`);
      }
      if (key === "playbackStart" && !Number.isFinite(value)) invalidArgs(`Invalid argument "patch.playbackStart": expected a finite number, got ${JSON.stringify(value)}`);
      if (key !== "playbackStart" && typeof value !== "string" && value !== null) {
        invalidArgs();
      }
    }
    const record = { ...(instance.instance ?? {}), ...patch };
    next = replaceInstanceNode(doc, instanceId, { instance: record });
  }

  commitDocument(editor, next, "AI: Set instance override");
  return {
    ok: true,
    instanceId,
    layerId: instanceId,
    childId: targetChildId,
  };
}

function resetInstanceOverrides(args = {}) {
  const editor = requireEditor();
  const instanceId = requireId(args.instanceId);
  const instance = requireInstance(editor, instanceId);

  if (typeof editor.resetInstanceOverrides === "function") {
    try {
      const result = editor.resetInstanceOverrides(instanceId);
      const normalized = normalizeInstanceResult(result, instanceId);
      if (normalized) return normalized;
    } catch (error) {
      mapEngineError(error);
    }
  }

  const doc = getDocument(editor);
  // Overrides live on the instance record; its view/camera fields are kept.
  const record = clearAllOverrides(instance.instance ?? {});
  const next = {
    ...doc,
    nodes: doc.nodes.map((node) =>
      node.id === instanceId ? { ...node, instance: record } : node,
    ),
  };
  commitDocument(editor, next, "AI: Reset instance overrides");
  return { ok: true, instanceId, layerId: instanceId };
}

function swapInstance(args = {}) {
  const editor = requireEditor();
  const instanceId = requireId(args.instanceId);
  const componentId = requireId(args.componentId);
  const instance = requireInstance(editor, instanceId);

  if (typeof editor.swapInstance === "function") {
    try {
      const result = editor.swapInstance(instanceId, componentId);
      const normalized = normalizeInstanceResult(result, instanceId);
      if (normalized) return { ...normalized, componentId };
    } catch (error) {
      mapEngineError(error);
    }
  }

  const doc = getDocument(editor);
  if (instance.sourceCanvasId === componentId) {
    invalidArgs("The instance already uses this component");
  }
  const resolveCanvas = (id) => resolveComponentDocument(editor, id);
  if (wouldCreateCanvasCycle(doc.canvasId, componentId, resolveCanvas)) {
    invalidArgs("Swapping to this component would create a canvas cycle");
  }
  const master = resolveComponentDocument(editor, componentId);
  if (!master) {
    apiMissing(`The main component ${componentId} is not available`);
  }

  // Overrides pointed at the old master's layer ids, so they start over;
  // the instance's view/camera fields are kept.
  const record = clearAllOverrides(instance.instance ?? {});
  const next = replaceInstanceNode(doc, instanceId, {
    sourceCanvasId: componentId,
    instance: record,
  });
  commitDocument(editor, next, "AI: Swap instance");
  return {
    ok: true,
    instanceId,
    layerId: instanceId,
    componentId,
    previousComponentId: instance.sourceCanvasId,
  };
}

/* ------------------------------------------------------------------ */
/* Variables                                                           */
/* ------------------------------------------------------------------ */

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
    invalidArgs();
  });
}

function requireVariableCollection(model, collectionId) {
  const collection = model.collections.find(
    (candidate) => candidate.id === collectionId,
  );
  if (!collection) invalidArgs(`No variable collection ${collectionId}`);
  return collection;
}

function createVariableCollection(args = {}) {
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

function addVariableMode(args = {}) {
  const editor = requireEditor();
  const collectionId = requireId(args.collectionId);
  const name = args.name;
  if (name !== undefined && typeof name !== "string") invalidArgs(`Invalid argument "name": expected a string, got ${JSON.stringify(name)}`);

  const doc = variableDoc(editor);
  let next;
  try {
    next = addMode(doc, collectionId, typeof name === "string" ? { name } : {});
  } catch (error) {
    mapEngineError(error);
  }
  const collection = requireVariableCollection(
    getVariablesModel(next),
    collectionId,
  );
  const mode = collection.modes[collection.modes.length - 1];
  commitDocument(editor, next, "AI: Add variable mode");
  return { ok: true, collectionId, modeId: mode.id, modeName: mode.name };
}

function createVariable(args = {}) {
  const editor = requireEditor();
  const collectionId = requireId(args.collectionId);
  if (!VARIABLE_TYPES.includes(args.type)) invalidArgs();
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
    mapEngineError(error);
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

function setVariableValueTool(args = {}) {
  const editor = requireEditor();
  const variableId = requireId(args.variableId);
  if (args.modeId !== undefined && typeof args.modeId !== "string") invalidArgs(`Invalid argument "modeId": expected a string, got ${JSON.stringify(args.modeId)}`);
  if (args.value === undefined || args.value === null) invalidArgs(`Invalid argument "value": expected a non-null value`);

  const doc = variableDoc(editor);
  let next;
  try {
    next = setVariableValue(doc, variableId, args.modeId, args.value);
  } catch (error) {
    mapEngineError(error);
  }
  commitDocument(editor, next, "AI: Set variable value");
  return { ok: true, variableId, modeId: args.modeId ?? null, value: args.value };
}

function setActiveMode(args = {}) {
  const editor = requireEditor();
  const modeId = requireId(args.modeId);
  const doc = variableDoc(editor);
  let collectionId = null;
  let layerId = null;

  if (args.layerId === undefined && args.collectionId === undefined) {
    invalidArgs(`Invalid arguments: "layerId" or "collectionId" is required`);
  }
  if (args.collectionId !== undefined) {
    if (args.layerId !== undefined) invalidArgs();
    collectionId = requireId(args.collectionId);
    requireVariableCollection(getVariablesModel(doc), collectionId);
  } else {
    // No collection given: switch the mode of the collection that this
    // layer's bound variable lives in (fill/stroke/opacity/... binding).
    layerId = requireId(args.layerId);
    const node = requireNode(editor, layerId);
    const boundId = BINDING_KEYS.map((key) => node[key]).find(Boolean);
    if (!boundId) {
      invalidArgs(`${layerId} is not bound to a variable`);
    }
    const found = findVariable(doc, boundId);
    if (!found) invalidArgs();
    collectionId = found.collection.id;
  }

  let next;
  try {
    next = setActiveCollectionMode(doc, collectionId, modeId);
  } catch (error) {
    mapEngineError(error);
  }
  commitDocument(editor, next, "AI: Set active variable mode");
  return {
    ok: true,
    collectionId,
    modeId,
    ...(layerId ? { layerId } : {}),
  };
}

export const COMPONENT_TOOL_SCHEMAS = Object.freeze([
  {
    type: "function",
    function: {
      name: "set_instance_override",
      description:
        "Override part of a component instance. With childId, patch overrides a component layer " +
        "(text, fill, visible). Without childId, patch adjusts the instance's own record " +
        "(layoutMode, playbackMode, playbackStart, cameraId, poster).",
      parameters: {
        type: "object",
        properties: {
          instanceId: { type: "string" },
          childId: {
            type: "string",
            description: "Optional layer id inside the component.",
          },
          patch: { type: "object" },
        },
        required: ["instanceId", "patch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reset_instance_overrides",
      description: "Clear every layer override of a component instance.",
      parameters: {
        type: "object",
        properties: { instanceId: { type: "string" } },
        required: ["instanceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "swap_instance",
      description:
        "Point an existing component instance at a different main component. Keeps its box, " +
        "resets layer overrides.",
      parameters: {
        type: "object",
        properties: {
          instanceId: { type: "string" },
          componentId: { type: "string" },
        },
        required: ["instanceId", "componentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_variable_collection",
      description: "Create a variable collection with an optional list of extra modes.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          modes: {
            type: "array",
            items: { type: "string" },
            description: "Optional additional mode names.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_variable_mode",
      description: "Add a mode to a variable collection; values are copied from the default mode.",
      parameters: {
        type: "object",
        properties: {
          collectionId: { type: "string" },
          name: { type: "string" },
        },
        required: ["collectionId", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_variable",
      description:
        "Create a typed variable (color, number, string, boolean) in a collection. " +
        "valuesByMode maps mode ids to values; missing modes fall back to the default mode's value.",
      parameters: {
        type: "object",
        properties: {
          collectionId: { type: "string" },
          type: { type: "string", enum: [...VARIABLE_TYPES], description: "Variable type: one of color, number, string, boolean (VARIABLE_TYPES)." },
          name: { type: "string" },
          valuesByMode: { type: "object" },
        },
        required: ["collectionId", "type", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_variable_value",
      description: "Set a variable's value for one mode (default mode when modeId is omitted).",
      parameters: {
        type: "object",
        properties: {
          variableId: { type: "string" },
          modeId: { type: "string" },
          value: {},
        },
        required: ["variableId", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_active_mode",
      description:
        "Switch a collection's active mode and re-resolve bound properties. " +
        "Give collectionId, or layerId to switch the collection the layer's bound variable belongs to.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          collectionId: { type: "string" },
          modeId: { type: "string" },
        },
        required: ["modeId"],
      },
    },
  },
]);

export const COMPONENT_TOOL_EXECUTORS = Object.freeze({
  set_instance_override: setInstanceOverride,
  reset_instance_overrides: resetInstanceOverrides,
  swap_instance: swapInstance,
  create_variable_collection: createVariableCollection,
  add_variable_mode: addVariableMode,
  create_variable: createVariable,
  set_variable_value: setVariableValueTool,
  set_active_mode: setActiveMode,
});
