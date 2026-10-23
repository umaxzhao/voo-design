/**
 * Undo/redo for the editor.
 *
 * Snapshots are whole serialised documents. They are small — geometry and a
 * few strings, never image bytes — so keeping the last `MAX_HISTORY` of them
 * costs far less than reconstructing inverse operations for every tool.
 *
 * Pure state machine: no canvas, no React, so the node:test suite drives it
 * directly.
 */

import { createEditorGestureTransaction } from "../../shared/editor-gesture-transaction.js";
import { validateEditorDocumentSnapshot } from "../../shared/editor-document-contract.js";

export const MAX_HISTORY = 50;

export function createHistory({
  resolveDefaultName = null,
  validateSnapshot = false,
  domain = "design",
} = {}) {
  /**
   * `entries`: array of `{ id, name, timestamp, snapshot, commandId?, args? }`
   * `currentIndex`: pointer to currently active state in `entries` (0-indexed).
   *
   * `name` is a stable i18n key (`editor.history.entry.*`), never display copy:
   * the history panel localises it with `t()`, so the engine stays locale-free.
   * `commandId`/`args` are optional command-table metadata attached after a
   * command finishes, so one command is one undoable history unit.
   */
  let entries = [];
  let currentIndex = -1;
  let muteDepth = 0;
  let batchDepth = 0;
  let gestureTransaction = null;

  function isMuted() {
    return muteDepth > 0 || batchDepth > 0;
  }

  function snapshotsMatch(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") {
      return false;
    }
    if (a.doc !== b.doc) return false;
    const aIds = a.selectedIds;
    const bIds = b.selectedIds;
    if (aIds !== bIds) {
      if (!Array.isArray(aIds) || !Array.isArray(bIds) || aIds.length !== bIds.length) {
        return false;
      }
      for (let i = 0; i < aIds.length; i += 1) {
        if (aIds[i] !== bIds[i]) return false;
      }
    }
    const aSel = a.pixelSelection;
    const bSel = b.pixelSelection;
    if (aSel === bSel) return true;
    if (!aSel || !bSel) return aSel === bSel;
    return (
      aSel.contoursRef === bSel.contoursRef &&
      aSel.mode === bSel.mode &&
      aSel.inverted === bSel.inverted
    );
  }

  function pushEntry(snapshot, name = null) {
    if (isMuted()) return;
    if (currentIndex >= 0 && snapshotsMatch(entries[currentIndex]?.snapshot, snapshot))
      return;

    if (validateSnapshot) {
      validateEditorDocumentSnapshot(domain, snapshot);
    }

    // Unnamed commits derive their label from the active undo-action
    // contract (injected by the engine); the generic key is the last resort.
    const entryName =
      name ?? resolveDefaultName?.() ?? "editor.history.entry.action";

    // Truncate redo future branch
    if (currentIndex < entries.length - 1) {
      entries = entries.slice(0, currentIndex + 1);
    }

    entries.push({
      id: `h_${Date.now()}_${entries.length}`,
      name: entryName,
      timestamp: Date.now(),
      snapshot,
    });

    if (entries.length > MAX_HISTORY) {
      entries.shift();
    }
    currentIndex = entries.length - 1;
  }

  function getGestureTransaction() {
    if (!gestureTransaction) {
      gestureTransaction = createEditorGestureTransaction({
        onCommit: (ctx) => {
          const snap =
            typeof ctx?.getSnapshot === "function"
              ? ctx.getSnapshot()
              : ctx?.snapshot;
          pushEntry(snap, ctx?.name);
        },
      });
    }
    return gestureTransaction;
  }

  return {
    /** Discards history and seeds it with the initial document state. */
    reset(snapshot, initialName = "editor.history.entry.open") {
      if (validateSnapshot) {
        validateEditorDocumentSnapshot(domain, snapshot);
      }
      entries = [
        {
          id: `h_${Date.now()}_0`,
          name: initialName,
          timestamp: Date.now(),
          snapshot,
        },
      ];
      currentIndex = 0;
    },

    mute(run) {
      muteDepth += 1;
      let result;
      try {
        result = run();
      } catch (error) {
        muteDepth -= 1;
        throw error;
      }
      if (result && typeof result.then === "function") {
        return Promise.resolve(result).finally(() => {
          muteDepth = Math.max(0, muteDepth - 1);
        });
      }
      muteDepth = Math.max(0, muteDepth - 1);
      return result;
    },

    /** Starts suppressing history pushes until the matching endBatch(). */
    beginBatch() {
      batchDepth += 1;
      return batchDepth;
    },

    endBatch() {
      batchDepth = Math.max(0, batchDepth - 1);
      return batchDepth;
    },

    isMuted,

    push(snapshot, name = null) {
      pushEntry(snapshot, name);
    },

    beginGesture(key, context = {}) {
      return getGestureTransaction().begin(key, context);
    },

    markGestureChanged(key) {
      return getGestureTransaction().setChanged(key);
    },

    commitGesture(key) {
      return getGestureTransaction().commit(key);
    },

    cancelGesture(key) {
      return getGestureTransaction().cancel(key);
    },

    getPendingGesture() {
      return getGestureTransaction().getPending();
    },

    canUndo() {
      return currentIndex > 0;
    },

    canRedo() {
      return currentIndex < entries.length - 1;
    },

    undo() {
      if (currentIndex <= 0) return null;
      currentIndex -= 1;
      return entries[currentIndex].snapshot;
    },

    redo() {
      if (currentIndex >= entries.length - 1) return null;
      currentIndex += 1;
      return entries[currentIndex].snapshot;
    },

    jumpTo(index) {
      if (index < 0 || index >= entries.length) return null;
      currentIndex = index;
      return entries[currentIndex].snapshot;
    },

    tagLastEntry(commandId, args) {
      const entry = entries[currentIndex];
      if (!entry) return;
      entry.commandId = commandId;
      entry.args = args;
    },

    updateCurrentSelection(selectedIds) {
      if (isMuted()) return;
      const entry = entries[currentIndex];
      if (!entry) return;
      const nextIds = Array.isArray(selectedIds) ? [...selectedIds] : [];
      if (entry.snapshot && typeof entry.snapshot === "object") {
        entry.snapshot.selectedIds = nextIds;
        return;
      }
      if (typeof entry.snapshot !== "string") return;
      try {
        const raw = JSON.parse(entry.snapshot);
        if (raw && typeof raw === "object") {
          raw.selectedIds = nextIds;
          entry.snapshot = JSON.stringify(raw);
        }
      } catch {
        // ignore malformed snapshot
      }
    },

    getEntries() {
      return entries.map((entry, idx) => ({
        id: entry.id,
        name: entry.name,
        timestamp: entry.timestamp,
        ...(entry.commandId !== undefined
          ? { commandId: entry.commandId, args: entry.args }
          : {}),
        active: idx === currentIndex,
        future: idx > currentIndex,
      }));
    },

    getCurrentIndex() {
      return currentIndex;
    },

    getSnapshots() {
      return entries.map((entry) => entry.snapshot);
    },
  };
}
