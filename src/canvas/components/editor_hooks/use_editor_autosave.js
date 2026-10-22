import { useEffect, useRef } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import { isQuotaError } from "../../../shared/persistence_contract.js";
import { createEditorDraftSaver } from "./editor-autosave.js";

/** Debounced durable scene snapshots; no PNG export on typing/dragging/playback. */
export function useEditorAutosave({
  enginesRef,
  snapshotsRef,
  nodeIds,
  disabled = true,
  setApplyError,
}) {
  // In standalone desktop app mode, automatic background saving to server/draft is disabled.
  // The document follows Photoshop-style manual save (Ctrl+S / Cmd+S).
  if (disabled) {
    return {
      wait: () => Promise.resolve(),
      hasUnsaved: () => false,
      hasChangedDocument: () => false,
      needsSave: () => false,
      schedule: () => {},
      flush: () => Promise.resolve(),
      resume: () => {},
      pause: () => {},
      dispose: () => {},
    };
  }
  const latest = useRef(null);
  latest.current = {
    enginesRef,
    snapshotsRef,
    nodeIds,
    disabled,
    setApplyError,
  };
  const saverRef = useRef(null);
  if (!saverRef.current) {
    saverRef.current = createEditorDraftSaver({
      getPages: () => {
        const current = latest.current;
        if (current.disabled) return [];
        return current.nodeIds.flatMap((nodeId) => {
          const live = current.enginesRef.current.get(nodeId);
          const snapshot = current.snapshotsRef.current.get(nodeId);
          return live?.ready
            ? [{ nodeId, engine: live.engine }]
            : snapshot
              ? [{ nodeId, snapshot }]
              : [];
        });
      },
      persist: (entries) =>
        useDesignStore.getState().saveEditorDrafts(entries),
      onError: (error) =>
        latest.current.setApplyError(
          isQuotaError(error) ? "quotaExceeded" : true,
        ),
      onSaved: () => latest.current.setApplyError(false),
      schedule: (callback, delay) => window.setTimeout(callback, delay),
      cancel: (timer) => window.clearTimeout(timer),
    });
  }
  const saver = saverRef.current;
  useEffect(() => {
    saver.resume();
    return () => saver.dispose();
  }, [saver]);
  useEffect(() => {
    if (!disabled && saver.needsSave()) saver.schedule();
  });
  return saver;
}
