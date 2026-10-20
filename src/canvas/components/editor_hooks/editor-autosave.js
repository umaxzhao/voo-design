import { getCanvasType } from "../../editor/canvas-composition-model.js";

/** Flush asset writes without flattening the scene or changing selection. */
export async function flushEditorPendingWrites(
  engine,
  { commitSelection = false } = {},
) {
  if (commitSelection && engine.getSelectionTransform?.()) {
    await engine.applySelectionTransform?.();
  }
  await engine.flushTransforms?.();
  await engine.flushPaints?.();
  await engine.flushMasks?.();
  // Paint/mask queues intentionally survive storage errors. Resolution alone
  // is not proof that their in-memory bytes have reached persistent storage.
  if (engine.hasUnpersistedPixels?.())
    throw new Error("EDITOR_PIXEL_SAVE_FAILED");
}

export const EDITOR_AUTOSAVE_DELAY_MS = 600;

/** Drafts share one debounced queue; 3D uses the already mounted editor renderer. */
export function createEditorDraftSaver({
  getPages,
  persist,
  capturePreview = null,
  onError,
  onSaved,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  const saved = new Map();
  const savedSources = new Map();
  let timer = null;
  let pending = null;
  let disposed = false;

  function readPage(page) {
    const engine = page.engine;
    if (engine) {
      if (!engine.isDirty() && !saved.has(page.nodeId)) return null;
      return {
        nodeId: page.nodeId,
        editorDoc: engine.serialise(),
        regions: engine.getRegions?.() ?? [],
      };
    }
    return page.snapshot?.dirty || saved.has(page.nodeId)
      ? {
          nodeId: page.nodeId,
          editorDoc: page.snapshot.doc,
          regions: page.snapshot.regions ?? [],
        }
      : null;
  }

  async function save() {
    const entries = [];
    const signatures = new Map();
    const sources = new Map();
    for (const page of getPages()) {
      if (page.engine) await flushEditorPendingWrites(page.engine);
      const entry = readPage(page);
      if (!entry) continue;
      const signature = JSON.stringify(entry);
      sources.set(
        page.nodeId,
        page.engine?.getDocument?.() ?? page.snapshot?.doc,
      );
      if (saved.get(page.nodeId) === signature) continue;
      if (capturePreview && getCanvasType(entry.editorDoc) === "3d") {
        try {
          const png = capturePreview(page.nodeId);
          if (png?.startsWith("data:image/png;")) {
            entry.previewDataUrl = png;
          }
        } catch {
          // A loading or lost WebGL view cannot block the scene document save.
        }
      }
      entries.push(entry);
      signatures.set(page.nodeId, signature);
    }
    if (entries.length) await persist(entries);
    for (const [id, signature] of signatures) saved.set(id, signature);
    for (const [id, source] of sources) savedSources.set(id, source);
    if (entries.length && !disposed) onSaved?.();
  }

  function scheduleSave() {
    if (disposed || timer !== null || pending) return;
    timer = schedule(() => {
      timer = null;
      void flush().catch((error) => {
        if (!disposed) onError(error);
      });
    }, EDITOR_AUTOSAVE_DELAY_MS);
  }

  function hasChangedDocument() {
    return getPages().some((page) => {
      const entry = readPage(page);
      return entry && saved.get(page.nodeId) !== JSON.stringify(entry);
    });
  }

  function needsSave() {
    return getPages().some((page) => {
      if (page.engine?.hasUnpersistedPixels?.()) return true;
      const source = page.engine?.getDocument?.() ?? page.snapshot?.doc;
      if (source && savedSources.get(page.nodeId) === source) return false;
      return (
        saved.has(page.nodeId) ||
        (page.engine ? page.engine.isDirty() : page.snapshot?.dirty)
      );
    });
  }

  function flush() {
    if (timer !== null) cancel(timer);
    timer = null;
    const work = (pending ?? Promise.resolve()).then(save);
    pending = work;
    // Clearing both outcomes lets a failed write be retried without poisoning
    // the next request. The caller still receives the original rejection.
    void work.then(
      () => {
        if (pending !== work) return;
        pending = null;
        if (hasChangedDocument()) scheduleSave();
      },
      () => {
        if (pending === work) pending = null;
      },
    );
    return work;
  }

  return {
    flush,
    needsSave,
    wait: () => pending,
    schedule: scheduleSave,
    resume: () => {
      disposed = false;
    },
    hasUnsaved() {
      // Undo/redo can match the last acknowledged document while a different
      // snapshot is still being written. Unload must wait for that queue, not
      // just compare the current document with an earlier acknowledgement.
      if (pending) return true;
      return getPages().some((page) => {
        if (
          page.engine?.hasUnpersistedPixels?.() ||
          page.engine?.getSelectionTransform?.()
        )
          return true;
        const entry = readPage(page);
        return entry && saved.get(page.nodeId) !== JSON.stringify(entry);
      });
    },
    dispose() {
      disposed = true;
      if (timer !== null) cancel(timer);
      timer = null;
    },
  };
}
