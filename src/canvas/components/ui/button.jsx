import PropTypes from "prop-types";

const VARIANT_CLASSES = {
  primary:
    "bg-white text-black font-medium hover:bg-neutral-200 active:bg-neutral-300",
  secondary:
    "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.12] hover:text-neutral-100 active:bg-white/[0.16]",
  ghost:
    "bg-transparent text-neutral-300 hover:bg-white/[0.08] hover:text-white active:bg-white/[0.12]",
  ai:
    "bg-white/[0.06] text-[#E5B2FF] hover:bg-[#E5B2FF]/20 hover:text-[#eed0ff] active:bg-[#E5B2FF]/30",
};

const SIZE_CLASSES = {
  sm: "h-7 px-2.5 text-[10px]",
  md: "h-8 px-3 text-[11px]",
  lg: "h-9 px-4 text-xs",
};

/**
 * Canonical tool-grade action button.
 */
export function Button({
  type = "button",
  variant = "secondary",
  size = "md",
  pill = false,
  disabled = false,
  onClick = undefined,
  children,
  className = "",
  testId = undefined,
  ariaLabel = undefined,
  ...rest
}) {
  const radius = pill ? "rounded-full" : "rounded-lg";
  const variantClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.secondary;
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;

  return (
    <button
      type={type}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-1.5 font-mono select-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed ${radius} ${sizeClass} ${variantClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

Button.propTypes = {
  type: PropTypes.oneOf(["button", "submit", "reset"]),
  variant: PropTypes.oneOf(["primary", "secondary", "ghost", "ai"]),
  size: PropTypes.oneOf(["sm", "md", "lg"]),
  pill: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func,
  children: PropTypes.node,
  className: PropTypes.string,
  testId: PropTypes.string,
  ariaLabel: PropTypes.string,
};

const ICON_SIZE_CLASSES = {
  sm: "h-6 w-6",
  md: "h-7 w-7",
  lg: "h-8 w-8",
};

const ICON_VARIANT_CLASSES = {
  ghost:
    "text-neutral-400 hover:bg-white/[0.08] hover:text-white active:bg-white/[0.12]",
  secondary:
    "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.12] hover:text-white active:bg-white/[0.16]",
  ai:
    "bg-white/[0.06] text-[#E5B2FF] hover:bg-[#E5B2FF]/20 hover:text-[#eed0ff] active:bg-[#E5B2FF]/30",
};

/**
 * Canonical tool-grade icon button.
 * Strict ladder: rounded-lg for standard square icon buttons, never rounded-full.
 */
export function IconButton({
  type = "button",
  size = "md",
  variant = "ghost",
  pill = false,
  disabled = false,
  onClick = undefined,
  ariaLabel,
  title = undefined,
  children,
  className = "",
  testId = undefined,
  ...rest
}) {
  const radius = pill ? "rounded-full" : "rounded-lg";
  const sizeClass = ICON_SIZE_CLASSES[size] ?? ICON_SIZE_CLASSES.md;
  const variantClass = ICON_VARIANT_CLASSES[variant] ?? ICON_VARIANT_CLASSES.ghost;

  return (
    <button
      type={type}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel || title}
      title={title || ariaLabel}
      className={`shrink-0 inline-flex items-center justify-center select-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed ${radius} ${sizeClass} ${variantClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

IconButton.propTypes = {
  type: PropTypes.oneOf(["button", "submit", "reset"]),
  size: PropTypes.oneOf(["sm", "md", "lg"]),
  variant: PropTypes.oneOf(["ghost", "secondary", "ai"]),
  pill: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func,
  ariaLabel: PropTypes.string,
  title: PropTypes.string,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  testId: PropTypes.string,
};
