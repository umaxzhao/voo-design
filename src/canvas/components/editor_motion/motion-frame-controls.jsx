import PropTypes from "prop-types";
import { parseCubicBezier } from "../../editor/scene-motion.js";
import { IconTrash } from "../../icons.jsx";
import MotionNumber, { MOTION_INPUT_CLASS } from "./motion-number.jsx";

const EASINGS = ["linear", "hold", "ease-in", "ease-out", "ease-in-out"];
const DEFAULT_CURVE = [0.25, 0.1, 0.25, 1];
const CONTROL_POINTS = ["x1", "y1", "x2", "y2"];
const BUTTON_CLASS =
  "flex h-7 shrink-0 items-center justify-center rounded-lg px-2 text-[11px] text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:opacity-40";

export default function MotionFrameControls({
  frame,
  displayTime,
  duration,
  fps,
  onMove,
  onEasing,
  onRemove,
  t,
}) {
  if (!frame) return null;
  const points = parseCubicBezier(frame.easing);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 bg-white/[0.02] px-3 py-1">
      <MotionNumber
        label={t("editor.motion.keyframeTime")}
        value={displayTime}
        min={0}
        max={duration}
        step={1 / fps}
        onCommit={onMove}
      />
      <label className="flex min-w-0 items-center gap-1 text-[10px] text-neutral-400">
        <span>{t("editor.motion.easing")}</span>
        <select
          className={`${MOTION_INPUT_CLASS} w-24`}
          aria-label={t("editor.motion.easing")}
          value={points ? "custom" : frame.easing}
          onChange={(event) =>
            onEasing(
              event.target.value === "custom"
                ? `cubic-bezier(${DEFAULT_CURVE.join(",")})`
                : event.target.value,
            )
          }
          onKeyDown={(event) => event.stopPropagation()}
        >
          {EASINGS.map((easing) => (
            <option key={easing} value={easing}>
              {t(`editor.motion.easing.${easing}`)}
            </option>
          ))}
          <option value="custom">{t("editor.motion.easing.custom")}</option>
        </select>
      </label>
      {points ? (
        <div
          data-testid="motion-custom-easing"
          className="flex flex-wrap items-center gap-2"
        >
          {CONTROL_POINTS.map((point, index) => (
            <MotionNumber
              key={point}
              label={t(`editor.motion.easing.${point}`)}
              value={points[index]}
              min={index % 2 === 0 ? 0 : -2}
              max={index % 2 === 0 ? 1 : 2}
              step={0.01}
              onCommit={(next) => {
                const updated = [...points];
                updated[index] = next;
                onEasing(`cubic-bezier(${updated.join(",")})`);
              }}
            />
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className={BUTTON_CLASS}
        aria-label={t("editor.motion.removeKeyframe")}
        title={t("editor.motion.removeKeyframe")}
        onClick={onRemove}
      >
        <IconTrash size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

MotionFrameControls.propTypes = {
  frame: PropTypes.object,
  displayTime: PropTypes.number.isRequired,
  duration: PropTypes.number.isRequired,
  fps: PropTypes.number.isRequired,
  onMove: PropTypes.func.isRequired,
  onEasing: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
