import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../../use_i18n.js";

/**
 * A field for a property whose multi-selection disagrees.
 *
 * Without `onValueChange` it stays the read-only dash the panel has always
 * shown. With a handler, typing a value applies it to every selected layer
 * (Figma's "type once, change all" behaviour) instead of forcing the user to
 * edit each layer separately.
 */
export default function MixedField({
  label,
  suffix = "",
  bare = false,
  onValueChange = undefined,
  min = undefined,
  max = undefined,
  precision = 0,
  ariaLabel = undefined,
  commitNow = undefined,
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const editable = typeof onValueChange === "function";

  const commit = () => {
    if (!editable) return;
    const text = draft.trim();
    setDraft("");
    if (!text) return;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return;
    let next = precision > 0
      ? Math.round(parsed * 10 ** precision) / 10 ** precision
      : Math.round(parsed);
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);
    onValueChange(next);
    commitNow?.();
  };

  return (
    <div
      className={`flex min-w-0 items-center rounded-xl bg-[#222222] px-2 py-1.5 text-[11px] font-mono text-neutral-400 ${
        bare ? "flex-1" : ""
      }`}
      title={editable ? t("editor.props.mixedValuesEditable") : t("editor.props.mixedValues")}
    >
      <span className="inline-flex shrink-0 items-center pr-1 text-[10px] font-mono uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      {editable ? (
        <input
          type="number"
          value={draft}
          placeholder={suffix ? `—${suffix}` : "—"}
          aria-label={ariaLabel || (typeof label === "string" ? label : t("editor.props.mixedValues"))}
          title={t("editor.props.mixedValuesEditable")}
          onFocus={(event) => event.target.select?.()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft("");
              event.currentTarget.blur();
            }
          }}
          className="ml-auto w-full min-w-0 bg-transparent text-right text-[11px] font-mono tabular-nums text-neutral-200 outline-none placeholder:text-neutral-400"
        />
      ) : (
        <span className="ml-auto">{suffix ? `—${suffix}` : "—"}</span>
      )}
    </div>
  );
}

MixedField.propTypes = {
  label: PropTypes.node.isRequired,
  suffix: PropTypes.string,
  bare: PropTypes.bool,
  onValueChange: PropTypes.func,
  min: PropTypes.number,
  max: PropTypes.number,
  precision: PropTypes.number,
  ariaLabel: PropTypes.string,
  commitNow: PropTypes.func,
};
