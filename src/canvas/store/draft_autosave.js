/**
 * Draft copies of unsaved documents.
 *
 * An unsaved document (no file path) is mirrored to the local draft store a
 * short while after its last change, so it can be reopened from Recents. The
 * workspace is never written: manual Save stays the only way to create a real
 * .voo file.
 */
import { buildVooFile } from "./project_io.js";
import { createVooBackgroundClient } from "./voo-background-client.js";
import { findDraftEntry } from "./draft-entry.js";
export { findDraftEntry } from "./draft-entry.js";
import { saveDraftBytes } from "./draft_store.js";
import { captureLiveProjectCover } from "../previews/live-project-cover.js";

/** Quiet period after the last change before a draft copy is written. */
export const DRAFT_AUTOSAVE_DELAY_MS = 1500;

let backgroundClient;
let queuedWrite = Promise.resolve();
const background = () => backgroundClient ??= createVooBackgroundClient();

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
export async function writeDraftSnapshot({ store, enginesRef, snapshotsRef, signal }) {
  try {
    signal?.throwIfAborted();
    if (!store || store.filePath || !(store.nodes || []).length) return false;
    const entry = findDraftEntry(store.fileName);
    if (!entry) return false;
    const pages = collectPages(store, enginesRef, snapshotsRef);
    const focusedId = store.editingNodeId;
    const primary = pages.find((page) => page.id === focusedId) || pages[0];
    const document = {
      ...(primary?.sceneDoc || { version: 1, width: 1200, height: 800, nodes: [] }),
      pages,
      canvasBackgroundColor: store.canvasBackgroundColor,
      editorArtboardLayouts: store.editorArtboardLayouts || {},
      editorCamera: store.editorCamera || { panX: 0, panY: 0, zoom: 1 },
      editingNodeId: focusedId,
    };
    let preview = null;
    try {
      const primaryEntry = enginesRef?.current?.get(primary?.id);
      preview = captureLiveProjectCover(primaryEntry?.ready ? primaryEntry.engine : null);
    } catch (error) {
      console.warn("[VOO] Live draft cover unavailable; using portable cover:", error);
    }
    // Capture canonical pages before yielding: later edits must not change an
    // already requested snapshot. Serialize background jobs and their IDB writes
    // together so an older completion cannot overwrite a newer draft.
    const write = async () => {
      signal?.throwIfAborted();
      const vooFile = await buildVooFile({ document, kind: "design", version: 2, preview });
      signal?.throwIfAborted();
      try {
        if (!preview) {
          const { rasterizeProjectCover } = await import("../previews/project_cover.js");
          const source = await background().run("cover", vooFile, { signal });
          signal?.throwIfAborted();
          vooFile.preview = await rasterizeProjectCover(source);
        }
      } catch (error) {
        signal?.throwIfAborted();
        console.warn("[VOO] Draft cover unavailable; retaining document snapshot:", error);
      }
      signal?.throwIfAborted();
      const bytes = await background().run("encode", vooFile, { signal });
      signal?.throwIfAborted();
      return saveDraftBytes(entry.id, bytes, entry.name);
    };
    const task = queuedWrite.then(write);
    // The caller receives failure below; the queue remains usable for retries.
    queuedWrite = task.catch(() => {});
    return await task;
  } catch (err) {
    if (signal?.aborted) return false;
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
  let running = null;
  let due = false;
  const clearPending = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const cancel = () => {
    clearPending();
    due = false;
    running?.abort();
  };
  const start = () => {
    if (running) { due = true; return; }
    due = false;
    const controller = new AbortController();
    running = controller;
    let result;
    try { result = write({ signal: controller.signal }); }
    catch (error) { result = Promise.reject(error); }
    Promise.resolve(result).catch(error => {
      if (!controller.signal.aborted) console.warn("[VOO] Draft scheduler failed:", error);
    }).finally(() => {
      running = null;
      if (due) start();
    });
  };
  return {
    notify() {
      clearPending();
      due = false;
      timer = setTimer(() => {
        timer = null;
        start();
      }, delayMs);
    },
    cancel,
  };
}
