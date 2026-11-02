import PropTypes from "prop-types";
import { IconSearch } from "../../icons.jsx";

/**
 * Standard single-line text input for editor panels.
 */
export function TextInput({
  value,
  defaultValue = undefined,
  onChange = undefined,
  onKeyDown = undefined,
  onBlur = undefined,
  placeholder = undefined,
  ariaLabel,
  disabled = false,
  className = "",
  testId = undefined,
  inputRef = undefined,
  ...rest
}) {
  return (
    <input
      ref={inputRef}
      type="text"
      data-testid={testId}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`h-7 w-full min-w-0 rounded-xl bg-neutral-800 px-2.5 text-[11px] font-mono text-neutral-100 placeholder:text-neutral-400 outline-none transition-colors hover:bg-neutral-800/80 focus:ring-1 focus:ring-[#a7ffd4]/40 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed ${className}`}
      {...rest}
    />
  );
}

TextInput.propTypes = {
  value: PropTypes.string,
  defaultValue: PropTypes.string,
  onChange: PropTypes.func,
  onKeyDown: PropTypes.func,
  onBlur: PropTypes.func,
  placeholder: PropTypes.string,
  ariaLabel: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  testId: PropTypes.string,
  inputRef: PropTypes.oneOfType([PropTypes.func, PropTypes.shape({ current: PropTypes.any })]),
};

/**
 * Search input with leading bare search icon.
 */
export function SearchInput({
  value,
  onChange = undefined,
  placeholder = "Search...",
  ariaLabel = "Search",
  disabled = false,
  className = "",
  testId = undefined,
  inputRef = undefined,
  ...rest
}) {
  return (
    <div className={`relative flex items-center min-w-0 ${className}`}>
      <IconSearch
        size={12}
        className="pointer-events-none absolute left-2.5 text-neutral-500"
      />
      <input
        ref={inputRef}
        type="text"
        data-testid={testId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        className="h-7 w-full min-w-0 rounded-xl bg-neutral-800 pl-7 pr-2.5 text-[11px] font-mono text-neutral-100 placeholder:text-neutral-400 outline-none transition-colors hover:bg-neutral-800/80 focus:ring-1 focus:ring-[#a7ffd4]/40 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
        {...rest}
      />
    </div>
  );
}

SearchInput.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  placeholder: PropTypes.string,
  ariaLabel: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  testId: PropTypes.string,
  inputRef: PropTypes.oneOfType([PropTypes.func, PropTypes.shape({ current: PropTypes.any })]),
};
