import PropTypes from "prop-types";

/**
 * Canonical tool-grade Switch component.
 * Uses role="switch" for accessibility, matching Design.md flat visual hierarchy.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  className = "",
  testId = undefined,
}) {
  return (
    <button
      type="button"
      role="switch"
      data-testid={testId}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-0 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-white/80" : "bg-white/15"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none block h-3 w-3 rounded-full bg-neutral-900 transition-transform ${
          checked ? "translate-x-3.5" : "translate-x-0.5"
        } self-center`}
      />
    </button>
  );
}

Switch.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  testId: PropTypes.string,
};

/**
 * Toggle with inline text label for forms and inspector rows.
 */
export function ToggleRow({
  checked,
  onChange,
  label,
  hint = undefined,
  disabled = false,
  className = "",
  testId = undefined,
}) {
  return (
    <label
      title={hint}
      data-testid={testId}
      className={`flex select-none items-center justify-between gap-2 text-[11px] font-mono cursor-pointer ${
        disabled ? "cursor-not-allowed opacity-40" : ""
      } ${className}`}
    >
      <span className="text-neutral-300">{label}</span>
      <Switch
        checked={checked}
        onChange={onChange}
        label={label}
        disabled={disabled}
      />
    </label>
  );
}

ToggleRow.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  hint: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  testId: PropTypes.string,
};

export default Switch;
