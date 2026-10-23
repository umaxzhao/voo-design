/**
 * Design-system canvas tools: components/instances, named styles and variables.
 *
 * The executors live here so `canvas_tools.js` only extends its schema and
 * executor tables. Everything is committed through the live editor's document
 * API, which keeps a normal tool call to one undo entry.
 */

import { extractComponent } from "../editor/component_extract.js";
import { createCanvasInstanceNode } from "../editor/canvas-composition-nodes.js";
import {
  getStyles,
  createStyle as createStyleInDocument,
  applyStyle as applyStyleInDocument,
} from "../editor/scene_styles.js";
import {
  getVariablesModel,
  migrateColorVariablesV1,
  bindVariable as bindVariableInDocument,
} from "../editor/scene_variables.js";

const TOOL_ERROR = Object.freeze({
  NO_EDITOR: "agentNoEditor",
  NODE_NOT_FOUND: "agentNodeNotFound",
  INVALID_ARGS: "agentInvalidArgs",
});

const STYLE_TYPES = Object.freeze(["paint", "text", "effect"]);
const BINDING_TARGETS = Object.freeze(["fill", "stroke"]);

/** Master documents created through the fallback path, per live editor. */
const componentDocs = new WeakMap();

function invalidArgs() {
  throw Object.assign(new Error(TOOL_ERROR.INVALID_ARGS), {
    code: TOOL_ERROR.INVALID_ARGS,
  });
}

function nodeNotFound() {
  throw Object.assign(new Error(TOOL_ERROR.NODE_NOT_FOUND), {
    code: TOOL_ERROR.NODE_NOT_FOUND,
  });
}

function requireEditor() {
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) {
    throw Object.assign(new Error(TOOL_ERROR.NO_EDITOR), {
      code: TOOL_ERROR.NO_EDITOR,
    });
  }
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

function getNode(editor, layerId) {
  return (
    editor.getNode?.(layerId) ??
    getDocument(editor).nodes.find((node) => node.id === layerId) ??
    null
  );
}

function requireNode(editor, layerId) {
  const node = getNode(editor, layerId);
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
  // Minimal hosts only expose a commit hook and their document object. Apply
  // the replacement in place so the tool still works in that harness.
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

function storeComponent(editor, master) {
  let docs = componentDocs.get(editor);
  if (!docs) {
    docs = new Map();
    componentDocs.set(editor, docs);
  }
  docs.set(master.canvasId, master);
}

function componentRegistry(editor) {
  return componentDocs.get(editor) ?? null;
}

function storeState() {
  if (typeof window === "undefined") return null;
  const store = window.__vooStore;
  if (!store) return null;
  return typeof store.getState === "function" ? store.getState() : store;
}

/** Resolves a component's source document across the engine and the host store. */
function resolveComponentDocument(editor, componentId) {
  const local = componentRegistry(editor)?.get(componentId);
  if (local) return local;
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
  const host = getDocument(editor);
  if (host.components?.[componentId]?.nodes) {
    return host.components[componentId];
  }
  const state = storeState();
  const nodes = state?.nodes ?? [];
  const page = nodes.find(
    (node) =>
      node.id === componentId ||
      node.data?.editorDoc?.canvasId === componentId ||
      node.data?.sceneDoc?.canvasId === componentId,
  );
  return page?.data?.editorDoc ?? page?.data?.sceneDoc ?? null;
}

function normalizeComponentResult(result, fallbackLayerId = null) {
  if (!result) return null;
  const instance = result.instance ?? result.node ?? result;
  const componentId =
    result.componentId ??
    result.master?.canvasId ??
    result.master?.id ??
    result.component?.canvasId ??
    result.sourceCanvasId ??
    null;
  const instanceId =
    result.instanceId ??
    result.layerId ??
    instance?.id ??
    fallbackLayerId ??
    null;
  return {
    ok: true,
    componentId,
    instanceId,
    layerId: instanceId,
  };
}

function createComponent(args = {}) {
  const editor = requireEditor();
  const layerId = requireId(args.layerId);
  const node = requireNode(editor, layerId);
  const name =
    typeof args.name === "string" && args.name.trim()
      ? args.name
      : node.name || "Component";

  if (typeof editor.createComponent === "function") {
    const result = editor.createComponent({ layerId, name });
    const normalized = normalizeComponentResult(result, layerId);
    if (normalized) return normalized;
  }

  const doc = getDocument(editor);
  const result = extractComponent(doc, [layerId], { name });
  const masterId = result.master.canvasId;
  storeComponent(editor, result.master);
  // Keep a local copy with the page so another turn can still resolve it.
  const next = {
    ...result.doc,
    components: { ...(doc.components ?? {}), [masterId]: result.master },
  };
  commitDocument(editor, next, "AI: Create component");
  editor.selectExactly?.([result.instance.id]);
  return {
    ok: true,
    componentId: masterId,
    instanceId: result.instance.id,
    layerId: result.instance.id,
  };
}

function createInstance(args = {}) {
  const editor = requireEditor();
  const componentId = requireId(args.componentId);
  const x = args.x;
  const y = args.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) invalidArgs();

  if (typeof editor.createInstance === "function") {
    const result = editor.createInstance({
      componentId,
      x,
      y,
      width: args.width,
      height: args.height,
      name: args.name,
    });
    const normalized = normalizeComponentResult(result);
    if (normalized) return normalized;
  }

  const source = resolveComponentDocument(editor, componentId);
  const width = Number.isFinite(args.width)
    ? args.width
    : Number.isFinite(source?.width)
      ? source.width
      : 320;
  const height = Number.isFinite(args.height)
    ? args.height
    : Number.isFinite(source?.height)
      ? source.height
      : 180;
  const instance = createCanvasInstanceNode({
    sourceCanvasId: componentId,
    x,
    y,
    width,
    height,
    ...(typeof args.name === "string" && args.name.trim()
      ? { name: args.name }
      : {}),
  });
  const doc = getDocument(editor);
  commitDocument(
    editor,
    { ...doc, nodes: [...doc.nodes, instance] },
    "AI: Create instance",
  );
  editor.selectExactly?.([instance.id]);
  return {
    ok: true,
    componentId,
    instanceId: instance.id,
    layerId: instance.id,
  };
}

function listStyles(args = {}) {
  const editor = requireEditor();
  if (args.type !== undefined && !STYLE_TYPES.includes(args.type)) {
    invalidArgs();
  }
  const library = getStyles(getDocument(editor));
  if (args.type) {
    return { ok: true, type: args.type, styles: library[args.type] };
  }
  return { ok: true, styles: library };
}

function createStyle(args = {}) {
  const editor = requireEditor();
  if (!STYLE_TYPES.includes(args.type)) invalidArgs();
  if (typeof args.name !== "string" || args.name.trim() === "") invalidArgs();
  let fromLayerId = args.fromLayerId ?? args.fromNodeId ?? null;
  if (fromLayerId === null) fromLayerId = editor.getSelectedId?.() ?? null;
  if (fromLayerId !== null) requireNode(editor, requireId(fromLayerId));

  const doc = getDocument(editor);
  const before = new Set(getStyles(doc)[args.type].map((style) => style.id));
  let next;
  try {
    next = createStyleInDocument(doc, {
      type: args.type,
      name: args.name,
      fromNodeId: fromLayerId,
      ...(args.value !== undefined ? { value: args.value } : {}),
    });
  } catch (error) {
    throw Object.assign(new Error(error?.message || TOOL_ERROR.INVALID_ARGS), {
      code: TOOL_ERROR.INVALID_ARGS,
    });
  }
  const created = getStyles(next)[args.type].find(
    (style) => !before.has(style.id),
  );
  commitDocument(editor, next, "AI: Create style");
  return {
    ok: true,
    styleId: created?.id ?? null,
    type: args.type,
    name: created?.name ?? args.name,
    style: created ?? null,
  };
}

function applyStyle(args = {}) {
  const editor = requireEditor();
  const layerId = requireId(args.layerId);
  if (!STYLE_TYPES.includes(args.type)) invalidArgs();
  const styleId = requireId(args.styleId);
  requireNode(editor, layerId);

  const doc = getDocument(editor);
  let next;
  try {
    next = applyStyleInDocument(doc, layerId, args.type, styleId);
  } catch (error) {
    throw Object.assign(new Error(error?.message || TOOL_ERROR.INVALID_ARGS), {
      code: TOOL_ERROR.INVALID_ARGS,
    });
  }
  commitDocument(editor, next, "AI: Apply style");
  return { ok: true, layerId, type: args.type, styleId };
}

function listVariables(args = {}) {
  const editor = requireEditor();
  const doc = migrateColorVariablesV1(getDocument(editor));
  const model = getVariablesModel(doc);
  const collections = model.collections.filter(
    (collection) => !args.collectionId || collection.id === args.collectionId,
  );
  const variables = collections.flatMap((collection) =>
    collection.variables.map((variable) => {
      const modeId =
        model.activeModeByCollection[collection.id] ?? collection.modes[0].id;
      return {
        ...variable,
        collectionId: collection.id,
        collectionName: collection.name,
        modeId,
        value:
          variable.valuesByMode[modeId] ??
          variable.valuesByMode[collection.modes[0].id],
      };
    }),
  );
  return { ok: true, collections, variables };
}

function bindVariable(args = {}) {
  const editor = requireEditor();
  const layerId = requireId(args.layerId);
  const variableId = requireId(args.variableId);
  const target = args.target ?? "fill";
  if (!BINDING_TARGETS.includes(target)) invalidArgs();
  requireNode(editor, layerId);

  const doc = migrateColorVariablesV1(getDocument(editor));
  let next;
  try {
    next = bindVariableInDocument(doc, layerId, variableId, target);
  } catch (error) {
    throw Object.assign(new Error(error?.message || TOOL_ERROR.INVALID_ARGS), {
      code: TOOL_ERROR.INVALID_ARGS,
    });
  }
  commitDocument(editor, next, "AI: Bind variable");
  return { ok: true, layerId, variableId, target };
}

export const DESIGN_TOOL_SCHEMAS = Object.freeze([
  {
    type: "function",
    function: {
      name: "create_component",
      description:
        "Turn a layer into a main component and leave a linked instance in its place.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          name: { type: "string", description: "Optional component name." },
        },
        required: ["layerId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_instance",
      description: "Place an instance of a main component at x/y.",
      parameters: {
        type: "object",
        properties: {
          componentId: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          name: { type: "string" },
        },
        required: ["componentId", "x", "y"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_styles",
      description: "List the document's named paint, text and effect styles.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [...STYLE_TYPES],
            description: "Optional style type to list.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_style",
      description:
        "Create a named style. Capture the value from fromLayerId when supplied.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...STYLE_TYPES] },
          name: { type: "string" },
          fromLayerId: { type: "string" },
        },
        required: ["type", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_style",
      description: "Apply a named style to a layer.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          type: { type: "string", enum: [...STYLE_TYPES] },
          styleId: { type: "string" },
        },
        required: ["layerId", "type", "styleId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_variables",
      description: "List the document's variables, their collections and values.",
      parameters: {
        type: "object",
        properties: {
          collectionId: { type: "string", description: "Optional collection filter." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bind_variable",
      description: "Bind a layer's fill or stroke to a color variable.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          variableId: { type: "string" },
          target: { type: "string", enum: [...BINDING_TARGETS] },
        },
        required: ["layerId", "variableId", "target"],
      },
    },
  },
]);

export const DESIGN_TOOL_EXECUTORS = Object.freeze({
  create_component: createComponent,
  create_instance: createInstance,
  list_styles: listStyles,
  create_style: createStyle,
  apply_style: applyStyle,
  list_variables: listVariables,
  bind_variable: bindVariable,
});
