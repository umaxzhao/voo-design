/**
 * Pure transaction boundary shared by the image and clip editors.
 *
 * History storage stays editor-specific. This state machine only guarantees
 * that one changed gesture commits once and an unchanged gesture commits zero
 * times.
 */
export function createEditorGestureTransaction({ onCommit, onCancel = null }) {
  if (typeof onCommit !== "function") {
    throw new TypeError("Gesture transaction requires an onCommit callback");
  }
  if (onCancel !== null && typeof onCancel !== "function") {
    throw new TypeError("Gesture transaction onCancel must be a function");
  }

  let pending = null;

  return Object.freeze({
    begin(key, context = null) {
      if (!key) throw new Error("editor-gesture-transaction-key-required");
      if (pending?.key === key) return false;
      if (pending) throw new Error("editor-gesture-transaction-already-active");
      pending = { key, context, changed: false };
      return true;
    },

    setChanged(key, changed = true) {
      if (pending?.key !== key) return false;
      pending.changed = Boolean(changed);
      return true;
    },

    commit(key) {
      if (pending?.key !== key) return false;
      const completed = pending;
      pending = null;
      if (!completed.changed) return false;
      onCommit(completed.context);
      return true;
    },

    cancel(key) {
      if (pending?.key !== key) return false;
      const cancelled = pending;
      pending = null;
      onCancel?.(cancelled.context);
      return true;
    },

    getPending() {
      return pending ? { ...pending } : null;
    },
  });
}
