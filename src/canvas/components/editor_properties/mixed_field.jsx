import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";

/**
 * A read-only dash for a property field whose multi-selection disagrees
 * (plan 1.9). Rendered in place of the numeric editor so the panel never
 * shows a misleading value for a mixed selection.
 */
export default function MixedField({ label, suffix = "", bare = false }) {
  const { t } = useI18n();
  return (
    <div
      className={`flex min-w-0 items-center rounded-xl bg-[#222222] px-2 py-1.5 text-[11px] font-mono text-neutral-500 ${
        bare ? "flex-1" : ""
      }`}
      title={t("editor.props.mixedValues")}
    >
      <span className="shrink-0 pr-1 text-[10px] font-mono uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <span className="ml-auto">{suffix ? `—${suffix}` : "—"}</span>
    </div>
  );
}

MixedField.propTypes = {
  label: PropTypes.string.isRequired,
  suffix: PropTypes.string,
  bare: PropTypes.bool,
};
