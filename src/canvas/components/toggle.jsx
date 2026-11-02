import PropTypes from "prop-types";

export { Switch } from "./ui/switch.jsx";

/**
 * Compact toggle switch with label, preserving backward compatibility.
 * Canonical styling adheres to Design.md flat visual hierarchy.
 */
export default function Toggle({
  checked,
  onChange,
  label,
  hint = undefined,
  disabled = false,
  testId = undefined,
}) {
  return (
    <label
      title={hint}
      data-testid={testId}
      className={`nodrag flex cursor-pointer select-none items-center gap-2 text-[11px] font-mono ${
        disabled ? "cursor-not-allowed opacity-40" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-4 w-7 shrink-0 rounded-full bg-white/15 transition-colors peer-checked:bg-white/80 peer-focus-visible:ring-1 peer-focus-visible:ring-[#a7ffd4]/40 after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-neutral-900 after:transition-transform peer-checked:after:translate-x-3"
      />
      <span className="text-neutral-300">{label}</span>
    </label>
  );
}

Toggle.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  hint: PropTypes.string,
  disabled: PropTypes.bool,
  testId: PropTypes.string,
};
