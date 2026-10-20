import { useCallback, useEffect, useReducer, useRef } from "react";
import { buildEditorHtml } from "../../editor/editor_html_clipboard.js";
import {
  listActiveAdjustments,
  listActiveEffects,
} from "../../editor/adjustment_queries.js";
import { useWorkflowStore } from "../../store/workflow_store.js";
import { flushEditorPendingWrites } from "./editor-autosave.js";

const INITIAL = { preview: null, preparing: false, failed: false };

/** Preview the live document in a separate runtime, even if its node is offscreen. */
export function useEditorPreview({ visible, focusedId, engine, pageTitle }) {
  const [state, patch] = useReducer(
    (previous, next) => ({ ...previous, ...next }),
    INITIAL,
  );
  const requestRef = useRef(0);
  const preparingRef = useRef(false);
  const titleRef = useRef(pageTitle);
  titleRef.current = pageTitle;
  const close = useCallback(() => {
    requestRef.current += 1;
    preparingRef.current = false;
    patch(INITIAL);
  }, []);

  useEffect(() => {
    close();
    if (!visible || !focusedId || !engine) return undefined;
    const open = async () => {
      if (preparingRef.current) return;
      preparingRef.current = true;
      const request = ++requestRef.current;
      patch({ preparing: true, failed: false });
      try {
        await flushEditorPendingWrites(engine);
        // A serialized clone freezes the preview at click time. Its playback,
        // selection and history must never share the editor's mutable document.
        const doc = structuredClone(engine.serialise());
        const node = useWorkflowStore
          .getState()
          .nodes.find((candidate) => candidate.id === focusedId);
        const isWeb = ["web", "mobile", "html"].includes(
          node?.data?.layoutMedia,
        );
        // HTML handoff cannot reproduce masks, filters or cropped scenes.
        // Keep those designs on the native renderer so preview matches editing.
        const needsScene =
          doc.crop ||
          doc.nodes.some(
            (layer) =>
              ["video", "model3d", "adjustment"].includes(layer.kind) ||
              layer.maskId ||
              layer.clipTo ||
              listActiveAdjustments(layer.adjustments).length > 0 ||
              listActiveEffects(layer.effects).length > 0 ||
              layer.animations?.some((track) => track.keyframes?.length),
          );
        const html = isWeb && !needsScene ? await buildEditorHtml(doc) : null;
        if (request !== requestRef.current) return;
        patch({
          preview: {
            nodeId: focusedId,
            title: titleRef.current(),
            snapshot: { doc },
            html,
          },
          preparing: false,
        });
      } catch (error) {
        if (request !== requestRef.current) return;
        console.error("Editor preview failed", error);
        patch({ preparing: false, failed: true });
      } finally {
        if (request === requestRef.current) preparingRef.current = false;
      }
    };
    // Caller: EditorTopBar. Do not route through the virtualized workflow node.
    window.addEventListener("voo:editor-preview", open);
    return () => {
      requestRef.current += 1;
      preparingRef.current = false;
      window.removeEventListener("voo:editor-preview", open);
    };
  }, [visible, focusedId, engine, close]);

  return { ...state, close };
}
