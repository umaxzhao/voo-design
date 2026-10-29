/** 0..100 when the local model reports a definite download/encode share. */
export function aiProgressPct(progress) {
  if (!progress) return null;
  if (progress.phase === "downloading" && progress.total > 0) {
    return Math.min(
      100,
      Math.round((progress.loaded / progress.total) * 100),
    );
  }
  if (progress.phase === "cached") return 100;
  return null;
}

/** Human label for the running AI phase (local cutout, matting, repaint). */
export function aiProgressLabel(progress, t) {
  if (!progress) return t("editor.aiProgress.working");
  switch (progress.phase) {
    case "runtime":
      return t("editor.aiProgress.loadingRuntime");
    case "downloading":
      return progress.total > 0
        ? t("editor.aiProgress.downloading", {
            pct: Math.min(
              100,
              Math.round((progress.loaded / progress.total) * 100),
            ),
          })
        : t("editor.aiProgress.downloading", { pct: "…" });
    case "compiling":
      return t("editor.aiProgress.compiling");
    case "starting":
      // An installed-but-stopped managed backend is booting inside the
      // submit call: the wait is real and the overlay has to name it, or a
      // cold start reads as a dead canvas (contract §6.6).
      return t("stage.starting");
    case "running":
      return t("editor.aiProgress.running");
    case "encoding":
      return t("editor.aiProgress.encoding");
    case "tiling":
      // Large-image upscales run tile by tile; the count is the only
      // progress they can report, and a bare "Working..." for minutes is
      // worse than a number.
      return t("editor.aiProgress.tiling", {
        tile: progress.tile ?? 0,
        tiles: progress.tiles ?? 0,
      });
    case "cached":
      return t("editor.aiProgress.ready");
    case "fallback":
      return t("editor.aiProgress.fallback", {
        provider: progress.providerName || progress.providerId || "",
      });
    default:
      return t("editor.aiProgress.working");
  }
}

