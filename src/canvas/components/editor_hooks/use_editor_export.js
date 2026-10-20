import { useCallback, useEffect, useRef } from "react";
import { t } from "../../../shared/i18n.js";
import { exportEditorImage } from "./export_editor_image.js";

/** Export attempts belong to one page and cannot outlive its dialog/session. */
export function useEditorExport({
  engine,
  pageTitle,
  exportFormat,
  exportQuality,
  exportScale,
  exportRange = "frame",
  selectedIds = [],
  setBusy,
  setApplyError,
  setExportOpen,
  resolveCanvas,
  onExportWarnings,
  exportMotion,
  setExportProgress,
}) {
  const attemptRef = useRef(null);

  const cancelExport = useCallback(() => {
    const attempt = attemptRef.current;
    if (attempt) {
      attemptRef.current = null;
      attempt.controller.abort();
      setBusy(false);
    }
    setExportProgress?.(null);
    setExportOpen(false);
  }, [setBusy, setExportOpen, setExportProgress]);

  useEffect(() => {
    if (attemptRef.current && attemptRef.current.engine !== engine) {
      cancelExport();
    }
  }, [engine, cancelExport]);

  useEffect(
    () => () => {
      attemptRef.current?.controller.abort();
      attemptRef.current = null;
    },
    [],
  );

  const exportImage = useCallback(() => {
    if (!engine?.exportImage) return Promise.resolve(null);
    if (attemptRef.current) return attemptRef.current.promise;
    const attempt = {
      engine,
      controller: new AbortController(),
      promise: null,
    };
    attemptRef.current = attempt;
    setBusy(true);
    setApplyError(false);
    setExportProgress?.(null);
    // Encoders may finish after cancellation. Only this active attempt may
    // update the dialog or release busy state belonging to a newer export.
    attempt.promise = (async () => {
      try {
        let receipt;
        if (exportFormat === "video") {
          if (!exportMotion) throw new Error(t("editor.motion.exportFailed"));
          const result = await exportMotion((value) => {
            if (attemptRef.current === attempt) setExportProgress?.(value);
          }, attempt.controller.signal);
          receipt = result === null ? null : { path: result ?? null };
        } else if (exportFormat === "html") {
          const { exportEditorWebPage } =
            await import("./export_editor_web_page.js");
          receipt = await exportEditorWebPage({
            engine,
            name: pageTitle(),
            title: t("editor.export"),
            resolveCanvas,
            assetSourceOf: (assetId) =>
              engine.getHost?.()?.resolveImage?.(assetId) ?? null,
            threeModuleUrl: import.meta.env.VITE_THREE_EXPORT_MODULE_URL,
            gltfLoaderModuleUrl: import.meta.env
              .VITE_THREE_EXPORT_GLTF_LOADER_URL,
            signal: attempt.controller.signal,
          });
        } else {
          receipt = await exportEditorImage({
            engine,
            format: exportFormat,
            quality: exportQuality,
            scale: exportScale,
            name: pageTitle(),
            title: t("editor.export"),
            signal: attempt.controller.signal,
            range: exportRange,
            selectedIds,
            resolveCanvas,
          });
        }
        if (attemptRef.current !== attempt) return null;
        if (receipt) {
          setExportOpen(false);
          if (receipt.warnings?.length) onExportWarnings?.(receipt.warnings);
        }
        return receipt;
      } catch (error) {
        if (
          attemptRef.current === attempt &&
          !attempt.controller.signal.aborted
        ) {
          console.error("export failed", error);
          const raw = error?.message;
          const mappedKey =
            raw &&
            [
              "EXPORT_TOO_LARGE",
              "EXPORT_FORMAT_UNSUPPORTED",
              "EXPORT_DOCUMENT_INVALID",
              "EXPORT_SELECTION_EMPTY",
            ].includes(raw)
              ? `editor.exportError.${raw}`
              : "editor.applyError";
          setApplyError(mappedKey);
        }
        return null;
      } finally {
        if (attemptRef.current === attempt) {
          attemptRef.current = null;
          setBusy(false);
          setExportProgress?.(null);
        }
      }
    })();
    return attempt.promise;
  }, [
    engine,
    exportFormat,
    exportQuality,
    exportScale,
    exportRange,
    selectedIds,
    pageTitle,
    resolveCanvas,
    onExportWarnings,
    exportMotion,
    setBusy,
    setApplyError,
    setExportOpen,
    setExportProgress,
  ]);

  return { exportImage, cancelExport };
}
