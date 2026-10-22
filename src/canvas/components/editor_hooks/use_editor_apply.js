/**
 * The image editor's save/export/exit actions, extracted verbatim from
 * image_editor.jsx (plan-design-editor-fixes A5): applying edited pages back
 * to their workflow nodes, saving a .voo file, exporting in the chosen
 * format, and leaving the editor.
 *
 */
import { useCallback, useEffect, useRef } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import { buildVooFile, saveVooProject, openVooProject } from "../../store/project_io.js";
import { useEditorExport } from "./use_editor_export.js";
export { assertExportableDocument } from "./export_editor_image.js";
import { isQuotaError } from "../../../shared/persistence_contract.js";
import { flushEditorPendingWrites } from "./editor-autosave.js";
import { useEditorAutosave } from "./use_editor_autosave.js";

/** How long the save-and-exit path keeps retrying a refused (busy) apply. */
export const MAX_SAVE_EXIT_RETRIES = 8;
/** Delay between save-and-exit retries while a matting/apply is in flight. */
export const SAVE_EXIT_RETRY_DELAY_MS = 400;

/**
 * Decides what save-and-exit does with an apply result.
 *
 * Pure so the retry budget is unit-testable without a React render: a busy
 * apply (a matting or another apply still running) is retried a bounded number
 * of times so Tab exit eventually lands instead of silently doing nothing,
 * while "ok" closes and "failed" surfaces the error for a manual retry.
 *
 * @param {"ok"|"busy"|"failed"|string} result the apply() outcome
 * @param {number} retryCount how many busy retries already happened
 * @returns {{action: "close"|"error"|"retry"|"wait"}}
 */
export function decideSaveExit(result, retryCount) {
  if (result === "ok") return { action: "close" };
  if (result === "failed") return { action: "error" };
  if (result === "busy") {
    return retryCount < MAX_SAVE_EXIT_RETRIES
      ? { action: "retry" }
      : { action: "wait" };
  }
  return { action: "wait" };
}

export function useEditorApply({
  enginesRef,
  snapshotsRef,
  nodeIds,
  applyImageEdits,
  closeImageEditor,
  streamingPreview,
  engine,
  pageTitle,
  busy,
  maskBusy,
  exportFormat,
  exportQuality,
  exportScale,
  exportRange = "frame",
  selectedIds = [],
  setBusy,
  setApplyError,
  setSavedNotice,
  setExitPrompt,
  setExportOpen,
  setHistoryOpen,
  resolveCanvas,
  onExportWarnings,
  exportMotion,
  setExportProgress,
}) {
  /** Pages with unsaved work, live or evicted. */
  const dirtyIds = nodeIds.filter((id) => {
    const live = enginesRef.current.get(id);
    if (live?.ready) return live.dirty;
    return snapshotsRef.current.get(id)?.dirty ?? false;
  });

  /** Busy-refusals seen by save-and-exit; reset on a landed save or error. */
  const saveExitRetryCount = useRef(0);
  /** Always the latest handleSaveAndExit, so a retry never reads stale state. */
  const handleSaveAndExitRef = useRef(null);
  const saveExitTimer = useRef(null);
  const savingExit = useRef(false);
  const applying = useRef(false);
  const autosave = useEditorAutosave({
    enginesRef,
    snapshotsRef,
    nodeIds,
    setApplyError,
    disabled: true,
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(saveExitTimer.current);
      saveExitTimer.current = null;
      handleSaveAndExitRef.current = null;
    };
  }, []);

  /**
   * Writes every changed page back to its own node in one pass.
   *
   * Pages without a live engine are applied from the snapshot taken when they
   * were evicted, so work does not depend on a page still being on screen.
   *
   * Resolves "ok" when the save landed (or there was nothing to save), "busy"
   * when it was refused because a matting or another apply is in flight, and
   * "failed" when an error was thrown — the exit path must not close the
   * editor over unsaved work (see handleSaveAndExit).
   */
  const apply = useCallback(async () => {
    // Applying is pointless mid-matting: the result lands on a stale picture.
    // A refused apply reports "busy" instead of pretending success.
    if (busy || maskBusy || applying.current) return "busy";
    // A layout generation is still running for an open page: the document is
    // not settled yet, so saving now would write the current blank or stale
    // canvas over the node's real content. Guard here so every path that lands
    // on apply() — Tab (handleSaveAndExit), the toolbar Apply button, and the
    // ⌘S bridge event — refuses to save a moving picture, not just the Tab
    // path. Same status read as handleSaveAndExit; the node's "Generating
    // layout…" status line already explains why.
    if (streamingPreview) return "busy";
    applying.current = true;
    setBusy(true);
    setApplyError(false);
    try {
      const draftWrite = autosave.wait();
      if (draftWrite) await draftWrite;
      const entries = [];
      for (const nodeId of nodeIds) {
        const live = enginesRef.current.get(nodeId)?.ready
          ? enginesRef.current.get(nodeId).engine
          : null;
        if (live) {
          await flushEditorPendingWrites(live, { commitSelection: true });
          const previewDirty = useDesignStore
            .getState()
            .nodes.find((node) => node.id === nodeId)?.data?.editorPreviewDirty;
          if (!live.isDirty() && !previewDirty) continue;
          live.cancelCrop();
          live.select(null);
          // A stroke finished a moment ago may still be writing its matte blob;
          // serialising before it lands would save the previous maskId.
          await live.prepareFrame?.(live.getPlaybackState?.().time ?? 0);
          const editorDoc = live.serialise();
          entries.push({
            nodeId,
            // A very large picture is edited from a reduced preview; save must
            // flatten the full-resolution original, not that preview, or the
            // node's picture would be permanently downscaled. Falls back to the
            // sync export when the engine has no full-res path.
            dataUrl:
              (await live.exportFullResPng?.()) ?? live.exportPng(),
            editorDoc,
            regions: live.getRegions(),
            promptLayers: live.getPromptLayers(),
            annotatedLayers: live.exportAnnotatedLayers(),
          });
          continue;
        }
        const snapshot = snapshotsRef.current.get(nodeId);
        if (snapshot?.dirty && !snapshot.png)
          throw new Error("EDITOR_SNAPSHOT_PREVIEW_MISSING");
        if (snapshot?.dirty && snapshot.png) {
          entries.push({
            nodeId,
            dataUrl: snapshot.png,
            editorDoc: snapshot.doc,
            regions: snapshot.regions,
            promptLayers: snapshot.promptLayers ?? [],
            annotatedLayers: snapshot.annotatedLayers ?? [],
          });
        }
      }
      await applyImageEdits(entries, { close: false });
      if (!mounted.current) return "failed";
      let changedWhileSaving = false;
      for (const entry of entries) {
        const live = enginesRef.current.get(entry.nodeId)?.engine;
        if (live) {
          if (
            JSON.stringify(live.serialise()) === JSON.stringify(entry.editorDoc)
          )
            live.markApplied();
          else changedWhileSaving = true;
        } else if (
          snapshotsRef.current.get(entry.nodeId)?.doc === entry.editorDoc
        ) {
          snapshotsRef.current.delete(entry.nodeId);
        }
      }
      changedWhileSaving ||= nodeIds.some((nodeId) => {
        const live = enginesRef.current.get(nodeId);
        return live?.ready
          ? live.engine.isDirty()
          : snapshotsRef.current.get(nodeId)?.dirty;
      });
      if (changedWhileSaving) return "busy";
      setSavedNotice(true);
      return "ok";
    } catch (err) {
      console.warn("Editor save failed", err);
      if (mounted.current)
        setApplyError(isQuotaError(err) ? "quotaExceeded" : true);
      return "failed";
    } finally {
      applying.current = false;
      if (mounted.current) setBusy(false);
    }
    // enginesRef/snapshotsRef and the setters are stable identities; listed
    // so exhaustive-deps stays quiet in the extracted module.
  }, [
    busy,
    maskBusy,
    nodeIds,
    applyImageEdits,
    enginesRef,
    snapshotsRef,
    streamingPreview,
    setBusy,
    setApplyError,
    setSavedNotice,
    autosave,
  ]);

  /** One save/exit request at a time; retries belong to this mounted editor. */
  const handleSaveAndExit = useCallback(async () => {
    if (!mounted.current || savingExit.current) return;
    // Do not apply a blank or partial streaming document over its real source.
    if (streamingPreview) {
      // Tab can leave a streaming preview without saving its partial result.
      // Keep the editor session mounted so the completed page remains available.
      return;
    }
    savingExit.current = true;
    let result = "failed";
    try {
      result = await apply();
    } catch (e) {
      console.warn("Auto save on exit failed", e);
    }
    if (!mounted.current) return;
    const { action } = decideSaveExit(result, saveExitRetryCount.current);
    if (action !== "retry") savingExit.current = false;
    if (action === "close") {
      saveExitRetryCount.current = 0;
      closeImageEditor();
    } else if (action === "error") {
      saveExitRetryCount.current = 0;
      setApplyError(true);
    } else if (action === "retry") {
      saveExitRetryCount.current += 1;
      // The latest handler, not this render's closure: busy/maskBusy in the
      // captured closure would otherwise read stale values on the next try.
      saveExitTimer.current = window.setTimeout(() => {
        saveExitTimer.current = null;
        savingExit.current = false;
        void handleSaveAndExitRef.current?.();
      }, SAVE_EXIT_RETRY_DELAY_MS);
    }
    // "wait": a busy apply that never settled — the editor stays open, and a
    // later Tab tries again once the in-flight work has finished.
  }, [apply, closeImageEditor, nodeIds, streamingPreview, setApplyError]);
  // The retry path needs the freshest closure (busy/maskBusy update per
  // render); keep a ref that always points at this render's handler.
  handleSaveAndExitRef.current = handleSaveAndExit;

  /**
   * Saves this editor document as a self-contained `.voo` file on computer (Photoshop-like).
   */
  const saveVooDocument = useCallback(
    async ({ saveAs = false } = {}) => {
      try {
        setBusy(true);
        setApplyError(false);
        const res = await saveVooProject({
          store: useDesignStore.getState(),
          enginesRef,
          snapshotsRef,
          saveAs,
          pageTitle,
        });
        if (res?.success) {
          setSavedNotice(res.fileName || true);
          return "ok";
        }
        return "cancelled";
      } catch (err) {
        console.error("save .voo failed", err);
        setApplyError("editor.saveFailed");
        return "failed";
      } finally {
        setBusy(false);
      }
    },
    [enginesRef, snapshotsRef, pageTitle, setBusy, setApplyError, setSavedNotice],
  );

  const openVooDocument = useCallback(
    async (fileOrPath = null) => {
      try {
        setBusy(true);
        setApplyError(false);
        const res = await openVooProject({
          store: useDesignStore.getState(),
          fileOrPath,
        });
        if (res?.success) {
          setSavedNotice(`✓ ${res.fileName}`);
          return "ok";
        }
        return "cancelled";
      } catch (err) {
        console.error("open .voo failed", err);
        setApplyError("editor.openFailed");
        return "failed";
      } finally {
        setBusy(false);
      }
    },
    [setBusy, setApplyError, setSavedNotice],
  );

  const newVooDocument = useCallback(() => {
    useDesignStore.getState().newVooProject?.();
    setSavedNotice(false);
    setApplyError(false);
  }, [setSavedNotice, setApplyError]);

  const saveAsVoo = useCallback(
    () => saveVooDocument({ saveAs: true }),
    [saveVooDocument],
  );

  const { exportImage, cancelExport } = useEditorExport({
    engine,
    exportFormat,
    exportQuality,
    exportScale,
    exportRange,
    selectedIds,
    pageTitle,
    setBusy,
    setApplyError,
    setExportOpen,
    resolveCanvas,
    onExportWarnings,
    exportMotion,
    setExportProgress,
  });

  /**
   * Leaving the editor.
   *
   * Reached from the close button only. Escape deliberately does not lead
   * here — it belongs to the tools, which each end their own gesture with it.
   * Closing and Tab share one durable autosave path; an error keeps the live
   * document open instead of offering routine discard/save decisions.
   */
  const requestExit = useCallback(() => {
    setExitPrompt(false);
    return handleSaveAndExit();
  }, [handleSaveAndExit, setExitPrompt]);

  // Sync editor bridge events for TopBar / Menus / Shortcuts
  useEffect(() => {
    const onTriggerApply = () => void saveVooDocument({ saveAs: false });
    const onTriggerSaveVoo = () => void saveVooDocument({ saveAs: false });
    const onTriggerSaveAs = () => void saveVooDocument({ saveAs: true });
    const onTriggerOpen = (e) => void openVooDocument(e?.detail?.file);
    const onTriggerNew = () => newVooDocument();
    const onTriggerHistory = () => setHistoryOpen((open) => !open);
    const onTriggerExport = () => setExportOpen(true);
    const onTriggerClose = () => requestExit();

    window.addEventListener("voo:file-save", onTriggerSaveVoo);
    window.addEventListener("voo:file-save-as", onTriggerSaveAs);
    window.addEventListener("voo:file-open", onTriggerOpen);
    window.addEventListener("voo:file-new", onTriggerNew);
    window.addEventListener("voo:editor-apply", onTriggerApply);
    window.addEventListener("voo:editor-toggle-history", onTriggerHistory);
    window.addEventListener("voo:editor-export", onTriggerExport);
    window.addEventListener("voo:editor-close", onTriggerClose);
    window.addEventListener("voo:editor-save-voo", onTriggerSaveVoo);

    // Browser refresh / tab close protection: prompt the user if there are unsaved edits
    const onBeforeUnload = (e) => {
      const isDirty = useDesignStore.getState().isDirty || dirtyIds.length > 0;
      if (
        busy ||
        maskBusy ||
        streamingPreview ||
        applying.current ||
        isDirty
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("voo:file-save", onTriggerSaveVoo);
      window.removeEventListener("voo:file-save-as", onTriggerSaveAs);
      window.removeEventListener("voo:file-open", onTriggerOpen);
      window.removeEventListener("voo:file-new", onTriggerNew);
      window.removeEventListener("voo:editor-apply", onTriggerApply);
      window.removeEventListener("voo:editor-toggle-history", onTriggerHistory);
      window.removeEventListener("voo:editor-export", onTriggerExport);
      window.removeEventListener("voo:editor-close", onTriggerClose);
      window.removeEventListener("voo:editor-save-voo", onTriggerSaveVoo);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [
    handleSaveAndExit,
    requestExit,
    saveVooDocument,
    openVooDocument,
    newVooDocument,
    setExportOpen,
    setHistoryOpen,
    dirtyIds,
    autosave,
    busy,
    maskBusy,
    streamingPreview,
  ]);

  return {
    apply: () => saveVooDocument({ saveAs: false }),
    handleSaveAndExit,
    saveAsVoo,
    saveVooDocument,
    openVooDocument,
    newVooDocument,
    exportImage,
    cancelExport,
    requestExit,
    dirtyIds,
  };
}
