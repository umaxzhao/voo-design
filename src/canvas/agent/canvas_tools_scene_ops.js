/**
 * Scene-level canvas tools: boolean operations, layout constraints and layer
 * export. Registered by extending CANVAS_TOOL_SCHEMAS / the executor map in
 * canvas_tools.js.
 */

import { TOOL_ERROR } from "./canvas_tools.js";
import {
  HORIZONTAL_CONSTRAINTS,
  VERTICAL_CONSTRAINTS,
  withConstraints,
  withoutConstraints,
} from "../editor/scene_constraints.js";
import { BOOLEAN_OPERATIONS } from "../editor/scene_model_node_builders.js";

function requireEditor() {
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) throw Object.assign(new Error(TOOL_ERROR.NO_EDITOR), { code: TOOL_ERROR.NO_EDITOR });
  return editor;
}

function getDocument(editor) {
  const doc = editor.getDoc?.() ?? editor.getDocument?.() ?? null;
  if (!doc || !Array.isArray(doc.nodes)) invalidArgs();
  return doc;
}

function invalidArgs(message) {
  throw Object.assign(new Error(message || TOOL_ERROR.INVALID_ARGS), {
    code: TOOL_ERROR.INVALID_ARGS,
  });
}

function nodeNotFound(message) {
  throw Object.assign(new Error(message || TOOL_ERROR.NODE_NOT_FOUND), {
    code: TOOL_ERROR.NODE_NOT_FOUND,
  });
}

function requireLayerIds(value, { min = 1 } = {}) {
  if (!Array.isArray(value) || value.length < min) invalidArgs();
  const ids = [...new Set(value)];
  if (ids.some((id) => typeof id !== "string" || id.trim() === "")) invalidArgs();
  return ids;
}

function requireNode(editor, layerId) {
  const doc = getDocument(editor);
  const node = doc.nodes.find((entry) => entry.id === layerId);
  if (!node) nodeNotFound();
  return node;
}

/** Resolves the selection the tools act on: explicit ids or the current selection. */
function selectionIdsOf(editor, layerIds) {
  if (layerIds != null) return requireLayerIds(layerIds);
  const units = editor.selectionUnits?.() ?? [];
  const ids = units.map((unit) => unit.id).filter(Boolean);
  if (ids.length === 0) invalidArgs("No layers selected; pass layerIds.");
  return ids;
}

function commitDocument(editor, next, message) {
  if (typeof editor.setDoc === "function") {
    editor.setDoc(next, { name: message });
    return;
  }
  invalidArgs();
}

async function booleanCombine(args) {
  const editor = requireEditor();
  const operation = BOOLEAN_OPERATIONS.includes(args.operation)
    ? args.operation
    : null;
  if (!operation) invalidArgs();
  const ids = selectionIdsOf(editor, args.layerIds ?? null);
  if (ids.length === 0) invalidArgs();
  editor.selectExactly?.(ids);
  editor.combineSelected?.(operation);
  const selection = editor.getSelection?.() ?? [];
  return { ok: true, operation, nodeIds: selection };
}

async function setConstraints(args) {
  const editor = requireEditor();
  const { clear = false } = args ?? {};
  const horizontal =
    args.horizontal == null ? null : String(args.horizontal);
  const vertical = args.vertical == null ? null : String(args.vertical);

  if (clear) {
    if (horizontal != null || vertical != null) invalidArgs();
  } else if (
    (horizontal != null && !HORIZONTAL_CONSTRAINTS.includes(horizontal)) ||
    (vertical != null && !VERTICAL_CONSTRAINTS.includes(vertical))
  ) {
    invalidArgs();
  } else if (horizontal == null && vertical == null) {
    invalidArgs("Pass horizontal and/or vertical constraint modes, or clear: true.");
  }

  const ids = selectionIdsOf(editor, args.layerIds ?? null);
  let doc = getDocument(editor);
  let changed = false;
  for (const id of ids) {
    requireNode(editor, id);
    if (clear) {
      const next = withoutConstraints(doc, id);
      if (next !== doc) changed = true;
      doc = next;
    } else {
      const current = doc.nodes.find((node) => node.id === id)?.constraints ?? {};
      const next = withConstraints(doc, id, {
        horizontal: horizontal ?? current.horizontal,
        vertical: vertical ?? current.vertical,
      });
      if (next !== doc) changed = true;
      doc = next;
    }
  }
  if (changed) commitDocument(editor, doc, "agent.constraints");
  return { ok: true, layerIds: ids, cleared: Boolean(clear) };
}

async function exportLayers(args) {
  const editor = requireEditor();
  const ids = selectionIdsOf(editor, args.layerIds ?? null);
  const options = {};
  if (Number.isFinite(Number(args.scale))) options.scale = Number(args.scale);
  const dataUrl =
    ids.length === 1
      ? editor.exportNodePng?.(ids[0], options) ??
        (await editor.exportSelectionPngAsync?.(ids, options))
      : args.async === true
        ? await editor.exportSelectionPngAsync?.(ids, options)
        : editor.exportSelectionPng?.(ids, options);
  if (!dataUrl) nodeNotFound("Selected layers have no renderable raster to export.");
  const match = /^data:(image\/[a-z+]+);base64,/.exec(dataUrl);
  const base64 = dataUrl.slice(match?.[0].length ?? 0);
  const result = {
    ok: true,
    mime: match?.[1] ?? "image/png",
    base64Length: base64.length,
  };
  if (args.includeDataUrl === true) {
    result.dataUrl = dataUrl;
  } else {
    result.preview = base64.slice(0, 64);
  }
  return result;
}

export const SCENE_OPS_TOOL_SCHEMAS = Object.freeze([
  {
    type: "function",
    function: {
      name: "boolean_combine",
      description:
        "Combine layers into a boolean group (union, subtract, intersect or exclude), then select it. " +
        "Without layerIds the current selection is used.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: [...BOOLEAN_OPERATIONS],
            description: "Boolean operation to apply.",
          },
          layerIds: {
            type: "array",
            items: { type: "string" },
            description: "Optional operand layer IDs; defaults to the current selection.",
          },
        },
        required: ["operation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_constraints",
      description:
        "Set or clear layout constraints on layers (how they follow their parent frame when it resizes). " +
        "Only meaningful for children of frames/groups.",
      parameters: {
        type: "object",
        properties: {
          layerIds: {
            type: "array",
            items: { type: "string" },
            description: "Target layer IDs; defaults to the current selection.",
          },
          horizontal: {
            type: "string",
            enum: [...HORIZONTAL_CONSTRAINTS],
            description: "Optional horizontal mode; omitted keeps the existing one.",
          },
          vertical: {
            type: "string",
            enum: [...VERTICAL_CONSTRAINTS],
            description: "Optional vertical mode; omitted keeps the existing one.",
          },
          clear: {
            type: "boolean",
            description: "Remove all constraints from the layers instead of setting them.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "export_layers",
      description:
        "Export layers to a base64 PNG data URL: a single layer rasterized alone, or several " +
        "composited into one image cropped to their union bounds.",
      parameters: {
        type: "object",
        properties: {
          layerIds: {
            type: "array",
            items: { type: "string" },
            description: "Target layer IDs; defaults to the current selection.",
          },
          scale: {
            type: "number",
            description: "Optional export scale multiplier (default 1).",
          },
          includeDataUrl: {
            type: "boolean",
            description: "Return the full data URL instead of a short preview.",
          },
        },
      },
    },
  },
]);

export const SCENE_OPS_TOOL_EXECUTORS = Object.freeze({
  boolean_combine: booleanCombine,
  set_constraints: setConstraints,
  export_layers: exportLayers,
});
