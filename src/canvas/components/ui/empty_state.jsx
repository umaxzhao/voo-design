import PropTypes from "prop-types";

/**
 * Standard empty state placeholder for lists, layers, panels.
 */
export function EmptyState({
  message,
  action = null,
  className = "",
  testId = undefined,
}) {
  return (
    <div
      data-testid={testId}
      className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.08] p-4 text-center text-[11px] font-mono text-neutral-500 select-none ${className}`}
    >
      <span>{message}</span>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

EmptyState.propTypes = {
  message: PropTypes.node.isRequired,
  action: PropTypes.node,
  className: PropTypes.string,
  testId: PropTypes.string,
};

export default EmptyState;
