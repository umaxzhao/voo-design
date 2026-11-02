import PropTypes from "prop-types";

const BADGE_VARIANTS = {
  default: "bg-white/[0.06] text-neutral-300",
  success: "bg-emerald-500/10 text-emerald-400",
  warning: "bg-amber-500/10 text-amber-400",
  error: "bg-rose-500/10 text-rose-400",
  mint: "bg-[#a7ffd4]/10 text-[#a7ffd4]",
  purple: "bg-[#E5B2FF]/10 text-[#eed0ff]",
};

/**
 * Canonical tool-grade badge / tag.
 * Flat, neutral /10 semantic washes only (Design.md Rule 2).
 */
export function Badge({
  children,
  variant = "default",
  className = "",
  testId = undefined,
}) {
  const variantClass = BADGE_VARIANTS[variant] ?? BADGE_VARIANTS.default;
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono tabular-nums select-none ${variantClass} ${className}`}
    >
      {children}
    </span>
  );
}

Badge.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(["default", "success", "warning", "error", "mint", "purple"]),
  className: PropTypes.string,
  testId: PropTypes.string,
};

const DOT_STATUS_CLASSES = {
  active: "bg-emerald-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  idle: "bg-amber-400",
  error: "bg-rose-400",
  system: "bg-[#a7ffd4]",
  offline: "bg-neutral-500",
  disabled: "bg-neutral-500",
};

/**
 * Canonical status dot.
 * Fixed 6x6px rounded-full.
 */
export function StatusDot({
  status = "active",
  className = "",
  ariaLabel = undefined,
}) {
  const dotColor = DOT_STATUS_CLASSES[status] ?? DOT_STATUS_CLASSES.active;
  return (
    <span
      role={ariaLabel ? "status" : undefined}
      aria-label={ariaLabel}
      aria-hidden={!ariaLabel}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor} ${className}`}
    />
  );
}

StatusDot.propTypes = {
  status: PropTypes.oneOf([
    "active",
    "success",
    "warning",
    "idle",
    "error",
    "system",
    "offline",
    "disabled",
  ]),
  className: PropTypes.string,
  ariaLabel: PropTypes.string,
};
