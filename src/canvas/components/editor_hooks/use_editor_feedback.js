import { useEffect, useState } from "react";
import { RETOUCH_TOO_LARGE } from "../../editor/portrait_retouch_plan.js";
import { maskErrorCopy } from "../../error_text.js";
import { subscribePersistenceAlert } from "../../editor/editor_persist_events.js";

/** Own toast timers and persistence warnings so every subscription is cleaned up. */
export function useEditorFeedback({
  engine,
  t,
  splitLayersError,
  clearSplitLayersError,
  maskError,
  retouchError,
  retouchErrorSeq,
}) {
  const [applyError, setApplyError] = useState(false);
  const [regionHint, setRegionHint] = useState(null);
  const [regionHintFading, setRegionHintFading] = useState(false);
  const [persistQuota, setPersistQuota] = useState(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [imageActionError, setImageActionError] = useState(null);
  const [aiErrorText, setAiErrorText] = useState(null);
  const [exportNotice, setExportNotice] = useState(false);

  // Split Layers failures must be visible, not console-only: the alert toast
  // surfaces the reason for six seconds, the same pattern applyError uses.
  useEffect(() => {
    if (!splitLayersError) return undefined;
    const timer = setTimeout(() => clearSplitLayersError(), 6000);
    return () => clearTimeout(timer);
  }, [splitLayersError, clearSplitLayersError]);

  // The one-click image actions (auto enhance, portrait retouch) fail loudly
  // for the same reason Split Layers does: a button that appears to do nothing
  // reads as broken, and the retouch engine knows why it refused.
  useEffect(() => {
    if (!imageActionError) return undefined;
    const timer = setTimeout(() => setImageActionError(null), 6000);
    return () => clearTimeout(timer);
  }, [imageActionError]);

  // Repaint, expand, upscale and cutout report through maskError, which the
  // Properties panel shows only while its mask section is open. Echo each new
  // failure as a toast so a model run never ends in silence.
  useEffect(() => {
    if (!maskError) return undefined;
    setAiErrorText(
      maskError === true ? t("editor.ai.failed") : maskErrorCopy(maskError),
    );
    const timer = setTimeout(() => setAiErrorText(null), 8000);
    return () => clearTimeout(timer);
  }, [maskError, t]);

  useEffect(() => {
    if (!retouchError) return undefined;
    setImageActionError(
      retouchError === RETOUCH_TOO_LARGE
        ? "editor.retouch.tooLarge"
        : retouchError === "noImage"
          ? "editor.imageAction.noImage"
          : "editor.retouch.failed",
    );
    return undefined;
    // retouchErrorSeq is the failure's identity: the same code failing twice is
    // two events, and the second must toast as well.
  }, [retouchError, retouchErrorSeq]);

  // The saved notice hides itself. Owning the timer in an effect means closing
  // the editor inside those seconds cancels it, instead of leaving a
  // callback that sets state on a component that is gone. The notice also
  // carries the "Tab returns to the canvas" hint, so it stays up long enough
  // to be read, not just noticed.
  useEffect(() => {
    if (!savedNotice) return undefined;
    const timer = setTimeout(() => setSavedNotice(false), 3200);
    return () => clearTimeout(timer);
  }, [savedNotice]);

  useEffect(() => {
    if (!exportNotice) return undefined;
    const timer = setTimeout(() => setExportNotice(false), 8000);
    return () => clearTimeout(timer);
  }, [exportNotice]);

  // The save-failed banner clears itself too; it must never pin the editor
  // into a state that looks broken after the user has moved on.
  useEffect(() => {
    if (!applyError) return undefined;
    const timer = setTimeout(() => setApplyError(false), 6000);
    return () => clearTimeout(timer);
  }, [applyError]);

  // A region gesture that drew nothing (the pointer was not over a picture)
  // surfaces here as a toast, and clears itself — the engine keeps the reason
  // so the panel does not need its own copy. Error-toned hints are failures
  // (a model run that produced nothing, a stroke that failed): they render as
  // an alert pill and dwell six seconds instead of vanishing in a breath.
  const regionHintFromEngine = engine?.getRegionHint() ?? null;
  const regionHintTone = engine?.getRegionHintTone?.() ?? null;
  useEffect(() => {
    if (!regionHintFromEngine) {
      setRegionHint(null);
      setRegionHintFading(false);
      return undefined;
    }
    setRegionHint(regionHintFromEngine);
    setRegionHintFading(false);
    const isError = regionHintTone === "error";
    const fadeTimer = setTimeout(
      () => setRegionHintFading(true),
      isError ? 5600 : 1200,
    );
    const clearTimer = setTimeout(
      () => {
        engine?.setRegionHint(null);
        setRegionHint(null);
        setRegionHintFading(false);
      },
      isError ? 6000 : 1600,
    );
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(clearTimer);
    };
  }, [engine, regionHintFromEngine, regionHintTone]);

  // Background persist failures reach us through the engine persistence alert
  // bus: quota exhaustion must become a standing, dismissible warning — a
  // silently-swallowed error loses the user's pixel work on the next reload.
  useEffect(() => {
    const unsubscribe = subscribePersistenceAlert((alert) => {
      if (alert?.type === "persist-quota") {
        setPersistQuota({ source: alert.source ?? "unknown" });
      }
    });
    return unsubscribe;
  }, []);

  return {
    applyError,
    setApplyError,
    regionHint,
    regionHintFading,
    regionHintTone,
    persistQuota,
    setPersistQuota,
    savedNotice,
    setSavedNotice,
    imageActionError,
    setImageActionError,
    aiErrorText,
    setAiErrorText,
    exportNotice,
    setExportNotice,
  };
}
