/**
 * Converts extracted HTML from the browser drawer into VOO canvas nodes
 * and inserts them into the active document with non-overlapping layout.
 */

import { useDesignStore } from "../../../store/design_store.js";

function getActiveEditor() {
  if (typeof window === "undefined") return null;
  return window.__vooEditor || Object.values(window.__vooEditors || {})[0] || null;
}

/**
 * Calculates a non-overlapping coordinate (x, y) to place newly imported content.
 */
function findSafePlacement(doc, width = 800) {
  if (!doc?.nodes || doc.nodes.length === 0) {
    return { x: 80, y: 80 };
  }
  let maxRight = 0;
  let minY = 80;

  for (const node of doc.nodes) {
    if (!node.parentId) {
      const right = (node.x || 0) + (node.width || 0);
      if (right > maxRight) maxRight = right;
    }
  }

  return {
    x: Math.max(80, maxRight + 80),
    y: minY,
  };
}

/**
 * Imports an HTML string or element snapshot into the active VOO canvas.
 *
 * @param {Object} options
 * @param {string} options.html - Raw or styled HTML snippet
 * @param {number} [options.width=1080] - Preferred width
 * @param {number} [options.height=900] - Preferred height
 * @param {string} [options.title="Imported Web Element"] - Layer / Frame label
 * @returns {Promise<{ success: boolean, count?: number, rootId?: string, error?: string }>}
 */
export async function importHtmlSnippetToCanvas({
  html,
  width = 1080,
  height = 900,
  title = "Imported Web Element",
}) {
  if (!html || typeof html !== "string" || !html.trim()) {
    return { success: false, error: "No HTML content provided to import." };
  }

  let editor = getActiveEditor();

  // If no document is open, create a new untitled document first
  if (!editor) {
    const store = useDesignStore.getState();
    await store.newVooProject({ label: title });
    // Allow React lifecycle and Skia canvas engine to mount
    await new Promise((r) => setTimeout(r, 120));
    editor = getActiveEditor();
    if (!editor) {
      return { success: false, error: "Canvas editor could not be initialized." };
    }
  }

  try {
    // Keep fonts and scene engines deferred until an actual import operation.
    const { incrementalHtmlToDocument } = await import("../../editor/html_import.js");
    const parsed = incrementalHtmlToDocument(html, {
      width: Math.max(100, Math.min(3840, width)),
      height: Math.max(100, Math.min(8192, height)),
    });

    if (!parsed?.doc?.nodes || parsed.doc.nodes.length === 0) {
      return { success: false, error: "HTML parser generated 0 canvas nodes." };
    }

    const currentDoc = editor.getDocument?.() ?? editor.getDoc?.();
    if (!currentDoc) {
      return { success: false, error: "Cannot access current canvas document." };
    }

    const existingNodes = currentDoc.nodes || [];
    const placement = findSafePlacement(currentDoc, width);

    // Identify the root imported node (or create an enclosing frame if multiple roots)
    const newNodes = parsed.doc.nodes;
    const rootNodes = newNodes.filter((n) => !n.parentId);

    // Calculate bounding box of the imported root nodes
    let minImportX = Infinity;
    let minImportY = Infinity;
    for (const n of newNodes) {
      if (n.x < minImportX) minImportX = n.x;
      if (n.y < minImportY) minImportY = n.y;
    }
    if (!Number.isFinite(minImportX)) minImportX = 0;
    if (!Number.isFinite(minImportY)) minImportY = 0;

    const deltaX = placement.x - minImportX;
    const deltaY = placement.y - minImportY;

    // Shift all imported nodes to the safe target canvas coordinates
    for (const node of newNodes) {
      node.x = Math.round((node.x || 0) + deltaX);
      node.y = Math.round((node.y || 0) + deltaY);
    }

    // Assign meaningful name to the topmost container
    if (rootNodes.length === 1) {
      rootNodes[0].name = `Web: ${title}`;
    }

    const combinedNodes = [...existingNodes, ...newNodes];
    const nextDoc = {
      ...currentDoc,
      nodes: combinedNodes,
    };

    if (typeof editor.setDoc === "function") {
      editor.setDoc(nextDoc, { name: `Import: ${title}` });
    } else if (typeof editor.setDocument === "function") {
      editor.setDocument(nextDoc, { name: `Import: ${title}` });
    }

    // Select the imported root layer(s)
    const rootIds = rootNodes.map((n) => n.id);
    if (rootIds.length > 0 && typeof editor.selectExactly === "function") {
      editor.selectExactly(rootIds);
    }

    return {
      success: true,
      count: newNodes.length,
      rootId: rootIds[0],
      title,
    };
  } catch (err) {
    console.error("[VOO Browser Import Error]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
