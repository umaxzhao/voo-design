import { useCallback, useRef, useState } from "react";
import {
  editorMediaFileKind,
  importEditorMediaFile,
} from "../editor_media_import.js";
import { importPickedEditorFile } from "../editor_import_files.js";
import { TOOL } from "../../editor/editor_constants.js";
import { useDesignStore } from "../../../store/design_store.js";

/** Route picker and dropped media to the page under the interaction. */
export function useEditorMediaImport({
  engine,
  enginesRef,
  focusedId,
  focusEditorPage,
  openVooDocument,
  t,
}) {
  const [mediaImportBusy, setMediaImportBusy] = useState(false);
  const [mediaImportError, setMediaImportError] = useState(null);
  const mediaInputRef = useRef(null);
  const importMediaFiles = useCallback(
    (files, { point = null, targetEngine = null } = {}) => {
      const activeEngine = targetEngine || engine;
      if (!files?.length || !activeEngine || mediaImportBusy) return;
      setMediaImportBusy(true);
      setMediaImportError(null);
      void (async () => {
        for (const file of files) {
          await importPickedEditorFile(activeEngine, file, {
            point,
            openDocument: openVooDocument,
            importMedia: (file) => importEditorMediaFile(
              activeEngine, file, useDesignStore.getState(), { point },
            ),
          });
        }
      })()
        .then(() => {
          activeEngine.setTool(TOOL.SELECT);
          // Sound has no box on the stage, so the timeline is the only place
        })
        .catch((error) => {
          console.error("[Design Editor] Media import failed", error);
          setMediaImportError(t("editor.media.importFailed"));
        })
        .finally(() => setMediaImportBusy(false));
    },
    [engine, mediaImportBusy, t, openVooDocument],
  );

  const openMediaPicker = useCallback(() => {
    const input = mediaInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
        return;
      } catch {
        // Older mobile browsers may expose showPicker but reject hidden inputs.
      }
    }
    input.click();
  }, []);

  const handleMediaDrop = useCallback(
    (event) => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter(
        editorMediaFileKind,
      );
      if (!files.length) return;
      event.preventDefault();

      const pageElement =
        event.target?.closest?.('[data-testid="editor-page"]') ||
        (typeof document !== "undefined" && document.elementsFromPoint
          ? document
              .elementsFromPoint(event.clientX, event.clientY)
              .map((el) => el.closest?.('[data-testid="editor-page"]'))
              .find(Boolean)
          : null) ||
        (typeof document !== "undefined" && document.elementFromPoint
          ? document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest?.('[data-testid="editor-page"]')
          : null);
      const targetNodeId = pageElement?.getAttribute("data-node-id");
      const targetEntry = targetNodeId
        ? enginesRef.current.get(targetNodeId)
        : null;
      const targetEngine = targetEntry?.engine || engine;
      const targetId = targetEntry ? targetNodeId : focusedId;
      if (targetId && targetId !== focusedId) {
        focusEditorPage(targetId);
      }

      const point =
        targetEntry && targetEngine?.toDocPoint
          ? targetEngine.toDocPoint(event.clientX, event.clientY)
          : null;

      importMediaFiles(files, { point, targetEngine });
    },
    [engine, enginesRef, focusedId, focusEditorPage, importMediaFiles],
  );


  return {
    mediaImportBusy,
    mediaImportError,
    mediaInputRef,
    importMediaFiles,
    openMediaPicker,
    handleMediaDrop,
  };
}
