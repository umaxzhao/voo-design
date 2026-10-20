import PropTypes from "prop-types";

/**
 * Segmented control radio group.
 * Strictly adheres to Design.md radius ladder (rounded-lg container, rounded-md chips).
 */
export function SegmentedControl({
  value,
  options,
  onChange,
  label,
  className = "",
  disabled = false,
  testId = undefined,
}) {
  return (
    <div
      role="radiogroup"
      data-testid={testId}
      aria-label={label}
      className={`flex items-center gap-0.5 rounded-lg bg-neutral-950 p-0.5 select-none ${
        disabled ? "opacity-40 pointer-events-none" : ""
      } ${className}`}
    >
      {options.map(({ value: optionValue, label: optionLabel, title = undefined }) => {
        const active = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={active}
            title={title || (typeof optionLabel === "string" ? optionLabel : undefined)}
            disabled={disabled}
            onClick={() => onChange(optionValue)}
            className={`h-6 flex-1 rounded-md px-2 text-[10px] font-mono leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
              active
                ? "bg-white/90 text-black font-medium"
                : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100"
            }`}
          >
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}

SegmentedControl.propTypes = {
  value: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.node.isRequired,
      title: PropTypes.string,
    }),
  ).isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  className: PropTypes.string,
  disabled: PropTypes.bool,
  testId: PropTypes.string,
};

export default SegmentedControl;
