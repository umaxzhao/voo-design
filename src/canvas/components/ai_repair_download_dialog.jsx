import PropTypes from "prop-types";
import { useId, useRef } from "react";
import { useI18n } from "../use_i18n.js";
import { useModalFocus } from "./use_modal_focus.js";

function AiRepairDownloadDialog({ state, onDownload, onCancel }) {
  const { t } = useI18n();
  const isMatting = state.kind === "matting";
  const copy = isMatting ? "editor.matting" : "editor.aiRepair";
  const downloading = state.phase === "downloading";
  const running = state.phase === "running";
  const failed = state.phase === "failed" || state.phase === "runFailed";
  const dialogRef = useRef(null);
  const titleId = useId();
  useModalFocus({ open: true, dialogRef, onClose: onCancel });
  const detail = downloading
    ? t(`${copy}.downloading`, { percent: state.progress ?? 0 })
    : running
      ? t(`${copy}.running`)
      : failed
        ? t(
            state.phase === "runFailed"
              ? `${copy}.runFailed`
              : `${copy}.downloadFailed`,
          )
        : t(`${copy}.downloadHint`);

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xs rounded-3xl border border-white/10 bg-neutral-900 p-4 shadow-panel"
      >
        <h2
          id={titleId}
          className="text-[12px] font-medium text-neutral-100"
        >
          {t(`${copy}.downloadTitle`)}
        </h2>
        <p className="mt-1 text-[10px] leading-relaxed text-neutral-400">
          {detail}
        </p>
        {downloading ? (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#E5B2FF] transition-[width] duration-200"
              style={{
                width: `${Math.max(0, Math.min(100, state.progress ?? 0))}%`,
              }}
            />
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-3 py-1.5 text-[10px] text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-100"
          >
            {t("editor.cancel")}
          </button>
          {!downloading && !running ? (
            <button
              type="button"
              onClick={onDownload}
              className="rounded-xl bg-[#E5B2FF] px-3 py-1.5 text-[10px] font-medium text-black transition-colors hover:bg-[#eed0ff]"
            >
              {failed ? t(`${copy}.retry`) : t(`${copy}.download`)}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

AiRepairDownloadDialog.propTypes = {
  state: PropTypes.shape({
    kind: PropTypes.string,
    phase: PropTypes.string.isRequired,
    progress: PropTypes.number,
  }).isRequired,
  onDownload: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default AiRepairDownloadDialog;
