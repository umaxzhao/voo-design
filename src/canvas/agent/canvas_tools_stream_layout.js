/**
 * Bidirectional streaming layout channel for VOO Design.
 *
 * Allows agents (local CLIs like Claude Code, Codex, DeepSeek Harness, or built-in agents)
 * to stream designs incrementally onto the canvas with real-time visual feedback,
 * auto-closing tolerant HTML parsing, staggered animation, and animated agent cursor.
 */

import { canStreamNatively, clearNativeLayoutStream, streamNativeLayout } from "./native-layout-stream.js";
import { incrementalHtmlToDocument } from "../editor/html_import.js";
import { useDesignStore } from "../../store/design_store.js";

export const STREAM_LAYOUT_SCHEMA = {
  type: "function",
  function: {
    name: "stream_layout",
    description:
      "Stream an incremental HTML/layout snippet onto the active canvas with live progressive rendering and animated agent cursor. Pass final: true when the generation is complete to commit it as editable canvas layers.",
    parameters: {
      type: "object",
      properties: {
        html: {
          type: "string",
          description: "The full HTML string or accumulated snippet so far.",
        },
        chunk: {
          type: "string",
          description: "Optional delta text/chunk to append to the active stream buffer.",
        },
        final: {
          type: "boolean",
          description: "Whether this chunk completes the generation and should commit native layers.",
        },
        clear: {
          type: "boolean",
          description: "Clear the active streaming preview without committing any layers.",
        },
        frameId: {
          type: "string",
          description: "Optional target page or frame node ID to place elements into.",
        },
      },
    },
  },
};

let streamBuffer = "";
let currentTargetId = null;
let streamDocumentId = null;

export function getStreamBuffer() {
  return streamBuffer;
}

export function resetStreamBuffer() {
  streamBuffer = "";
  currentTargetId = null;
  streamDocumentId = null;
}

/**
 * Execute incremental layout stream updates.
 */
export async function streamLayout(args = {}, context = {}) {
  context.signal?.throwIfAborted();

  const store = (typeof window !== "undefined" && window.__vooStoreApi)
    ? window.__vooStoreApi
    : useDesignStore;

  if (args.clear) {
    await clearNativeLayoutStream();
    resetStreamBuffer();
    store.getState().setStreamingPreview?.(null);
    return { status: "cleared" };
  }

  const documentId = store.getState().activeDocumentId;
  if (streamDocumentId && streamDocumentId !== documentId) {
    throw new DOMException("Stream document changed; clear the previous stream before restarting", "AbortError");
  }
  if (typeof args.chunk === "string" || typeof args.html === "string") streamDocumentId = documentId;

  if (typeof args.chunk === "string") {
    streamBuffer += args.chunk;
  } else if (typeof args.html === "string") {
    streamBuffer = args.html;
  }

  if (args.frameId) {
    currentTargetId = args.frameId;
  }

  const content = streamBuffer;
  const isFinal = Boolean(args.final);

  const editor = context.editor || (typeof window !== "undefined" ? window.__vooEditor : null);
  if (content && canStreamNatively(editor)) {
    store.getState().setStreamingPreview?.(null);
    try {
      return await streamNativeLayout(content, { editor, targetId: currentTargetId, store, signal: context.signal, final: isFinal });
    } finally { if (isFinal) resetStreamBuffer(); }
  }

  if (!isFinal) {
    if (content) {
      store.getState().setStreamingPreview?.(content, currentTargetId);
    }
    return {
      status: "streaming",
      length: content.length,
      preview: true,
    };
  }

  // Final commit: parse accumulated layout and commit to editor
  return commitStreamedLayout(content, {
    editor,
    targetNodeId: currentTargetId,
    store,
  });
}

/**
 * Commit streamed layout into native canvas layers.
 */
export function commitStreamedLayout(content, { editor, targetNodeId, store = useDesignStore } = {}) {
  if (!content || !content.trim()) {
    resetStreamBuffer();
    store.getState().setStreamingPreview?.(null);
    return { status: "empty", nodeCount: 0 };
  }

  let nodeCount = 0;
  let createdNodes = [];

  const targetDoc = editor?.getDocument?.() || editor?.getDoc?.() || null;
  const width = targetDoc?.width || 1440;
  const height = targetDoc?.height || 900;

  try {
    const parsed = incrementalHtmlToDocument(content, { width, height });
    createdNodes = parsed?.doc?.nodes || [];
    nodeCount = createdNodes.length;

    if (editor && createdNodes.length > 0) {
      const currentDoc = targetDoc || { nodes: [] };
      const existingNodes = Array.isArray(currentDoc.nodes) ? currentDoc.nodes : [];

      if (targetNodeId && existingNodes.some((n) => n.id === targetNodeId)) {
        createdNodes.forEach((node) => {
          if (!node.parentId) node.parentId = targetNodeId;
        });
      }

      const nextNodes = existingNodes.length === 0
        ? createdNodes
        : [...existingNodes, ...createdNodes];

      const nextDoc = {
        ...currentDoc,
        nodes: nextNodes,
      };

      if (typeof editor.setDoc === "function") {
        editor.setDoc(nextDoc, { name: "AI: Stream layout" });
      } else if (typeof editor.commitEditorDocument === "function") {
        editor.commitEditorDocument("AI: Stream layout", () => nextDoc);
      }
      editor.requestRender?.();
    }
  } finally {
    resetStreamBuffer();
    store.getState().setStreamingPreview?.(null);
  }

  return {
    status: "committed",
    nodeCount,
    final: true,
  };
}
