import PropTypes from "prop-types";

/**
 * One property setting as a list row: label (and an optional one-line helper)
 * on the left, the control on the right. Free-text fields use SettingsField
 * (label above input) instead.
 */
export default function SettingsRow({ label, hint, children }) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1">
      <div className="flex min-w-0 flex-1 basis-40 flex-col">
        <span className="text-xs text-neutral-200">{label}</span>
        {hint && <span className="text-xs text-neutral-400">{hint}</span>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

SettingsRow.propTypes = {
  label: PropTypes.string.isRequired,
  hint: PropTypes.string,
  children: PropTypes.node.isRequired,
};
