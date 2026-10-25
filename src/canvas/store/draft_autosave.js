/**
 * Draft copies of unsaved documents.
 *
 * An unsaved document (no file path) is mirrored to the local draft store a
 * short while after its last change, so it can be reopened from Recents. The
 * workspace is never written: manual Save stays the only way to create a real
 * .voo file.
 */
import { buildVooFile } from "./project_io.js";
import { encodeVooBinary } from "./voo_binary.js";
import { getRecentFiles } from "./recent_files.js";
import { saveDraftBytes } from "./draft_store.js";

/** Quiet period after the last change before a draft copy is written. */
export const DRAFT_AUTOSAVE_DELAY_MS = 1500;

/** Finds the recent entry of an unsaved document; unsaved entries are unique by name. */
export function findDraftEntry(fileName) {
  if (!fileName) return null;
  return getRecentFiles().find((item) => !item.path && item.name === fileName) || null;
}

/** Serialises the open pages the same way a manual save does, minus preview and engine flush. */
function collectPages(store, enginesRef, snapshotsRef) {
  return (store.nodes || []).map((node) => {
    const entry = enginesRef?.current?.get(node.id);
    let sceneDoc;
    if (entry?.ready && entry.engine) sceneDoc = entry.engine.serialise();
    else if (snapshotsRef?.current?.get(node.id)?.doc) sceneDoc = snapshotsRef.current.get(node.id).doc;
    else sceneDoc = node.data?.editorDoc ?? node.data?.sceneDoc ?? {};
    return {
      id: node.id,
      label: node.data?.label || "Page",
      canvasType: node.data?.canvasType || "design",
      sceneDoc,
      layout: store.editorArtboardLayouts?.[node.id] || null,
    };
  });
}

/**
 * Writes one draft copy for the current document. Returns true when written,
 * false when there is nothing to write (saved document, no recent entry) or
 * the write failed. Never throws.
 */
export async function writeDraftSnapshot({ store, enginesRef, snapshotsRef }) {
  try {
    if (!store || store.filePath || !(store.nodes || []).length) return false;
    const entry = findDraftEntry(store.fileName);
    if (!entry) return false;
    const pages = collectPages(store, enginesRef, snapshotsRef);
    const focusedId = store.editingNodeId;
    const primary = pages.find((page) => page.id === focusedId) || pages[0];
    const document = {
      ...(primary?.sceneDoc || { version: 1, width: 1200, height: 800, nodes: [] }),
      pages,
      editorArtboardLayouts: store.editorArtboardLayouts || {},
      editorCamera: store.editorCamera || { panX: 0, panY: 0, zoom: 1 },
      editingNodeId: focusedId,
    };
    const vooFile = await buildVooFile({ document, kind: "design", version: 2 });
    return await saveDraftBytes(entry.id, encodeVooBinary(vooFile), entry.name);
  } catch (err) {
    console.warn("[VOO] Failed to write draft copy:", err);
    return false;
  }
}

/**
 * Debounced scheduler: every notify() restarts the timer, so the write runs
 * once, DRAFT_AUTOSAVE_DELAY_MS after the last change.
 */
export function createDraftAutosaver({
  write,
  delayMs = DRAFT_AUTOSAVE_DELAY_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let timer = null;
  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  return {
    notify() {
      cancel();
      timer = setTimer(() => {
        timer = null;
        void write();
      }, delayMs);
    },
    cancel,
  };
}
