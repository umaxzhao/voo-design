import PropTypes from "prop-types";
import {
  IconPause,
  IconPlay,
  IconClose,
  IconRepeat,
  IconScissors,
} from "../../icons.jsx";
import MotionNumber from "./motion-number.jsx";
import {
  formatTimecode,
  MAX_TIMELINE_ZOOM,
  MIN_TIMELINE_ZOOM,
} from "./motion-timeline-model.js";

const BUTTON_CLASS =
  "flex h-7 shrink-0 items-center justify-center rounded-lg px-2 text-[11px] text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:opacity-40";

export default function MotionTransportControls({
  time,
  duration,
  fps,
  playing,
  exporting,
  exportProgress,
  showExport,
  onTogglePlayback,
  onDuration,
  onExport,
  onClose,
  zoom = 1,
  onZoom = null,
  loop = false,
  onLoop = null,
  canSplit = false,
  onSplit = null,
  t,
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-2 py-1">
      <button
        type="button"
        className={BUTTON_CLASS}
        aria-label={t(playing ? "editor.motion.pause" : "editor.motion.play")}
        title={t(playing ? "editor.motion.pause" : "editor.motion.play")}
        onClick={onTogglePlayback}
      >
        {playing ? (
          <IconPause size={14} strokeWidth={1.5} />
        ) : (
          <IconPlay size={14} strokeWidth={1.5} />
        )}
      </button>
      {onSplit ? (
        <button
          type="button"
          data-testid="motion-split"
          className={BUTTON_CLASS}
          disabled={!canSplit}
          aria-label={t("editor.motion.split")}
          title={t("editor.motion.split")}
          onClick={onSplit}
        >
          <IconScissors size={14} strokeWidth={1.5} />
        </button>
      ) : null}
      {onLoop ? (
        <button
          type="button"
          data-testid="motion-loop"
          className={`${BUTTON_CLASS} ${loop ? "!text-[#eed0ff]" : ""}`}
          aria-label={t("editor.motion.loop")}
          title={t("editor.motion.loop")}
          aria-pressed={loop}
          onClick={() => onLoop(!loop)}
        >
          <IconRepeat size={14} strokeWidth={1.5} />
        </button>
      ) : null}
      <span
        data-testid="motion-timecode"
        className="text-[11px] tabular-nums text-neutral-100"
        aria-live="off"
        aria-label={`${time.toFixed(2)} ${t("editor.motion.seconds")}`}
      >
        {formatTimecode(time, fps)}
        <span className="text-neutral-500">
          {" "}
          / {formatTimecode(duration, fps)}
        </span>
      </span>
      <MotionNumber
        label={t("editor.motion.duration")}
        value={duration}
        min={1 / fps}
        max={86400}
        step={1 / fps}
        onCommit={onDuration}
      />
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        {onZoom ? (
          <input
            type="range"
            data-testid="motion-zoom"
            aria-label={t("editor.motion.zoom")}
            title={t("editor.motion.zoom")}
            min={MIN_TIMELINE_ZOOM}
            max={MAX_TIMELINE_ZOOM}
            step={0.25}
            value={zoom}
            onChange={(event) => onZoom(Number(event.target.value))}
            onKeyDown={(event) => event.stopPropagation()}
            className="flat-range w-24"
          />
        ) : null}
        {exporting && Number.isFinite(exportProgress) ? (
          <span
            role="status"
            className="truncate text-[10px] tabular-nums text-neutral-400"
          >
            {t("editor.motion.exportProgress", {
              percent: Math.round(exportProgress * 100),
            })}
          </span>
        ) : null}
        {showExport ? (
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={exporting}
            onClick={onExport}
          >
            {t(
              exporting
                ? "editor.motion.exporting"
                : "editor.motion.exportVideo",
            )}
          </button>
        ) : null}
        <button
          type="button"
          className={BUTTON_CLASS}
          aria-label={t("editor.motion.close")}
          title={t("editor.motion.close")}
          onClick={onClose}
        >
          <IconClose size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

MotionTransportControls.propTypes = {
  time: PropTypes.number.isRequired,
  duration: PropTypes.number.isRequired,
  fps: PropTypes.number.isRequired,
  playing: PropTypes.bool.isRequired,
  exporting: PropTypes.bool.isRequired,
  exportProgress: PropTypes.number,
  showExport: PropTypes.bool.isRequired,
  onTogglePlayback: PropTypes.func.isRequired,
  onDuration: PropTypes.func.isRequired,
  onExport: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  zoom: PropTypes.number,
  onZoom: PropTypes.func,
  loop: PropTypes.bool,
  onLoop: PropTypes.func,
  canSplit: PropTypes.bool,
  onSplit: PropTypes.func,
  t: PropTypes.func.isRequired,
};
