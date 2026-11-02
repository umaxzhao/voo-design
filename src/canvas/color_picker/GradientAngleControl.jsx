import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";
import ScrubField from "../components/scrub_field.jsx";

const QUICK_ANGLE_CHANGES = [-90, -45, 45, 90];

export function GradientAngleControl({ angle, onChange }) {
  const { t } = useI18n();
  const numericAngle = Math.max(
    0,
    Math.min(360, Number.parseFloat(angle) || 0),
  );

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-neutral-800 px-2 py-1.5">
      <div className="flex min-h-7 items-center gap-2">
        <span
          className="shrink-0 text-[10px] font-mono text-neutral-400"
          aria-hidden="true"
        >
          ∠
        </span>
        <ScrubField
          value={numericAngle}
          min={0}
          max={360}
          suffix="°"
          onValueChange={(next) => onChange(next)}
          ariaLabel={t("editor.props.gradientAngle")}
          scrubHint={t("editor.props.dragToAdjust")}
          showRange
          className="min-w-0 flex-1"
        />
      </div>
      <div className="flex items-center justify-end gap-1">
        {QUICK_ANGLE_CHANGES.map((change) => (
          <button
            key={change}
            type="button"
            onClick={() => onChange(numericAngle + change, true)}
            aria-label={t("editor.colorPicker.rotateAngle", {
              degrees: change,
            })}
            className="rounded-lg px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 hover:bg-white/10 hover:text-neutral-100"
          >
            {change > 0 ? `+${change}` : change}°
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(numericAngle + 180, true)}
          aria-label={t("editor.colorPicker.flipAngle")}
          className="rounded-lg px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 hover:bg-white/10 hover:text-neutral-100"
        >
          {t("editor.colorPicker.flip")}
        </button>
      </div>
    </div>
  );
}

GradientAngleControl.propTypes = {
  angle: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
