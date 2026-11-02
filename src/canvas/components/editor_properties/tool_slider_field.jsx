/** Combined label + scrubbable field row shared by tool property panels. */

import PropTypes from "prop-types";
import ScrubField from "../scrub_field.jsx";
import { useScrubDrag } from "../use_scrub_drag.js";

/**
 * One tool-property row: a micro label and ONE numeric field.
 *
 * The field is the slider: drag it (or its label) horizontally to scrub, click
 * to type, and the thin track under the number shows where the value sits in
 * its range. The old separate range bar + number box pair duplicated the same
 * value and ate a row's worth of space, so it is gone.
 */
export default function ToolSliderField({
  label,
  icon = null,
  value,
  min,
  max,
  step = 1,
  precision = 0,
  suffix = undefined,
  onValueChange,
  onCommit,
  ariaLabel,
  scrubHint,
  disabled = false,
  labelClassName = "w-[84px]",
}) {
  // Dragging the caption is the Figma habit: the value lives in the field, the
  // label is the handle. The field's own suffix stays draggable too.
  const scrub = useScrubDrag({
    value,
    step,
    min,
    max,
    onScrub: onValueChange,
    onTap: undefined,
    // A released scrub is an interaction boundary: land one snapshot.
    onScrubEnd: () => onCommit?.(),
  });

  return (
    <div className="flex min-h-7 min-w-0 items-center gap-2">
      <span
        title={label}
        aria-hidden="true"
        {...(disabled ? {} : scrub)}
        className={`flex shrink-0 items-center gap-1 text-[9px] font-mono uppercase tracking-tight leading-[10px] text-neutral-400 ${
          disabled ? "opacity-40" : "cursor-ew-resize touch-none select-none"
        } ${labelClassName}`}
      >
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span className="min-w-0 whitespace-normal">{label}</span>
      </span>
      <ScrubField
        value={value}
        min={min}
        max={max}
        step={step}
        precision={precision}
        suffix={suffix}
        onValueChange={onValueChange}
        onCommit={onCommit}
        ariaLabel={ariaLabel || label}
        scrubHint={scrubHint}
        disabled={disabled}
        showRange
        className="min-w-0 flex-1"
      />
    </div>
  );
}

ToolSliderField.propTypes = {
  label: PropTypes.string.isRequired,
  icon: PropTypes.node,
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number,
  precision: PropTypes.number,
  suffix: PropTypes.node,
  onValueChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
  ariaLabel: PropTypes.string,
  scrubHint: PropTypes.string,
  disabled: PropTypes.bool,
  labelClassName: PropTypes.string,
};
