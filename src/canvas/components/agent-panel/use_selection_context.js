import { useCallback, useEffect, useRef, useState } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import {
  EDITOR_ENGINE_CHANGE_EVENT,
  isEditorEngineReady,
} from "../../editor-engine-events.js";
import {
  readSelectionContext,
  selectionContextKey,
} from "./selection_context.js";

function currentSelection() {
  const {
    activeDocumentId: documentId,
    editingNodeId: pageId,
    welcomeOpen,
  } = useDesignStore.getState();
  const scope = { documentId, pageId };
  const engine = globalThis.window?.__vooEditors?.[pageId];
  return {
    scopeKey: JSON.stringify([documentId, pageId, welcomeOpen]),
    context:
      !welcomeOpen && isEditorEngineReady(engine)
        ? readSelectionContext(engine, scope)
        : null,
  };
}

/** Follow selection events; explicit attachments last until the target changes. */
export function useSelectionContext() {
  const initial = currentSelection();
  const [context, setContext] = useState(initial.context);
  const source = useRef({
    scopeKey: initial.scopeKey,
    key: selectionContextKey(initial.context),
    manual: false,
  });
  useEffect(() => {
    const sync = () => {
      const next = currentSelection();
      const key = selectionContextKey(next.context);
      if (
        source.current.scopeKey !== next.scopeKey ||
        source.current.key !== key
      ) {
        source.current = { scopeKey: next.scopeKey, key, manual: false };
      }
      if (!source.current.manual)
        setContext((previous) =>
          JSON.stringify(previous) === JSON.stringify(next.context)
            ? previous
            : next.context,
        );
    };
    sync();
    window.addEventListener(EDITOR_ENGINE_CHANGE_EVENT, sync);
    const unsubscribe = useDesignStore.subscribe(sync);
    return () => {
      window.removeEventListener(EDITOR_ENGINE_CHANGE_EVENT, sync);
      unsubscribe();
    };
  }, []);
  const attach = useCallback((next) => {
    // Removing the chip suppresses this selection until the user selects again.
    source.current.manual = true;
    setContext(next);
  }, []);
  return [context, attach];
}
