import { useCallback, useSyncExternalStore } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import { presentationHistoryTarget } from "../../presentation/presentation-history.js";

export function usePresentationHistory(ownerId, engine, activePageIds = []) {
  const undoStack = useDesignStore((state) => state.undoStack);
  const redoStack = useDesignStore((state) => state.redoStack);
  const target = (direction) =>
    presentationHistoryTarget(
      { undoStack, redoStack },
      ownerId,
      engine,
      direction,
      activePageIds,
    );
  const subscribe = useCallback(
    (listener) => engine?.subscribeRender?.(listener) ?? (() => {}),
    [engine],
  );
  // A primitive snapshot stays stable across canvas renders that do not
  // change the toolbar state, including when workflow history takes priority.
  const getSnapshot = () =>
    (target("undo") === "workflow" || engine?.canUndo() ? 1 : 0) |
    (target("redo") === "workflow" || engine?.canRedo() ? 2 : 0);
  const availability = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const run = (direction) => {
    const store = useDesignStore.getState();
    if (
      presentationHistoryTarget(
        store,
        ownerId,
        engine,
        direction,
        activePageIds,
      ) === "workflow"
    )
      store[direction]();
    else return engine?.[direction]?.();
  };
  return {
    canUndo: Boolean(availability & 1),
    canRedo: Boolean(availability & 2),
    undo: () => run("undo"),
    redo: () => run("redo"),
  };
}
