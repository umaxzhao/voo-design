import PropTypes from "prop-types";
import { useId } from "react";
import { useI18n } from "../use_i18n.js";
import VooBrandLogo from "./voo_brand_logo.jsx";
import "./loading_modal.css";

/** Shared loading feedback; known progress uses real values, otherwise a moving segment. */
export default function LoadingModal({
  label,
  progress = null,
  className = "",
  onCancel = null,
  showLabel = true,
}) {
  const { t } = useI18n();
  const labelId = useId();
  const pct = Number.isFinite(progress)
    ? Math.min(100, Math.max(0, Math.round(progress)))
    : null;

  return (
    <div
      data-testid="loading-modal"
      className={`voo-loading flex max-w-full flex-col items-center gap-6 rounded-3xl px-8 py-8 ${className}`}
    >
      <span data-loading-brand aria-hidden="true" className="voo-loading-brand block size-12">
        <VooBrandLogo className="block size-full" />
      </span>
      <span id={labelId} className={showLabel ? "max-w-52 text-center text-[11px] text-neutral-400" : "sr-only"}>
        {label ?? t("common.loading")}
      </span>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        data-loading-progress={pct === null ? "indeterminate" : "determinate"}
        className="voo-loading-track h-1 w-44 max-w-full overflow-hidden rounded-full"
      >
        <div
          className={`voo-loading-fill h-full rounded-full ${pct === null ? "voo-loading-segment w-1/3" : "w-full"}`}
          style={pct === null ? undefined : { transform: `scaleX(${pct / 100})` }}
        />
      </div>
      {typeof onCancel === "function" ? (
        <button
          type="button"
          data-testid="loading-modal-cancel"
          onClick={onCancel}
          className="rounded-lg px-3 py-1 text-[11px] font-medium text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
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
  showLabel: PropTypes.bool,
};
