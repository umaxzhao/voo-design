import { useCallback, useEffect, useRef } from "react";
import { createEditorGestureTransaction } from "../../../shared/editor-gesture-transaction.js";

/**
 * One history snapshot per editing burst, not per keystroke/slider tick.
 *
 * The 1500ms timer is the fallback insurance only: the primary commit path is
 * the explicit interaction boundary (slider pointer-up / text blur+Enter /
 * number-input confirm) that every caller wires through `commitNow`. The timer
 * exists so a user who keeps dragging without ever releasing still lands a
 * snapshot, and so a vanished panel can flush (see the unmount effect).
 */
const COMMIT_DEBOUNCE_MS = 1500;
const PROPERTY_GESTURE_KEY = "editor-property";

/**
 * The property panel's write path.
 *
 * Every field edits the document live and only snapshots history once the
 * burst settles, so dragging a slider costs one undo step rather than one per
 * frame. Discrete edits (a swatch click) snapshot immediately.
 *
 * The callbacks are held in refs so the returned handlers keep a stable
 * identity across renders — the panel re-renders on every engine notification,
 * and new function identities would defeat memoisation in the sections.
 */
export function usePropertyCommit({ onMutate, onCommit }) {
  const commitTimerRef = useRef(null);
  const onMutateRef = useRef(onMutate);
  const onCommitRef = useRef(onCommit);
  const transactionRef = useRef(null);

  if (!transactionRef.current) {
    transactionRef.current = createEditorGestureTransaction({
      onCommit: () => onCommitRef.current?.(),
    });
  }

  useEffect(() => {
    onMutateRef.current = onMutate;
  }, [onMutate]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  // A panel that disappears mid-burst (selection cleared, editor closed) must
  // still land its pending snapshot, or the last edit never enters history.
  useEffect(
    () => () => {
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
        transactionRef.current.commit(PROPERTY_GESTURE_KEY);
      }
    },
    [],
  );

  const commitNow = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    return transactionRef.current.commit(PROPERTY_GESTURE_KEY);
  }, []);

  /** Live edit now, one history snapshot once the burst settles. */
  const edit = useCallback((patch) => {
    transactionRef.current.begin(PROPERTY_GESTURE_KEY);
    onMutateRef.current?.(patch);
    transactionRef.current.setChanged(PROPERTY_GESTURE_KEY);
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
    }
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      transactionRef.current.commit(PROPERTY_GESTURE_KEY);
    }, COMMIT_DEBOUNCE_MS);
  }, []);

  /** Discrete edit (swatch click): snapshot immediately. */
  const editAndCommit = useCallback((patch) => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    transactionRef.current.commit(PROPERTY_GESTURE_KEY);
    transactionRef.current.begin(PROPERTY_GESTURE_KEY);
    onMutateRef.current?.(patch);
    transactionRef.current.setChanged(PROPERTY_GESTURE_KEY);
    transactionRef.current.commit(PROPERTY_GESTURE_KEY);
  }, []);

  return { edit, editAndCommit, commitNow };
}
