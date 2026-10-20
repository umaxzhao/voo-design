import PropTypes from "prop-types";
import ScrubValueInput from "./scrub_value_input.jsx";
import { useI18n } from "../../use_i18n.js";

/**
 * One visual-adjustment row: enable box, live value, reset, slider.
 *
 * Every adjustment shares this shape, so the section drives it from a table
 * rather than repeating the markup per channel.
 *
 * `onCommit` fires at the interaction boundary — the range thumb released or
 * the value scrubbed/typed to completion — so one drag costs one undo step.
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

  const content = (
    <div className="flex flex-col gap-1.5 py-0.5">
      {label && !hideLabel ? (
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-medium">
            {label}
          </span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={enabled}
            aria-label={label || t("editor.props.toggleFallback")}
            onChange={(event) => onToggle(event.target.checked)}
            className="flat-check"
          />
          <ScrubValueInput
            min={min}
            max={max}
            step={step}
            value={value}
            format={(current) => `${current}${unit}`}
            onChange={onChange}
            onCommit={onCommit}
            ariaLabel={label || t("editor.props.valueFallback")}
            disabled={!enabled}
            scrubHint={t("editor.props.dragToAdjust")}
            className="min-w-9 font-mono"
          />
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-[10px] font-mono text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          {t("editor.props.reset")}
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={!enabled}
        aria-label={label || t("editor.props.rangeFallback")}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={() => onCommit?.()}
        onKeyUp={(event) => {
          // Keyboard-driven range edits land one snapshot per keypress.
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
            ].includes(event.key)
          ) {
            onCommit?.();
          }
        }}
        className="flat-range w-full"
      />
    </div>
  );

  return content;
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
  /** Called at the interaction boundary (thumb released / value committed). */
  onCommit: PropTypes.func,
  onReset: PropTypes.func.isRequired,
  hideLabel: PropTypes.bool,
};
