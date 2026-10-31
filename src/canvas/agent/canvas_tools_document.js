/**
 * Document-level canvas tools: new document creation.
 * Registered by extending CANVAS_TOOL_SCHEMAS / EXECUTORS in canvas_tools.js.
 */

import { useDesignStore } from "../../store/design_store.js";

export const DOCUMENT_TOOL_SCHEMAS = Object.freeze([
  {
    type: "function",
    function: {
      name: "new_document",
      description:
        "Create and open a new blank VOO design document. Fails if the current document has unsaved changes unless force is true.",
      parameters: {
        type: "object",
        properties: {
          width: {
            type: "number",
            description: "Canvas width in pixels (default 1440).",
            default: 1440,
          },
          height: {
            type: "number",
            description: "Canvas height in pixels (default 900).",
            default: 900,
          },
          name: {
            type: "string",
            description: 'Document name (default "Untitled").',
            default: "Untitled",
          },
          force: {
            type: "boolean",
            description:
              "Force creation even if the current document has unsaved changes (default false).",
            default: false,
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resize_document",
      description: "Resize the active canvas document dimensions (width, height in pixels).",
      parameters: {
        type: "object",
        properties: {
          width: { type: "number", description: "New document width in pixels." },
          height: { type: "number", description: "New document height in pixels." },
        },
        required: ["width", "height"],
      },
    },
  },
]);

function isDocumentDirty(store) {
  if (!store) return false;
  if (store.isDirty) return true;

  if (Array.isArray(store.nodes) && store.nodes.length > 0) {
    const hasPageWithLayers = store.nodes.some(
      (node) =>
        Array.isArray(node?.data?.editorDoc?.nodes) &&
        node.data.editorDoc.nodes.length > 0,
    );
    if (hasPageWithLayers) return true;

    const allAreEmptyPages = store.nodes.every(
      (node) =>
        node?.data?.editorDoc &&
        Array.isArray(node.data.editorDoc.nodes) &&
        node.data.editorDoc.nodes.length === 0,
    );
    if (allAreEmptyPages) return false;

    return true;
  }

  return false;
}

export function newDocument(args = {}) {
  const width = args?.width !== undefined ? args.width : 1440;
  const height = args?.height !== undefined ? args.height : 900;
  const name =
    args?.name !== undefined && args?.name !== null && String(args.name).trim() !== ""
      ? String(args.name)
      : "Untitled";
  const force = Boolean(args?.force);

  if (
    typeof width !== "number" ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof height !== "number" ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    return { ok: false, error: "invalid_size" };
  }

  const store = useDesignStore.getState();
  if (!force && isDocumentDirty(store)) {
    return { ok: false, error: "unsaved_changes" };
  }

  store?.newVooProject?.({ label: name, width, height });
  return { ok: true, width, height, name };
}

export function resizeDocument(args = {}) {
  const width = Math.max(1, Number(args.width) || 1440);
  const height = Math.max(1, Number(args.height) || 900);
  const editor = typeof window !== "undefined"
    ? window.__vooEditor || Object.values(window.__vooEditors || {})[0] || null
    : null;
  if (!editor) throw new Error("No active editor");
  if (typeof editor.setDocumentSize === "function") {
    editor.setDocumentSize(width, height);
  } else if (typeof editor.setDoc === "function") {
    const doc = editor.getDocument?.() || editor.getDoc?.() || {};
    editor.setDoc({ ...doc, width, height }, { name: "Resize document" });
  }
  return { ok: true, width, height };
}

export const DOCUMENT_TOOL_EXECUTORS = Object.freeze({
  new_document: newDocument,
  resize_document: resizeDocument,
});
