import PropTypes from "prop-types";
import ScrubField from "../scrub_field.jsx";
import { useI18n } from "../../use_i18n.js";

/**
 * One visual-adjustment row: enable box, reset, and ONE combined field.
 *
 * The field is the slider: drag it (or the value itself) horizontally to
 * scrub, click to type, and the thin track under the number shows where the
 * value sits in its range. The old separate range bar plus value chip are gone
 * — they duplicated the same number and cost an extra row.
 *
 * `onCommit` fires at the interaction boundary — scrub release or typed/arrow
 * commit — so one drag costs one undo step.
 */
export default function AdjustmentSlider({
  label = "",
  unit,
  min,
  max,
  step = 1,
  value,
  enabled,
  onToggle,
  onChange,
  onCommit = undefined,
  onReset,
  hideLabel = false,
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-1 py-0.5">
      {label && !hideLabel ? (
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-medium">
            {label}
          </span>
        </div>
      ) : null}
      <div className="flex min-h-7 min-w-0 items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          aria-label={label || t("editor.props.toggleFallback")}
          onChange={(event) => onToggle(event.target.checked)}
          className="flat-check"
        />
        <ScrubField
          value={value}
          min={min}
          max={max}
          step={step}
          suffix={unit}
          onValueChange={(next) => onChange(next)}
          onCommit={onCommit}
          ariaLabel={label || t("editor.props.valueFallback")}
          scrubHint={t("editor.props.dragToAdjust")}
          disabled={!enabled}
          showRange
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={onReset}
          className="shrink-0 text-[10px] font-mono text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          {t("editor.props.reset")}
        </button>
      </div>
    </div>
  );
}

AdjustmentSlider.propTypes = {
  label: PropTypes.string,
  unit: PropTypes.string.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number,
  value: PropTypes.number.isRequired,
  enabled: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
  /** Called at the interaction boundary (scrub release / value committed). */
  onCommit: PropTypes.func,
  onReset: PropTypes.func.isRequired,
  hideLabel: PropTypes.bool,
};
