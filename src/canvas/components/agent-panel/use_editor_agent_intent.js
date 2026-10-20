import { useEffect, useReducer, useRef } from "react";
import { useWorkflowStore } from "../../store/workflow_store.js";
import {
  EDITOR_ENGINE_CHANGE_EVENT,
  getEditorRequestTarget,
} from "./editor-request-intent.js";

/**
 * Determine editor operation and target automatically based on selection and creation type:
 * - Selecting an image layer -> "layer" (edit layer)
 * - Selecting a group or nothing -> "design" (edit design)
 * - Explicitly selecting an external creation type (video, 3d, etc.) -> "generate"
 */
export function useEditorAgentIntent(enabled, creationType = null) {
  const [, refresh] = useReducer((value) => value + 1, 0);
  const targetSignatureRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const signature = () => {
      const target = getEditorRequestTarget(useWorkflowStore.getState());
      return JSON.stringify([
        target?.nodeId ?? null,
        target?.canvasType ?? null,
        target?.ready ?? false,
        (target?.selectedLayers ?? []).map(
          ({ id, name, kind, imageId, thumbnail }) => [
            id,
            name,
            kind,
            imageId,
            thumbnail,
          ],
        ),
      ]);
    };
    targetSignatureRef.current = signature();

    const refreshIfChanged = () => {
      const next = signature();
      if (next === targetSignatureRef.current) return;
      targetSignatureRef.current = next;
      refresh();
    };

    const unsubscribe = useWorkflowStore.subscribe(refreshIfChanged);
    const onEngineChange = (event) => {
      const focusedId = useWorkflowStore.getState().editingNodeId;
      if (event.detail?.nodeId === focusedId) refreshIfChanged();
    };
    window.addEventListener(EDITOR_ENGINE_CHANGE_EVENT, onEngineChange);
    return () => {
      unsubscribe();
      window.removeEventListener(EDITOR_ENGINE_CHANGE_EVENT, onEngineChange);
    };
  }, [enabled]);

  const target = enabled
    ? getEditorRequestTarget(useWorkflowStore.getState())
    : null;

  const selectedLayers = target?.selectedLayers ?? [];
  const hasImage = selectedLayers.some(
    (l) => l.kind === "image" || Boolean(l.imageId),
  );
  const hasSpatialSelection =
    target?.canvasType !== "design" && selectedLayers.length > 0;

  let operation = "design";
  if (hasImage || hasSpatialSelection) {
    if (creationType && !["design", "image"].includes(creationType)) {
      operation = "generate";
    } else {
      operation = "layer";
    }
  } else {
    if (creationType && creationType !== "design") {
      operation = "generate";
    } else {
      operation = "design";
    }
  }

  const blocked = enabled && !target?.ready;

  return {
    operation,
    setOperation() {},
    creationType: creationType || "design",
    setCreationType() {},
    target,
    blocked,
    editorIntent: enabled ? operation : null,
  };
}
