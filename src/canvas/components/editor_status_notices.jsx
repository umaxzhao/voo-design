import React from "react";
import PropTypes from "prop-types";
import AiRepairDownloadDialog from "./ai_repair_download_dialog.jsx";

/** Existing status messages share rendering, while their timers stay in the host. */
export default function EditorStatusNotices({
  savedNotice, exportNotice, applyError, persistQuota,
  setPersistQuota, imageActionError, aiErrorText, setAiErrorText,
  splitLayersError, aiRepairDownload, engine, mattingDownload,
  downloadMattingModel, cancelMattingModelDownload, regionHint, regionHintTone,
  regionHintFading, t,
}) {
  return <>
        {savedNotice ? (
          <div
            role="status"
            className="absolute top-28 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1 text-[11px] font-mono text-[#b2ffd6] shadow-pop backdrop-blur-md"
          >
            ✓{" "}
            {typeof savedNotice === "string"
              ? savedNotice.startsWith("✓")
                ? savedNotice.slice(1).trim()
                : `${savedNotice} ${t("editor.saved")}`
              : t("editor.saved")}
          </div>
        ) : null}

        {exportNotice ? (
          <div
            role="status"
            className="absolute top-28 left-1/2 z-50 rounded-xl bg-surface-raised px-3 py-2 text-[11px] text-amber-300 shadow-pop"
          >
            {Array.isArray(exportNotice) && exportNotice.length > 0
              ? t(
                  typeof exportNotice[0] === "string"
                    ? `editor.exportWarning.${exportNotice[0]}`
                    : exportNotice[0]?.code
                      ? `editor.exportWarning.${exportNotice[0].code}`
                      : "editor.exportHtml3dWarning",
                )
              : typeof exportNotice === "string"
                ? t(exportNotice)
                : t("editor.exportHtml3dWarning")}
          </div>
        ) : null}

        {applyError ? (
          <div
            role="alert"
            className="absolute top-28 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1 text-[11px] font-mono text-rose-300 shadow-pop backdrop-blur-md"
          >
            {applyError === "quotaExceeded"
              ? t("error.quotaExceeded")
              : typeof applyError === "string" && applyError !== "true"
                ? t(applyError)
                : t("editor.applyError")}
          </div>
        ) : null}

        {persistQuota ? (
          <div
            role="alert"
            className="absolute top-40 left-1/2 z-50 -translate-x-1/2 flex max-w-[520px] items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-1.5 text-[11px] font-mono text-rose-400 shadow-pop backdrop-blur-md"
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400"
            />
            <span>{t("editor.storage.persistQuotaWarning")}</span>
            <button
              type="button"
              onClick={() => setPersistQuota(null)}
              className="shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
            >
              {t("error.dismiss")}
            </button>
          </div>
        ) : null}

        {imageActionError ? (
          <div
            role="alert"
            className="absolute top-28 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1 text-[11px] font-mono text-rose-300 shadow-pop backdrop-blur-md"
          >
            {t(imageActionError)}
          </div>
        ) : null}

        {aiErrorText && !imageActionError ? (
          <div
            role="alert"
            data-testid="editor-ai-error"
            className="absolute top-28 left-1/2 z-50 flex max-w-[min(32rem,90%)] -translate-x-1/2 items-center gap-2 rounded-xl bg-black/60 px-3.5 py-1.5 text-[11px] font-mono text-rose-300 shadow-pop backdrop-blur-md"
          >
            <span className="min-w-0">{aiErrorText}</span>
            <button
              type="button"
              onClick={() => setAiErrorText(null)}
              aria-label={t("error.dismiss")}
              className="shrink-0 rounded-lg px-1 text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
            >
              ✕
            </button>
          </div>
        ) : null}

        {splitLayersError ? (
          <div
            role="alert"
            // One step below imageActionError's top-28: both can fire from the
            // same click on the taskbar, and stacked at the same offset the
            // second toast lands exactly on the first.
            className="absolute top-36 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1 text-[11px] font-mono text-rose-300 shadow-pop backdrop-blur-md"
          >
            {t(
              splitLayersError === "extensionRequired"
                ? "editor.taskbar.splitLayersUnavailableWeb"
                : splitLayersError === "noLayersIdentified"
                  ? "editor.taskbar.splitNoLayers"
                  : "editor.taskbar.splitError",
            )}
          </div>
        ) : null}

        {aiRepairDownload ? (
          <AiRepairDownloadDialog
            state={aiRepairDownload}
            onDownload={() => void engine?.downloadAiRepairModel?.()}
            onCancel={() => engine?.cancelAiRepairDownload?.()}
          />
        ) : null}

        {mattingDownload ? (
          <AiRepairDownloadDialog
            state={{ ...mattingDownload, kind: "matting" }}
            onDownload={() => void downloadMattingModel()}
            onCancel={cancelMattingModelDownload}
          />
        ) : null}

        {regionHint ? (
          regionHintTone === "error" ? (
            <div
              role="alert"
              className={`absolute top-28 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1 text-[11px] font-mono text-rose-300 shadow-pop backdrop-blur-md transition-opacity duration-300 ${
                regionHintFading ? "opacity-0" : "opacity-100"
              }`}
            >
              {t(regionHint)}
            </div>
          ) : (
            <div
              role="status"
              className={`pointer-events-none absolute top-28 left-1/2 z-50 -translate-x-1/2 text-center text-[12px] font-mono text-neutral-100 shadow-pop transition-opacity duration-300 ${
                regionHintFading ? "opacity-0" : "opacity-100"
              }`}
            >
              {t(regionHint)}
            </div>
          )
        ) : null}

  </>;
}
const noticeType = PropTypes.oneOfType([PropTypes.bool, PropTypes.string, PropTypes.array, PropTypes.object]);
EditorStatusNotices.propTypes = {
  savedNotice: noticeType,
  exportNotice: noticeType,
  applyError: noticeType,
  persistQuota: PropTypes.shape({ source: PropTypes.string.isRequired }),
  setPersistQuota: PropTypes.func.isRequired,
  imageActionError: PropTypes.string,
  aiErrorText: PropTypes.string,
  setAiErrorText: PropTypes.func.isRequired,
  splitLayersError: PropTypes.string,
  aiRepairDownload: PropTypes.object,
  engine: PropTypes.object,
  mattingDownload: PropTypes.object,
  downloadMattingModel: PropTypes.func.isRequired,
  cancelMattingModelDownload: PropTypes.func.isRequired,
  regionHint: PropTypes.string,
  regionHintTone: PropTypes.string,
  regionHintFading: PropTypes.bool,
  t: PropTypes.func.isRequired,
};
