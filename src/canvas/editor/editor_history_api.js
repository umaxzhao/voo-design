import { commitEditorAction } from "../undo-action-contracts.js";

/**
 * History-domain API extracted from the createEditor closure.
 *
 * All mutable state is read through accessors:
 * - appliedSnapshot is reassigned by markApplied(), so it goes through
 *   getAppliedSnapshot/setAppliedSnapshot
 * - selectionTransform is reassigned by transform code, so isDirty() reads it
 *   through getSelectionTransform()
 *
 * Stable references passed directly: history, maskTools, paintTools, restore,
 * snapshotState, transformsInFlight.
 */
export function createHistoryApi({
  history,
  maskTools,
  paintTools,
  restore,
  snapshotState,
  snapshotDoc = null,
  getSelectionTransform,
  transformsInFlight,
  getAppliedSnapshot,
  setAppliedSnapshot,
  onCommit = null,
}) {
  const currentDocSnapshot = () =>
    snapshotDoc ? snapshotDoc() : snapshotState();
  return {
    captureDocumentSession: () => ({
      current: snapshotState(), history: history.captureSession(), applied: getAppliedSnapshot(),
    }),
    restoreDocumentSession(session) {
      history.restoreSession(session.history);
      restore(session.current, { fromHistory: true });
      setAppliedSnapshot(session.applied);
    },
    canUndo: () =>
      history.canUndo() ||
      maskTools.hasDirtyMasks() ||
      paintTools.hasDirtyPaints(),
    /** True when the document differs from what was last applied. */
    isDirty: () =>
      maskTools.hasDirtyMasks() ||
      paintTools.hasDirtyPaints() ||
      Boolean(getSelectionTransform()) ||
      transformsInFlight.size > 0 ||
      (getAppliedSnapshot() !== null &&
        getAppliedSnapshot() !== currentDocSnapshot()),
    // Persistence queues report errors and remain usable. Callers that leave
    // the editor must also check this after flushing before discarding memory.
    hasUnpersistedPixels: () =>
      maskTools.hasDirtyMasks() || paintTools.hasDirtyPaints(),
    /** Records the document as saved; call it after a successful apply. */
    markApplied() {
      setAppliedSnapshot(currentDocSnapshot());
    },
    /**
     * Preserves the persisted baseline across virtualized artboard eviction and
     * remount. Consumed by image_editor.jsx handleBeforeDispose; deleting it
     * causes re-opened draft pages to forget their saved baseline and drop the
     * dirty indicator before the user explicitly saves (N10).
     */
    getAppliedDoc: () => getAppliedSnapshot(),
    canRedo: () => history.canRedo(),
    commit: (name) =>
      commitEditorAction("editor.document.commit", () => {
        const result = history.push(snapshotState(), name);
        // Preview gestures skip normal document notifications until release.
        onCommit?.();
        return result;
      }),
    mute: (run) => history.mute(run),
    beginBatch: () => history.beginBatch?.(),
    endBatch: () => history.endBatch?.(),
    /**
     * Flushes any pending mask-stroke persists so the history entry lands
     * before stepping back. Without this, a stroke painted and immediately
     * undone would vanish from the canvas but leave no entry to redo.
     */
    async undo() {
      await maskTools.flushMasks();
      await paintTools.flushPaints();
      restore(history.undo(), { fromHistory: true });
    },
    async redo() {
      await maskTools.flushMasks();
      await paintTools.flushPaints();
      restore(history.redo(), { fromHistory: true });
    },
    async jumpToHistory(index) {
      await maskTools.flushMasks();
      await paintTools.flushPaints();
      restore(history.jumpTo(index), { fromHistory: true });
    },
    // Publication/retention consumes detached canonical nodes, including undo/redo media.
    getAssetRetentionNodes() {
      return [snapshotState(), ...history.getSnapshots()].map((snapshot) => {
        const raw =
          typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
        const doc = raw?.doc ?? raw;
        return { data: { editorDoc: structuredClone(doc) } };
      });
    },
    getHistoryEntries: () => history.getEntries(),
    getCurrentHistoryIndex: () => history.getCurrentIndex(),
    tagLastHistoryEntry: (commandId, args) =>
      history.tagLastEntry(commandId, args),
  };
}
