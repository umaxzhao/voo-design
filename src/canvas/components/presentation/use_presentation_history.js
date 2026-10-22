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
    canUndo: target("undo") === "workflow" || Boolean(engine?.canUndo()),
    canRedo: target("redo") === "workflow" || Boolean(engine?.canRedo()),
    undo: () => run("undo"),
    redo: () => run("redo"),
  };
}
