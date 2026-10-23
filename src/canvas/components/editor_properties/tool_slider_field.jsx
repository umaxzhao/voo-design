/** Compact label + slider + numeric field row shared by tool property panels. */

import PropTypes from "prop-types";
import { useId } from "react";
import ScrubField from "../scrub_field.jsx";

export default function ToolSliderField({
  label,
  icon = null,
  value,
  min,
  max,
  step = 1,
  suffix = undefined,
  onValueChange,
  onCommit,
  ariaLabel,
  scrubHint,
  disabled = false,
  labelClassName = "w-[64px]",
  fieldClassName = "w-[68px]",
}) {
  const id = useId();

  return (
    <div className="flex h-7 min-w-0 items-center gap-2">
      <label
        htmlFor={id}
        title={label}
        className={`flex shrink-0 items-center gap-1 overflow-hidden text-[10px] font-mono uppercase tracking-wide text-neutral-500 ${labelClassName}`}
      >
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span className="min-w-0 truncate">{label}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange?.(Number(event.target.value))}
        onPointerUp={onCommit}
        aria-label={ariaLabel || label}
        className="flat-range min-w-0 flex-1"
      />
      <ScrubField
        value={value}
        min={min}
        max={max}
        step={step}
        suffix={suffix}
        onValueChange={onValueChange}
        onCommit={onCommit}
        ariaLabel={ariaLabel || label}
        scrubHint={scrubHint}
        disabled={disabled}
        className={`shrink-0 ${fieldClassName}`}
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
  suffix: PropTypes.node,
  onValueChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
  ariaLabel: PropTypes.string,
  scrubHint: PropTypes.string,
  disabled: PropTypes.bool,
  labelClassName: PropTypes.string,
  fieldClassName: PropTypes.string,
};
