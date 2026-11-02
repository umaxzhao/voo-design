/** Shared validation, document access, and component catalog helpers. */
import { variantGroupOf } from "../editor/component_variants.js";
import { VARIABLE_BINDINGS } from "../editor/scene_variables.js";

export const TOOL_ERROR = Object.freeze({
  NO_EDITOR: "agentNoEditor",
  NODE_NOT_FOUND: "agentNodeNotFound",
  INVALID_ARGS: "agentInvalidArgs",
  API_MISSING: "agentApiMissing",
});

export const INSTANCE_NODE_KIND = "canvasInstance";

export const INSTANCE_RECORD_FIELDS = Object.freeze([
  "layoutMode",
  "playbackMode",
  "playbackStart",
  "cameraId",
  "poster",
]);
export const BINDING_KEYS = Object.values(VARIABLE_BINDINGS).map((entry) => entry.key);
export function invalidArgs(message) {
  const base = message || TOOL_ERROR.INVALID_ARGS;
  const full = base === TOOL_ERROR.INVALID_ARGS ? base : `${TOOL_ERROR.INVALID_ARGS}: ${base}`;
  throw Object.assign(new Error(full), {
    code: TOOL_ERROR.INVALID_ARGS,
  });
}

export function nodeNotFound(message) {
  throw Object.assign(new Error(message || TOOL_ERROR.NODE_NOT_FOUND), {
    code: TOOL_ERROR.NODE_NOT_FOUND,
  });
}

export function apiMissing(message) {
  throw Object.assign(new Error(message || TOOL_ERROR.API_MISSING), {
    code: TOOL_ERROR.API_MISSING,
  });
}

export function mapEngineError(error, context = "") {
  const detail = error?.message || "invalid value";
  const message = context
    ? `${TOOL_ERROR.INVALID_ARGS}: Invalid argument ${context}: ${detail}`
    : `${TOOL_ERROR.INVALID_ARGS}: ${detail}`;
  throw Object.assign(new Error(message), {
    code: TOOL_ERROR.INVALID_ARGS,
  });
}

export function requireEditor() {
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) throw Object.assign(new Error(TOOL_ERROR.NO_EDITOR), { code: TOOL_ERROR.NO_EDITOR });
  return editor;
}

export function requireId(value, name = "id") {
  if (typeof value !== "string" || value.trim() === "") {
    invalidArgs(`Invalid argument "${name}": expected a non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

export function getDocument(editor) {
  const doc = editor.getDocument?.() ?? editor.getDoc?.() ?? null;
  if (!doc || !Array.isArray(doc.nodes)) {
    invalidArgs("The editor does not expose a document with a nodes array");
  }
  return doc;
}

export function requireNode(editor, layerId) {
  const node =
    editor.getNode?.(layerId) ??
    getDocument(editor).nodes.find((node) => node.id === layerId) ??
    null;
  if (!node) nodeNotFound();
  return node;
}

export function commitDocument(editor, next, message) {
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
  invalidArgs("The editor cannot commit document changes");
}

/** Resolves a main component's document through the editor or the host doc. */
export function resolveComponentDocument(editor, componentId) {
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

export function getDocumentSafe(editor) {
  try {
    return getDocument(editor);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Component variants                                                  */
/* ------------------------------------------------------------------ */

export function componentEntries(editor, extra = null) {
  const entries = new Map();
  const add = (key, document, fallbackName = null) => {
    if (!document || !Array.isArray(document.nodes)) return;
    const componentId = document.canvasId || key;
    if (!componentId) return;
    const existing = entries.get(componentId);
    if (existing && variantGroupOf(existing.document) && !variantGroupOf(document)) return;
    entries.set(componentId, {
      componentId,
      document,
      name: document.name ?? fallbackName ?? componentId,
    });
  };

  const host = getDocumentSafe(editor);
  for (const [key, document] of Object.entries(host?.components ?? {})) {
    add(key, document);
  }
  for (const resolver of ["listComponents", "getComponents"]) {
    if (typeof editor[resolver] !== "function") continue;
    try {
      const result = editor[resolver]();
      const list = Array.isArray(result) ? result : Object.values(result ?? {});
      for (const item of list) add(item?.canvasId ?? item?.id, item?.document ?? item);
    } catch {
      // An engine that cannot enumerate components still resolves by id.
    }
  }
  if (extra?.componentId) add(extra.componentId, extra.document, extra.name);
  return [...entries.values()];
}

export function requireComponent(editor, componentId) {
  const document = resolveComponentDocument(editor, componentId);
  if (!document) apiMissing(`The main component ${componentId} is not available`);
  return document;
}

