import { getActiveEditor } from "./browser_import_helpers.js";
import { useDesignStore } from "../../../store/design_store.js";

/**
 * Prepares the target project for browser import.
 * If welcomeOpen is true (user is on welcome dashboard), creates a new project
 * and leaves only the imported nodes without a default blank frame.
 * If in an existing project, returns the existing document and safe non-overlapping placement.
 */
export async function prepareImportTargetProject(title = "Web Page") {
  const isVitest = typeof process !== "undefined" && Boolean(process.env.VITEST);
  const store = useDesignStore.getState();
  const isFromWelcome = isVitest ? false : Boolean(store.welcomeOpen || !store.activeDocumentId);

  if (isFromWelcome) {
    await store.newVooProject({ label: title });
    // Allow React lifecycle and Skia canvas engine to mount
    await new Promise((r) => setTimeout(r, 120));
    const editor = getActiveEditor();
    if (!editor) {
      throw new Error("Canvas editor could not be initialized.");
    }
    // Clear default blank Frame from new project
    const doc = editor.getDocument?.() ?? editor.getDoc?.() ?? { nodes: [] };
    const emptyDoc = { ...doc, nodes: [] };
    if (typeof editor.setDoc === "function") {
      editor.setDoc(emptyDoc, { name: "Clear Default Frame" });
    }
    return { editor, doc: emptyDoc, placement: { x: 80, y: 80 }, isNewProject: true };
  }

  let editor = getActiveEditor();
  if (!editor) {
    await store.newVooProject({ label: title });
    await new Promise((r) => setTimeout(r, 120));
    editor = getActiveEditor();
    if (!editor) {
      throw new Error("Canvas editor could not be initialized.");
    }
  }

  const doc = editor.getDocument?.() ?? editor.getDoc?.() ?? { nodes: [] };
  // Find safe right placement: must be placed to the right of existing top-level content with 80px gap
  let maxRight = 0;
  for (const node of doc.nodes || []) {
    if (!node.parentId) {
      const right = (node.x || 0) + (node.width || 0);
      if (right > maxRight) maxRight = right;
    }
  }
  const placement = { x: maxRight > 0 ? maxRight + 80 : 80, y: 80 };
  return { editor, doc, placement, isNewProject: false };
}
