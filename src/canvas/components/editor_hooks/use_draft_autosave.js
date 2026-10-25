import { useEffect, useRef } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import { createDraftAutosaver, writeDraftSnapshot } from "../../store/draft_autosave.js";

/**
 * Keeps a local draft copy of an unsaved document (one with no file path).
 * `revision` changes on every editor change; the copy is written 1.5 s after
 * the last one. Saved documents and the workspace are never touched.
 */
export function useDraftAutosave({ enginesRef, snapshotsRef, revision }) {
  const latest = useRef({ enginesRef, snapshotsRef });
  latest.current = { enginesRef, snapshotsRef };
  const saverRef = useRef(null);
  if (!saverRef.current) {
    saverRef.current = createDraftAutosaver({
      write: () =>
        writeDraftSnapshot({
          store: useDesignStore.getState(),
          enginesRef: latest.current.enginesRef,
          snapshotsRef: latest.current.snapshotsRef,
        }),
    });
  }
  const saver = saverRef.current;

  useEffect(() => {
    if (useDesignStore.getState().filePath) {
      saver.cancel();
      return;
    }
    saver.notify();
  }, [revision, saver]);

  useEffect(() => () => saver.cancel(), [saver]);
}
