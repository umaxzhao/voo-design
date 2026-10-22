import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";

/**
 * Standard Dark-Glass Loading Modal with spinning purple accent ring and progress bar.
 * Unified with Design Editor's AI / Model loading style.
 */
export default function LoadingModal({
  label,
  progress = null,
  className = "",
  onCancel = null,
}) {
  const { t } = useI18n();
  const pct =
    typeof progress === "number"
      ? Math.min(100, Math.max(0, Math.round(progress)))
      : null;

  return (
    <div
      data-testid="loading-modal"
      className={`flex flex-col items-center gap-3 rounded-3xl bg-neutral-900/90 border border-white/10 px-8 py-6 shadow-panel backdrop-blur-md ${className}`}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[#E5B2FF]" />
      {label ? (
        <div className="text-[12px] font-mono text-neutral-200">{label}</div>
      ) : null}
      <div className="h-1 w-52 overflow-hidden rounded-full bg-white/10">
        {pct !== null ? (
          <div
            className="h-full rounded-full bg-[#E5B2FF] transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-2/3 animate-pulse rounded-full bg-[#E5B2FF]" />
        )}
      </div>
      {typeof onCancel === "function" ? (
        <button
          type="button"
          data-testid="loading-modal-cancel"
          onClick={onCancel}
          className="mt-1 rounded-lg px-3 py-1 text-[11px] font-medium text-neutral-400 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
        >
          {t("common.cancel")}
        </button>
      ) : null}
    </div>
  );
}

LoadingModal.propTypes = {
  label: PropTypes.node,
  progress: PropTypes.number,
  className: PropTypes.string,
  onCancel: PropTypes.func,
};
